"use client";

import { A2uiSurface, basicCatalog } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { useEffect, useRef, useState } from "react";

type Props = { messages: unknown[] };

export function A2UIRenderer({ messages }: Props) {
  const [processor] = useState(() => new MessageProcessor([basicCatalog]));
  const [surface, setSurface] = useState<any>(null);
  const processedCount = useRef(0);

  useEffect(() => {
    const subscription = processor.onSurfaceCreated((nextSurface) => setSurface(nextSurface));
    return () => subscription.unsubscribe();
  }, [processor]);

  useEffect(() => {
    const pending = messages.slice(processedCount.current);
    if (pending.length === 0) return;
    processor.processMessages(pending as any[]);
    processedCount.current = messages.length;
  }, [messages, processor]);

  if (!surface) return null;
  return (
    <div className="a2ui-surface">
      <A2uiSurface surface={surface} />
    </div>
  );
}
