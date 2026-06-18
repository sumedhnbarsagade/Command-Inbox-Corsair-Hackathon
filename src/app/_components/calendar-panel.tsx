"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "@/trpc/react";

type ViewMode = "day" | "week" | "month" | "year";

const CALENDARS = [
  { id: "work", label: "Work", color: "var(--cal-work)" },
  { id: "personal", label: "Personal", color: "var(--cal-personal)" },
  { id: "meetings", label: "Meetings", color: "var(--cal-meetings)" },
  { id: "study", label: "Study", color: "var(--cal-study)" },
  { id: "deadlines", label: "Deadlines", color: "var(--cal-deadlines)" },
] as const;

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6 AM – 8 PM

export function CalendarPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [enabledCals, setEnabledCals] = useState<Record<string, boolean>>({
    work: true,
    personal: true,
    meetings: true,
    study: true,
    deadlines: true,
  });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [attendees, setAttendees] = useState("");

  const utils = api.useUtils();

  const searchRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === "month" || viewMode === "year") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else if (viewMode === "week") {
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return {
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
    };
  }, [currentDate, viewMode]);

  const { data: events = [], isLoading } = api.calendar.searchEvents.useQuery({
    query: "",
    weekStart: searchRange.weekStart,
    weekEnd: searchRange.weekEnd,
    limit: 100,
    offset: 0,
  });

  const refreshEvents = api.calendar.refreshEvents.useMutation({
    onSuccess: async () => {
      await utils.calendar.searchEvents.invalidate();
    },
  });

  const sendInvite = api.calendar.sendInvite.useMutation({
    onSuccess: async () => {
      await utils.calendar.searchEvents.invalidate();
      setShowScheduleModal(false);
      setSummary("");
      setDescription("");
      setLocation("");
      setAttendees("");
    },
  });

  useEffect(() => {
    if (!isLoading && events.length === 0 && !refreshEvents.isPending && !refreshEvents.isError) {
      refreshEvents.mutate({
        weekStart: searchRange.weekStart,
        weekEnd: searchRange.weekEnd,
      });
    }
  }, [searchRange.weekStart, searchRange.weekEnd, isLoading, events.length, refreshEvents]);

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const miniMonthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length < 42) {
      const next = cells.length - firstDay - totalDays + 1;
      cells.push({ date: new Date(year, month + 1, next), inMonth: false });
    }
    return cells;
  }, [currentDate]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter((e) => e.start && new Date(e.start).getTime() >= now - 86400000)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 4);
  }, [events]);

  const isToday = (date: Date) => {
    const t = new Date();
    return (
      date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear()
    );
  };

  const getEventsForDate = (date: Date) =>
    events.filter((e) => {
      if (!e.start) return false;
      const d = new Date(e.start);
      return (
        d.getDate() === date.getDate() &&
        d.getMonth() === date.getMonth() &&
        d.getFullYear() === date.getFullYear()
      );
    });

  const handleNavigate = (dir: "prev" | "next") => {
    const d = new Date(currentDate);
    const mod = dir === "prev" ? -1 : 1;
    if (viewMode === "month" || viewMode === "year") d.setMonth(d.getMonth() + mod);
    else if (viewMode === "week") d.setDate(d.getDate() + mod * 7);
    else d.setDate(d.getDate() + mod);
    setCurrentDate(d);
  };

  const openCreateModal = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const end = new Date(now.getTime() + 3600000);
    setStartTime(now.toISOString().slice(0, 16));
    setEndTime(end.toISOString().slice(0, 16));
    setShowScheduleModal(true);
  };

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  const getEventStyle = (event: { start: string; end: string }) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const top = ((startMinutes - 360) / 60) * 48;
    const height = Math.max(((endMinutes - startMinutes) / 60) * 48, 24);
    return { top: `${top}px`, height: `${height}px` };
  };

  return (
    <div className="cal-layout">
      {/* Secondary sidebar */}
      <aside className="cal-sidebar">
        <div>
          <div className="cal-sidebar-section-title">
            Calendars
            <Plus size={14} style={{ cursor: "pointer", color: "var(--text-muted)" }} />
          </div>
          {CALENDARS.map((cal) => (
            <label key={cal.id} className="cal-calendar-item">
              <input
                type="checkbox"
                checked={enabledCals[cal.id] ?? true}
                onChange={() =>
                  setEnabledCals((prev) => ({ ...prev, [cal.id]: !prev[cal.id] }))
                }
              />
              <span className="cal-dot" style={{ background: cal.color }} />
              {cal.label}
            </label>
          ))}
        </div>

        <div className="cal-mini-month">
          <div className="cal-mini-month-header">
            <button type="button" className="cal-nav-btn" onClick={() => handleNavigate("prev")}>
              <ChevronLeft size={14} />
            </button>
            {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
            <button type="button" className="cal-nav-btn" onClick={() => handleNavigate("next")}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="cal-mini-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
              <div key={d} className="cal-mini-day-label">{d}</div>
            ))}
            {miniMonthDays.map(({ date, inMonth }, i) => (
              <button
                key={i}
                type="button"
                className={`cal-mini-day ${isToday(date) ? "today" : ""} ${!inMonth ? "other-month" : ""}`}
                onClick={() => setCurrentDate(date)}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="cal-sidebar-section-title">Upcoming</div>
          {upcomingEvents.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No upcoming events</p>
          ) : (
            upcomingEvents.map((event) => (
              <div key={event.id} className="cal-upcoming-item">
                <span className="cal-dot" style={{ background: "var(--cal-meetings)", marginTop: 4 }} />
                <div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{event.summary}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                    {event.start
                      ? new Date(event.start).toLocaleString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main calendar */}
      <div className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-toolbar-left">
            <span className="cal-month-label">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button type="button" className="cal-today-btn" onClick={() => setCurrentDate(new Date())}>
              Today
            </button>
            <button type="button" className="cal-nav-btn" onClick={() => handleNavigate("prev")}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="cal-nav-btn" onClick={() => handleNavigate("next")}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="cal-view-switcher">
              {(["day", "week", "month", "year"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`cal-view-btn ${viewMode === v ? "active" : ""}`}
                  onClick={() => setViewMode(v)}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="cal-nav-btn"
              onClick={() =>
                refreshEvents.mutate({
                  weekStart: searchRange.weekStart,
                  weekEnd: searchRange.weekEnd,
                })
              }
              disabled={refreshEvents.isPending}
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshEvents.isPending ? "animate-spin" : ""} />
            </button>
            <button type="button" className="cal-event-btn" onClick={openCreateModal}>
              <Plus size={16} /> Event
            </button>
          </div>
        </div>

        {/* Week time-grid view */}
        {viewMode === "week" && (
          <div className="cal-week-grid">
            <div className="cal-week-header">
              <div className="cal-week-header-cell" />
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="cal-week-header-cell">
                  <div className="cal-week-header-day">
                    {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  </div>
                  <div className={`cal-week-header-num ${isToday(day) ? "today" : ""}`}>
                    {day.getDate()}
                  </div>
                </div>
              ))}
            </div>
            <div className="cal-week-body">
              <div className="cal-time-col">
                {HOURS.map((h) => (
                  <div key={h} className="cal-time-slot">{formatHour(h)}</div>
                ))}
              </div>
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="cal-day-col">
                  {HOURS.map((h) => (
                    <div key={h} className="cal-hour-line" />
                  ))}
                  {getEventsForDate(day).map((event) => (
                    <div
                      key={event.id}
                      className="cal-event-block"
                      style={getEventStyle(event)}
                      title={event.summary}
                    >
                      <div style={{ fontWeight: 600 }}>{event.summary}</div>
                      {event.start && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Month grid fallback */}
        {viewMode === "month" && (
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid var(--border-subtle)" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} style={{ padding: 8, textAlign: "center", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
                  {d}
                </div>
              ))}
              {miniMonthDays.map(({ date, inMonth }, i) => {
                const dayEvents = inMonth ? getEventsForDate(date) : [];
                return (
                  <div
                    key={i}
                    style={{
                      minHeight: 90,
                      padding: 6,
                      borderRight: "1px solid var(--border-subtle)",
                      borderBottom: "1px solid var(--border-subtle)",
                      opacity: inMonth ? 1 : 0.4,
                      background: "var(--bg-base)",
                    }}
                  >
                    <div style={{ textAlign: "right", marginBottom: 4 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          width: 24,
                          height: 24,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          fontSize: 12,
                          background: isToday(date) ? "var(--accent-primary)" : "transparent",
                          color: isToday(date) ? "#fff" : "var(--text-secondary)",
                        }}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                    {dayEvents.slice(0, 2).map((e) => (
                      <div key={e.id} style={{ fontSize: 10, padding: "2px 4px", background: "var(--accent-primary-dim)", borderRadius: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.summary}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(viewMode === "day" || viewMode === "year") && (
          <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
            {viewMode === "day" ? (
              getEventsForDate(currentDate).length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No events for this day.</p>
              ) : (
                getEventsForDate(currentDate).map((e) => (
                  <div key={e.id} style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8, marginBottom: 8, background: "var(--bg-surface)" }}>
                    <div style={{ fontWeight: 600 }}>{e.summary}</div>
                    {e.start && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{new Date(e.start).toLocaleString()}</div>}
                  </div>
                ))
              )
            ) : (
              <p style={{ color: "var(--text-muted)" }}>Year view — use month or week for detailed scheduling.</p>
            )}
          </div>
        )}
      </div>

      {/* Create event modal */}
      {showScheduleModal && (
        <div className="compose-overlay" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="compose-panel" style={{ width: 480 }}>
            <div className="compose-header">
              <span className="compose-title">New Event</span>
              <button type="button" className="btn-icon" onClick={() => setShowScheduleModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                placeholder="Event title"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--border-default)", color: "var(--text-primary)", fontSize: 18, padding: "8px 0", outline: "none" }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Start</label>
                  <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: "100%", marginTop: 4, padding: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>End</label>
                  <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: "100%", marginTop: 4, padding: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)" }} />
                </div>
              </div>
              <input type="text" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} style={{ padding: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)" }} />
              <input type="text" placeholder="Guests (comma-separated emails)" value={attendees} onChange={(e) => setAttendees(e.target.value)} style={{ padding: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)" }} />
              <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ padding: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)", resize: "none" }} />
            </div>
            <div className="compose-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "var(--accent-primary)" }}
                disabled={sendInvite.isPending || !summary || !startTime || !endTime}
                onClick={() => {
                  const emailsArr = attendees.split(",").map((e) => e.trim()).filter(Boolean);
                  sendInvite.mutate({
                    summary,
                    description,
                    location,
                    start: new Date(startTime).toISOString(),
                    end: new Date(endTime).toISOString(),
                    attendees: emailsArr.length ? emailsArr : ["guest@example.com"],
                  });
                }}
              >
                {sendInvite.isPending ? "Saving…" : "Save & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
