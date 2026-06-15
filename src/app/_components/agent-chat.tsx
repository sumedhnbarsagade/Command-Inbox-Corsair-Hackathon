"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/trpc/react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
}

interface AgentChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Check my inbox for unread emails",
  "Send an email to dev@corsair.dev about our meeting",
  "Schedule a meeting tomorrow at 9 AM",
];

export function AgentChat({ isOpen, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I can send emails, create calendar events, and manage your inbox using Corsair. What would you like to do?",
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chat = api.agent.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          toolCalls: data.toolCalls,
        },
      ]);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chat.isPending]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    chat.mutate({ message: trimmed, history });
  }

  if (!isOpen) return null;

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-title">
          Agent
          <span className="chat-ai-badge">AI</span>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-bubble">{msg.content}</div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                Tools: {msg.toolCalls.join(", ")}
              </div>
            )}
          </div>
        ))}
        {chat.isPending && (
          <div className="chat-msg assistant">
            <div className="chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chat-suggestion-chip"
              onClick={() => sendMessage(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask me to send an email or schedule a meeting…"
            rows={1}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || chat.isPending}
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
