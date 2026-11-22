import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fullDatabase } from "./helpers/full-database";

test("stock movements reconcile inventory and field usage, including returns and retried requests", async () => {
  const db = await fullDatabase();
  try {
    const [owner, technician, partner, other, client, visit, customer, dossier, part, spa, foreignPart, line] = Array.from({ length: 12 }, () => randomUUID());
    await db.query("insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'tech@example.invalid')", [owner, technician]);
    await db.query("insert into partners(id,company_name,email) values($1,'Entreprise','owner@example.invalid'),($2,'Autre','other@example.invalid')", [partner, other]);
    await db.query("insert into partner_planning_technicians(partner_id,id,name) values($1,$2,'Technicien')", [partner, line]);
    await db.query("insert into partner_users(partner_id,user_id,role,technician_id) values($1,$2,'owner',null),($1,$3,'technician',$4)", [partner, owner, technician, line]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values($1,$2,'Client','10 rue Test','67000','Strasbourg')", [partner, client]);
    await db.query("insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,technician_id) values($1,$2,$3,'SAV',now()-interval '1 hour',now()+interval '1 hour',$4)", [partner, visit, client, line]);
    await db.query("insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values($1,'Client','0600000000','client@example.invalid','Strasbourg','Spa test','2024','exterieur','230V')", [customer]);
    await db.query("insert into diagnostics(id,customer_id,problem_type,choice,status,assigned_partner_id) values($1,$2,'fuite','intervention','ASSIGNED',$3)", [dossier, customer, partner]);
    await db.query("insert into partner_appointments(diagnostic_id,partner_id,starts_at,ends_at,technician_id) values($1,$2,now()-interval '3 hours',now()-interval '2 hours',$3)", [dossier, partner, line]);
    await db.query("insert into partner_private_stock(partner_id,id,category,label,quantity) values($1,$2,'piece','Pièce externe',10)", [other, foreignPart]);

    await db.exec("set role service_role");
    const saveArticle = "select save_partner_inventory_item($1,$2,$3,$4,$5,$6,$7,$8)";
    await db.query(saveArticle, [partner, owner, part, "piece", "Joint", "J-01", 10, null]);
    await db.query(saveArticle, [partner, owner, part, "piece", "Joint", "J-01", 10, null]);
    await db.query(saveArticle, [partner, owner, spa, "spa", "Spa de test", "", 1, null]);
    const item = async () => (await db.query<{quantity: number; version: string}>(
      "select quantity,updated_at::text version from partner_private_stock where partner_id=$1 and id=$2", [partner, part])).rows[0];
    const initial = await item();
    const start = async (source: string, id: string) => (await db.query<{session: string}>(
      "select start_partner_field_visit($1,$2,$3,$4) session", [partner, technician, source, id])).rows[0].session;
    const privateSession = await start("private", visit);
    const sanispaSession = await start("sanispa", dossier);
    const consume = "select set_partner_field_stock_usage($1,$2,$3,$4,$5,$6,$7,$8,$9)";
    const stockUsage = (quantity: number, expected: number, op = randomUUID(), id: string = part) =>
      db.query(consume, [partner, technician, "private", visit, privateSession, id, quantity, expected, op]);

    const first = randomUUID();
    await stockUsage(3, 0, first);
    await stockUsage(3, 0, first);
    assert.equal((await item()).quantity, 7);
    await assert.rejects(db.query(saveArticle, [partner, owner, part, "piece", "Joint", "J-01", 8, initial.version]), /STOCK_CHANGED/);
    await assert.rejects(stockUsage(2, 0), /STOCK_USAGE_CHANGED/);
    await assert.rejects(stockUsage(11, 3), /STOCK_INSUFFICIENT/);
    await assert.rejects(stockUsage(1, 0, randomUUID(), foreignPart), /STOCK_NOT_FOUND/);
    await assert.rejects(stockUsage(1, 0, randomUUID(), spa), /STOCK_NOT_FOUND/);
    await assert.rejects(db.query(consume, [partner, technician, "sanispa", dossier, privateSession, part, 1, 0, randomUUID()]), /FIELD_NOT_FOUND/);
    await db.query(consume, [partner, technician, "sanispa", dossier, sanispaSession, part, 4, 0, randomUUID()]);
    await stockUsage(1, 3);
    assert.equal((await item()).quantity, 5);

    const usage = await db.query("select stock_id,used,available from get_partner_field_stock_usage($1,'private',$2)", [partner, visit]);
    assert.deepEqual(usage.rows, [{stock_id: part, used: 1, available: 5}]);
    await db.query("select submit_partner_field_report($1,$2,$3,$4,now(),'Constat de test suffisamment long','Travaux fictifs suffisamment longs','Contrôle final')",
      [partner, technician, privateSession, randomUUID()]);
    await stockUsage(3, 0, first);
    await assert.rejects(stockUsage(0, 1), /FIELD_ALREADY_FINISHED/);
    await db.query(saveArticle, [partner, owner, part, "piece", "Joint", "J-01", 8, (await item()).version]);
    const history = await db.query("select kind,delta,quantity_after from partner_stock_movements where partner_id=$1 and stock_id=$2 order by created_at,id", [partner, part]);
    assert.deepEqual(history.rows, [
      {kind: "opening", delta: 10, quantity_after: 10}, {kind: "use", delta: -3, quantity_after: 7},
      {kind: "use", delta: -4, quantity_after: 3}, {kind: "return", delta: 2, quantity_after: 5},
      {kind: "adjustment", delta: 3, quantity_after: 8},
    ]);
    const rows = JSON.stringify([{category: "piece", label: "Filtre", reference: "F-01", quantity: 5}]);
    await db.query("select import_partner_stock($1,$2,$3)", [partner, owner, rows]);
    await db.query("select import_partner_stock($1,$2,$3)", [partner, owner, rows]);
    assert.deepEqual((await db.query("select delta,quantity_after from partner_stock_movements where partner_id=$1 and kind='import'", [partner])).rows,
      [{delta: 5, quantity_after: 5}]);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from partner_stock_movements"), /permission denied/);
    await assert.rejects(stockUsage(1, 0), /permission denied/);
  } finally { await db.close(); }
});
