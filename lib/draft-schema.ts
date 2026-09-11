import { z } from "zod";
import { problemTypes } from "./questions";
import { missingRequiredPhotos, normalizeDiagnostic, validateAnswers } from "./diagnostic-answers";
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
    answers: z.record(z.union([z.string().max(3000), z.array(z.string().max(3000)).max(20)])).refine(v => Object.keys(v).length <= 60),
    photos: z.record(z.string().max(450000)).refine(v => Object.keys(v).length <= 5),
    choice: z.enum(["intervention", "devis", "remote", ""]).default(""),
    paymentPlan: z.enum(["water", "photo", "guided", "premium", ""]).default(""),
    spaId: z.string().uuid().optional()
}).transform(normalizeDiagnostic);
export function validateSubmission(input: unknown) {
    const p = draftSchema.parse(input);
    if (![p.name, p.phone, p.postalCode, p.city, p.installationType].every(v => v.trim()))
        throw new Error("Complétez vos coordonnées et l'installation du spa.");
    if (!p.choice || (p.choice === "remote" && (p.paymentPlan !== "water" || p.problemType !== "traitement-eau")))
        throw new Error("Choisissez une prestation disponible.");
    validateAnswers(p);
    const missing = missingRequiredPhotos(p);
    if (missing.length) throw new Error("Ajoutez la photo du clavier ou indiquez pourquoi elle est impossible à fournir.");
    return p;
}
export const draftSteps = ["/diagnostic", "/questionnaire", "/upload", "/resume"] as const;
