type EmailAnswer = {
  question_label: string;
  answer: string;
};

type EmailPhoto = {
  photo_type: string;
  public_url: string | null;
};

type DiagnosticEmailPayload = {
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
  answers: EmailAnswer[];
  photos: EmailPhoto[];
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "SANISPA <onboarding@resend.dev>";

  if (!apiKey || !payload.customer.email) {
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
      to: payload.customer.email,
      subject: "Votre demande SANISPA a bien ete prise en compte",
      html: buildCustomerConfirmationEmail(payload)
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Customer confirmation email failed: ${details}`);
  }

  return { skipped: false };
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
        <strong>Formule :</strong> ${escapeHtml(payload.paymentPlan || "Non applicable")}
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
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0a2342;line-height:1.6;max-width:680px;">
      <h1 style="margin-bottom:16px;">Votre demande SANISPA a bien été prise en compte</h1>
      <p>Bonjour ${escapeHtml(payload.customer.name)},</p>
      <p>
        Nous avons bien reçu votre demande de pré-diagnostic pour votre spa.
        Un technicien SANISPA va analyser les informations transmises et vous contactera très prochainement
        pour faire une analyse plus approfondie.
      </p>
      <p>
        <strong>Type de panne déclaré :</strong> ${escapeHtml(payload.problemType)}<br />
        <strong>Référence dossier :</strong> ${escapeHtml(payload.diagnosticId)}
      </p>
      <p>
        Si des éléments complémentaires sont nécessaires, SANISPA vous les demandera directement par téléphone ou par email.
      </p>
      <p style="margin-top:24px;">
        Merci pour votre confiance,<br />
        <strong>L'équipe SANISPA</strong>
      </p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
