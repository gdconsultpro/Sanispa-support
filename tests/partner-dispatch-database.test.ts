import {test} from 'node:test';import assert from 'node:assert/strict';
import {dispatchDatabase,ids,releaseJob} from './helpers/dispatch-fixture';
import {canViewPartnerOffer,partnerDispatchDecision} from '../lib/partner-release';
const withDb=async(run:(db:Awaited<ReturnType<typeof dispatchDatabase>>)=>Promise<void>)=>{const db=await dispatchDatabase();try{await run(db);}finally{await db.close();}};
test('unapproved offers cannot be seen or reserved; keep is audited, idempotent and preserves treatment status',()=>withDb(async db=>{
 const before=(await db.query<any>('select * from diagnostics')).rows[0];assert.equal(partnerDispatchDecision(before),'pending');assert.equal(canViewPartnerOffer(before,ids.a),false);
 for(const [pid,uid]of[[ids.a,ids.user],[ids.b,ids.otherUser]])await assert.rejects(db.query('select prepare_partner_acquisition($1,$2,$3,$4,$5)',[ids.d,pid,uid,'fixture-price',1500]),/LEAD_UNAVAILABLE/);
 await db.exec("update diagnostics set status='en analyse';set role service_role;");
 await db.query('select keep_partner_intervention($1,$2)',[ids.d,ids.admin]);await db.query('select keep_partner_intervention($1,$2)',[ids.d,ids.admin]);
 const row=(await db.query<any>('select * from diagnostics')).rows[0];assert.equal(row.status,'en analyse');assert.equal(partnerDispatchDecision(row),'internal');assert.deepEqual(row.matched_partner_ids,[]);assert.equal(row.partner_kept_by,ids.admin);assert.ok(row.partner_kept_at);
 const audit=(await db.query<any>('select * from diagnostic_activity')).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor,ids.admin);assert.equal(audit[0].metadata.decision,'internal');
 assert.equal((await db.query('select * from notification_jobs')).rows.length,0);
 await assert.rejects(db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.admin,releaseJob()]),/KEPT_BY_SANISPA/);
 await db.exec('reset role;set role authenticated;');await assert.rejects(db.query('select keep_partner_intervention($1,$2)',[ids.d,ids.admin]),/permission denied/);
}));
test('explicit release selects one eligible recipient, never assigns and a double validation queues once',()=>withDb(async db=>{
 await assert.rejects(db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.user,releaseJob()]),/ADMIN_REQUIRED/);
 await db.exec(`delete from partner_departments where partner_id='${ids.b}'`);
 await assert.rejects(db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.b,ids.admin,releaseJob(ids.b)]),/PARTNER_INELIGIBLE/);
 await Promise.all([1,2].map(()=>db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.admin,releaseJob()])));
 const row=(await db.query<any>('select * from diagnostics')).rows[0];assert.equal(partnerDispatchDecision(row),'released');assert.equal(row.status,'AVAILABLE');assert.equal(row.assigned_partner_id,null);assert.equal(canViewPartnerOffer(row,ids.a),true);assert.equal(canViewPartnerOffer(row,ids.b),false);
 assert.equal((await db.query('select * from lead_purchases')).rows.length,0);assert.equal((await db.query('select * from diagnostic_activity')).rows.length,1);
 const jobs=(await db.query<any>('select * from notification_jobs')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.notificationKey,`${ids.d}:manual-partner:${ids.a}`);
 await assert.rejects(db.query('select keep_partner_intervention($1,$2)',[ids.d,ids.admin]),/ALREADY_RELEASED/);
}));
test('after release paid/free terms are server-derived and existing reservations stay unchanged',()=>withDb(async db=>{
 await db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.admin,releaseJob()]);
 await assert.rejects(db.query('select prepare_partner_acquisition($1,$2,$3)',[ids.d,ids.a,ids.user]),/BILLING_TERMS_CHANGED/);
 const first=(await db.query<any>('select prepare_partner_acquisition($1,$2,$3,$4,$5) as result',[ids.d,ids.a,ids.user,'price_fixture',1500])).rows[0].result;
 assert.equal(first.kind,'checkout');assert.equal(first.purchase.payment_required,true);assert.equal(first.purchase.amount,1500);
 await db.exec(`update partners set leads_paid=false where id='${ids.a}';`);
 const again=(await db.query<any>('select prepare_partner_acquisition($1,$2,$3) as result',[ids.d,ids.a,ids.user])).rows[0].result;assert.equal(again.purchase.id,first.purchase.id);assert.equal(again.purchase.amount,1500);assert.equal(again.purchase.payment_required,true);
 await assert.rejects(db.query('select prepare_partner_acquisition($1,$2,$3)',[ids.d,ids.b,ids.otherUser]),/LEAD_UNAVAILABLE/);
}));
test('free release unlocks only after exclusive acquisition; repeated acquisition does not duplicate',()=>withDb(async db=>{
 await db.exec(`update partners set leads_paid=false where id='${ids.a}';`);
 await db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.admin,releaseJob()]);
 for(let i=0;i<2;i++) {const r=(await db.query<any>('select prepare_partner_acquisition($1,$2,$3) as result',[ids.d,ids.a,ids.user])).rows[0].result;assert.equal(r.kind,'assigned');assert.equal(r.purchase.payment_required,false);assert.equal(r.purchase.stripe_checkout_session_id,null);}
 const rows=(await db.query<any>('select * from diagnostics')).rows;assert.equal(rows[0].assigned_partner_id,ids.a);assert.equal((await db.query('select * from lead_purchases')).rows.length,1);
 await assert.rejects(db.query('select prepare_partner_acquisition($1,$2,$3)',[ids.d,ids.b,ids.otherUser]),/LEAD_UNAVAILABLE/);
}));
test('legacy purchased and pending acquisitions are preserved without fabricating release decisions',()=>withDb(async db=>{
 await db.exec(`insert into lead_purchases(request_id,partner_id,status,payment_required,amount,stripe_price_id) values('${ids.d}','${ids.a}','pending',true,1700,'price_old');`);
 const old=(await db.query<any>('select * from lead_purchases')).rows[0];
 await assert.rejects(db.query('select keep_partner_intervention($1,$2)',[ids.d,ids.admin]),/ACQUISITION_STARTED/);
 const result=(await db.query<any>('select prepare_partner_acquisition($1,$2,$3) as result',[ids.d,ids.a,ids.user])).rows[0].result;assert.equal(result.purchase.id,old.id);assert.equal(result.purchase.amount,1700);
 assert.equal((await db.query<any>('select partner_released_at from diagnostics')).rows[0].partner_released_at,null);
 await db.exec(`update lead_purchases set status='paid';update diagnostics set assigned_partner_id='${ids.a}';`);
 assert.equal((await db.query<any>('select prepare_partner_acquisition($1,$2,$3) as result',[ids.d,ids.a,ids.user])).rows[0].result.kind,'assigned');
 assert.equal((await db.query('select * from notification_jobs')).rows.length,0);
}));
test('submission strips partner proposals and partner jobs for home visits but retains client/internal confirmations',()=>withDb(async db=>{
 const draft='00000000-0000-4000-8000-000000000099';
 const payload={name:'TEST Nouvelle',phone:'0000000000',email:'test@example.invalid',address:'TEST',postalCode:'67000',city:'TEST',spaBrand:'TEST',spaYear:'2020',installationType:'exterieur',powerSupply:'230V',problemType:'fuite',choice:'intervention',answers:{}};
 await db.query('insert into diagnostic_drafts(id,user_id,payload) values($1,$2,$3)',[draft,ids.user,payload]);
 const jobs=['admin','customer','partner'].map(kind=>({key:`${draft}:${kind}`,kind,payload:{diagnosticId:draft}}));
 await db.query('select submit_diagnostic($1,$2,1,$3,$4,$5,$6,$7)',[draft,ids.user,'67',[ids.a],[],[],jobs]);
 const row=(await db.query<any>('select * from diagnostics where id=$1',[draft])).rows[0];assert.equal(partnerDispatchDecision(row),'pending');assert.deepEqual(row.matched_partner_ids,[]);
 assert.deepEqual((await db.query<any>('select kind from notification_jobs order by kind')).rows.map(r=>r.kind),['admin','customer']);
}));
test('queue claim is exclusive and persisted sent jobs are never reclaimed',()=>withDb(async db=>{
 await db.query('select release_partner_intervention($1,$2,$3,$4)',[ids.d,ids.a,ids.admin,releaseJob()]);
 const first=await db.query<any>('select * from claim_notifications()');assert.equal(first.rows.length,1);assert.ok(first.rows[0].first_delivery_attempt_at);
 assert.equal((await db.query('select * from claim_notifications()')).rows.length,0);
 await db.exec("update notification_jobs set state='sent',sent_at=now(),locked_until=null");assert.equal((await db.query('select * from claim_notifications()')).rows.length,0);
}));
