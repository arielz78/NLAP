import { z } from "zod";

const eventBase = {
  clientEventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};

const sectionId = z.enum(["families", "couples", "golden-age"]);

export const draftIdSchema = z.string().uuid();

export const draftCommandSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("replace"),
    sectionId,
    slotIndex: z.number().int().min(0).max(4),
    alternativeCandidateId: z.string().min(1),
  }),
  z.object({
    ...eventBase,
    type: z.literal("undo"),
  }),
  z.object({
    ...eventBase,
    type: z.literal("feedback"),
    sectionId,
    slotIndex: z.number().int().min(0).max(4),
    value: z.enum(["preferred", "broken", "skipped"]),
  }),
  z.object({
    ...eventBase,
    type: z.literal("source_open"),
    candidateId: z.string().min(1),
    sourceUrl: z.string().url(),
    context: z.enum(["selected", "alternative"]),
  }),
]);

export const commandRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
  command: draftCommandSchema,
});

export const submitRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
  clientEventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});
