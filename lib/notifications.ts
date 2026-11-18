import { sendPartnerAcceptance, sendClientReportNotification, sendPremiumCareReminder } from "./email";
import { canNotifyPartnerOffer } from "./partner-release";
import { getSupabaseAdmin } from "./supabase";
import {
  sendCustomerConfirmation,
  sendDiagnosticNotification,
  sendPartnerLeadNotification,
  sendWaterAssistanceResumeLink,
} from "./email";
export async function processNotifications(prefix?: string) {
  const supabase = getSupabaseAdmin();
  const { data: jobs, error } = await supabase.rpc("claim_notifications", {
    p_key: prefix || null,
  });
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const job of jobs || []) {
    try {
      let result;
      if (job.kind === "premium_care") {
        const [reminder, premium] = await Promise.all([
          supabase.from("care_reminders").select("version,completed_at").eq("id", job.payload.reminderId).eq("user_id", job.payload.userId).maybeSingle(),
          supabase.rpc("customer_has_premium", { p_user: job.payload.userId }),
        ]);
        if (reminder.error || premium.error) throw reminder.error || premium.error;
        if (!premium.data || !reminder.data || reminder.data.completed_at || reminder.data.version !== job.payload.version) {
          const cancel = await supabase.from("notification_jobs").update({ state: "cancelled", locked_until: null }).eq("id", job.id);
          if (cancel.error) throw cancel.error;
          continue;
        }
        const firstAttempt = Date.parse(job.first_delivery_attempt_at || "");
        if (!Number.isFinite(firstAttempt) || Date.now() - firstAttempt >= 23 * 3600000 || (process.env.EMAIL_PROVIDER || "resend").toLowerCase() !== "resend") {
          const review = await supabase.from("notification_jobs").update({ state: "delivery_unknown", locked_until: null }).eq("id", job.id);
          if (review.error) throw review.error;
          continue;
        }
        result = await sendPremiumCareReminder(job.payload);
      } else if (job.kind === "client_report" || job.kind === "client_review_reminder") {
        const { data: report, error: reportError } = await supabase.from("intervention_reports").select("client_validated_at,diagnostics!inner(archived_at)").eq("id", job.payload.reportId).maybeSingle();
        if (reportError) throw reportError;
        const dossier = Array.isArray(report?.diagnostics) ? report.diagnostics[0] : report?.diagnostics;
        if (!report || report.client_validated_at || dossier?.archived_at) {
          const cancelled = await supabase.from("notification_jobs").update({ state: "cancelled", locked_until: null }).eq("id", job.id);
          if (cancelled.error) throw cancelled.error;
          continue;
        }
        const firstAttempt = Date.parse(job.first_delivery_attempt_at || "");
        if (!Number.isFinite(firstAttempt) || Date.now() - firstAttempt >= 23 * 3600000 || (process.env.EMAIL_PROVIDER || "resend").toLowerCase() !== "resend") {
          const review = await supabase.from("notification_jobs").update({ state: "delivery_unknown", locked_until: null }).eq("id", job.id);
          if (review.error) throw review.error;
          continue;
        }
        result = await sendClientReportNotification(job.payload, job.kind === "client_review_reminder");
      } else if (job.kind === "admin")
        result = await sendDiagnosticNotification(job.payload);
      else if (job.kind === "partner_accepted") {
        const firstAttempt = Date.parse(job.first_delivery_attempt_at || "");
        if (
          !Number.isFinite(firstAttempt) ||
          Date.now() - firstAttempt >= 23 * 60 * 60 * 1000 ||
          (process.env.EMAIL_PROVIDER || "resend").toLowerCase() !== "resend"
        ) {
          const review = await supabase
            .from("notification_jobs")
            .update({ state: "delivery_unknown", locked_until: null })
            .eq("id", job.id);
          if (review.error) throw review.error;
          continue;
        }
        result = await sendPartnerAcceptance(job.payload);
      } else if (job.kind === "customer")
        result = await sendCustomerConfirmation(job.payload);
      else if (job.kind === "partner") {
        const { data: dossier, error: lookupError } = await supabase
          .from("diagnostics")
          .select(
            "choice,request_type,partner_released_at,partner_kept_at,matched_partner_ids,assigned_partner_id,archived_at,status",
          )
          .eq("id", job.payload.diagnosticId)
          .maybeSingle();
        if (lookupError) throw lookupError;
        const authorized = dossier && canNotifyPartnerOffer(dossier, job);
        if (!authorized) {
          const { error: cancelError } = await supabase
            .from("notification_jobs")
            .update({ state: "cancelled", locked_until: null })
            .eq("id", job.id);
          if (cancelError) throw cancelError;
          continue;
        }
        // Provider deduplication lasts 24h. Stop uncertain retries before that boundary.
        const firstAttempt = Date.parse(job.first_delivery_attempt_at || "");
        if (
          !Number.isFinite(firstAttempt) ||
          Date.now() - firstAttempt >= 23 * 60 * 60 * 1000 ||
          (process.env.EMAIL_PROVIDER || "resend").toLowerCase() !== "resend"
        ) {
          const { error: reviewError } = await supabase
            .from("notification_jobs")
            .update({ state: "delivery_unknown", locked_until: null })
            .eq("id", job.id);
          if (reviewError) throw reviewError;
          continue;
        }
        result = await sendPartnerLeadNotification(job.payload);
      } else if (job.kind === "water")
        result = await sendWaterAssistanceResumeLink(job.payload);
      else throw new Error("Unknown notification");
      if (
        (
          result as {
            skipped?: boolean;
          }
        ).skipped ||
        (
          result as {
            failed?: number;
          }
        ).failed
      )
        throw new Error("Email unavailable");
      const { error } = await supabase
        .from("notification_jobs")
        .update({
          state: "sent",
          sent_at: new Date().toISOString(),
          locked_until: null,
        })
        .eq("id", job.id);
      if (error) throw error;
      if (job.kind === "customer")
        await supabase
          .from("diagnostics")
          .update({ customer_email_status: "sent", customer_email_error: null })
          .eq("id", job.payload.diagnosticId);
      sent++;
    } catch {
      failed++;
      await supabase
        .from("notification_jobs")
        .update({ locked_until: new Date(Date.now() + 60000).toISOString() })
        .eq("id", job.id);
      if (job.kind === "customer")
        await supabase
          .from("diagnostics")
          .update({
            customer_email_status: "error",
            customer_email_error: "Envoi à relancer",
          })
          .eq("id", job.payload.diagnosticId);
    }
  }
  return { sent, failed };
}
