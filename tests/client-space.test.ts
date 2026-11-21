import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as drafts } from "../app/api/client/drafts/route";
import { GET as dashboard } from "../app/api/client/dashboard/route";
import { GET as care } from "../app/api/client/care/route";
import { clientCaseProgress, type ClientCase } from "../lib/client-case-progress";
import { clientCaseLoginPath, clientCaseReturnPath } from "../lib/client-case-navigation";
import { sendCustomerConfirmation } from "../lib/email";
import { clientDisplayName } from "../lib/client-display-name";
import { missingContactFields } from "../lib/diagnostic-contact";

const owner = "90000000-0000-4000-8000-000000000001";
const dossierId = "90000000-0000-4000-8000-000000000002";
const created = "2026-11-19T12:00:00.000Z";
const updated = "2026-11-20T12:00:00.000Z";
const dossier: ClientCase = {
  id: dossierId, public_reference: "SAV-1", status: "NEW",
  problem_type: "fuite", choice: "intervention", payment_status: null, created_at: created,
};

test("the session label uses the first name and last initial for current and legacy profiles", () => {
  assert.equal(clientDisplayName("Camille", "Durand"), "Camille D.");
  assert.equal(clientDisplayName("Jean-Pierre Évrard", ""), "Jean-Pierre É.");
  assert.equal(clientDisplayName(" Camille ", null), "Camille");
  assert.equal(clientDisplayName(null, null), "");
  assert.deepEqual(missingContactFields({ name: "Camille", email: "camille@example.invalid", phone: "  ", postalCode: "", city: "Strasbourg", address: "" }), ["phone", "postalCode"]);
});

test("the receipt e-mail has three separate destinations on the current app origin", async () => {
  const previousFetch = globalThis.fetch;
  const env = { ...process.env };
  const app = "https://support.sani-spa.fr";
  Object.assign(process.env, { NEXT_PUBLIC_APP_URL: app, RESEND_API_KEY: "fixture", EMAIL_PROVIDER: "resend" });
  let html = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    html = JSON.parse(String(init?.body)).html;
    return Response.json({ id: "simulated-receipt" });
  };
  try {
    await sendCustomerConfirmation({
      diagnosticId: dossierId, dossierReference: "SAV-1", appUrl: "https://legacy.fixture.invalid",
      customer: { name: "Client Test", phone: "0000000000", email: "client@example.invalid", address: "Rue de test", spaBrand: "Fictif", spaYear: "" },
      problemType: "fuite", choice: "intervention", answers: [], photos: [],
    });
    const links = [...html.matchAll(/<a href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(links, [
      app + "/espace-client",
      app + "/espace-client/interventions/" + dossierId,
      app + "/espace-client/interventions/" + dossierId + "/resume-pdf",
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});

test("client login preserves only known case and summary destinations", () => {
  const path = "/espace-client/interventions/" + dossierId;
  for (const destination of [path, path + "#validation", path + "/resume-pdf"]) {
    const login = new URL(clientCaseLoginPath(destination), "https://support.sani-spa.fr");
    assert.equal(login.pathname, "/connexion");
    assert.equal(login.searchParams.get("next"), "compte");
    assert.equal(clientCaseReturnPath(login.searchParams.get("retour")), destination);
  }
  for (const invalid of ["//fixture.invalid", "https://fixture.invalid" + path, path + "/../../", path + "?next=//fixture.invalid", "/espace-client/interventions/invalid/resume-pdf"]) {
    assert.equal(clientCaseReturnPath(invalid), null);
  }
});

test("case actions reflect appointments, unread reports and completed work", () => {
  assert.equal(clientCaseProgress(dossier).label, "Demande reçue");
  assert.equal(clientCaseProgress({ ...dossier, status: "en analyse", updates: [{ created_at: updated }] }).updatedAt, updated);
  const appointment = { starts_at: "2026-11-22T09:00:00Z", ends_at: "2026-11-22T10:00:00Z", updated_at: updated };
  assert.equal(clientCaseProgress({ ...dossier, appointment }, Date.parse(updated)).label, "Rendez-vous confirmé");
  assert.equal(clientCaseProgress({ ...dossier, appointment }, Date.parse("2026-11-23T00:00:00Z")).label, "Compte rendu attendu");
  const report = { submitted_at: updated, client_validated_at: null, client_outcome: null };
  const waiting = clientCaseProgress({ ...dossier, reports: [report] });
  assert.equal(waiting.needsAttention, true);
  assert.equal(waiting.href, `/espace-client/interventions/${dossierId}#validation`);
  const done = clientCaseProgress({ ...dossier, reports: [{ ...report, client_validated_at: updated, client_outcome: "repaired" }] });
  assert.equal(done.needsAttention, false);
  assert.equal(done.label, "Dossier terminé");
});

test("client overview endpoints constrain data to the session owner and return only the required summaries", async () => {
  const previous = globalThis.fetch;
  const env = { ...process.env };
  const db = "https://client-space.fixture.invalid";
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    NEXT_PUBLIC_SANISPA_BILLING_MODE: "live",
  });
  const token = `e30.${Buffer.from(JSON.stringify({
    sub: owner, role: "authenticated", session_id: "90000000-0000-4000-8000-000000000003",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url")}.fixture`;
  const request = (path: string, authenticated = true) => new Request("https://app.fixture.invalid/api/client/" + path, {
    headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, db);
    const table = url.pathname.split("/").at(-1);
    const param = (key: string) => url.searchParams.get(key);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: owner, email: "client@example.invalid", email_confirmed_at: created });
    if (table === "private_session_status") return Response.json({ active: true });
    if (table === "customer_has_premium") return Response.json(true);
    if (table === "customer_subscriptions") return Response.json({ status: "active", paid_until: "2099-01-01" });
    assert.equal(param("user_id"), `eq.${owner}`);
    if (table === "diagnostic_drafts") {
      assert.equal(param("submitted_at"), "is.null");
      assert.match(param("select") || "", /problemType:payload->>problemType/);
      assert.match(param("select") || "", /spaId:payload->>spaId/);
      assert.doesNotMatch(param("select") || "", /photos|answers|\*/);
      return Response.json([{ id: dossierId, step: "/upload", problemType: "fuite" }]);
    }
    if (table === "diagnostics") {
      assert.equal(param("id"), `eq.${dossierId}`);
      assert.equal(param("archived_at"), "is.null");
      assert.equal(param("invoices.user_id"), `eq.${owner}`);
      assert.equal(param("visios.requester_id"), `eq.${owner}`);
      assert.equal(param("reports.limit"), "1");
      assert.doesNotMatch(param("select") || "", /findings|meeting_url|metadata/);
      return Response.json([dossier]);
    }
    if (table === "care_reminders") {
      assert.equal(param("completed_at"), "is.null");
      assert.equal(param("limit"), "1");
      return Response.json({ title: "Changer le filtre" });
    }
    if (table === "water_readings") {
      assert.equal(param("limit"), "1");
      assert.equal(param("order"), "measured_at.desc");
      return Response.json({ ph: 7.6 });
    }
    throw new Error("Unexpected request " + url.pathname);
  };
  try {
    assert.equal((await drafts(request("drafts", false))).status, 401);
    const draftList = await drafts(request("drafts"));
    assert.equal(draftList.status, 200);
    assert.equal((await draftList.json()).drafts[0].step, "/upload");
    const cases = await dashboard(request(`dashboard?followUp=1&id=${dossierId}`));
    assert.equal(cases.status, 200);
    assert.equal((await cases.json()).diagnostics[0].id, dossierId);
    const overview = await care(request("care?overview=1"));
    assert.equal(overview.status, 200);
    assert.deepEqual(await overview.json(), { nextReminder: { title: "Changer le filtre" }, lastReading: { ph: 7.6 } });
  } finally {
    globalThis.fetch = previous;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
