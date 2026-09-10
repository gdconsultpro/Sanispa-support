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

test('switching browser identity revokes only the old administrator session and clears its cookie', async () => {
  const { PATCH: synchronize } = await import('../app/api/admin/session/route');
  const { adminCookieName } = await import('../lib/admin-auth');
  const original = globalThis.fetch;
  const adminJwt = jwt('aal2');
  const clientId = '00000000-0000-4000-8000-000000000002';
  const clientJwt = jwt('aal1', { sub: clientId, session_id:'00000000-0000-4000-8000-000000000051' });
  const revoked: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
    if (url.pathname === '/auth/v1/user') {
      if (token !== adminJwt && token !== clientJwt) return Response.json({message:'Invalid JWT',code:'bad_jwt'},{status:401});
      return Response.json({id:token === adminJwt ? userId : clientId,email_confirmed_at:new Date().toISOString()});
    }
    if (url.pathname === '/rest/v1/rpc/private_session_status') {
      const body = JSON.parse(String(init?.body));
      return Response.json({active:!revoked.includes(body.p_user===userId ? adminJwt : clientJwt),is_admin:body.p_user===userId,mfa_verified:body.p_user===userId});
    }
    if (url.pathname === '/auth/v1/logout') {
      assert.equal(url.searchParams.get('scope'),'local');
      revoked.push(token!); return new Response(null,{status:204});
    }
    throw new Error(`Unexpected operation ${url.pathname}`);
  };
  const syncRequest=(token?:string,origin='https://app.example.invalid')=>new Request('https://app.example.invalid/api/admin/session',{method:'PATCH',headers:{Origin:origin,Cookie:`${adminCookieName}=${adminJwt}`,...(token?{Authorization:`Bearer ${token}`}:{})}});
  try {
    const unchanged=await synchronize(syncRequest(adminJwt));
    assert.equal(unchanged.status,200); assert.equal(unchanged.headers.get('set-cookie'),null); assert.deepEqual(revoked,[]);
    assert.equal((await synchronize(syncRequest(clientJwt,'https://attacker.example.invalid'))).status,403); assert.deepEqual(revoked,[]);
    const changed=await synchronize(syncRequest(clientJwt));
    assert.equal(changed.status,200); assert.equal((await changed.json()).adminCleared,true);
    assert.match(changed.headers.get('set-cookie')!,/Max-Age=0/); assert.deepEqual(revoked,[adminJwt]);
    assert.equal((await adminDenied(req(adminJwt)))?.status,401);
    const again=await synchronize(syncRequest(clientJwt));
    assert.equal(again.status,200); assert.match(again.headers.get('set-cookie')!,/Max-Age=0/); assert.deepEqual(revoked,[adminJwt]);
    revoked.length=0;
    const signedOut=await synchronize(syncRequest());
    assert.equal(signedOut.status,200); assert.deepEqual(revoked,[adminJwt]);
  } finally { globalThis.fetch=original; }
});
