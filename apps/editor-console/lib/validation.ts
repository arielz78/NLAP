import { z } from "zod";

const eventBase = {
  clientEventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};

const sectionId = z.enum(["families", "couples", "golden-age"]);

// What he types for his own event (Decision_Log §113). Blank fields are allowed while he is
// still typing; submit refuses a marked slot until all three are filled.
const selfFilledEventSchema = z.object({
  title: z.string().max(200),
  url: z
    .string()
    .max(2000)
    .refine((value) => value.trim() === "" || /^https?:\/\/\S+$/i.test(value.trim()), {
      message: "The link must start with http:// or https://",
    }),
  date: z
    .string()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "The date must be YYYY-MM-DD",
    }),
  description: z.string().max(500).optional(),
});

export const draftIdSchema = z.string().uuid();
export const submissionIdSchema = z.string().uuid();
export const issueBuildIdSchema = z.string().uuid();

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
  z.object({
    ...eventBase,
    type: z.literal("self_fill"),
    sectionId,
    slotIndex: z.number().int().min(0).max(4),
    selfFilled: z.boolean(),
    event: selfFilledEventSchema.optional(),
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

export const reopenRequestSchema = submitRequestSchema;
