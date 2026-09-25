import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const generateUiSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export type GeneratedUi = z.infer<typeof generateUiSchema>;

export const generateUiTool = tool(async (input) => input, {
  name: "generate_ui",
  description:
    "Generate a structured visual UI when the answer is better presented as cards or sections than plain text.",
  schema: generateUiSchema,
});
