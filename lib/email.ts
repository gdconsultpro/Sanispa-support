import { createHash } from "node:crypto";
import { choiceLabel, photoLabel, problemLabel, statusLabel } from "./display-labels";
type EmailAnswer = {
    question_label: string;
    answer: string;
};
type EmailPhoto = {
    photo_type: string;
    public_url: string | null;
};
export type PartnerLeadRecipient = {
    id: string;
    companyName: string;
    contactName?: string | null;
    email: string;
};
export type DiagnosticEmailPayload = {
    diagnosticId: string;
    customer: {
        name: string;
        phone: string;
        email: string;
        address: string;
        spaBrand: string;
        spaModel?: string | null;
        spaYear: string;
    };
    problemType: string;
    choice: string;
    paymentPlan?: string | null;
    amountPaid?: number | null;
    status?: string | null;
    appUrl?: string;
    dossierUrl?: string;
    summaryPdfUrl?: string;
    answers: EmailAnswer[];
    photos: EmailPhoto[];
};
export type PartnerLeadNotificationPayload = {
    diagnosticId: string;
    partners: PartnerLeadRecipient[];
    problemType: string;
    postalCode: string;
    city: string;
    department: string;
    spaBrand?: string | null;
    spaModel?: string | null;
    answers: EmailAnswer[];
};
type TransactionalEmail = {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
};
export async function sendDiagnosticNotification(payload: DiagnosticEmailPayload) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ADMIN_NOTIFICATION_EMAIL;
    const from = process.env.EMAIL_FROM || "SANISPA <onboarding@resend.dev>";
    if (!apiKey || !to) {
        return { skipped: true };
    }
    const response = await fetch("https://api.resend.com/emails", {
        signal: AbortSignal.timeout(10000),
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `admin:${payload.diagnosticId}`
        },
        body: JSON.stringify({
            from,
            to,
            reply_to: payload.customer.email,
            subject: `Nouvelle demande SANISPA Support - ${problemLabel(payload.problemType)}`,
            html: buildDiagnosticEmail(payload)
        })
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Email notification failed: ${details}`);
    }
    return { skipped: false };
}
export async function sendCustomerConfirmation(payload: DiagnosticEmailPayload) {
    console.log("[SANISPA email client] tentative d'envoi email client", {
        diagnosticId: payload.diagnosticId,
        to: payload.customer.email
    });
    try {
        const result = await sendTransactionalEmail({
            to: payload.customer.email,
            subject: "SANISPA Support - Confirmation de votre demande d'assistance",
            html: buildCustomerConfirmationEmail(payload),
            replyTo: process.env.EMAIL_REPLY_TO || process.env.ADMIN_NOTIFICATION_EMAIL
        });
        if (result.skipped) {
            console.log("[SANISPA email client] email client ignoré : configuration incomplète", { diagnosticId: payload.diagnosticId });
        }
        else {
            console.log("[SANISPA email client] email client envoyé", { diagnosticId: payload.diagnosticId });
        }
        return result;
    }
    catch (error) {
        console.error("[SANISPA email client] erreur email client", {
            diagnosticId: payload.diagnosticId,
            error: error instanceof Error ? error.message : error
        });
        throw error;
    }
}
export async function sendPartnerLeadNotification(payload: PartnerLeadNotificationPayload) {
    if (!payload.partners.length) {
        console.log("[SANISPA email partenaires] aucun partenaire actif à notifier", {
            diagnosticId: payload.diagnosticId,
            department: payload.department
        });
        return { attempted: 0, sent: 0, failed: 0 };
    }
    console.log("[SANISPA email partenaires] partenaires trouvés", {
        diagnosticId: payload.diagnosticId,
        department: payload.department,
        count: payload.partners.length,
        partnerIds: payload.partners.map((partner) => partner.id)
    });
    let sent = 0;
    let failed = 0;
    for (const partner of payload.partners) {
        console.log("[SANISPA email partenaires] tentative d'envoi", {
            diagnosticId: payload.diagnosticId,
            partnerId: partner.id,
            to: partner.email
        });
        try {
            const result = await sendTransactionalEmail({
                to: partner.email,
                subject: `SANISPA Support - Nouveau dossier technique - ${problemLabel(payload.problemType)} (${payload.department})`,
                replyTo: process.env.EMAIL_REPLY_TO || process.env.ADMIN_NOTIFICATION_EMAIL,
                html: buildPartnerLeadEmail(payload, partner)
            });
            if (result.skipped) {
                failed += 1;
                console.log("[SANISPA email partenaires] envoi ignoré", {
                    diagnosticId: payload.diagnosticId,
                    partnerId: partner.id,
                    to: partner.email
                });
            }
            else {
                sent += 1;
                console.log("[SANISPA email partenaires] succès Resend", {
                    diagnosticId: payload.diagnosticId,
                    partnerId: partner.id,
                    to: partner.email,
                    status: result.status,
                    response: result.response
                });
            }
        }
        catch (error) {
            failed += 1;
            console.error("[SANISPA email partenaires] erreur Resend", {
                diagnosticId: payload.diagnosticId,
                partnerId: partner.id,
                to: partner.email,
                error: error instanceof Error ? error.message : error
            });
        }
    }
    return { attempted: payload.partners.length, sent, failed };
}
export async function sendWaterAssistanceResumeLink({ to, name, resumeUrl, expiresAt }: {
    to: string;
    name: string;
    resumeUrl: string;
    expiresAt: string;
}) {
    if (!to) {
        return { skipped: true };
    }
    return sendTransactionalEmail({
        to,
        subject: "SANISPA Support - Votre accès à l'assistance pour le traitement de l'eau",
        replyTo: process.env.EMAIL_REPLY_TO || process.env.ADMIN_NOTIFICATION_EMAIL,
        html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:680px;">
        <h1>Votre assistance pour le traitement de l'eau est disponible</h1>
        <p>Bonjour ${escapeHtml(name)},</p>
        <p>Vous recevez ce message à la suite de la confirmation de votre paiement pour l'assistance au traitement de l'eau SANISPA Support.</p>
        <p>Connectez-vous à votre espace client, puis ouvrez votre dossier pour reprendre l'assistance sans effectuer un nouveau paiement pendant sa période de validité.</p>
        <p>
          <a href="${escapeHtml(resumeUrl)}" style="display:inline-block;background:#0a2342;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">
            Accéder à mon espace client
          </a>
        </p>
        <p>Votre accès à l'assistance est valable jusqu'au ${escapeHtml(new Date(expiresAt).toLocaleDateString("fr-FR"))}.</p>
        <p>Merci pour votre confiance,<br /><strong>L'équipe SANISPA Support</strong></p>
      </div>
    `
    });
}
async function sendTransactionalEmail({ to, subject, html, replyTo }: TransactionalEmail) {
    const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
    const apiKey = provider === "resend" ? process.env.RESEND_API_KEY : process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM || "SANISPA <onboarding@resend.dev>";
    console.log("[SANISPA email] préparation envoi", {
        provider,
        to,
        from,
        subject,
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        hasEmailApiKey: Boolean(process.env.EMAIL_API_KEY)
    });
    if (!apiKey || !to) {
        console.log("[SANISPA email] envoi ignoré", {
            provider,
            to,
            reason: !apiKey ? "clé API manquante" : "destinataire manquant"
        });
        return { skipped: true };
    }
    if (provider === "sendgrid") {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
            signal: AbortSignal.timeout(10000),
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                personalizations: [{ to: [parseEmailAddress(to)] }],
                from: parseEmailAddress(from),
                reply_to: replyTo ? parseEmailAddress(replyTo) : undefined,
                subject,
                content: [{ type: "text/html", value: html }]
            })
        });
        if (!response.ok) {
            const details = await response.text();
            throw new Error(`SendGrid email failed: ${details}`);
        }
        return { skipped: false };
    }
    if (provider === "mailgun") {
        const domain = process.env.MAILGUN_DOMAIN;
        if (!domain)
            throw new Error("MAILGUN_DOMAIN manquant.");
        const form = new FormData();
        form.append("from", from);
        form.append("to", to);
        form.append("subject", subject);
        form.append("html", html);
        if (replyTo)
            form.append("h:Reply-To", replyTo);
        const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            signal: AbortSignal.timeout(10000),
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`
            },
            body: form
        });
        if (!response.ok) {
            const details = await response.text();
            throw new Error(`Mailgun email failed: ${details}`);
        }
        return { skipped: false };
    }
    if (provider === "smtp") {
        throw new Error("SMTP nécessite un adaptateur serveur dédié. Utilisez Resend, SendGrid ou Mailgun pour l'instant.");
    }
    const response = await fetch("https://api.resend.com/emails", {
        signal: AbortSignal.timeout(10000),
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": createHash("sha256").update(`${to}|${subject}|${html}`).digest("hex")
        },
        body: JSON.stringify({
            from,
            to,
            reply_to: replyTo,
            subject,
            html
        })
    });
    const resendResponse = await response.text();
    console.log("[SANISPA email] réponse Resend", {
        to,
        status: response.status,
        ok: response.ok,
        response: resendResponse
    });
    if (!response.ok) {
        throw new Error(`Resend email failed: ${resendResponse}`);
    }
    return { skipped: false, provider: "resend", status: response.status, response: resendResponse };
}
function buildDiagnosticEmail(payload: DiagnosticEmailPayload) {
    const answers = payload.answers
        .map((answer) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #d8e1ea;font-weight:700;">${escapeHtml(answer.question_label)}</td>
          <td style="padding:8px;border-bottom:1px solid #d8e1ea;">${escapeHtml(answer.answer)}</td>
        </tr>
      `)
        .join("");
    const photos = payload.photos
        .map((photo) => photo.public_url
        ? `<li><a href="${escapeHtml(photo.public_url)}">${escapeHtml(photoLabel(photo.photo_type))}</a></li>`
        : `<li>${escapeHtml(photoLabel(photo.photo_type))}</li>`)
        .join("");
    return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.5;">
      <h1>Nouvelle demande de pré-diagnostic SANISPA Support</h1>
      <p><strong>Dossier :</strong> ${escapeHtml(payload.diagnosticId)}</p>
      <p>Vous recevez cette notification car une nouvelle demande client a été enregistrée dans SANISPA Support.</p>
      <h2>Client</h2>
      <p>
        <strong>Nom :</strong> ${escapeHtml(payload.customer.name)}<br />
        <strong>Téléphone :</strong> ${escapeHtml(payload.customer.phone)}<br />
        <strong>E-mail :</strong> ${escapeHtml(payload.customer.email)}<br />
        <strong>Adresse / secteur :</strong> ${escapeHtml(payload.customer.address)}
      </p>
      <h2>Spa</h2>
      <p>
        <strong>Marque :</strong> ${escapeHtml(payload.customer.spaBrand)}<br />
        <strong>Modèle :</strong> ${escapeHtml(payload.customer.spaModel || "Non renseigné")}<br />
        <strong>Année :</strong> ${escapeHtml(payload.customer.spaYear)}
      </p>
      <h2>Orientation</h2>
      <p>
        <strong>Type de panne :</strong> ${escapeHtml(problemLabel(payload.problemType))}<br />
        <strong>Choix client :</strong> ${escapeHtml(choiceLabel(payload.choice))}<br />
        <strong>Formule :</strong> ${escapeHtml(formatPlan(payload.paymentPlan))}
      </p>
      <h2>Réponses</h2>
      <table style="border-collapse:collapse;width:100%;max-width:760px;">${answers}</table>
      <h2>Photos</h2>
      <ul>${photos}</ul>
      <p style="margin-top:24px;">Connectez-vous à l'espace d'administration pour consulter le dossier et traiter la demande.</p>
    </div>
  `;
}
function buildCustomerConfirmationEmail(payload: DiagnosticEmailPayload) {
    const baseUrl = payload.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://sanispa-support.vercel.app";
    const firstName = payload.customer.name.split(" ")[0] || "Client SANISPA";
    const espaceClientUrl = `${baseUrl}/espace-client`;
    const dossierUrl = payload.dossierUrl || espaceClientUrl;
    const summaryPdfUrl = payload.summaryPdfUrl || espaceClientUrl;
    const isWaterAnalysis = payload.choice === "remote" && payload.paymentPlan === "water";
    const amountLine = customerAmountLine(payload);
    return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:720px;">
      <h1 style="margin-bottom:16px;">Votre demande est bien enregistrée</h1>
      <p>Bonjour ${escapeHtml(firstName)},</p>
      <p>Vous recevez ce message car votre demande d'assistance a été enregistrée dans SANISPA Support.</p>
      <p>
        <strong>Numéro de dossier :</strong><br />
        ${escapeHtml(payload.diagnosticId)}
      </p>
      <p>
        <strong>Type de demande :</strong> ${escapeHtml(problemLabel(payload.problemType))}<br />
        <strong>Formule choisie :</strong> ${escapeHtml(formatPlan(payload.paymentPlan))}<br />
        <strong>État :</strong> ${escapeHtml(statusLabel(payload.status || "Demande enregistrée"))}
        ${amountLine ? `<br />${amountLine}` : ""}
      </p>
      <p>Connectez-vous à votre espace client pour consulter votre dossier, suivre son avancement et télécharger son résumé PDF.</p>
      ${isWaterAnalysis
        ? `<p>L'accès à l'assistance pour le traitement de l'eau s'active après confirmation du paiement. Vous pouvez consulter son état depuis votre dossier.</p>`
        : ""}
      <p>
        <a href="${escapeHtml(espaceClientUrl)}" style="display:inline-block;background:#0a2342;color:#fff;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;">
          Accéder à mon espace client
        </a>
        <a href="${escapeHtml(dossierUrl)}" style="display:inline-block;background:#eef4f8;color:#0a2342;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;">
          Consulter mon dossier
        </a>
        <a href="${escapeHtml(summaryPdfUrl)}" style="display:inline-block;background:#eef4f8;color:#0a2342;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Accéder au résumé PDF
        </a>
      </p>
      <p style="margin-top:24px;">
        SANISPA Support<br />
        Réparation et assistance spa
      </p>
    </div>
  `;
}
function buildPartnerLeadEmail(payload: PartnerLeadNotificationPayload, partner: PartnerLeadRecipient) {
    const answers = payload.answers.length
        ? payload.answers
            .map((answer) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #d8e1ea;font-weight:700;">${escapeHtml(answer.question_label)}</td>
              <td style="padding:8px;border-bottom:1px solid #d8e1ea;">${escapeHtml(answer.answer)}</td>
            </tr>
          `)
            .join("")
        : `<tr><td style="padding:8px;border-bottom:1px solid #d8e1ea;">Aucun descriptif complémentaire renseigné.</td></tr>`;
    return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:720px;">
      <h1>Nouveau dossier technique SANISPA Support</h1>
      <p>Bonjour ${escapeHtml(partner.contactName || partner.companyName)},</p>
      <p>Vous recevez cette notification car un nouveau dossier technique correspond à votre secteur dans SANISPA Support.</p>
      <p>
        <strong>Type de panne :</strong> ${escapeHtml(problemLabel(payload.problemType))}<br />
        <strong>Code postal :</strong> ${escapeHtml(payload.postalCode)}<br />
        <strong>Ville :</strong> ${escapeHtml(payload.city)}<br />
        <strong>Département :</strong> ${escapeHtml(payload.department)}<br />
        <strong>Marque :</strong> ${escapeHtml(payload.spaBrand || "Non renseignée")}<br />
        <strong>Modèle :</strong> ${escapeHtml(payload.spaModel || "Non renseigné")}
      </p>
      <h2>Descriptif déclaré</h2>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">${answers}</table>
      <p style="margin-top:24px;padding:14px;background:#eef4f8;border-radius:6px;">
        Connectez-vous à votre espace partenaire pour consulter la disponibilité du dossier et les conditions de déblocage de ses informations détaillées.
      </p>
      <p>SANISPA Support</p>
    </div>
  `;
}
function formatPlan(plan?: string | null) {
    if (plan === "photo")
        return "Assistance téléphonique";
    if (plan === "guided")
        return "Assistance guidée par photos";
    if (plan === "premium")
        return "Assistance en visioconférence";
    if (plan === "water")
        return "Diagnostic du traitement de l'eau par intelligence artificielle";
    return "Non applicable";
}
function customerAmountLine(payload: DiagnosticEmailPayload) {
    const paymentConfirmed = ["paid", "Paiement confirmé", "Paiement validé"].includes(payload.status || "");
    if (!paymentConfirmed || typeof payload.amountPaid !== "number" || !Number.isFinite(payload.amountPaid) || payload.amountPaid < 0)
        return "";
    const amount = payload.amountPaid.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    return `<strong>Montant payé :</strong> ${escapeHtml(amount)}`;
}
function parseEmailAddress(value: string) {
    const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) {
        return { name: match[1], email: match[2] };
    }
    return { email: value };
}
function escapeHtml(value: string | number | null | undefined) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
