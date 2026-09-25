"use client";

import { EventType } from "@ag-ui/core";
import { FormEvent, useRef, useState } from "react";
import { A2UIRenderer } from "./a2ui-renderer";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type AgentEvent = { type: string; [key: string]: unknown };

export function Chat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [a2uiMessages, setA2uiMessages] = useState<unknown[]>([]);
  const threadId = useRef(crypto.randomUUID());

  function handleEvent(event: AgentEvent) {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_START:
        setMessages((current) => [
          ...current,
          { id: String(event.messageId), role: "assistant", content: "" },
        ]);
        break;
      case EventType.TEXT_MESSAGE_CONTENT:
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, content: message.content + String(event.delta ?? "") }
              : message,
          ),
        );
        break;
      case EventType.CUSTOM:
        if (event.name === "a2ui") {
          setA2uiMessages((current) => [...current, event.value]);
        }
        break;
      case EventType.RUN_ERROR:
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", content: String(event.message ?? "Agent error") },
        ]);
        break;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
    ]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, threadId: threadId.current }),
      });

      if (!response.ok || !response.body) throw new Error("Agent request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          handleEvent(JSON.parse(chunk.slice(6)) as AgentEvent);
        }
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <h1>Agentic UI</h1>
        <p>Gemini · LangChain · AG-UI · A2UI</p>
      </header>

      <section className="conversation">
        {messages.length === 0 && a2uiMessages.length === 0 && (
          <div className="empty-state">
            <h2>Build interfaces with an agent.</h2>
            <p>Try: “Create a three-day Tokyo itinerary.”</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="message-role">{message.role === "user" ? "You" : "Agent"}</span>
            <div>{message.content}</div>
          </div>
        ))}

        <A2UIRenderer messages={a2uiMessages} />
        {loading && <div className="status">Agent is working…</div>}
      </section>

      <form className="composer" onSubmit={submit}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask the agent..." />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </div>
  );
}
