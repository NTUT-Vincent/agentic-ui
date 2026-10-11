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

export type UIAction = z.infer<typeof uiActionSchema>;

export type UIActionResult = {
  ok: boolean;
  completed: Array<{ id: UIAction["id"]; result: unknown }>;
  failed?: { id?: UIAction["id"]; message: string };
};

// A shared, browser-safe schema. The LangChain tool is bound on the server
// in run-agent.ts, so client components never import LangChain runtime code.
