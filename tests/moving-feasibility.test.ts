import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDatabase } from "./helpers/full-database";
import { draftSchema, validateSubmission } from "../lib/draft-schema";
import { emptyDraft } from "../lib/storage";
import { confirmedClientDestination, clientTokenConfirmationUrl, publicClientIntent } from "../lib/client-access";
import { serializeAnswers } from "../lib/diagnostic-answers";
const user="30000000-0000-4000-8000-000000000001", stranger="30000000-0000-4000-8000-000000000002", draftId="30000000-0000-4000-8000-000000000010", mediaId="30000000-0000-4000-8000-000000000020";
const payload={...emptyDraft,email:"client@example.invalid",name:"Client TEST",phone:"0600000000",postalCode:"67000",city:"Strasbourg",installationType:"exterieur",problemType:"demenagement",choice:"devis",answers:{moving_departure:"1 rue de départ",moving_destination:"2 rue d’arrivée, 68000 Colmar",moving_date:"Décembre",moving_dimensions:"200 × 200 × 90 cm",moving_places:"6",moving_weight:"Valeur inconnue",moving_departure_access:"Marches ou escalier",moving_departure_details:"Trois marches et un portail de 2 m",moving_destination_access:"Accès de plain-pied",moving_destination_details:"Passage libre",moving_lifting:"Oui, au départ"}};
test("moving dossier keeps both addresses, seats, unknown empty weight and lifting needs through submission; email resumes uploads",()=>{
 const draft=draftSchema.parse(payload); const validated=validateSubmission(draft);const saved=serializeAnswers(validated);
 assert.equal(saved.find(a=>a.question_key==="moving_places")?.answer,"6");assert.equal(saved.find(a=>a.question_key==="moving_weight")?.answer,"Valeur inconnue");
 assert.equal(saved.find(a=>a.question_key==="moving_destination")?.answer,payload.answers.moving_destination);
 assert.equal(confirmedClientDestination(draft,draft.email),"/upload");assert.equal(confirmedClientDestination(draft,"other@example.invalid"),"/diagnostic");
 assert.throws(()=>validateSubmission({...draft,answers:{...draft.answers,moving_places:"0"}}));
 assert.throws(()=>validateSubmission({...draft,answers:{...draft.answers,moving_places:"5,5"}}));
 assert.throws(()=>validateSubmission({...draft,answers:{...draft.answers,moving_weight:"Écran illisible"}}));
 for(const next of ["carnet","releves","notices"] as const){assert.equal(publicClientIntent(next),next);assert.equal(new URL(clientTokenConfirmationUrl("https://support.sani-spa.fr","x".repeat(64),next)).searchParams.get("next"),next);}
 assert.equal(publicClientIntent("https://evil.invalid"),"diagnostic");
});
test("private video finalization is owner scoped and idempotent, follows submission, and rejects direct client SQL access",async()=>{
 const db=await fullDatabase();
 try{
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'client@example.invalid',now()),($2,'other@example.invalid',now())",[user,stranger]);
 await db.query("insert into diagnostic_drafts(id,user_id,payload,step) values($1,$2,$3,'/upload')",[draftId,user,JSON.stringify(payload)]);
 await db.query("insert into moving_media_uploads(id,draft_id,user_id,slot,storage_path,file_name,mime_type,file_size) values($1,$2,$3,0,'private/path.mp4','acces.mp4','video/mp4',1024)",[mediaId,draftId,user]);
 await assert.rejects(db.query("select complete_moving_media_upload($1,$2)",[mediaId,stranger]),/MEDIA_NOT_FOUND/);
 await db.exec("set role service_role");
 await db.query("select complete_moving_media_upload($1,$2)",[mediaId,user]);await db.query("select complete_moving_media_upload($1,$2)",[mediaId,user]);
 await db.exec("reset role");
 assert.equal((await db.query<any>("select count(*)::int n from client_documents where draft_id=$1",[draftId])).rows[0].n,1);
 assert.equal((await db.query<any>("select diagnostic_id from client_documents where id=$1",[mediaId])).rows[0].diagnostic_id,null);
 await db.query("select submit_diagnostic($1,$2,1,'67','{}','[]','[]','[]')",[draftId,user]);
 assert.equal((await db.query<any>("select diagnostic_id from client_documents where id=$1",[mediaId])).rows[0].diagnostic_id,draftId);
 // An upload started before submission may finish after it, without losing its attachment.
 const second="30000000-0000-4000-8000-000000000021";
 await db.query("insert into moving_media_uploads(id,draft_id,user_id,slot,storage_path,file_name,mime_type,file_size) values($1,$2,$3,1,'private/second.mp4','arrivee.mp4','video/mp4',1024)",[second,draftId,user]);
 await db.exec("set role service_role");await db.query("select complete_moving_media_upload($1,$2)",[second,user]);await db.exec("reset role");
 assert.equal((await db.query<any>("select diagnostic_id from client_documents where id=$1",[second])).rows[0].diagnostic_id,draftId);
 await db.exec("set role authenticated");await assert.rejects(db.query("select * from moving_media_uploads"),/permission denied/);await assert.rejects(db.query("select complete_moving_media_upload($1,$2)",[mediaId,user]),/permission denied/);await db.exec("reset role");
 assert.equal((await db.query<any>("select public from storage.buckets where id='moving-videos'")).rows[0].public,false);
 const manuals=(await db.query<any>("select brand,language,source_kind from spa_manuals where active and language='fr'")).rows;assert.equal(manuals.length,8);assert.ok(manuals.every(m=>m.source_kind==="manual"));
 }finally{await db.close();}
});
