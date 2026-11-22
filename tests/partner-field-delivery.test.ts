import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { sendFieldReportPdfEmail } from "../lib/email";
import { buildSummaryPdf } from "../lib/pdf";

test("the signed report email contains the exact PDF bytes and an idempotency key", async context => {
  const env = { EMAIL_PROVIDER: process.env.EMAIL_PROVIDER, RESEND_API_KEY: process.env.RESEND_API_KEY };
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "fixture";
  const report = () => buildSummaryPdf(["Intervention", "Rapport SAV"], { field: {
    company: "Atelier fictif", photos: [], issuedAt: "2026-11-22T13:00:00Z",
    signature: { name: "Camille Exemple", signedAt: "22 novembre 2026 à 14:00", strokes: [[[40, 180], [100, 40], [150, 195]]] },
  } });
  let emails = 0;
  try {
    const bytes = await report();
    assert.deepEqual(await report(), bytes);
    context.mock.method(globalThis, "fetch", async (url: URL | string | Request, init?: RequestInit) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      const content = JSON.parse(String(init?.body));
      assert.equal(content.to, "client@example.invalid");
      assert.equal(new Headers(init?.headers).get("idempotency-key"), "fixture-report-and-recipient");
      assert.equal(content.attachments.length, 1);
      assert.equal(content.attachments[0].filename, "compte-rendu-test.pdf");
      const attached = Buffer.from(content.attachments[0].content, "base64");
      assert.deepEqual(attached, bytes);
      assert.equal((await PDFDocument.load(attached)).getTitle(), "Compte rendu d’intervention");
      emails += 1;
      return Response.json({ id: "fixture-mail" });
    });
    const result = await sendFieldReportPdfEmail({ email: "client@example.invalid", company: "Atelier fictif",
      pdf: bytes, filename: "compte-rendu-test.pdf", key: "fixture-report-and-recipient" });
    assert.equal(result.skipped, false);
    assert.equal(emails, 1);
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
