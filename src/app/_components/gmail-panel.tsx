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
  Video,
  MessageSquare,
  Calendar,
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
      <div className="compose-panel" style={{ width: "550px", height: "450px", boxShadow: "0px 12px 24px rgba(0,0,0,0.3)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", background: "#202124", border: "1px solid #3c4043" }}>
        <div className="compose-header" style={{ background: "#2f3136", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "8px 8px 0 0" }}>
          <span className="compose-title" style={{ fontSize: "14px", fontWeight: "600", color: "#e8eaed" }}>New Message</span>
          <button type="button" className="btn-icon" onClick={resetCompose} style={{ color: "#9aa0a6", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "0 16px" }}>
          <div className="compose-field" style={{ borderBottom: "1px solid #3c4043", padding: "8px 0", display: "flex" }}>
            <span style={{ color: "#9aa0a6", width: "60px", fontSize: "14px" }}>To</span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipients" style={{ background: "transparent", border: "none", outline: "none", color: "#fff", flex: 1, fontSize: "14px" }} />
          </div>
          <div className="compose-field" style={{ borderBottom: "1px solid #3c4043", padding: "8px 0", display: "flex" }}>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={{ background: "transparent", border: "none", outline: "none", color: "#fff", flex: 1, fontSize: "14px" }} />
          </div>
        </div>
        <div className="compose-body" style={{ flex: 1, padding: "16px" }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body content" style={{ background: "transparent", border: "none", outline: "none", color: "#fff", width: "100%", height: "100%", resize: "none", fontSize: "14px", lineHeight: "1.5" }} />
        </div>
        {attachments.length > 0 && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {attachments.map((file) => (
              <div key={`${file.filename}-${file.size}`} style={{ display: "inline-flex", alignItems: "center", gap: "8px", maxWidth: "240px", padding: "6px 10px", borderRadius: "16px", background: "#303134", color: "#e8eaed", fontSize: "12px" }}>
                <Paperclip size={13} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
                <button type="button" aria-label={`Remove ${file.filename}`} onClick={() => removeAttachment(file.filename)} style={{ border: "none", background: "transparent", color: "#9aa0a6", cursor: "pointer", padding: 0 }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="compose-footer" style={{ padding: "16px", display: "flex", gap: "12px", alignItems: "center", background: "#2f3136" }}>
          <button type="button" className="btn btn-primary" onClick={() => sendEmail.mutate(composePayload)} disabled={sendEmail.isPending || !to || !subject || !body} style={{ background: "#1a73e8", color: "white", borderRadius: "20px", padding: "6px 20px", border: "none", cursor: "pointer" }}>
            {sendEmail.isPending ? "Sending…" : "Send"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => createDraft.mutate(composePayload)} disabled={createDraft.isPending || !to || !subject || !body} style={{ borderRadius: "20px", padding: "6px 16px", cursor: "pointer" }}>
            Save Draft
          </button>
          <input ref={attachmentInputRef} type="file" multiple onChange={handleAttachmentChange} style={{ display: "none" }} />
          <button type="button" aria-label="Attach files" title="Attach files" onClick={() => attachmentInputRef.current?.click()} style={{ border: "none", background: "transparent", color: "#9aa0a6", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "6px" }}>
            <Paperclip size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="email-pane" style={{ display: "flex", height: "100vh", background: "#111", color: "#e8eaed", fontFamily: "Roboto, Arial, sans-serif" }}>
      {composeModal}

      {/* COLUMN 1: Far Left Google App Strip */}
      <div style={{ width: "64px", background: "#161616", borderRight: "1px solid #282828", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "16px", gap: "24px" }}>
        <button className="btn-icon" style={{ color: "#1a73e8", background: "transparent", border: "none" }}><Mail size={20} /></button>
        <button className="btn-icon" style={{ color: "#9aa0a6", background: "transparent", border: "none" }}><MessageSquare size={20} /></button>
        <button className="btn-icon" style={{ color: "#9aa0a6", background: "transparent", border: "none" }}><Video size={20} /></button>
        <div style={{ width: "32px", height: "1px", background: "#282828" }} />
        <button className="btn-icon" style={{ color: "#9aa0a6", background: "transparent", border: "none" }}><Calendar size={20} /></button>
      </div>

      {/* COLUMN 2: Standard Folders Navigation Menu Tree */}
      <div style={{ width: "240px", background: "#1f1f1f", padding: "12px 8px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px 8px", marginBottom: "16px" }}>
          <Menu size={18} className="muted" style={{ cursor: "pointer" }} />
          <span style={{ fontSize: "20px", fontWeight: "500", color: "#fff" }}>Gmail</span>
        </div>

        <button 
          onClick={() => { setTo(""); setSubject(""); setBody(""); setAttachments([]); setShowCompose(true); }} 
          style={{ width: "140px", background: "#303134", color: "#e8eaed", padding: "16px 24px", borderRadius: "16px", fontWeight: "500", display: "flex", alignItems: "center", gap: "12px", border: "none", cursor: "pointer", transition: "box-shadow 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
        >
          <span style={{ fontSize: "20px" }}>✏️</span> Compose
        </button>
        
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <button 
            onClick={() => { setView("inbox"); setSelectedId(null); }} 
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "0 20px 20px 0", border: "none", background: view === "inbox" ? "#004a77" : "transparent", color: view === "inbox" ? "#c2e7ff" : "#e8eaed", textAlign: "left", cursor: "pointer", fontSize: "14px" }}
          >
            <Inbox size={16} /> <span style={{ flex: 1 }}>Inbox</span>
          </button>

          <button 
            onClick={() => { setView("starred"); setSelectedId(null); }} 
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "0 20px 20px 0", border: "none", background: view === "starred" ? "#004a77" : "transparent", color: view === "starred" ? "#c2e7ff" : "#e8eaed", textAlign: "left", cursor: "pointer", fontSize: "14px" }}
          >
            <Star size={16} /> <span style={{ flex: 1 }}>Starred</span>
          </button>

          <button 
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "0 20px 20px 0", border: "none", background: "transparent", color: "#e8eaed", textAlign: "left", cursor: "pointer", fontSize: "14px", opacity: 0.6 }}
          >
            <Clock size={16} /> <span style={{ flex: 1 }}>Snoozed</span>
          </button>

          <button 
            onClick={() => { setView("sent"); setSelectedId(null); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "0 20px 20px 0", border: "none", background: view === "sent" ? "#004a77" : "transparent", color: view === "sent" ? "#c2e7ff" : "#e8eaed", textAlign: "left", cursor: "pointer", fontSize: "14px" }}
          >
            <Send size={16} /> <span style={{ flex: 1 }}>Sent</span>
          </button>

          <button 
            onClick={() => { setView("drafts"); setSelectedId(null); }} 
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", borderRadius: "0 20px 20px 0", border: "none", background: view === "drafts" ? "#004a77" : "transparent", color: view === "drafts" ? "#c2e7ff" : "#e8eaed", textAlign: "left", cursor: "pointer", fontSize: "14px" }}
          >
            <FileText size={16} /> <span style={{ flex: 1 }}>Drafts</span> <span style={{ fontSize: "12px", opacity: 0.7 }}>{drafts.data?.length ?? 0}</span>
          </button>
        </div>
      </div>

      {/* Main Mail Dashboard Splitting Layer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#111" }}>
        
        {/* Universal Gmail Top Bar Search */}
        <div style={{ height: "64px", borderBottom: "1px solid #282828", display: "flex", alignItems: "center", padding: "0 16px", background: "#1f1f1f" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#3c4043", borderRadius: "24px", padding: "6px 16px", width: "600px", gap: "12px" }}>
            <Search size={18} style={{ color: "#9aa0a6" }} />
            <input 
              type="text" 
              placeholder="Search in mail" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveSearch(search); }}
              style={{ background: "transparent", border: "none", outline: "none", color: "#fff", width: "100%", fontSize: "15px" }}
            />
            {search && <X size={16} style={{ color: "#9aa0a6", cursor: "pointer" }} onClick={() => { setSearch(""); setActiveSearch(""); }} />}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => refreshInbox.mutate()} disabled={refreshInbox.isPending} style={{ background: "transparent", border: "none", color: "#9aa0a6", cursor: "pointer", padding: "8px" }}>
            <RefreshCw size={18} className={refreshInbox.isPending ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Action Controls Headers Split-Pane Workspace */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          
          {/* COLUMN 3: Compact Thread Feed Grid */}
          <div style={{ width: selectedId ? "420px" : "100%", borderRight: selectedId ? "1px solid #282828" : "none", display: "flex", flexDirection: "column", background: "#111" }}>
            
            {/* Context Toolbars */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #282828", justifyContent: "space-between", background: "#161616", minHeight: "46px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div onClick={toggleSelectAll} style={{ cursor: "pointer", color: "#9aa0a6", display: "flex", alignItems: "center" }}>
                  {isAllSelected ? <CheckSquare size={16} style={{ color: "#1a73e8" }} /> : <Square size={16} />}
                </div>
                <Archive size={16} className="muted" style={{ cursor: "pointer" }} />
                <Trash2 size={16} className="muted" style={{ cursor: "pointer" }} />
                <Mail size={16} className="muted" style={{ cursor: "pointer" }} />
                <MoreVertical size={16} className="muted" style={{ cursor: "pointer" }} />
              </div>
              
              {view === "inbox" && (
                <div style={{ display: "flex", gap: "4px" }}>
                  <button onClick={() => setFilter("all")} style={{ border: "none", background: filter === "all" ? "#303134" : "transparent", color: "#fff", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>All</button>
                  <button onClick={() => setFilter("high-priority")} style={{ border: "none", background: filter === "high-priority" ? "#303134" : "transparent", color: "#fff", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>🔥 Focused</button>
                </div>
              )}
            </div>

            {/* Email Rows Loop Grid */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {emails.isLoading && <div style={{ padding: "24px", textAlign: "center", color: "#9aa0a6" }}>Loading Workspace Feed...</div>}
              {emailList.length === 0 && !emails.isLoading && (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "#9aa0a6" }}>
                  <AlertCircle size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  <p style={{ fontSize: "14px" }}>No conversations inside active view.</p>
                </div>
              )}

              {view === "drafts" ? (
                drafts.data?.map((draft) => (
                  <div key={draft.id} className="email-row" style={{ padding: "12px", borderBottom: "1px solid #202020" }}>
                    <div className="email-row-top">
                      <span className="email-sender">Draft {draft.id.slice(0, 8)}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}
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
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        padding: "10px 16px",
                        borderBottom: "1px solid #202020",
                        background: isSelected ? "#2a3b47" : isChecked ? "#222" : "#111",
                        cursor: "pointer",
                        position: "relative",
                        gap: "12px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "2px" }}>
                        <div onClick={(e) => toggleSelectRow(email.id, e)} style={{ color: "#5f6368" }}>
                          {isChecked ? <CheckSquare size={15} style={{ color: "#1a73e8" }} /> : <Square size={15} />}
                        </div>
                        <Star 
                          size={15} 
                          onClick={(e) => toggleStar(email.id, e)} 
                          fill={isStarred ? "#fbbc04" : "none"} 
                          color={isStarred ? "#fbbc04" : "#5f6368"} 
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: selectedId ? "160px" : "240px" }}>
                            {sender.name || sender.email || "Unknown"}
                          </span>
                          <span style={{ fontSize: "11px", color: "#9aa0a6" }}>
                            {email.date ? formatMessageDate(email.date) : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#e8eaed", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {email.subject || "(no subject)"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#9aa0a6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {email.snippet}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 4: Expanded Detailed Reading Window Frame */}
          {selectedId && view !== "drafts" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#161616" }}>
              {selectedEmail.isLoading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span className="spinner" /></div>
              ) : selectedEmail.data ? (
                <>
                  {/* Top Action Ribbon */}
                  <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #282828", background: "#1f1f1f", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: "16px", color: "#9aa0a6" }}>
                      <Archive size={16} style={{ cursor: "pointer" }} onClick={() => setSelectedId(null)} />
                      <Trash2 size={16} style={{ cursor: "pointer" }} onClick={() => setSelectedId(null)} />
                      <Mail size={16} style={{ cursor: "pointer" }} onClick={() => setSelectedId(null)} />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "4px 12px", cursor: "pointer" }} onClick={openReply}>
                        <CornerUpLeft size={14} /> Reply
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ padding: "4px", cursor: "pointer" }} onClick={() => setSelectedId(null)}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Body Scroller Metadata view content block */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
                    <div style={{ fontSize: "20px", fontWeight: "400", color: "#fff", marginBottom: "20px", lineHeight: "1.3" }}>
                      {selectedEmail.data.subject || "(no subject)"}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", borderBottom: "1px solid #282828", paddingBottom: "16px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#3c4043", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "16px" }}>
                        {(parseEmailAddress(selectedEmail.data.from).name || "?")[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>{formatSender(selectedEmail.data.from)}</span>
                          <span style={{ fontSize: "12px", color: "#9aa0a6" }}>{selectedEmail.data.date ? formatMessageDate(selectedEmail.data.date) : ""}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#9aa0a6", marginTop: "2px" }}>to: {selectedEmail.data.to}</div>
                      </div>
                    </div>

                    {/* Email body block container text styling matching real inbox line height maps */}
                    <div style={{ fontSize: "14px", color: "#e8eaed", lineHeight: "1.6", whiteSpace: "pre-wrap", overflowX: "hidden" }}>
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
