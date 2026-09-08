import { z } from "zod";
import { problemTypes, questionSets, getPhotoRequirements, isPhotoRequired } from "./questions";
import type { ProblemType } from "./types";
const text = z.string().max(500);
export const draftSchema = z.object({
    name: text.default(""), phone: text.default(""), email: z.string().trim().toLowerCase().email(),
    address: text.default(""), postalCode: text.default(""), city: text.default(""),
    spaBrand: text.default(""), spaModel: text.default(""), spaYear: text.default(""),
    installationType: z.enum(["interieur", "exterieur", ""]).default(""),
    powerSupply: z.enum(["230V", "400V", "je ne sais pas", ""]).default(""),
    problemType: z.enum(problemTypes.map(p => p.value) as [
        ProblemType,
        ...ProblemType[]
    ]),
    answers: z.record(z.string().max(3000)).refine(v => Object.keys(v).length <= 40),
    photos: z.record(z.string().max(450000)).refine(v => Object.keys(v).length <= 5),
    choice: z.enum(["intervention", "devis", "remote", ""]).default(""),
    paymentPlan: z.enum(["water", "photo", "guided", "premium", ""]).default(""),
    spaId: z.string().uuid().optional()
});
export function validateSubmission(input: unknown) {
    const p = draftSchema.parse(input);
    if (![p.name, p.phone, p.postalCode, p.city, p.installationType].every(v => v.trim()))
        throw new Error("Complétez vos coordonnées et l'installation du spa.");
    if (!p.choice || (p.choice === "remote" && (p.paymentPlan !== "water" || p.problemType !== "traitement-eau")))
        throw new Error("Choisissez une prestation disponible.");
    for (const q of questionSets[p.problemType]) {
        const visible = !q.showWhen || p.answers[q.showWhen.questionId] === q.showWhen.equals;
        if (!visible)
            continue;
        const answer = p.answers[q.id]?.trim();
        if (q.required && !answer)
            throw new Error(`Réponse requise : ${q.label}`);
        if (answer && q.options && !q.options.includes(answer))
            throw new Error(`Réponse invalide : ${q.label}`);
        if (answer && q.type === "number" && !Number.isFinite(Number(answer)))
            throw new Error(`Nombre attendu : ${q.label}`);
    }
    for (const photo of getPhotoRequirements(p.problemType)) {
        if (isPhotoRequired(photo.id, p.problemType) && !p.photos[photo.id])
            throw new Error(`Photo requise : ${photo.label}`);
    }
    return p;
}
export const draftSteps = ["/diagnostic", "/questionnaire", "/upload", "/resume"] as const;
