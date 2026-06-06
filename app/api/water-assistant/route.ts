import { NextResponse } from "next/server";
import { z } from "zod";
import { questionSets } from "@/lib/questions";

const messageSchema = z.object({
  message: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["assistant", "user"]),
    content: z.string()
  })).default([]),
  draft: z.any().optional()
});

export async function POST(request: Request) {
  try {
    const payload = messageSchema.parse(await request.json());
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ answer: buildFallbackAnswer(payload.message, payload.draft) });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Tu es l'assistant traitement d'eau de SANISPA. Tu aides un client de spa à interpréter ses valeurs d'eau. Réponds en français, clairement, avec prudence. Donne des étapes simples, l'ordre des corrections, les délais avant de retester, et rappelle de contacter SANISPA si la situation semble technique ou dangereuse. Ne garantis jamais un résultat."
          },
          {
            role: "user",
            content: `Contexte client et formulaire:\n${buildContext(payload.draft)}\n\nConversation:\n${payload.messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`
          }
        ]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ answer: buildFallbackAnswer(payload.message, payload.draft) });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? buildFallbackAnswer(payload.message, payload.draft);
    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur assistant";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function buildContext(draft: any) {
  if (!draft) return "Aucun formulaire disponible.";
  const treatmentQuestions = questionSets["traitement-eau"];
  const answers = treatmentQuestions
    .map((question) => `${question.label}: ${draft.answers?.[question.id] || "Non renseigné"}`)
    .join("\n");

  const waterPhotos = [
    draft.photos?.water_test ? "photo de bandelette ou relevé" : null,
    draft.photos?.filters ? "photo du ou des filtres" : null,
    draft.photos?.water_overview ? "photo générale du spa en eau" : null
  ].filter(Boolean);

  const photoInfo = waterPhotos.length
    ? `Photos disponibles: ${waterPhotos.join(", ")}.`
    : "Aucune photo spécifique au traitement d'eau indiquée dans le brouillon local.";

  return [
    `Client: ${draft.name || "Non renseigné"}`,
    `Spa: ${draft.spaBrand || "Non renseigné"} ${draft.spaModel || ""}`,
    `Type de problème: ${draft.problemType || "Non renseigné"}`,
    answers,
    photoInfo
  ].join("\n");
}

function buildFallbackAnswer(message: string, draft: any) {
  const lower = message.toLowerCase();
  const ph = draft?.answers?.ph_level;
  const product = draft?.answers?.product_used;

  if (lower.includes("vert") || lower.includes("verte")) {
    return "Pour une eau verte, commencez par vérifier le pH puis corrigez-le avant tout traitement choc. Nettoyez le filtre, lancez une filtration longue, puis refaites une bandelette après quelques heures. Si l'eau reste verte ou si le spa mousse fortement, SANISPA devra analyser plus précisément la situation.";
  }

  if (ph === "Plus de 7,8" || lower.includes("ph haut")) {
    return "Le pH semble trop haut. La priorité est de le redescendre progressivement avant d'ajouter d'autres produits, sinon le désinfectant agit mal. Ajoutez le correcteur pH moins par petites doses, laissez brasser, puis refaites un test.";
  }

  if (ph === "Moins de 7" || lower.includes("ph bas")) {
    return "Le pH semble trop bas. Corrigez-le progressivement avec un produit pH plus, laissez circuler l'eau, puis retestez avant de corriger le désinfectant. Un pH trop bas peut irriter et déséquilibrer l'eau.";
  }

  return `D'après les éléments disponibles${product ? ` et le traitement utilisé (${product})` : ""}, commencez par contrôler le pH, puis le niveau de désinfectant, puis l'état du filtre. Corrigez un seul paramètre à la fois, laissez filtrer, et refaites un test avant l'étape suivante.`;
}
