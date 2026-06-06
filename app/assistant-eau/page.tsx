"use client";

import { Bot, Send, TestTube2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { questionSets } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft } from "@/lib/storage";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export default function WaterAssistantPage() {
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Bonjour, je suis l'assistant traitement d'eau SANISPA. Envoyez-moi vos valeurs de bandelette ou décrivez l'eau du spa, et je vous guide étape par étape."
    }
  ]);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  const treatmentAnswers = useMemo(() => {
    const questions = questionSets["traitement-eau"];
    return questions
      .map((question) => ({
        label: question.label,
        value: draft.answers[question.id] || "Non renseigné"
      }))
      .filter((item) => item.value !== "Non renseigné");
  }, [draft.answers]);

  async function sendMessage(event?: React.FormEvent<HTMLFormElement>, quickMessage?: string) {
    event?.preventDefault();
    const content = (quickMessage ?? input).trim();
    if (!content || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/water-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, messages: nextMessages, draft })
      });
      const payload = await response.json();
      setMessages([...nextMessages, { role: "assistant", content: payload.answer ?? "Je n'ai pas pu analyser la demande pour le moment." }]);
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: "Je n'ai pas pu répondre pour le moment. Vous pouvez réessayer dans quelques instants." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Assistant traitement d'eau"
        title="Analyse guidée de l'eau du spa"
        description="Indiquez les valeurs relevées ou décrivez la bandelette test. L'assistant vous aide à prioriser les corrections."
      />
      <BackLink href="/resume" />

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-md border border-sanispa-line bg-white p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-sanispa-ice text-sanispa-blue">
              <TestTube2 size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-bold text-sanispa-navy">Données disponibles</h2>
              <p className="text-sm text-sanispa-steel">Issues du formulaire client.</p>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 text-sm">
            {treatmentAnswers.length ? (
              treatmentAnswers.map((item) => (
                <div key={item.label} className="rounded-md bg-sanispa-ice p-3">
                  <dt className="font-bold text-sanispa-navy">{item.label}</dt>
                  <dd className="mt-1 text-sanispa-steel">{item.value}</dd>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-sanispa-ice p-3 text-sm text-sanispa-steel">
                Aucune valeur précise n'a encore été renseignée. Vous pouvez les écrire directement dans le chat.
              </p>
            )}
          </dl>

          <p className="mt-4 rounded-md border border-sanispa-line p-3 text-xs leading-5 text-sanispa-steel">
            L'assistant fournit des conseils d'analyse et d'entretien. Il ne remplace pas une analyse professionnelle en magasin ou une intervention technique.
          </p>
        </aside>

        <section className="flex min-h-[560px] flex-col rounded-md border border-sanispa-line bg-white shadow-soft">
          <div className="border-b border-sanispa-line p-4">
            <h2 className="flex items-center gap-2 font-bold text-sanispa-navy">
              <Bot size={20} aria-hidden="true" />
              Chat SANISPA
            </h2>
          </div>

          <div className="flex-1 space-y-3 overflow-auto p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[88%] rounded-md px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto bg-sanispa-navy text-white"
                    : "bg-sanispa-ice text-sanispa-navy"
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading ? <div className="rounded-md bg-sanispa-ice px-4 py-3 text-sm text-sanispa-steel">Analyse en cours...</div> : null}
          </div>

          <div className="grid gap-2 border-t border-sanispa-line p-4">
            <div className="flex flex-wrap gap-2">
              {["Mon eau est trouble", "Mon pH est trop haut", "J'ai une eau verte", "J'ai une photo de bandelette"].map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => sendMessage(undefined, text)}
                  className="focus-ring rounded-md border border-sanispa-line px-3 py-2 text-xs font-bold text-sanispa-navy"
                >
                  {text}
                </button>
              ))}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                className="focus-ring min-h-12 flex-1 resize-none rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-3 text-sm"
                placeholder="Exemple : pH 8, chlore bas, eau trouble..."
              />
              <Button type="submit" disabled={loading || !input.trim()} className="h-auto px-4">
                <Send size={18} aria-hidden="true" />
              </Button>
            </form>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
