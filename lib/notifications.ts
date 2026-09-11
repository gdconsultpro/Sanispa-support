import { getSupabaseAdmin } from "./supabase";
import { sendCustomerConfirmation, sendDiagnosticNotification, sendPartnerLeadNotification, sendWaterAssistanceResumeLink } from "./email";
export async function processNotifications(prefix?: string) {
    const supabase = getSupabaseAdmin();
    const { data: jobs, error } = await supabase.rpc("claim_notifications", { p_key: prefix || null });
    if (error)
        throw error;
    let sent = 0;
    let failed = 0;
    for (const job of jobs || []) {
        try {
            let result;
            if (job.kind === "admin")
                result = await sendDiagnosticNotification(job.payload);
            else if (job.kind === "customer")
                result = await sendCustomerConfirmation(job.payload);
            else if (job.kind === "partner") {
                const { data: dossier, error: lookupError } = await supabase.from("diagnostics")
                    .select("choice,partner_released_at,matched_partner_ids,assigned_partner_id,archived_at,status")
                    .eq("id",job.payload.diagnosticId).maybeSingle();
                if (lookupError) throw lookupError;
                const recipient = job.payload.partners?.[0]?.id;
                const authorized = dossier && !dossier.archived_at && !dossier.assigned_partner_id &&
                    ["NEW","AVAILABLE","nouvelle"].includes(dossier.status) &&
                    job.payload.partners?.length === 1 && dossier.matched_partner_ids?.includes(recipient) &&
                    (dossier.choice !== "intervention" || (dossier.partner_released_at && dossier.matched_partner_ids.length === 1 &&
                      job.key === `${job.payload.diagnosticId}:manual-partner:${recipient}`));
                if (!authorized) {
                    const {error: cancelError} = await supabase.from("notification_jobs").update({state:"cancelled",locked_until:null}).eq("id",job.id);
                    if (cancelError) throw cancelError;
                    continue;
                }
                result = await sendPartnerLeadNotification(job.payload);
            }
            else if (job.kind === "water")
                result = await sendWaterAssistanceResumeLink(job.payload);
            else
                throw new Error("Unknown notification");
            if ((result as {
                skipped?: boolean;
            }).skipped || (result as {
                failed?: number;
            }).failed)
                throw new Error("Email unavailable");
            const { error } = await supabase.from("notification_jobs").update({ state: "sent", sent_at: new Date().toISOString(), locked_until: null }).eq("id", job.id);
            if (error)
                throw error;
            if (job.kind === "customer")
                await supabase.from("diagnostics").update({ customer_email_status: "sent", customer_email_error: null }).eq("id", job.payload.diagnosticId);
            sent++;
        }
        catch {
            failed++;
            await supabase.from("notification_jobs").update({ locked_until: new Date(Date.now() + 60000).toISOString() }).eq("id", job.id);
            if (job.kind === "customer")
                await supabase.from("diagnostics").update({ customer_email_status: "error", customer_email_error: "Envoi à relancer" }).eq("id", job.payload.diagnosticId);
        }
    }
    return { sent, failed };
}
