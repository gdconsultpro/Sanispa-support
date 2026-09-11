import { rateLimit, requireUser } from "@/lib/client-auth";
import { apiError, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildWaterContext, waterAssistantInstructions } from "@/lib/water-context";
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
        const { user, supabase } = await requireUser(request);
        const { data: session, error: sessionError } = await supabase
            .from("water_assistance_sessions")
            .select("id, status, expires_at, diagnostic_id")
            .eq("resume_token", payload.sessionToken)
            .eq("user_id", user.id)
            .maybeSingle();
        if (sessionError)
            throw sessionError;
        if (!session) return NextResponse.json({ error: "Assistance introuvable pour ce compte." }, { status: 404 });
        if (!isActive(session)) {
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
        const { data: answers, error: answersError } = await supabase.from("diagnostic_answers").select("question_key,question_label,answer").eq("diagnostic_id", session.diagnostic_id);
        if (answersError)
            throw answersError;
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
                            content: waterAssistantInstructions
                        },
                        {
                            role: "user",
                            content: `Contexte client et formulaire:\n${buildWaterContext(answers || [])}\n\nHistorique:\n${(history ?? []).map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nDernier message client:\n${payload.message}`
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
