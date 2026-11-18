import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as list } from "../app/api/client/documents/route";
import { DELETE as remove } from "../app/api/client/documents/[id]/route";
import { POST as publishDocument } from "../app/api/admin/diagnostics/[id]/documents/route";
import { GET as file } from "../app/api/files/[kind]/route";
import { ids } from "./helpers/dispatch-fixture";
const base = "https://db.fixture.invalid",
  app = "https://app.fixture.invalid";
const token = `e30.${Buffer.from(JSON.stringify({ sub: ids.user, session_id: "00000000-0000-4000-8000-000000000050", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const request = (url: string, method = "GET") =>
  new Request(app + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Origin: app },
  });
test("client sees issued invoices, cannot delete SANISPA documents or deposit them as administrator; preview photo scope is checked", async () => {
  const originalFetch = globalThis.fetch,
    env = { ...process.env };
  let downloads = 0;
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, base, "No production requests");
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: ids.user,
        email: "client@example.invalid",
        email_confirmed_at: "2026-09-11",
      });
    if (url.pathname.endsWith("/rpc/private_session_status"))
      return Response.json({
        active: true,
        is_admin: false,
        mfa_verified: false,
      });
    if (url.pathname.endsWith("/diagnostics"))
      return Response.json({
        id: ids.d,
        request_type: "TECHNICAL_REQUEST",
        status: "AVAILABLE",
        archived_at: null,
        partner_released_at: "2026-09-11",
        partner_kept_at: null,
        matched_partner_ids: [ids.a],
        preview_photo_paths: ["selected/photo.jpg"],
      });
    if (url.pathname.endsWith("/client_documents")) {
      assert.equal(
        url.searchParams.get("user_id"),
        `eq.${ids.user}`,
        "every client document lookup is owner-scoped",
      );
      if (url.searchParams.has("id"))
        return Response.json({
          id: ids.customer,
          user_id: ids.user,
          issued_by: "sanispa",
        });
      return Response.json([
        {
          id: ids.customer,
          document_type: "Facture d’intervention",
          file_name: "facture.pdf",
          issued_by: "sanispa",
          created_at: "2026-09-11",
          diagnostic_id: ids.d,
        },
      ]);
    }
    if (url.pathname.endsWith("/partner_users"))
      return Response.json({ partner_id: ids.a, partners: { active: true } });
    if (url.pathname.endsWith("/diagnostic_photos")) {
      assert.equal(url.searchParams.get("diagnostic_id"), `eq.${ids.d}`);
      return Response.json({ storage_path: "selected/photo.jpg" });
    }
    if (url.pathname.includes("/storage/")) {
      downloads++;
      return new Response("fixture image", {
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    throw new Error(`Unexpected ${url.pathname} ${init?.method}`);
  };
  try {
    // This endpoint also queries summary dossiers; they are intentionally empty for this scenario.
    const documentFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) =>
      new URL(String(input)).pathname.endsWith("/diagnostics")
        ? Response.json([])
        : documentFetch(input, init);
    const response = await list(request("/api/client/documents"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).documents[0].issuedBy, "sanispa");
    globalThis.fetch = documentFetch;
    assert.equal(
      (
        await remove(
          request(`/api/client/documents/${ids.customer}`, "DELETE"),
          { params: Promise.resolve({ id: ids.customer }) },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await publishDocument(
          request(`/api/admin/diagnostics/${ids.d}/documents`, "POST"),
          { params: Promise.resolve({ id: ids.d }) },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await file(
          request(
            `/api/files/preview?diagnostic=${ids.d}&path=foreign/photo.jpg`,
          ),
          { params: Promise.resolve({ kind: "preview" }) },
        )
      ).status,
      404,
    );
    assert.equal(downloads, 0);
    assert.equal(
      (
        await file(
          request(
            `/api/files/preview?diagnostic=${ids.d}&path=selected/photo.jpg`,
          ),
          { params: Promise.resolve({ kind: "preview" }) },
        )
      ).status,
      200,
    );
    assert.equal(downloads, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
