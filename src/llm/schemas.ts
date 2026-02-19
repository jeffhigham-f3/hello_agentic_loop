import { z } from "zod";

export const toolCallSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
  reasoning: z.string().optional(),
});

export const modelDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CALL_TOOL"),
    message: z.string().optional(),
    toolCalls: z.array(toolCallSchema).min(1),
  }),
  z.object({
    action: z.literal("RESPOND"),
    message: z.string().min(1),
  }),
  z.object({
    action: z.literal("ASK_USER"),
    message: z.string().min(1),
  }),
  z.object({
    action: z.literal("STOP"),
    message: z.string().min(1),
  }),
]);
