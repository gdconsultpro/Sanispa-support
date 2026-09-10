import { z } from "zod";

export type NextActionState = "pending" | "done" | "cancelled";

export type NextActionSnapshot = {
  text: string | null;
  dueAt: string | null;
  state: NextActionState | null;
  version: number;
};

const expectedVersion = z.number().int().min(0).max(2147483646);

export const nextActionMutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("save"),
    text: z.string().trim().min(1).max(1000),
    dueAt: z.string().datetime({ offset: true }),
    expectedVersion,
  }).strict(),
  z.object({ operation: z.literal("complete"), expectedVersion }).strict(),
  z.object({ operation: z.literal("cancel"), expectedVersion }).strict(),
]);

export type NextActionMutation = z.infer<typeof nextActionMutationSchema>;
