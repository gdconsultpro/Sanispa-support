import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { GET } from "../app/api/client/interventions/[id]/route";

test("the dossier owner can read the signed report and submitted declaration", async context => {
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
  let noteLookups = 0;
  let declarationLookups = 0;
  let note: string | null = "Le débit est faible.\nLa pompe s’arrête après quatre minutes.";
  const photoPath = `${dossier}/photo fictive`;
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
      if (!param("id")) return Response.json([]);
      return Response.json([{
        id: report, partner_id: oldPartner, performed_at: time, submitted_at: time,
        findings: "Constat de test", actions: "Travaux de test", next_steps: "Aucune suite à prévoir.",
      }]);
    }
    if (table === "diagnostic_answers") {
      assert.equal(param("diagnostic_id"), "eq." + dossier);
      if (param("question_key") === "neq.additional_information") {
        declarationLookups++;
        return Response.json([{ id: id(9), question_label: "Quels jets ?", answer: "Un groupe de jets" }]);
      }
      noteLookups++;
      assert.equal(param("question_key"), "eq.additional_information");
      assert.equal(param("select"), "answer");
      return Response.json(note ? [{ answer: note }] : []);
    }
    if (table === "diagnostic_photos") {
      declarationLookups++;
      assert.equal(param("diagnostic_id"), "eq." + dossier);
      return Response.json([{ id: id(10), photo_type: "visible_problem", storage_path: photoPath }]);
    }
    if (table === "partner_appointments" || table === "client_documents") return Response.json([]);
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
  const get = (query = "") => GET(new Request(`https://fixture.invalid/api/client/interventions/${dossier}${query}`, {
    headers: { Authorization: `Bearer ${token(requestUser)}` },
  }), { params: Promise.resolve({ id: dossier }) });
  const getPdf = () => get(`?rapport=${report}`);
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
    assert.equal(noteLookups, 0);
    assert.equal((await get()).status, 404);
    assert.equal((await get("?declaration=1")).status, 404);
    assert.equal(noteLookups, 0);
    assert.equal(declarationLookups, 0);
    requestUser = owner;
    const workspace = await get();
    assert.equal(workspace.status, 200);
    assert.equal((await workspace.json()).additionalInformation, note);
    assert.equal(declarationLookups, 0);
    const declaration = await get("?declaration=1");
    assert.equal(declaration.status, 200);
    assert.equal(declaration.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await declaration.json(), {
      answers: [{ id: id(9), label: "Quels jets ?", value: "Un groupe de jets" }],
      photos: [{
        id: id(10), label: "Photo du problème visible ou de l’équipement concerné",
        url: `/api/files/photo?path=${encodeURIComponent(photoPath)}`,
      }],
    });
    note = null;
    assert.equal((await (await get()).json()).additionalInformation, null);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
