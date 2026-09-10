import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminDenied, requireSameOrigin } from '../lib/admin-auth';
import { POST as issueCookie } from '../app/api/admin/session/route';
import { GET as downloadAdminDocument } from '../app/api/admin/documents/[id]/route';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-placeholder';
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000050';
const jwt = (aal: string, extra = {}) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId, session_id:sessionId, role:'authenticated', exp:Math.floor(Date.now()/1000)+3600, aal,...extra})).toString('base64url')}.test-signature`;
const req = (token: string, method='GET') => new Request('https://app.example.invalid/api/admin/session', {method,headers:{Authorization:`Bearer ${token}`, Origin:'https://app.example.invalid'}});

test('every administrator entry checks server membership, MFA and revocation; tampered tokens fail', async () => {
  const original = globalThis.fetch;
  let active = true, isAdmin = false, mfa = false, valid = jwt('aal1');
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/auth/v1/user') {
      const h = new Headers(init?.headers);
      if (h.get('authorization') !== `Bearer ${valid}`) return Response.json({message:'Invalid JWT', code:'bad_jwt'}, {status:401});
      // An attacker-controlled metadata role must never grant administrator access.
      return Response.json({id:userId,email:'client@example.invalid',email_confirmed_at:new Date().toISOString(),user_metadata:{role:'admin',aal:'aal2'}});
    }
    if (url.pathname === '/rest/v1/rpc/private_session_status') return Response.json({active,is_admin:isAdmin,mfa_verified:mfa});
    throw new Error(`Unexpected sensitive operation: ${url.pathname}`);
  };
  try {
    assert.equal((await adminDenied(req(valid)))?.status,403);
    isAdmin = true;
    assert.equal((await adminDenied(req(valid)))?.status,403);
    valid = jwt('aal2'); mfa = true;
    assert.equal(await adminDenied(req(valid)),null);
    const cookie = await issueCookie(req(valid, 'POST'));
    assert.equal(cookie.status,200);
    assert.match(cookie.headers.get('set-cookie')!, /HttpOnly/i);
    assert.match(cookie.headers.get('set-cookie')!, /SameSite=strict/i);
    active = false;
    assert.equal((await adminDenied(req(valid)))?.status,401);
    assert.equal((await issueCookie(req(valid,'POST'))).status,401);
    active = true; mfa = false;
    assert.equal((await adminDenied(req(valid)))?.status,403);
    assert.equal((await downloadAdminDocument(req(valid),{params:Promise.resolve({id:userId})})).status,403);
    mfa = true;
    assert.equal((await adminDenied(req(jwt('aal2',{exp:9999999999}))))?.status,401);
  } finally { globalThis.fetch = original; }
});
test('administrator mutations reject cross-origin and absent-origin requests', () => {
  for (const origin of [undefined,'https://attacker.example.invalid','null']) {
    assert.throws(() => requireSameOrigin(new Request('https://app.example.invalid/api/admin', {method:'POST',headers:origin ? {origin} : {}})), /Origine/);
  }
  assert.doesNotThrow(() => requireSameOrigin(new Request('https://app.example.invalid/api/admin', {method:'POST',headers:{origin:'https://app.example.invalid'}})));
});
