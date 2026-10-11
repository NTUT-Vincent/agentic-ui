import { z } from "zod";

export const uiActionSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("plan.open"), args: z.object({}) }),
  z.object({
    id: z.literal("plan.setDays"),
    args: z.object({ days: z.number().int().min(1).max(14) }),
  }),
  z.object({
    id: z.literal("plan.setPace"),
    args: z.object({ pace: z.enum(["relaxed", "balanced", "packed"]) }),
  }),
  z.object({ id: z.literal("plan.generate"), args: z.object({}) }),
  z.object({ id: z.literal("plan.save"), args: z.object({}) }),
  z.object({
    id: z.literal("plan.removePlace"),
    args: z.object({ placeId: z.string().min(1) }),
  }),
]);

export const uiActionFlowSchema = z.object({
  actions: z.array(uiActionSchema).min(1).max(8),
});

// Gemini receives a flat, permissive tool-facing schema. The backend validates
// the resulting arguments using the strict discriminated union above.
export const uiActionToolSchema = z.object({
  actions: z.array(z.object({
    id: z.enum(["plan.open", "plan.setDays", "plan.setPace", "plan.generate", "plan.save", "plan.removePlace"]),
    args: z.object({
      days: z.number().int().optional(),
      pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
      placeId: z.string().optional(),
    }),
  })).min(1).max(8),
});

export type UIAction = z.infer<typeof uiActionSchema>;

export const uiActionResultSchema = z.object({
  ok: z.boolean(),
  completed: z.array(z.object({
    id: z.enum(["plan.open", "plan.setDays", "plan.setPace", "plan.generate", "plan.save", "plan.removePlace"]),
    result: z.unknown(),
  })).max(8),
  failed: z.object({
    id: z.enum(["plan.open", "plan.setDays", "plan.setPace", "plan.generate", "plan.save", "plan.removePlace"]).optional(),
    message: z.string().max(2000),
  }).optional(),
});

export type UIActionResult = {
  ok: boolean;
  completed: Array<{ id: UIAction["id"]; result: unknown }>;
  failed?: { id?: UIAction["id"]; message: string };
};

// A shared, browser-safe schema. The LangChain tool is bound on the server
// in run-agent.ts, so client components never import LangChain runtime code.
