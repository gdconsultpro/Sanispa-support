import { adminDossierPath, adminLoginPath } from "../lib/admin-navigation";
import { clientTokenConfirmationUrl } from "../lib/client-access";
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentsForDossier, hasOverdueAction, type AdminClientDocument } from '../lib/admin-dossier';
import { externalReportType } from '../lib/client-external-report';

const document = (id:string, user_id:string, diagnostic_id:string|null):AdminClientDocument => ({
  id, user_id, diagnostic_id, file_name:`${id}.pdf`, document_type:'Document', created_at:null, spa_id:null,
});
test('administrative documents retain actual account and dossier links without inferring ownership', () => {
  const rows = [document('client-only','client-a',null), document('this-dossier','client-a','dossier-a'),
    document('other-dossier-same-client','client-a','dossier-b'), document('other-client','client-b','dossier-c'),
    { ...document('external-report','client-a',null), document_type: externalReportType }];
  assert.deepEqual(documentsForDossier({id:'dossier-a',user_id:'client-a'},rows).map(d=>d.id),
    ['client-only','this-dossier','other-dossier-same-client']);
  assert.equal(rows[0].diagnostic_id,null, 'a client document is not reassigned to the dossier');
  assert.deepEqual(documentsForDossier({id:'dossier-a',user_id:null},rows).map(d=>d.id),['this-dossier']);
  assert.deepEqual(documentsForDossier({id:'unknown',user_id:null},rows),[]);
});
test('due actions exclude completed, cancelled, archived and closed dossiers and honor absolute time', () => {
  const now=Date.parse('2026-09-11T10:00:00Z');
  const dossier={archived_at:null,status:'en analyse',next_action_state:'pending',next_action_at:'2026-09-11T12:00:00+02:00'};
  assert.equal(hasOverdueAction(dossier,now),true);
  assert.equal(hasOverdueAction({...dossier,next_action_at:'2026-09-11T10:00:01Z'},now),false);
  for(const state of ['done','cancelled',null]) assert.equal(hasOverdueAction({...dossier,next_action_state:state},now),false);
  for(const status of ['terminé','CLOSED']) assert.equal(hasOverdueAction({...dossier,status},now),false);
  assert.equal(hasOverdueAction({...dossier,archived_at:'2026-09-01T00:00:00Z'},now),false);
  assert.equal(hasOverdueAction({...dossier,next_action_at:null},now),false);
  assert.equal(hasOverdueAction({...dossier,next_action_at:'invalid'},now),false);
});

test("administrative e-mail retains only an internal dossier and a known section through authentication", () => {
  const id = "84000000-0000-4000-8000-000000000003";
  const url = new URL(clientTokenConfirmationUrl("https://app.example.invalid", "x".repeat(64), "admin", undefined,
    { dossier: id, section: "followup" }));
  assert.equal(url.searchParams.get("next"), "admin");
  assert.equal(adminLoginPath(url.searchParams.get("dossier"), url.searchParams.get("section")), "/admin/connexion?dossier=" + id + "&section=followup");
  assert.equal(adminDossierPath(url.searchParams.get("dossier"), url.searchParams.get("section")), "/admin?dossier=" + id + "&section=followup");
  assert.equal(adminDossierPath("//invalid.example", "followup"), "/admin");
  assert.equal(adminDossierPath(id, "//invalid.example"), "/admin?dossier=" + id);
  const client = new URL(clientTokenConfirmationUrl("https://app.example.invalid", "x".repeat(64), "compte", undefined,
    { dossier: id, section: "followup" }));
  assert.equal(client.searchParams.has("dossier"), false);
});
