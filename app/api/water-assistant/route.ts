import { rateLimit } from "@/lib/client-auth";
import { apiError, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { z } from "zod";
import { questionSets } from "@/lib/questions";
import { getSupabaseAdmin } from "@/lib/supabase";
const messageSchema = z.object({
    message: z.string().trim().min(1).max(3000),
    sessionToken: z.string().regex(/^[a-f0-9]{32}$/),
});
function isActive(session: {
    status: string;
    expires_at: string | null;
}) {
    return session.status === "paid" && Boolean(session.expires_at) && new Date(session.expires_at as string) > new Date();
}
export async function POST(request: Request) {
    try {
        const payload = messageSchema.parse(await readJson(request, 5000));
        const supabase = getSupabaseAdmin();
        const { data: session, error: sessionError } = await supabase
            .from("water_assistance_sessions")
            .select("id, status, expires_at, diagnostic_id")
            .eq("resume_token", payload.sessionToken)
            .single();
        if (sessionError)
            throw sessionError;
        if (!session || !isActive(session)) {
            return NextResponse.json({ error: "Session d'assistance non payée ou expirée." }, { status: 402 });
        }
        await rateLimit(supabase, `water:${session.id}`, 12);
        const { error: messageError } = await supabase.from("water_assistance_messages").insert({
            session_id: session.id,
            role: "user",
            content: payload.message
        });
        if (messageError)
            throw messageError;
        const { data: answers, error: answersError } = await supabase.from("diagnostic_answers").select("question_key,answer").eq("diagnostic_id", session.diagnostic_id);
        if (answersError)
            throw answersError;
        const draft = { answers: Object.fromEntries((answers || []).map(a => [a.question_key, a.answer])) };
        const { data: history, error: historyError } = await supabase
            .from("water_assistance_messages")
            .select("role, content")
            .eq("session_id", session.id)
            .order("created_at", { ascending: false })
            .limit(20);
        if (historyError)
            throw historyError;
        history?.reverse();
        const apiKey = process.env.OPENAI_API_KEY;
        let answer = "L’assistant est momentanément indisponible. Contactez SANISPA depuis votre dossier pour obtenir une réponse personnalisée.";
        if (apiKey) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                signal: AbortSignal.timeout(25000),
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
                            content: "Tu es l'assistant traitement d'eau de SANISPA. Tu aides un client de spa à interpréter ses valeurs d'eau. Réponds en français, clairement, avec prudence. Donne des étapes simples, l'ordre des corrections, les délais avant de retester, et rappelle de contacter SANISPA si la situation semble technique ou dangereuse. Ne garantis jamais un résultat. Tu ne vois aucune photo : demande les valeurs lisibles. N’invente pas de dosage ; demande le volume et le produit exact et renvoie à son étiquette. Ne conseille aucun mélange de produits. En cas de danger ou de panne électrique, invite à arrêter les manipulations et contacter SANISPA."
                        },
                        {
                            role: "user",
                            content: `Contexte client et formulaire:\n${buildContext(draft)}\n\nHistorique:\n${(history ?? []).map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nDernier message client:\n${payload.message}`
                        }
                    ]
                })
            });
            if (response.ok) {
                const data = await response.json();
                answer = data.choices?.[0]?.message?.content ?? answer;
            }
        }
        const { error: answerError } = await supabase.from("water_assistance_messages").insert({
            session_id: session.id,
            role: "assistant",
            content: answer
        });
        if (answerError)
            throw answerError;
        await supabase
            .from("water_assistance_sessions")
            .update({ current_step: "assistant", last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", session.id);
        return NextResponse.json({ answer });
    }
    catch (error) {
        return apiError(error);
    }
}
function buildContext(draft: any) {
    if (!draft)
        return "Aucun formulaire disponible.";
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
