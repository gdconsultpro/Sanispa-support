import { NextResponse } from "next/server";
import { getAuthenticatedPartner } from "@/lib/partner-auth";
import { partnerLeadStatuses } from "@/lib/partner-leads";
import { getStripe } from "@/lib/stripe";

const lockMinutes = 15;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, partner, supabase } = await getAuthenticatedPartner(request);

  if (!user) {
    return NextResponse.json({ error: "Connexion partenaire requise." }, { status: 401 });
  }

  if (!partner) {
    return NextResponse.json({ error: "Aucun accès partenaire actif n'est associé à ce compte." }, { status: 403 });
  }

  const price = process.env.STRIPE_PRICE_PARTNER_LEAD_UNLOCK;
  if (!price) {
    return NextResponse.json({ error: "Variable STRIPE_PRICE_PARTNER_LEAD_UNLOCK manquante." }, { status: 400 });
  }

  const { data: paidPurchase } = await supabase
    .from("lead_purchases")
    .select("id")
    .eq("request_id", id)
    .eq("status", "paid")
    .maybeSingle();

  if (paidPurchase) {
    return NextResponse.json({ error: "Ce dossier a déjà été débloqué par un partenaire." }, { status: 409 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000).toISOString();

  const { data: lockedDiagnostic, error: lockError } = await supabase
    .from("diagnostics")
    .update({ lead_locked_until: lockedUntil })
    .eq("id", id)
    .eq("request_type", "TECHNICAL_REQUEST")
    .in("status", partnerLeadStatuses)
    .is("assigned_partner_id", null)
    .contains("matched_partner_ids", [partner.id])
    .or(`lead_locked_until.is.null,lead_locked_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();

  if (lockError) {
    console.error("[partner-checkout] Lead lock failed", {
      diagnosticId: id,
      partnerId: partner.id,
      error: lockError.message
    });
    return NextResponse.json({ error: "Impossible de verrouiller ce dossier." }, { status: 400 });
  }

  if (!lockedDiagnostic) {
    const { data: existingLead } = await supabase
      .from("diagnostics")
      .select("lead_locked_until, assigned_partner_id, matched_partner_ids")
      .eq("id", id)
      .maybeSingle();

    if (existingLead?.assigned_partner_id) {
      return NextResponse.json({ error: "Ce dossier a déjà été débloqué par un partenaire." }, { status: 409 });
    }

    if (existingLead?.lead_locked_until && new Date(existingLead.lead_locked_until).getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Ce dossier est temporairement en cours de déblocage par un autre partenaire." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Ce dossier n'est pas disponible pour votre compte partenaire." }, { status: 403 });
  }

  let purchase: { id: string };
  try {
    purchase = await upsertPendingPurchase(supabase, id, partner.id, lockedUntil);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de préparer l'achat du lead.";
    await supabase.from("diagnostics").update({ lead_locked_until: null }).eq("id", id).is("assigned_partner_id", null);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/partenaire/leads/${id}?unlock=success`,
      cancel_url: `${origin}/partenaire/leads/${id}?unlock=cancel`,
      metadata: {
        type: "partner_lead_unlock",
        diagnostic_id: id,
        partner_id: partner.id,
        lead_purchase_id: purchase.id
      }
    });

    const { error: updateError } = await supabase
      .from("lead_purchases")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", purchase.id);

    if (updateError) throw updateError;

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur Stripe";
    console.error("[partner-checkout] Stripe session creation failed", {
      diagnosticId: id,
      partnerId: partner.id,
      purchaseId: purchase.id,
      error: message
    });

    await supabase.from("lead_purchases").update({ status: "failed" }).eq("id", purchase.id);
    await supabase.from("diagnostics").update({ lead_locked_until: null }).eq("id", id).is("assigned_partner_id", null);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function upsertPendingPurchase(supabase: any, diagnosticId: string, partnerId: string, lockedUntil: string) {
  const { data: existing, error: existingError } = await supabase
    .from("lead_purchases")
    .select("id, status")
    .eq("request_id", diagnosticId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.status === "paid") {
    throw new Error("Ce dossier est déjà débloqué pour votre compte partenaire.");
  }

  if (existing) {
    const { data, error } = await supabase
      .from("lead_purchases")
      .update({
        status: "pending",
        locked_until: lockedUntil,
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("lead_purchases")
    .insert({
      request_id: diagnosticId,
      partner_id: partnerId,
      amount: 1000,
      status: "pending",
      locked_until: lockedUntil
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}
