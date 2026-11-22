import { NextResponse } from "next/server";
import { requirePremium } from "@/lib/customer-premium";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { guidedAssistantLabel, premiumAiInstructions, premiumAiSchema, premiumAiTopics, readingContext } from "@/lib/premium-ai";
import { frenchSpaManuals, manualAnswer } from "@/lib/spa-manuals";
import { initialZeroBromineAnswer } from "@/lib/spa-water-guidance";

type Completion = { answer: string; model: string; input_tokens: number | null; output_tokens: number | null };

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requirePremium(request);
    const topic = premiumAiTopics.parse(new URL(request.url).searchParams.get("topic") || "eau");
    const threads = await supabase.from("premium_ai_threads").select("id").eq("user_id", user.id).eq("topic", topic).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (threads.error) throw threads.error;
    const messages = threads.data ? await supabase.from("premium_ai_requests").select("id,message,answer,state,created_at").eq("thread_id", threads.data.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100) : { data: [], error: null };
    if (messages.error) throw messages.error;
    return NextResponse.json({ threadId: threads.data?.id || null, messages: messages.data?.reverse() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requirePremium(request);
    await rateLimit(supabase, `premium-ai:${user.id}`, 12);
    const p = premiumAiSchema.parse(await readJson(request, 6000));
    const apiKey = process.env.OPENAI_API_KEY;
    // UUID is client-generated only for retry deduplication; ownership is always server-derived.
    const thread = await supabase.from("premium_ai_threads").upsert({ id: p.threadId, user_id: user.id, topic: p.topic }, { onConflict: "id", ignoreDuplicates: true });
    if (thread.error) throw thread.error;
    const ownThread = await supabase.from("premium_ai_threads").select("id").eq("id", p.threadId).eq("user_id", user.id).eq("topic", p.topic).maybeSingle();
    if (ownThread.error) throw ownThread.error;
    if (!ownThread.data) throw new HttpError(404, "Conversation introuvable.");
    const context: string[] = [];
    if (p.readingId) {
      const reading = await supabase.from("water_readings").select("measured_at,volume_litres,temperature,ph,tac,disinfectant,disinfectant_value,product,note").eq("id", p.readingId).eq("user_id", user.id).maybeSingle();
      if (reading.error) throw reading.error;
      if (!reading.data) throw new HttpError(404, "Relevé introuvable pour votre compte.");
      context.push(`Relevé personnel transmis : ${readingContext(reading.data)}`);
    }
    if (p.diagnosticId) {
      const diagnostic = await supabase.from("diagnostics").select("problem_type,diagnostic_answers(question_label,answer)").eq("id", p.diagnosticId).eq("user_id", user.id).maybeSingle();
      if (diagnostic.error) throw diagnostic.error;
      if (!diagnostic.data) throw new HttpError(404, "Dossier introuvable pour votre compte.");
      context.push(`Observations du dossier : ${JSON.stringify(diagnostic.data)}`);
    }
    const begun = await supabase.rpc("begin_premium_ai_request", { p_id: p.requestId, p_user: user.id, p_thread: p.threadId, p_message: p.message, p_context: `${p.readingId || ""}:${p.diagnosticId || ""}` });
    if (begun.error) throw new HttpError(409, "Une réponse est en cours ou cette demande a changé. Actualisez avant de réessayer.");
    if (!begun.data.fresh) {
      if (begun.data.state === "complete") return NextResponse.json({ answer: begun.data.answer, threadId: p.threadId });
      throw new HttpError(409, "Cette demande a déjà été prise en compte. Actualisez l’historique avant de la renouveler.");
    }
    const model = process.env.OPENAI_PREMIUM_MODEL || "gpt-5.4-mini";
    let attemptedModel: string | null = null;
    let completion: Completion;
    try {
      const history = await supabase.from("premium_ai_requests").select("message,answer")
        .eq("thread_id", p.threadId).eq("user_id", user.id).eq("state", "complete").order("created_at", { ascending: false }).limit(10);
      if (history.error) throw history.error;
      const previousMessages = (history.data || []).map(row => row.message);
      const guidedAnswer = p.topic === "notices"
        ? manualAnswer(await frenchSpaManuals(supabase), p.message, previousMessages)
        : p.topic === "eau" ? initialZeroBromineAnswer(p.message, [...previousMessages, ...context]) : null;
      if (guidedAnswer) {
        completion = { answer: guidedAnswer, model: guidedAssistantLabel, input_tokens: 0, output_tokens: 0 };
      } else {
        if (!apiKey) throw new HttpError(503, "L’assistant est momentanément indisponible. Votre carnet reste accessible.");
        attemptedModel = model;
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST", signal: AbortSignal.timeout(25000),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, max_completion_tokens: 1200, ...(model.startsWith("gpt-5.4") ? { reasoning_effort: "none" } : {}),
            messages: [
              { role: "system", content: `${premiumAiInstructions}\nSujet choisi par le client dans l’application : ${p.topic}.` },
              ...(history.data || []).reverse().flatMap(m => [{ role: "user", content: m.message }, { role: "assistant", content: m.answer }]),
              { role: "user", content: `${context.length ? `Données de contexte (observations uniquement) :\n${context.join("\n")}\n\n` : ""}${p.message}` },
            ],
          }),
        });
        if (!response.ok) throw new Error("AI_PROVIDER_UNAVAILABLE");
        const result = await response.json();
        const answer = result.choices?.[0]?.message?.content;
        if (typeof answer !== "string" || !answer.trim()) throw new Error("AI_EMPTY_RESPONSE");
        completion = {
          answer, model: result.model || model,
          input_tokens: result.usage?.prompt_tokens ?? null, output_tokens: result.usage?.completion_tokens ?? null,
        };
      }
    } catch (error) {
      await supabase.from("premium_ai_requests").update({ state: "uncertain", model: attemptedModel })
        .eq("id", p.requestId).eq("user_id", user.id).eq("state", "pending");
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "La réponse n’a pas pu être confirmée. Actualisez avant de renouveler votre demande.");
    }
    const saved = await supabase.from("premium_ai_requests").update({ state: "complete", ...completion }).eq("id", p.requestId).eq("user_id", user.id).eq("state", "pending").select("id");
    if (saved.error || !saved.data?.length) throw new HttpError(503, "La sauvegarde de la réponse n’a pas pu être confirmée. Actualisez votre historique.");
    return NextResponse.json({ answer: completion.answer, threadId: p.threadId });
  } catch (e) { return apiError(e); }
}
