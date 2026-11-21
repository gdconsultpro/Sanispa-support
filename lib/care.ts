import { z } from "zod";
const kind = z.enum(["vidange", "filtre", "consommables"]);
const uuid = z.string().uuid(), date = z.string().datetime({ offset: true });
const optionalNumber = (max: number) => z.number().finite().min(0).max(max).nullable();
const reminderSchedule = {
  date,
  repeatDays: z.number().int().min(1).max(3650).nullable(),
  repeatMonths: z.number().int().min(1).max(120).nullable().default(null),
  repeatYears: z.number().int().min(1).max(10).nullable().default(null),
};
export const careActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("journal"), spaId: uuid, kind: z.enum(["vidange", "filtre", "consommables", "observation"]), date, note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({
    action: z.literal("reminder"),
    spaId: uuid,
    kind,
    title: z.string().trim().min(3).max(200),
    ...reminderSchedule,
  }).strict(),
  z.object({
    action: z.literal("edit-reminder"),
    id: uuid,
    version: z.number().int().min(1),
    ...reminderSchedule,
  }).strict(),
  z.object({ action: z.literal("complete"), id: uuid, version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("delete"), type: z.enum(["journal", "reminder", "reading"]), id: uuid }).strict(),
  z.object({ action: z.literal("reading"), spaId: uuid, date, volume: z.number().finite().positive().max(100000).nullable(), temperature: optionalNumber(60), ph: optionalNumber(14), tac: optionalNumber(1000), disinfectant: z.enum(["chlore", "brome", "autre", "aucun", "inconnu"]), disinfectantValue: optionalNumber(100), product: z.string().trim().max(300), note: z.string().trim().max(2000) }).strict(),
]).refine(
  (command) =>
    (command.action !== "reminder" && command.action !== "edit-reminder") ||
    [command.repeatDays, command.repeatMonths, command.repeatYears]
      .filter((value) => value !== null).length <= 1,
  "Choisissez une seule unité de répétition.",
);
