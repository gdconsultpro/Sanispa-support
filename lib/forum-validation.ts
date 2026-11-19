import { z } from "zod";

export const forumPostSchema = z.object({
  title: z.string().trim().max(150, "Le titre doit contenir au maximum 150 caractères.").default(""),
  body: z.string().trim().min(10, "Votre message doit contenir au moins 10 caractères.").max(3000, "Votre message doit contenir au maximum 3 000 caractères."),
  parentId: z.string().uuid("Sélectionnez une discussion valide.").nullable().default(null),
}).strict().refine(p => p.parentId || p.title.length >= 3, {
  path: ["title"], message: "Le titre doit contenir au moins 3 caractères.",
});
