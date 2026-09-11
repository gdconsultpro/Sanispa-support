import { test } from "node:test";
import assert from "node:assert/strict";
import { acquirePartnerLead } from "../lib/partner-acquisition";
import type { LeadPurchaseTerms } from "../lib/partner-billing";
import type { AuthenticatedPartner } from "../lib/partner-auth";
import { HttpError } from "../lib/http";

type Dependencies = NonNullable<Parameters<typeof acquirePartnerLead>[1]>;
type RpcResult = { data: unknown; error: { message: string } | null };
type RpcCall = { name: string; args: Record<string, unknown> };
const userId = "00000000-0000-4000-8000-000000000001";
const partnerId = "00000000-0000-4000-8000-000000000010";
const diagnosticId = "00000000-0000-4000-8000-000000000020";
const purchaseId = "00000000-0000-4000-8000-000000000030";
const origin = "https://app.example.invalid";
const partner: AuthenticatedPartner = {
  id: partnerId, company_name: "Partenaire fictif", contact_name: null,
  email: "partner@example.invalid", active: true, role: "owner", leads_paid: true
};

function fixture() {
  const purchase: LeadPurchaseTerms = {
    id: purchaseId, request_id: diagnosticId, partner_id: partnerId, status: "pending",
    payment_required: true, amount: 1000, currency: "eur", stripe_price_id: "price_frozen_local",
    stripe_checkout_session_id: null, locked_until: new Date(Date.now() + 3600000).toISOString()
  };
  const state = {
    purchase,
    prepareResults: [] as RpcResult[],
    calls: [] as RpcCall[],
    priceLoads: 0,
    stripeLoads: 0,
    retrieved: [] as string[],
    created: [] as Array<{ payload: Record<string, unknown>; options: { idempotencyKey: string } }>,
    createError: null as Error | null,
    session: { id: "cs_local_existing", status: "open", url: "https://checkout.example.invalid/reserved" }
  };
  const supabase = {
    from: () => assert.fail("The acquisition must ask the RPC before any pending-purchase table query."),
    rpc: async (name: string, args: Record<string, unknown>): Promise<RpcResult> => {
      state.calls.push({ name, args: structuredClone(args) });
      if (name === "prepare_partner_acquisition") {
        return state.prepareResults.shift() ?? { data: { kind: "checkout", purchase: structuredClone(state.purchase) }, error: null };
      }
      if (name === "attach_partner_checkout") {
        state.purchase.stripe_checkout_session_id = String(args.p_session);
        return { data: null, error: null };
      }
      if (name === "finish_partner_checkout") {
        state.purchase.status = String(args.p_status);
        return { data: null, error: null };
      }
      return assert.fail(`Unexpected RPC in local fixture: ${name}`);
    }
  };
  const dependencies: Dependencies = {
    loadPrice: async () => {
      state.priceLoads += 1;
      return { id: "price_current_local", amount: 1200, currency: "eur" };
    },
    stripe: () => {
      state.stripeLoads += 1;
      return {
        checkout: { sessions: {
          retrieve: async (id: string) => {
            state.retrieved.push(id);
            return structuredClone(state.session);
          },
          create: async (payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
            state.created.push({ payload: structuredClone(payload), options: structuredClone(options) });
            if (state.createError) throw state.createError;
            return { id: "cs_local_created", status: "open", url: "https://checkout.example.invalid/new" };
          }
        } }
      } as unknown as ReturnType<Dependencies["stripe"]>;
    }
  };
  const run = (currentPartner: AuthenticatedPartner = partner) => acquirePartnerLead({
    supabase, partner: currentPartner, userId, diagnosticId, origin
  }, dependencies);
  return { state, run };
}

async function withoutNetwork(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new Error("Real network access is forbidden in this injected-dependency test.");
  };
  try {
    await run();
    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function statusIs(status: number) {
  return (error: unknown) => error instanceof HttpError && error.status === status;
}

test("acquisition: free or already assigned result needs neither Stripe nor the current price", async () => {
  await withoutNetwork(async () => {
    for (const leadsPaid of [false, true]) {
      const { state, run } = fixture();
      state.prepareResults.push({ data: { kind: "assigned", purchase: null }, error: null });
      assert.deepEqual(await run({ ...partner, leads_paid: leadsPaid }), { acquired: true });
      assert.equal(state.priceLoads, 0);
      assert.equal(state.stripeLoads, 0);
      assert.deepEqual(state.calls, [{ name: "prepare_partner_acquisition", args: {
        p_diagnostic: diagnosticId, p_partner: partnerId, p_actor: userId,
        p_price_id: null, p_amount: null, p_currency: "eur"
      } }]);
    }
  });
});

test("acquisition: a paid reservation keeps its existing session after the partner setting becomes free", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.purchase.stripe_checkout_session_id = state.session.id;
    const snapshot = structuredClone(state.purchase);
    assert.deepEqual(await run({ ...partner, leads_paid: false }), { url: state.session.url });
    assert.equal(state.priceLoads, 0);
    assert.deepEqual(state.retrieved, [state.session.id]);
    assert.deepEqual(state.created, []);
    assert.deepEqual(state.purchase, snapshot);
    assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition"]);
  });
});

test("acquisition: new paid terms are requested only by the RPC and Checkout uses the frozen price and attempt key", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.prepareResults.push({ data: null, error: { message: "BILLING_TERMS_CHANGED" } });
    assert.deepEqual(await run(), { url: "https://checkout.example.invalid/new" });
    assert.equal(state.priceLoads, 1);
    assert.equal(state.stripeLoads, 1);
    assert.deepEqual(state.calls.slice(0, 2), [
      { name: "prepare_partner_acquisition", args: {
        p_diagnostic: diagnosticId, p_partner: partnerId, p_actor: userId,
        p_price_id: null, p_amount: null, p_currency: "eur"
      } },
      { name: "prepare_partner_acquisition", args: {
        p_diagnostic: diagnosticId, p_partner: partnerId, p_actor: userId,
        p_price_id: "price_current_local", p_amount: 1200, p_currency: "eur"
      } }
    ]);
    assert.deepEqual(state.created, [{
      payload: {
        mode: "payment", line_items: [{ price: "price_frozen_local", quantity: 1 }],
        success_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=success`,
        cancel_url: `${origin}/partenaire/leads/${diagnosticId}?unlock=cancel`,
        metadata: { type: "partner_lead_unlock", diagnostic_id: diagnosticId, partner_id: partnerId, lead_purchase_id: purchaseId }
      }, options: { idempotencyKey: `partner-lead-${purchaseId}` }
    }]);
    assert.deepEqual(state.calls[2], { name: "attach_partner_checkout", args: {
      p_purchase: purchaseId, p_partner: partnerId, p_diagnostic: diagnosticId, p_session: "cs_local_created"
    } });
    assert.equal(state.purchase.amount, 1000);
  });
});

test("acquisition: a reserved dossier is rejected before any Stripe or price operation", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.prepareResults.push({ data: null, error: { message: "LEAD_RESERVED" } });
    await assert.rejects(run(), statusIs(409));
    assert.equal(state.priceLoads, 0);
    assert.equal(state.stripeLoads, 0);
    assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition"]);
  });
});

test("acquisition: an expired provider session is released and requires a new explicit attempt", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.purchase.stripe_checkout_session_id = state.session.id;
    state.session.status = "expired";
    await assert.rejects(run(), statusIs(409));
    assert.equal(state.priceLoads, 0);
    assert.deepEqual(state.created, []);
    assert.equal(state.purchase.status, "expired");
    assert.deepEqual(state.calls[1], { name: "finish_partner_checkout", args: {
      p_purchase: purchaseId, p_partner: partnerId, p_diagnostic: diagnosticId,
      p_session: state.session.id, p_status: "expired"
    } });
    assert.equal(state.calls.length, 2);
  });
});

test("acquisition: a complete provider session awaits server confirmation and does not grant access itself", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.purchase.stripe_checkout_session_id = state.session.id;
    state.session.status = "complete";
    await assert.rejects(run(), (error: unknown) => statusIs(409)(error) && error instanceof Error && /confirmation/.test(error.message));
    assert.equal(state.priceLoads, 0);
    assert.deepEqual(state.created, []);
    assert.equal(state.purchase.status, "pending");
    assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition"]);
  });
});

test("acquisition: uncertain Checkout creation preserves the pending attempt and retries with the identical key", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    const interruption = new Error("Simulated uncertain provider response");
    state.createError = interruption;
    await assert.rejects(run(), error => error === interruption);
    assert.equal(state.purchase.status, "pending");
    assert.equal(state.purchase.stripe_checkout_session_id, null);
    assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition"]);
    state.createError = null;
    assert.deepEqual(await run(), { url: "https://checkout.example.invalid/new" });
    assert.equal(state.created.length, 2);
    assert.deepEqual(state.created[1], state.created[0]);
    assert.equal(state.created[0].options.idempotencyKey, `partner-lead-${purchaseId}`);
    assert.equal(state.priceLoads, 0);
    assert.equal(state.calls.some(call => call.name === "finish_partner_checkout"), false);
    assert.equal(state.purchase.status, "pending");
  });
});

test("acquisition: a free result from the second RPC never creates a Checkout session", async () => {
  await withoutNetwork(async () => {
    const { state, run } = fixture();
    state.prepareResults.push(
      { data: null, error: { message: "BILLING_TERMS_CHANGED" } },
      { data: { kind: "assigned", purchase: null }, error: null }
    );
    assert.deepEqual(await run(), { acquired: true });
    assert.equal(state.priceLoads, 1);
    assert.equal(state.stripeLoads, 0);
    assert.deepEqual(state.created, []);
    assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition", "prepare_partner_acquisition"]);
  });
});

test("acquisition: an old uncertain attempt without a valid future lock requires reconciliation without Stripe", async () => {
  await withoutNetwork(async () => {
    for (const lockedUntil of [null, "not-a-date", new Date(Date.now() - 1000).toISOString()]) {
      const { state, run } = fixture();
      state.purchase.locked_until = lockedUntil;
      const before = structuredClone(state.purchase);
      await assert.rejects(run(), statusIs(409));
      assert.equal(state.priceLoads, 0);
      assert.equal(state.stripeLoads, 0);
      assert.deepEqual(state.purchase, before);
      assert.deepEqual(state.calls.map(call => call.name), ["prepare_partner_acquisition"]);
    }
  });
});
