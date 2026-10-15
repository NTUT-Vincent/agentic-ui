"use client";

import {
  uiActionSchema,
  type UIAction,
} from "@/lib/dayflow/agent/ui-action-tool";

type ActionId = UIAction["id"];
type Handler = (args: never) => unknown | Promise<unknown>;

const handlers = new Map<ActionId, Handler>();
const listeners = new Set<() => void>();

export function registerUIAction<K extends ActionId>(
  id: K,
  handler: (
    args: Extract<UIAction, { id: K }>["args"],
  ) => unknown | Promise<unknown>,
) {
  const stored = handler as Handler;
  handlers.set(id, stored);
  listeners.forEach((listener) => listener());

  return () => {
    if (handlers.get(id) === stored) {
      handlers.delete(id);
    }
  };
}

export function waitForUIAction(
  id: ActionId,
  timeoutMs = 15_000,
): Promise<void> {
  if (handlers.has(id)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onRegister = () => {
      if (!handlers.has(id)) return;
      clearTimeout(timer);
      listeners.delete(onRegister);
      resolve();
    };

    const timer = window.setTimeout(() => {
      listeners.delete(onRegister);
      reject(new Error(`Action not ready: ${id}`));
    }, timeoutMs);

    listeners.add(onRegister);
    onRegister();
  });
}

export async function executeUIAction(input: UIAction) {
  const action = uiActionSchema.parse(input);
  await waitForUIAction(action.id);

  const handler = handlers.get(action.id);
  if (!handler) {
    throw new Error(`Action unavailable: ${action.id}`);
  }

  return await handler(action.args as never);
}
