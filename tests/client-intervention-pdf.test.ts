import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { GET } from "../app/api/client/interventions/[id]/route";

test("a signed report PDF follows its dossier owner after a partner change", async context => {
  const env = { ...process.env };
  const db = "https://client-report.fixture.invalid";
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db, SUPABASE_SERVICE_ROLE_KEY: "fixture" });
  const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const [owner, other, dossier, oldPartner, assigned, report, session] = [1,2,3,4,5,6,7].map(id);
  const time = "2026-11-22T13:00:00Z";
  const token = (sub: string) => `e30.${Buffer.from(JSON.stringify({
    sub, role: "authenticated", session_id: id(8), exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url")}.fixture`;
  let requestUser = owner;
  let signed = true;
  let pdfLookups = 0;
  context.mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    const url = new URL(String(input));
    assert.equal(url.origin, db);
    const table = url.pathname.split("/").at(-1);
    const param = (key: string) => url.searchParams.get(key);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: requestUser, email: "client@example.invalid", email_confirmed_at: time });
    if (table === "private_session_status") return Response.json({ active: true });
    if (table === "diagnostics") {
      assert.equal(param("user_id"), "eq." + requestUser);
      assert.equal(param("id"), "eq." + dossier);
      return Response.json(requestUser === owner ? [{
        id: dossier, user_id: owner, status: "ASSIGNED", assigned_partner_id: assigned,
        public_reference: "RAPPORT-01", problem_type: "fuite",
        customers: { name: "Client fictif", address: "Place Rapp", spa_brand: "Spa Exemple" },
      }] : []);
    }
    if (table === "intervention_reports") {
      assert.equal(param("diagnostic_id"), "eq." + dossier);
      return Response.json([{
        id: report, partner_id: oldPartner, performed_at: time, submitted_at: time,
        findings: "Constat de test", actions: "Travaux de test", next_steps: "Aucune suite à prévoir.",
      }]);
    }
    if (table === "partners") {
      pdfLookups++;
      assert.equal(param("id"), "eq." + oldPartner);
      return Response.json([{ company_name: "Partenaire de la visite" }]);
    }
    if (table === "partner_field_sessions") {
      assert.equal(param("diagnostic_id"), "eq." + dossier);
      assert.equal(param("partner_id"), "eq." + oldPartner);
      assert.equal(param("report_id"), "eq." + report);
      return Response.json([{
        id: session, report_id: report, submitted_at: time,
        customer_signature: signed ? { name: "Client fictif", strokes: [[[20,30],[120,180],[285,90]]] } : null,
      }]);
    }
    if (table === "partner_field_photos") {
      assert.equal(param("session_id"), "eq." + session);
      assert.equal(param("kind"), "neq.receipt");
      return Response.json([]);
    }
    throw new Error("Unexpected query " + url.pathname);
  });
  const getPdf = () => GET(new Request(`https://fixture.invalid/api/client/interventions/${dossier}?rapport=${report}`, {
    headers: { Authorization: `Bearer ${token(requestUser)}` },
  }), { params: Promise.resolve({ id: dossier }) });
  try {
    const response = await getPdf();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const pdf = await PDFDocument.load(await response.arrayBuffer());
    assert.equal(pdf.getAuthor(), "Partenaire de la visite");
    signed = false;
    assert.equal((await getPdf()).status, 404);
    requestUser = other;
    assert.equal((await getPdf()).status, 404);
    assert.equal(pdfLookups, 2);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
