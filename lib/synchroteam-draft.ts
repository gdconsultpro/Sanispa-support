import { z } from "zod";
// Preparation only: deliberately no fetch, credentials, SDK or send method.
export function prepareSynchroteamDraft(row: {
  public_reference?: string; id: string; user_id: string | null; customer_id: string; problem_type: string; request_type: string | null;
  customers: { name: string; email: string; phone: string; address: string } | { name: string; email: string; phone: string; address: string }[];
  diagnostic_answers: { question_label: string; answer: string }[];
}) {
  const id = z.string().uuid().parse(row.id);
  const owner = z.string().uuid().parse(row.user_id || row.customer_id);
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  if (!customer) throw new Error("CUSTOMER_REQUIRED");
  const customerKey = `sanispa:${row.user_id ? "user" : "customer"}:${owner}`;
  return {
    mode: "preparation_only",
    diagnosticId: id,
    dossierReference: row.public_reference,
    checksBeforeSending: ["Rapprocher le client avec une fiche Synchroteam existante avant sa première création.", "Vérifier les types d’intervention, les droits et l’environnement destinataire.", "Ne pas déduire un technicien ou un sous-traitant du seul nom de l’entreprise partenaire."],
    customer: { endpoint: "/api/v3/customer/send", body: { myId: customerKey, name: customer.name, address: customer.address, contactEmail: customer.email, contactPhone: customer.phone } },
    job: { endpoint: "/api/v3/job/send", body: {
      myId: `sanispa:${id}`, customer: { myId: customerKey }, address: customer.address, contactEmail: customer.email, contactPhone: customer.phone,
      description: [`SANISPA — ${row.problem_type} (${row.request_type || "demande"})`, `Dossier ${row.public_reference || "Référence en cours"}`,
        ...row.diagnostic_answers.map(a => `${a.question_label} : ${a.answer}`)].join("\n"),
    } },
    attachments: "Les photos et documents restent privés dans SANISPA. Leur copie via l’API pièces jointes est à configurer avant l’activation ; aucun lien public n’est généré.",
  };
}
