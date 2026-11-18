import Stripe from "stripe";

if (["preview", "production"].includes(process.env.VERCEL_ENV)) {
  const paused = process.env.NEXT_PUBLIC_SANISPA_BILLING_MODE !== "live";
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function db(path, init = {}) {
    const response = await fetch(`${origin}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("COMMERCIAL_DATABASE_UNAVAILABLE");
    return response.status === 204 ? null : response.json();
  }
  try {
    const actual = await db("rpc/commercial_payments_paused", { method: "POST", body: "{}" });
    if (actual !== paused) throw new Error("COMMERCIAL_MODE_MISMATCH");
    // Only checkouts recorded by this application are eligible. Do not touch the shop.
    if (paused) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia", timeout: 15000, maxNetworkRetries: 1 });
      const groups = [
        { table: "customer_subscription_checkouts", column: "stripe_session_id", filter: "state=eq.pending", type: "customer_premium" },
        { table: "partner_subscription_checkouts", column: "stripe_session_id", filter: "state=eq.pending", type: "partner_subscription" },
        { table: "lead_purchases", column: "stripe_checkout_session_id", filter: "status=eq.pending", type: "partner_lead_unlock" },
      ];
      let expired = 0;
      for (const group of groups) {
        const rows = await db(`${group.table}?select=id,${group.column}&${group.filter}&${group.column}=not.is.null&limit=100`);
        if (rows.length === 100) throw new Error("COMMERCIAL_RECONCILIATION_REQUIRED");
        for (const row of rows) {
          const session = await stripe.checkout.sessions.retrieve(row[group.column]);
          if (session.metadata?.type !== group.type) throw new Error("COMMERCIAL_CHECKOUT_MISMATCH");
          if (session.status === "complete") throw new Error("COMMERCIAL_COMPLETED_CHECKOUT_REVIEW_REQUIRED");
          if (session.status === "open") { await stripe.checkout.sessions.expire(session.id); expired++; }
          if (group.table !== "lead_purchases") await db(`${group.table}?id=eq.${row.id}&state=eq.pending`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ state: "expired" }) });
          else {
            const terms = await db(`lead_purchases?select=request_id,partner_id&id=eq.${row.id}`);
            await db("rpc/finish_partner_checkout", { method: "POST", body: JSON.stringify({ p_purchase: row.id, p_partner: terms[0].partner_id, p_diagnostic: terms[0].request_id, p_session: session.id, p_status: "expired" }) });
          }
        }
      }
      console.log(`SANISPA : paiements suspendus, accès offerts ; ${expired} ancienne(s) page(s) de paiement clôturée(s).`);
    } else console.log("SANISPA : mode commercial et base concordants.");
  } catch (error) {
    const code = error.message?.startsWith("COMMERCIAL_") ? error.message : "COMMERCIAL_VERIFICATION_FAILED";
    console.error("SANISPA : publication refusée — " + code);
    process.exit(1);
  }
}
