type EmailAnswer = {
  question_label: string;
  answer: string;
};

type EmailPhoto = {
  photo_type: string;
  public_url: string | null;
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: payload.customer.email,
      subject: `Nouvelle demande SANISPA - ${payload.problemType}`,
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
      subject: "Confirmation de votre demande d'assistance SANISPA",
      html: buildCustomerConfirmationEmail(payload),
      replyTo: process.env.EMAIL_REPLY_TO || process.env.ADMIN_NOTIFICATION_EMAIL
    });

    if (result.skipped) {
      console.log("[SANISPA email client] email client ignoré : configuration incomplète", { diagnosticId: payload.diagnosticId });
    } else {
      console.log("[SANISPA email client] email client envoyé", { diagnosticId: payload.diagnosticId });
    }

    return result;
  } catch (error) {
    console.error("[SANISPA email client] erreur email client", {
      diagnosticId: payload.diagnosticId,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

export async function sendWaterAssistanceResumeLink({
  to,
  name,
  resumeUrl,
  expiresAt
}: {
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
    subject: "Votre accès assistant traitement d'eau SANISPA",
    replyTo: process.env.EMAIL_REPLY_TO || process.env.ADMIN_NOTIFICATION_EMAIL,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:680px;">
        <h1>Votre assistant traitement d'eau est disponible</h1>
        <p>Bonjour ${escapeHtml(name)},</p>
        <p>Votre paiement a bien été validé. Vous pouvez reprendre votre assistance traitement d'eau SANISPA sans repayer avec le lien ci-dessous.</p>
        <p>
          <a href="${escapeHtml(resumeUrl)}" style="display:inline-block;background:#0a2342;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">
            Reprendre mon assistance
          </a>
        </p>
        <p>Ce lien est valable jusqu'au ${escapeHtml(new Date(expiresAt).toLocaleDateString("fr-FR"))}.</p>
        <p>Merci pour votre confiance,<br /><strong>L'équipe SANISPA</strong></p>
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
    if (!domain) throw new Error("MAILGUN_DOMAIN manquant.");
    const form = new FormData();
    form.append("from", from);
    form.append("to", to);
    form.append("subject", subject);
    form.append("html", html);
    if (replyTo) form.append("h:Reply-To", replyTo);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
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
    .map(
      (answer) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #d8e1ea;font-weight:700;">${escapeHtml(answer.question_label)}</td>
          <td style="padding:8px;border-bottom:1px solid #d8e1ea;">${escapeHtml(answer.answer)}</td>
        </tr>
      `
    )
    .join("");

  const photos = payload.photos
    .map((photo) =>
      photo.public_url
        ? `<li><a href="${escapeHtml(photo.public_url)}">${escapeHtml(photo.photo_type)}</a></li>`
        : `<li>${escapeHtml(photo.photo_type)}</li>`
    )
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.5;">
      <h1>Nouvelle demande de pre-diagnostic SANISPA</h1>
      <p><strong>Dossier :</strong> ${escapeHtml(payload.diagnosticId)}</p>
      <h2>Client</h2>
      <p>
        <strong>Nom :</strong> ${escapeHtml(payload.customer.name)}<br />
        <strong>Telephone :</strong> ${escapeHtml(payload.customer.phone)}<br />
        <strong>Email :</strong> ${escapeHtml(payload.customer.email)}<br />
        <strong>Adresse / secteur :</strong> ${escapeHtml(payload.customer.address)}
      </p>
      <h2>Spa</h2>
      <p>
        <strong>Marque :</strong> ${escapeHtml(payload.customer.spaBrand)}<br />
        <strong>Modele :</strong> ${escapeHtml(payload.customer.spaModel || "Non renseigne")}<br />
        <strong>Annee :</strong> ${escapeHtml(payload.customer.spaYear)}
      </p>
      <h2>Orientation</h2>
      <p>
        <strong>Type de panne :</strong> ${escapeHtml(payload.problemType)}<br />
        <strong>Choix client :</strong> ${escapeHtml(payload.choice)}<br />
        <strong>Formule :</strong> ${escapeHtml(formatPlan(payload.paymentPlan))}
      </p>
      <h2>Reponses</h2>
      <table style="border-collapse:collapse;width:100%;max-width:760px;">${answers}</table>
      <h2>Photos</h2>
      <ul>${photos}</ul>
      <p style="margin-top:24px;">Consultez le dashboard admin pour traiter la demande.</p>
    </div>
  `;
}

function buildCustomerConfirmationEmail(payload: DiagnosticEmailPayload) {
  const baseUrl = payload.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://sanispa-support.vercel.app";
  const firstName = payload.customer.name.split(" ")[0] || "Client SANISPA";
  const espaceClientUrl = `${baseUrl}/espace-client`;
  const dossierUrl = payload.dossierUrl || espaceClientUrl;
  const summaryPdfUrl = payload.summaryPdfUrl || espaceClientUrl;
  const isHumanAssistance = payload.choice === "remote" && payload.paymentPlan !== "water";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:720px;">
      <h1 style="margin-bottom:16px;">Confirmation de votre demande d'assistance SANISPA</h1>
      <p>Bonjour ${escapeHtml(firstName)},</p>
      <p>Nous avons bien reçu votre demande d'assistance.</p>
      <p>
        <strong>Numéro de dossier :</strong><br />
        ${escapeHtml(payload.diagnosticId)}
      </p>
      <p>
        <strong>Type de demande :</strong> ${escapeHtml(payload.problemType)}<br />
        <strong>Formule choisie :</strong> ${escapeHtml(formatPlan(payload.paymentPlan))}<br />
        <strong>Montant payé :</strong> ${escapeHtml(formatAmount(payload))}<br />
        <strong>Statut :</strong> ${escapeHtml(payload.status || "Demande enregistrée")}
      </p>
      ${
        isHumanAssistance
          ? `<p><strong>Notre équipe vous contactera afin de convenir d'un rendez-vous adapté à votre demande.</strong></p>`
          : ""
      }
      <p>
        <a href="${escapeHtml(espaceClientUrl)}" style="display:inline-block;background:#0a2342;color:#fff;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;">
          Accéder à mon espace client
        </a>
        <a href="${escapeHtml(dossierUrl)}" style="display:inline-block;background:#eef4f8;color:#0a2342;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;">
          Voir mon dossier
        </a>
        <a href="${escapeHtml(summaryPdfUrl)}" style="display:inline-block;background:#eef4f8;color:#0a2342;padding:12px 16px;border-radius:6px;text-decoration:none;font-weight:bold;">
          Voir le résumé PDF
        </a>
      </p>
      <p style="margin-top:24px;">
        SANISPA<br />
        Réparation et assistance spa
      </p>
    </div>
  `;
}

function formatPlan(plan?: string | null) {
  if (plan === "photo") return "Assistance Téléphonique - 49 €";
  if (plan === "guided") return "Assistance Guidée via Photos - 89 €";
  if (plan === "premium") return "Assistance Vidéo / Visio - 129 €";
  if (plan === "water") return "Diagnostic Traitement d'Eau IA - 9 €";
  return "Non applicable";
}

function formatAmount(payload: DiagnosticEmailPayload) {
  if (typeof payload.amountPaid === "number") return `${payload.amountPaid} €`;
  if (payload.paymentPlan === "photo") return "49 €";
  if (payload.paymentPlan === "guided") return "89 €";
  if (payload.paymentPlan === "premium") return "129 €";
  if (payload.paymentPlan === "water") return "9 €";
  return "Non applicable";
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
