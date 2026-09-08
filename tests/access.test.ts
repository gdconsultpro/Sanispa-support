import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as waterSession } from "../app/api/water-session/route";
import { POST as checkout } from "../app/api/checkout/route";
import { GET as adminPdf } from "../app/api/admin/diagnostics/[id]/pdf/route";
import { PUT as saveDraft } from "../app/api/client/drafts/route";
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-placeholder';
test('knowing only an email cannot disclose the water conversation', async () => {
    const response = await waterSession(new Request('https://app.example.invalid/api/water-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'victim@example.invalid' }) }));
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.token, undefined);
    assert.equal(body.messages, undefined);
});
test('checkout and cloud drafts require authenticated users', async () => {
    const request = () => new Request('https://app.example.invalid/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await checkout(request())).status, 401);
    assert.equal((await saveDraft(request())).status, 401);
});
test('admin PDF is protected even without the middleware', async () => {
    const response = await adminPdf(new Request('https://app.example.invalid/api/admin'), { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000010' }) });
    assert.equal(response.status, 401);
});
