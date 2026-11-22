import { test } from "node:test";
import assert from "node:assert/strict";
import { partnerReturnPath } from "../lib/partner-navigation";
import { matchesWorkFilters, readWorkspaceSelection, workItemPath, workspacePath, workspaceWorkItems } from "../lib/partner-workspace";
import type { PendingPrivatePartnerVisit, PrivatePartnerVisit, SanispaPartnerVisit } from "../lib/partner-planner";
import { fullDatabase } from "./helpers/full-database";

const before = "2026-11-09T10:00:00.000Z";
const after = "2026-11-09T11:00:00.000Z";
const privateJob: PrivatePartnerVisit = {
  id: "private-visit", title: "Entretien", description: "", starts_at: before, ends_at: after,
  technician_id: null, updated_at: before,
  client: { id: "client", name: "Client fictif", email: "", phone: "", street: "1 rue Test", postal_code: "68000",
    city: "Colmar", latitude: null, longitude: null, source_diagnostic_id: null },
};
const waiting: PendingPrivatePartnerVisit = { ...privateJob, id: "pending", starts_at: null, ends_at: null };
const scheduledReport: SanispaPartnerVisit = {
  diagnostic_id: "assigned", starts_at: before, ends_at: after, updated_at: after, technician_id: "tech",
  diagnostic: { status: "ASSIGNED", problem_type: "fuite", customer: null,
    intervention_reports: [{ performed_at: after, submitted_at: after, client_validated_at: null, client_outcome: null }] },
};

test("the shared statuses distinguish an elapsed appointment, a report awaiting review and an explicit validation", () => {
  const now = Date.parse("2026-11-16T10:00:00.000Z");
  const items = workspaceWorkItems({
    visits: [privateJob, { ...privateJob, id: "review", completed_at: after },
      { ...privateJob, id: "validated", completed_at: after, validated_at: after }],
    sanispa: [scheduledReport],
    technicians: [],
    pendingVisits: [waiting],
    historyDossiers: [{ ...scheduledReport.diagnostic, id: "report-without-date", intervened_at: after }],
  }, now);
  const statuses = Object.fromEntries(items.map(item => [item.id, item.workStatus]));
  assert.deepEqual(statuses, { "private:private-visit": "due", "private:review": "review", "private:validated": "validated",
    "sanispa:assigned": "review", "sanispa:report-without-date": "review", "private:pending": "pending" });
  const waitingForReview = items.filter(item => matchesWorkFilters(item, "review", "tech"));
  assert.equal(waitingForReview.length, 1);
  assert.equal(workItemPath(waitingForReview[0]), "/partenaire/interventions/assigned#rapport");
  assert.equal(items.find(item => item.id === "sanispa:report-without-date")?.activityAt, after);
  assert.equal(items.filter(item => matchesWorkFilters(item, "pending", "all")).length, 1);
});

test("agenda, map and list keep the selected period and status in authenticated navigation", () => {
  const selection = { day: "2026-11-09", period: "week", status: "review", technician: "" } as const;
  for (const view of ["agenda", "map", "list"] as const) {
    const path = workspacePath(view, selection);
    assert.equal(partnerReturnPath(path), path);
    assert.deepEqual(readWorkspaceSelection(path.split("?")[1]), selection);
  }
  assert.equal(partnerReturnPath("/partenaire/planning?view=stock"), "/partenaire/planning?view=stock");
  assert.equal(partnerReturnPath("/partenaire/planning?jour=2026-11-09&next=https%3A%2F%2Fexample.invalid"), "/partenaire/leads");
  assert.deepEqual(readWorkspaceSelection("?jour=2026-02-31&statut=unknown"), {});
});

test("a private intervention only advances within its own company and validation preserves the scheduled history", async () => {
  const db = await fullDatabase();
  const ids = Array.from({ length: 8 }, (_, index) => "a4a10000-0000-4000-8000-00000000000" + (index + 1));
  const [owner, technician, otherOwner, partner, otherPartner, client, visit, line] = ids;
  try {
    await db.query("insert into auth.users(id,email) values ($1,'owner@example.invalid'),($2,'tech@example.invalid'),($3,'outside@example.invalid')", [owner, technician, otherOwner]);
    await db.query("insert into partners(id,company_name,email) values ($1,'Partenaire fictif','company@example.invalid'),($2,'Partenaire extérieur','outside@example.invalid')", [partner, otherPartner]);
    await db.query("insert into partner_planning_technicians(partner_id,id,name) values($1,$2,'Technicien')", [partner, line]);
    await db.query("insert into partner_users(partner_id,user_id,role,technician_id) values ($1,$2,'owner',null),($1,$3,'technician',$6),($4,$5,'owner',null)", [partner, owner, technician, otherPartner, otherOwner, line]);
    await db.query("insert into partner_private_clients(partner_id,id,name,street,postal_code,city) values ($1,$2,'Fiche fictive','1 rue Essai','68000','Colmar')", [partner, client]);
    await db.query("insert into partner_private_visits(partner_id,id,client_id,title,starts_at,ends_at,updated_at,technician_id) values ($1,$2,$3,'Entretien',$4,$5,$5,$6)", [partner, visit, client, before, after, line]);
    await db.exec("set role service_role");
    const advance = (actor: string, version: string | Date, validate: boolean) => db.query(
      "select advance_partner_private_visit($1,$2,$3,$4,$5)", [partner, actor, visit, version, validate]);
    await assert.rejects(advance(otherOwner, after, false), /PARTNER_WORK_ROLE_REQUIRED/);
    await assert.rejects(advance(owner, after, true), /PARTNER_VISIT_STATE_CHANGED/);
    await advance(technician, after, false);
    const receive = () => db.query<{ completed_at: Date; validated_at: Date | null; updated_at: Date; starts_at: Date }>(
      "select completed_at,validated_at,updated_at,starts_at from partner_private_visits where partner_id=$1 and id=$2", [partner, visit]);
    const completed = (await receive()).rows[0];
    assert.ok(completed.completed_at);
    assert.equal(completed.validated_at, null);
    await assert.rejects(advance(technician, completed.updated_at, true), /PARTNER_WORK_ROLE_REQUIRED/);
    await assert.rejects(db.query("update partner_private_visits set starts_at=null,ends_at=null where partner_id=$1 and id=$2", [partner, visit]), /PARTNER_VISIT_FINISHED/);
    // Preserve PostgreSQL's full timestamp precision for the optimistic version.
    const version = (await db.query<{ version: string }>("select updated_at::text version from partner_private_visits where partner_id=$1 and id=$2", [partner, visit])).rows[0].version;
    await advance(owner, version, true);
    const verified = (await receive()).rows[0];
    assert.ok(verified.validated_at);
    assert.equal(verified.starts_at.toISOString(), before);
  } finally { await db.close(); }
});
