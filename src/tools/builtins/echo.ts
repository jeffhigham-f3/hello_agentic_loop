import { z } from "zod";
import type { ToolDefinition } from "../contracts.js";

const EchoInputSchema = z.object({
  text: z.string().min(1),
});

export type EchoInput = z.infer<typeof EchoInputSchema>;

export const echoTool: ToolDefinition<EchoInput> = {
  name: "echo",
  description: "Returns the provided text input unchanged.",
  inputSchema: EchoInputSchema,
  idempotent: true,
  retryPolicy: {
    attempts: 2,
    baseDelayMs: 50,
    maxDelayMs: 200,
  },
  async execute(args): Promise<string> {
    return args.text;
  },
};
