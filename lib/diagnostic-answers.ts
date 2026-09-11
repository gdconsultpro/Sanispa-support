import { getPhotoRequirements, isPhotoRequired, photoUnavailableDetail, photoUnavailableQuestion, questionSets, spaAccessQuestion, unavailableValues, unknown } from "./questions";
import type { AnswerCondition, AnswerValue, DiagnosticDraft, Question } from "./types";
export type AnswerDraft = Pick<DiagnosticDraft, "problemType" | "answers" | "choice" | "photos">;
export type SavedAnswer = { question_key?: string; question_label: string; answer: string };
export const exclusiveAnswers = [unknown, "Non observable", "Non applicable", "Aucun événement identifié", "Aucun autre signe"];
export const answerText = (answer?: AnswerValue) => Array.isArray(answer) ? answer.join(" ; ") : answer ?? "";
export const hasAnswer = (answer?: AnswerValue) => Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
export function toggleAnswer(current: AnswerValue | undefined, option: string): string[] {
  const values = Array.isArray(current) ? current : current ? [current] : [];
  if (values.includes(option)) return values.filter(v => v !== option);
  return exclusiveAnswers.includes(option) ? [option] : [...values.filter(v => !exclusiveAnswers.includes(v)), option];
}
export function questionsFor(draft: AnswerDraft): Question[] {
  if (!draft.problemType || !questionSets[draft.problemType]) return [];
  const questions = [...questionSets[draft.problemType]];
  if (draft.choice === "intervention" && draft.problemType !== "fuite") questions.push(spaAccessQuestion);
  if (draft.problemType === "electrique" && !draft.photos.keyboard) questions.push(photoUnavailableQuestion, photoUnavailableDetail);
  return questions;
}
function matches(condition: AnswerCondition, answers: Record<string, AnswerValue>, questions: Question[], visited: Set<string>): boolean {
  const parent = questions.find(q => q.id === condition.questionId);
  if (parent && !isQuestionVisible(parent, answers, questions, visited)) return false;
  const value = answers[condition.questionId];
  if (!hasAnswer(value)) return Boolean(condition.legacyWhenUnanswered);
  const values = Array.isArray(value) ? value : [value];
  return condition.values.length ? values.some(v => condition.values.includes(v)) : values.some(v => v && !unavailableValues.includes(v) && v !== unknown);
}
export function isQuestionVisible(q: Question, answers: Record<string, AnswerValue>, questions: Question[], visited = new Set<string>()): boolean {
  if (visited.has(q.id)) return false;
  const next = new Set(visited).add(q.id);
  if (q.showWhen?.legacyWhenUnanswered && !hasAnswer(answers[q.showWhen.questionId])) return hasAnswer(answers[q.id]);
  if (q.legacyOnly && !hasAnswer(answers[q.id])) return false;
  return (!q.showWhenAny || q.showWhenAny.some(condition => matches(condition, answers, questions, next))) && (!q.showWhen || matches(q.showWhen, answers, questions, next)) && (!q.hideWhen || !matches(q.hideWhen, answers, questions, next));
}
/** Upgrade only observations with identical meaning; never infer an exact value from a range. */
function upgradeLegacy(answers: Record<string, AnswerValue>, problem: AnswerDraft["problemType"]) {
  const next = { ...answers };
  if (problem === "traitement-eau") {
    const old = next.water_color;
    const mapped: Record<string, [string, string]> = { Claire: ["water_clarity", "Transparente"], Trouble: ["water_clarity", "Trouble"], Verte: ["water_hue", "Verte"], Moussante: ["water_foam", "Oui"], "Odeur forte": ["water_odor", "Oui"] };
    if (typeof old === "string" && mapped[old]) {
      const [key, value] = mapped[old];
      if (!hasAnswer(next[key])) next[key] = value;
      delete next.water_color;
    }
    const product = next.product_used;
    if (typeof product === "string" && ["Chlore", "Brome", "Oxygène actif"].includes(product)) {
      if (!hasAnswer(next.disinfectant)) next.disinfectant = product;
      delete next.product_used;
    } else if (typeof product === "string" && ["Aqua finess", "O-care", "Zodiac (mineral)"].includes(product)) {
      if (!hasAnswer(next.complementary_products)) next.complementary_products = product;
      delete next.product_used;
    }
    if (hasAnswer(next.ph_value) && !unavailableValues.includes(answerText(next.ph_value))) delete next.ph_level;
  }
  return next;
}
export function normalizeDiagnostic<T extends AnswerDraft>(draft: T): T {
  const questions = questionsFor(draft);
  const source = upgradeLegacy(draft.answers ?? {}, draft.problemType);
  const answers: Record<string, AnswerValue> = {};
  for (const q of questions) {
    if (!isQuestionVisible(q, source, questions) || !hasAnswer(source[q.id])) continue;
    const value = source[q.id];
    // A legacy single selection remains a valid one-element multiple selection.
    answers[q.id] = q.type === "checkbox" && typeof value === "string" ? [value.trim()] : Array.isArray(value) ? [...new Set(value.map(v => v.trim()).filter(Boolean))] : value.trim();
  }
  return { ...draft, answers };
}
export function updateDiagnosticAnswer<T extends AnswerDraft>(draft: T, id: string, value: AnswerValue): T {
  return normalizeDiagnostic({ ...draft, answers: { ...draft.answers, [id]: value } });
}
export function serializeAnswers(draft: AnswerDraft): SavedAnswer[] {
  const normalized = normalizeDiagnostic(draft);
  return questionsFor(normalized).filter(q => hasAnswer(normalized.answers[q.id])).map(q => ({ question_key: q.id, question_label: q.label, answer: answerText(normalized.answers[q.id]) }));
}
export function photoExceptionValid(draft: AnswerDraft) {
  const reason = draft.answers.keyboard_photo_unavailable;
  return typeof reason === "string" && Boolean(photoUnavailableQuestion.options?.includes(reason)) && (reason !== "Autre impossibilité" || answerText(draft.answers.keyboard_photo_unavailable_detail).trim().length > 0);
}
export function missingRequiredPhotos(draft: AnswerDraft) {
  return getPhotoRequirements(draft.problemType, draft.photos).filter(photo => isPhotoRequired(photo.id, draft.problemType) && !draft.photos[photo.id] && !photoExceptionValid(draft));
}
export function validateAnswers(draft: AnswerDraft, includePhotoException = true) {
  const normalized = normalizeDiagnostic(draft);
  const questions = questionsFor(normalized);
  for (const q of questions) {
    if ((!includePhotoException && q.id.startsWith("keyboard_photo_")) || !isQuestionVisible(q, normalized.answers, questions)) continue;
    const value = normalized.answers[q.id];
    if (q.required && !hasAnswer(value)) throw new Error(`Réponse requise : ${q.label}`);
    if (!hasAnswer(value)) continue;
    if (q.type !== "checkbox" && Array.isArray(value)) throw new Error(`Choisissez une seule réponse : ${q.label}`);
    const values = Array.isArray(value) ? value : [value];
    if (q.options && values.some(v => !q.options!.includes(v))) throw new Error(`Réponse invalide : ${q.label}`);
    if (q.type === "checkbox" && values.length > 1 && values.some(v => exclusiveAnswers.includes(v))) throw new Error(`Choisissez les symptômes observés ou une réponse inconnue : ${q.label}`);
    if (q.type === "number" && !q.unknownOptions?.includes(answerText(value))) {
      const n = Number(answerText(value).replace(",", "."));
      if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(answerText(value)) || !Number.isFinite(n) || (q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) throw new Error(`Vérifiez la valeur : ${q.label}`);
    }
  }
  return normalized;
}
