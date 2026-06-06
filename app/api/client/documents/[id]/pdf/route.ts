import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/client-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await getAuthenticatedUser(request);

  if (!user?.email) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data, error } = await supabase
    .from("diagnostics")
    .select(`
      id,
      created_at,
      status,
      problem_type,
      choice,
      payment_status,
      customers (
        name,
        phone,
        email,
        address,
        spa_brand,
        spa_model,
        spa_year,
        installation_type
      ),
      diagnostic_answers (
        question_label,
        answer
      ),
      diagnostic_photos (
        photo_type,
        public_url
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  if (customer?.email !== user.email) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const lines = [
    "SANISPA",
    "Resume de demande d'assistance SANISPA",
    "",
    `Numero dossier : ${data.id}`,
    `Date : ${new Date(data.created_at).toLocaleString("fr-FR")}`,
    `Statut : ${data.status}`,
    `Type de probleme : ${data.problem_type}`,
    `Prestation choisie : ${data.choice ?? "Non renseignee"}`,
    `Paiement : ${data.payment_status ?? "Non requis / non paye"}`,
    "",
    "Informations client",
    `Nom : ${customer?.name ?? ""}`,
    `Telephone : ${customer?.phone ?? ""}`,
    `Email : ${customer?.email ?? ""}`,
    `Adresse : ${customer?.address ?? ""}`,
    "",
    "Informations spa",
    `Marque : ${customer?.spa_brand ?? ""}`,
    `Modele : ${customer?.spa_model ?? ""}`,
    `Annee : ${customer?.spa_year ?? ""}`,
    `Installation : ${customer?.installation_type ?? ""}`,
    "",
    "Reponses au questionnaire",
    ...(data.diagnostic_answers ?? []).map((answer) => `${answer.question_label} : ${answer.answer}`),
    "",
    "Photos jointes",
    ...((data.diagnostic_photos ?? []).map((photo) => `${photo.photo_type} : ${photo.public_url ?? "Photo stockee"}`)),
    "",
    "Ce document constitue un resume de demande d'assistance et ne constitue pas une facture."
  ];

  const pdf = buildSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sanispa-resume-${data.id.slice(0, 8)}.pdf"`
    }
  });
}

function buildSimplePdf(lines: string[]) {
  const escaped = lines.flatMap((line) => splitLine(line, 92)).map((line) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"));
  const text = escaped.map((line, index) => `BT /F1 10 Tf 50 ${790 - index * 14} Td (${line}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(body, "binary");
}

function splitLine(line: string, size: number) {
  if (!line) return [""];
  const chunks = [];
  for (let index = 0; index < line.length; index += size) {
    chunks.push(line.slice(index, index + size));
  }
  return chunks;
}
