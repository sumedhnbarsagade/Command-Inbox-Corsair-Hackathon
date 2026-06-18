"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Paperclip,
  RefreshCw,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { api } from "@/trpc/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  timestamp: Date;
}

interface LastAction {
  tool: string;
  to?: string;
  subject?: string;
  messageId?: string;
  preview?: string;
  summary?: string;
}

const SUGGESTIONS = [
  "Send email to Alex about tomorrow's demo at 10am",
  "Check my inbox for unread emails",
  "Schedule a meeting tomorrow at 9 AM",
];

function parseLastAction(toolCalls: string[], reply: string, userMessage: string): LastAction | null {
  if (!toolCalls.length) return null;
  const tool = toolCalls[0] ?? "action";
  const emailMatch = userMessage.match(/([\w.-]+@[\w.-]+\.\w+)/i);
  const subjectMatch = userMessage.match(/about\s+(.+?)(?:\s+at\s+|\s*$)/i);
  return {
    tool,
    to: emailMatch?.[1],
    subject: subjectMatch?.[1],
    messageId: `msg_${Date.now().toString(36)}`,
    preview: reply,
    summary: `User asked to "${userMessage.slice(0, 60)}${userMessage.length > 60 ? "…" : ""}". Agent executed ${tool} successfully.`,
  };
}

function buildActivitySteps(userMessage: string, toolCalls: string[]) {
  const steps = [
    { title: "Understanding request", desc: `Parsed: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? "…" : ""}"`, done: true },
  ];
  if (userMessage.toLowerCase().includes("email") || userMessage.toLowerCase().includes("send")) {
    steps.push({ title: "Searching for contact", desc: "Looking up recipient in contacts", done: true });
    steps.push({ title: "Composing email", desc: "Drafting message content", done: true });
  }
  if (toolCalls.length) {
    steps.push({ title: "Executing action", desc: `Running ${toolCalls[0]}`, done: true });
  }
  steps.push({ title: "Complete", desc: "Action finished successfully", done: true });
  return steps;
}

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [activityOpen, setActivityOpen] = useState(true);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chat = api.agent.chat.useMutation({
    onSuccess: (data, variables) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          toolCalls: data.toolCalls,
          timestamp: new Date(),
        },
      ]);
      if (data.toolCalls.length > 0) {
        setLastAction(parseLastAction(data.toolCalls, data.reply, variables.message));
      }
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chat.isPending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chat.isPending) return;

    setLastUserMessage(trimmed);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: new Date() },
    ]);
    setInput("");

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    chat.mutate({ message: trimmed, history });
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const activitySteps = lastAssistant?.toolCalls?.length
    ? buildActivitySteps(lastUserMessage, lastAssistant.toolCalls)
    : [];

  return (
    <div className="agent-layout">
      <div className="agent-main">
        <header className="agent-header">
          <div className="agent-header-title">
            New conversation
            <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
          </div>
        </header>

        <div className="agent-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>
                Superhuman AI
              </p>
              <p style={{ fontSize: 13, marginBottom: 20 }}>
                Send emails, schedule meetings, and manage your inbox with natural language.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
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
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`agent-msg-row ${msg.role}`}>
              <div className={`agent-avatar ${msg.role}`}>
                {msg.role === "user" ? "U" : "✦"}
              </div>
              <div className="agent-msg-content">
                <div className="agent-msg-meta">
                  {msg.role === "user" ? "You" : "Superhuman AI"} ·{" "}
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="agent-msg-text">{msg.content}</div>

                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="agent-activity">
                    <button
                      type="button"
                      className="agent-activity-header"
                      onClick={() => setActivityOpen((v) => !v)}
                    >
                      <span>Agent activity</span>
                      {activityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {activityOpen && (
                      <div className="agent-activity-steps">
                        {buildActivitySteps(lastUserMessage, msg.toolCalls).map((step, i) => (
                          <div key={i} className="agent-step">
                            <div className={`agent-step-icon ${step.done ? "done" : ""}`}>
                              {step.done ? <Check size={12} /> : "·"}
                            </div>
                            <div className="agent-step-body">
                              <div className="agent-step-title">{step.title}</div>
                              <div className="agent-step-desc">{step.desc}</div>
                              {i === activitySteps.length - 2 && msg.toolCalls?.[0] && (
                                <div className="agent-tool-card">
                                  <div className="agent-tool-card-header">
                                    <span className="agent-tool-name">{msg.toolCalls[0]}</span>
                                    <span className="agent-badge-success">Success</span>
                                  </div>
                                  {lastAction?.to && (
                                    <div className="agent-tool-kv">
                                      <span>To</span>
                                      <span>{lastAction.to}</span>
                                    </div>
                                  )}
                                  {lastAction?.subject && (
                                    <div className="agent-tool-kv">
                                      <span>Subject</span>
                                      <span>{lastAction.subject}</span>
                                    </div>
                                  )}
                                  <div className="agent-tool-kv">
                                    <span>Status</span>
                                    <span>Sent</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {msg.role === "assistant" && (
                  <div className="agent-msg-actions">
                    <button type="button" className="btn-icon" title="Copy"><Copy size={14} /></button>
                    <button type="button" className="btn-icon" title="Good"><ThumbsUp size={14} /></button>
                    <button type="button" className="btn-icon" title="Bad"><ThumbsDown size={14} /></button>
                    <button type="button" className="btn-icon" title="Regenerate"><RefreshCw size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div className="agent-msg-row">
              <div className="agent-avatar assistant">✦</div>
              <div className="chat-typing">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="agent-input-area">
          <div className="agent-input-box">
            <button type="button" className="btn-icon" title="Attach file">
              <Paperclip size={16} />
            </button>
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
              placeholder="Ask anything…"
              rows={1}
            />
            <button
              type="button"
              className="agent-send-btn"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || chat.isPending}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="agent-disclaimer">
            Superhuman AI can make mistakes. Consider checking important info.
          </p>
        </div>
      </div>

      {/* Right sidebar — last action */}
      <aside className="agent-sidebar">
        <div className="agent-sidebar-header">
          Last action
          {lastAction && (
            <button type="button" className="btn-icon" onClick={() => setLastAction(null)}>
              <X size={14} />
            </button>
          )}
        </div>

        {lastAction ? (
          <>
            <div className="agent-sidebar-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span className="agent-tool-name">{lastAction.tool}</span>
                <span className="agent-badge-success">Success</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            <div className="agent-sidebar-section">
              <div className="agent-sidebar-label">Details</div>
              {lastAction.to && (
                <div className="agent-detail-row">
                  <span className="label">To</span>
                  <span className="value">{lastAction.to}</span>
                </div>
              )}
              {lastAction.subject && (
                <div className="agent-detail-row">
                  <span className="label">Subject</span>
                  <span className="value">{lastAction.subject}</span>
                </div>
              )}
              {lastAction.messageId && (
                <div className="agent-detail-row">
                  <span className="label">Message ID</span>
                  <span className="value">{lastAction.messageId}</span>
                </div>
              )}
              <div className="agent-detail-row">
                <span className="label">Provider</span>
                <span className="value">📧 Gmail</span>
              </div>
              <div className="agent-detail-row">
                <span className="label">Status</span>
                <span className="agent-status-sent">
                  <span className="agent-status-dot" /> Sent
                </span>
              </div>
            </div>

            {lastAction.preview && (
              <div className="agent-sidebar-section">
                <div className="agent-sidebar-label">Email preview</div>
                <div className="agent-preview-card">{lastAction.preview}</div>
              </div>
            )}

            {lastAction.summary && (
              <div className="agent-sidebar-section">
                <div className="agent-sidebar-label">Conversation summary</div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {lastAction.summary}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="agent-sidebar-section">
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Actions you take with the AI agent will appear here with full details and previews.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
