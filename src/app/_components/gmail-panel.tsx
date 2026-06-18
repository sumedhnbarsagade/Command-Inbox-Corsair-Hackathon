"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
  Inbox, 
  FileText, 
  RefreshCw, 
  Star, 
  Trash2, 
  Mail, 
  Archive, 
  Search, 
  CornerUpLeft, 
  X,
  Menu,
  CheckSquare,
  Square,
  MoreVertical,
  Clock,
  Send,
  AlertCircle,
  Paperclip
} from "lucide-react";

import {
  formatMessageDate,
  formatSender,
  LinkifiedText,
  parseEmailAddress,
} from "@/lib/display";
import { api } from "@/trpc/react";

type View = "inbox" | "drafts" | "starred" | "sent";
type Priority = "high" | "medium" | "low";
type FilterType = "all" | "high-priority" | "unread";
type ComposeAttachment = {
  filename: string;
  mimeType: string;
  data: string;
  size: number;
};

export function GmailPanel() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [view, setView] = useState<View>("inbox");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  const [starredEmails, setStarredEmails] = useState<Record<string, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);

  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingPriorityIds = useRef(new Set<string>());
  const utils = api.useUtils();

  const resetCompose = useCallback(() => {
    setShowCompose(false);
    setTo("");
    setSubject("");
    setBody("");
    setAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }, []);

  const emails = api.gmail.searchEmails.useQuery(
    { query: activeSearch, limit: 50, offset: 0 },
    { enabled: true },
  );

  const selectedEmail = api.gmail.getMessage.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  const drafts = api.gmail.listDrafts.useQuery(
    { limit: 50, offset: 0 },
    { enabled: view === "drafts" },
  );

  const refreshInbox = api.gmail.refreshInbox.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      await utils.gmail.listDrafts.invalidate();
    },
  });

  const toggleStarMutation = api.gmail.toggleStarMessage.useMutation({
    onMutate: async ({ id, starred }) => {
      setStarredEmails((prev) => ({ ...prev, [id]: starred }));
    },
    onError: (err, { id }) => {
      setStarredEmails((prev) => ({ ...prev, [id]: !prev[id] }));
      console.error("Failed to sync star status change:", err);
    },
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
    }
  });

  const createDraft = api.gmail.createDraft.useMutation({
    onSuccess: async () => {
      await utils.gmail.listDrafts.invalidate();
      resetCompose();
    },
  });

  const sendEmail = api.gmail.sendEmail.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      resetCompose();
      refreshInbox.mutate();
    },
  });

  const sendDraft = api.gmail.sendDraft.useMutation({
    onSuccess: async () => {
      await utils.gmail.searchEmails.invalidate();
      await utils.gmail.listDrafts.invalidate();
    },
  });

  const rawEmailList = useMemo(() => emails.data ?? [], [emails.data]);

  const emailList = useMemo(() => {
    return rawEmailList.filter((email) => {
      if (view === "starred") return !!starredEmails[email.id] || email.labels.includes("STARRED");
      if (view === "sent") return email.labels.includes("SENT");
      if (view === "inbox") {
        if (email.labels.includes("SENT") && !email.labels.includes("INBOX")) return false;
      }
      if (filter === "high-priority") return priorities[email.id] === "high";
      if (filter === "unread") return email.id.charCodeAt(0) % 2 === 0; 
      return true;
    });
  }, [rawEmailList, filter, priorities, view, starredEmails]);

  useEffect(() => {
    if (!emails.isLoading && rawEmailList.length === 0 && !activeSearch) {
      refreshInbox.mutate();
    }
  }, [rawEmailList.length, emails.isLoading, activeSearch, refreshInbox]);

  const loadPriorities = useCallback(async () => {
    if (!rawEmailList.length) return;
    const toFetch = rawEmailList
      .filter((email) => {
        const hasPreview = Boolean(
          email.subject.trim() || email.snippet.trim() || email.from.trim(),
        );
        return (
          hasPreview &&
          !priorities[email.id] &&
          !pendingPriorityIds.current.has(email.id)
        );
      })
      .slice(0, 8);
    if (!toFetch.length) return;

    for (const email of toFetch) {
      pendingPriorityIds.current.add(email.id);
    }

    const results = await Promise.all(
      toFetch.map(async (email) => {
        try {
          const result = await utils.client.agent.prioritizeEmail.query({
            subject: email.subject,
            snippet: email.snippet,
            from: email.from,
          });
          return { id: email.id, priority: result.priority };
        } catch {
          return { id: email.id, priority: "medium" as Priority };
        } finally {
          pendingPriorityIds.current.delete(email.id);
        }
      }),
    );

    setPriorities((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.id] = r.priority;
      return next;
    });
  }, [rawEmailList, priorities, utils.client.agent.prioritizeEmail]);

  useEffect(() => {
    if (view !== "drafts" && rawEmailList.length > 0) {
      void loadPriorities();
    }
  }, [view, rawEmailList.length, loadPriorities]);

  const openReply = useCallback(() => {
    if (!selectedEmail.data) return;
    const from = selectedEmail.data.from;
    const parsed = parseEmailAddress(from);
    setTo(parsed.email || from);
    setSubject(
      selectedEmail.data.subject?.startsWith("Re:")
        ? selectedEmail.data.subject
        : `Re: ${selectedEmail.data.subject || ""}`,
    );
    setBody("\n\n--- Original Message ---\n" + (selectedEmail.data.body || ""));
    setAttachments([]);
    setShowCompose(true);
  }, [selectedEmail.data]);

  const handleAttachmentChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const nextAttachments = await Promise.all(
      files.map(
        (file) =>
          new Promise<ComposeAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") {
                reject(new Error(`Could not read ${file.name}`));
                return;
              }

              resolve({
                filename: file.name,
                mimeType: file.type || "application/octet-stream",
                data: reader.result,
                size: file.size,
              });
            };
            reader.onerror = () =>
              reject(reader.error ?? new Error(`Could not read ${file.name}`));
            reader.readAsDataURL(file);
          }),
      ),
    );

    setAttachments((prev) => [...prev, ...nextAttachments].slice(0, 10));
    event.target.value = "";
  };

  const removeAttachment = (filename: string) => {
    setAttachments((prev) => prev.filter((file) => file.filename !== filename));
  };

  const composePayload = {
    to,
    subject,
    body,
    attachments: attachments.map(({ filename, mimeType, data }) => ({
      filename,
      mimeType,
      data,
    })),
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIsStarred = !!starredEmails[id] || 
      (rawEmailList.find(email => email.id === id)?.labels.includes("STARRED") ?? false);
    
    toggleStarMutation.mutate({
      id,
      starred: !currentIsStarred
    });
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isAllSelected = emailList.length > 0 && emailList.every(e => selectedRows[e.id]);
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows({});
    } else {
      const next: Record<string, boolean> = {};
      emailList.forEach(e => next[e.id] = true);
      setSelectedRows(next);
    }
  };

  const composeModal = showCompose && (
    <div className="compose-overlay" style={{ position: "fixed", bottom: 0, right: 30, zIndex: 1000, background: "transparent" }}>
      <div className="compose-panel" style={{ width: "550px", height: "450px", borderRadius: "8px 8px 0 0" }}>
        <div className="compose-header">
          <span className="compose-title">New Message</span>
          <button type="button" className="btn-icon" onClick={resetCompose}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "0 16px" }}>
          <div className="compose-field">
            <span className="compose-field-label">To</span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipients" />
          </div>
          <div className="compose-field">
            <span className="compose-field-label" style={{ width: 0, overflow: "hidden" }} />
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
        </div>
        <div className="compose-body">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body content" />
        </div>
        {attachments.length > 0 && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {attachments.map((file) => (
              <div key={`${file.filename}-${file.size}`} style={{ display: "inline-flex", alignItems: "center", gap: "8px", maxWidth: "240px", padding: "6px 10px", borderRadius: "16px", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px" }}>
                <Paperclip size={13} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
                <button type="button" aria-label={`Remove ${file.filename}`} onClick={() => removeAttachment(file.filename)} className="btn-icon" style={{ padding: 0 }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="compose-footer">
          <button type="button" className="btn btn-primary" onClick={() => sendEmail.mutate(composePayload)} disabled={sendEmail.isPending || !to || !subject || !body} style={{ borderRadius: "20px" }}>
            {sendEmail.isPending ? "Sending…" : "Send"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => createDraft.mutate(composePayload)} disabled={createDraft.isPending || !to || !subject || !body} style={{ borderRadius: "20px" }}>
            Save Draft
          </button>
          <input ref={attachmentInputRef} type="file" multiple onChange={handleAttachmentChange} style={{ display: "none" }} />
          <button type="button" aria-label="Attach files" title="Attach files" onClick={() => attachmentInputRef.current?.click()} className="btn-icon">
            <Paperclip size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  const navBtnClass = (active: boolean) =>
    `gmail-sidebar-nav-btn${active ? " active" : ""}`;

  return (
    <div className="email-pane">
      {composeModal}

      {/* Folder navigation */}
      <div style={{ width: "240px", background: "var(--bg-surface)", padding: "12px 8px", display: "flex", flexDirection: "column", gap: "4px", borderRight: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px 8px", marginBottom: "16px" }}>
          <Menu size={18} style={{ cursor: "pointer", color: "var(--text-muted)" }} />
          <span style={{ fontSize: "20px", fontWeight: "500", color: "var(--text-primary)" }}>Gmail</span>
        </div>

        <button 
          onClick={() => { setTo(""); setSubject(""); setBody(""); setAttachments([]); setShowCompose(true); }} 
          style={{ width: "140px", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "16px 24px", borderRadius: "16px", fontWeight: "500", display: "flex", alignItems: "center", gap: "12px", border: "1px solid var(--border-default)", cursor: "pointer", boxShadow: "var(--shadow-sm)" }}
        >
          <span style={{ fontSize: "20px" }}>✏️</span> Compose
        </button>
        
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <button type="button" className={navBtnClass(view === "inbox")} onClick={() => { setView("inbox"); setSelectedId(null); }}>
            <Inbox size={16} /> <span style={{ flex: 1 }}>Inbox</span>
          </button>
          <button type="button" className={navBtnClass(view === "starred")} onClick={() => { setView("starred"); setSelectedId(null); }}>
            <Star size={16} /> <span style={{ flex: 1 }}>Starred</span>
          </button>
          <button type="button" className="gmail-sidebar-nav-btn" style={{ opacity: 0.6 }} disabled>
            <Clock size={16} /> <span style={{ flex: 1 }}>Snoozed</span>
          </button>
          <button type="button" className={navBtnClass(view === "sent")} onClick={() => { setView("sent"); setSelectedId(null); }}>
            <Send size={16} /> <span style={{ flex: 1 }}>Sent</span>
          </button>
          <button type="button" className={navBtnClass(view === "drafts")} onClick={() => { setView("drafts"); setSelectedId(null); }}>
            <FileText size={16} /> <span style={{ flex: 1 }}>Drafts</span> <span style={{ fontSize: "12px", opacity: 0.7 }}>{drafts.data?.length ?? 0}</span>
          </button>
        </div>
      </div>

      <div className="gmail-main">
        <div className="gmail-toolbar">
          <div className="gmail-search-box">
            <Search size={18} className="gmail-icon-muted" />
            <input
              type="text"
              className="gmail-search-input"
              placeholder="Search in mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveSearch(search); }}
            />
            {search && <X size={16} className="gmail-icon-muted" onClick={() => { setSearch(""); setActiveSearch(""); }} />}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => refreshInbox.mutate()} disabled={refreshInbox.isPending} className="btn-icon">
            <RefreshCw size={18} className={refreshInbox.isPending ? "animate-spin" : ""} />
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div className="gmail-list-pane" style={{ width: selectedId ? "420px" : "100%", borderRight: selectedId ? undefined : "none" }}>
            <div className="gmail-list-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div onClick={toggleSelectAll} className="gmail-icon-muted" style={{ display: "flex", alignItems: "center" }}>
                  {isAllSelected ? <CheckSquare size={16} className="gmail-icon-accent" /> : <Square size={16} />}
                </div>
                <Archive size={16} className="gmail-icon-muted" />
                <Trash2 size={16} className="gmail-icon-muted" />
                <Mail size={16} className="gmail-icon-muted" />
                <MoreVertical size={16} className="gmail-icon-muted" />
              </div>
              {view === "inbox" && (
                <div style={{ display: "flex", gap: "4px" }}>
                  <button type="button" className={`gmail-filter-btn${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>All</button>
                  <button type="button" className={`gmail-filter-btn${filter === "high-priority" ? " active" : ""}`} onClick={() => setFilter("high-priority")}>🔥 Focused</button>
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {emails.isLoading && <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>Loading Workspace Feed...</div>}
              {emailList.length === 0 && !emails.isLoading && (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)" }}>
                  <AlertCircle size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  <p style={{ fontSize: "14px" }}>No conversations inside active view.</p>
                </div>
              )}

              {view === "drafts" ? (
                drafts.data?.map((draft) => (
                  <div key={draft.id} className="email-row">
                    <div className="email-row-top">
                      <span className="email-sender">Draft {draft.id.slice(0, 8)}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        onClick={() => sendDraft.mutate({ draftId: draft.id })}
                        disabled={sendDraft.isPending}
                      >
                        Send Draft
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                emailList.map((email) => {
                  const sender = parseEmailAddress(email.from);
                  const isSelected = selectedId === email.id;
                  const isStarred = !!starredEmails[email.id] || email.labels.includes("STARRED");
                  const isChecked = !!selectedRows[email.id];

                  return (
                    <div
                      key={email.id}
                      onClick={() => { setSelectedId(email.id); }}
                      className={`gmail-thread-row${isSelected ? " selected" : ""}${isChecked ? " checked" : ""}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "2px" }}>
                        <div onClick={(e) => toggleSelectRow(email.id, e)} className="gmail-icon-muted">
                          {isChecked ? <CheckSquare size={15} className="gmail-icon-accent" /> : <Square size={15} />}
                        </div>
                        <Star
                          size={15}
                          onClick={(e) => toggleStar(email.id, e)}
                          fill={isStarred ? "var(--accent-yellow)" : "none"}
                          color={isStarred ? "var(--accent-yellow)" : "var(--text-muted)"}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: selectedId ? "160px" : "240px" }}>
                            {sender.name || sender.email || "Unknown"}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {email.date ? formatMessageDate(email.date) : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {email.subject || "(no subject)"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {email.snippet}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selectedId && view !== "drafts" && (
            <div className="gmail-detail-pane">
              {selectedEmail.isLoading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="spinner" /></div>
              ) : selectedEmail.data ? (
                <>
                  <div className="gmail-detail-toolbar">
                    <div style={{ display: "flex", gap: "16px" }} className="gmail-icon-muted">
                      <Archive size={16} onClick={() => setSelectedId(null)} />
                      <Trash2 size={16} onClick={() => setSelectedId(null)} />
                      <Mail size={16} onClick={() => setSelectedId(null)} />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "4px 12px" }} onClick={openReply}>
                        <CornerUpLeft size={14} /> Reply
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ padding: "4px" }} onClick={() => setSelectedId(null)}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
                    <div style={{ fontSize: "20px", fontWeight: 400, color: "var(--text-primary)", marginBottom: "20px", lineHeight: 1.3 }}>
                      {selectedEmail.data.subject || "(no subject)"}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "16px" }}>
                      <div className="gmail-avatar">
                        {(parseEmailAddress(selectedEmail.data.from).name || "?")[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>{formatSender(selectedEmail.data.from)}</span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{selectedEmail.data.date ? formatMessageDate(selectedEmail.data.date) : ""}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>to: {selectedEmail.data.to}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowX: "hidden" }}>
                      <LinkifiedText text={selectedEmail.data.body || selectedEmail.data.snippet || "(empty message body)"} />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
