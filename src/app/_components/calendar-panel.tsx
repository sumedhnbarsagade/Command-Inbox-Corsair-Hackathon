"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatEventWhen } from "@/lib/display";
import { formatWeekLabel, getWeekBounds } from "@/lib/week";
import { api } from "@/trpc/react";

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDays(weekOffset: number) {
  const { start } = getWeekBounds(weekOffset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const CHIP_COLORS = ["", "purple", "green"] as const;

export function CalendarPanel() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const week = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);
  const weekLabel = formatWeekLabel(week.start, week.end);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = new Date().toDateString();

  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultEnd.getHours() + 1);

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(toDatetimeLocalValue(defaultStart));
  const [end, setEnd] = useState(toDatetimeLocalValue(defaultEnd));
  const [attendees, setAttendees] = useState("");

  const utils = api.useUtils();

  const events = api.calendar.searchEvents.useQuery({
    query: activeSearch,
    weekStart: week.start.toISOString(),
    weekEnd: week.end.toISOString(),
    limit: 50,
    offset: 0,
  });

  const refreshEvents = api.calendar.refreshEvents.useMutation({
    onSuccess: async () => {
      await utils.calendar.searchEvents.invalidate();
    },
  });

  const createDraft = api.calendar.createDraft.useMutation({
    onSuccess: async () => {
      await utils.calendar.searchEvents.invalidate();
      resetForm();
      setShowCreate(false);
    },
  });

  const sendInvite = api.calendar.sendInvite.useMutation({
    onSuccess: async () => {
      await utils.calendar.searchEvents.invalidate();
      resetForm();
      setShowCreate(false);
    },
  });

  function resetForm() {
    setSummary("");
    setDescription("");
    setLocation("");
    setAttendees("");
  }

  function parseAttendees() {
    return attendees
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  }

  function toIso(datetimeLocal: string) {
    return new Date(datetimeLocal).toISOString();
  }

  const eventInput = {
    summary,
    description: description || undefined,
    location: location || undefined,
    start: toIso(start),
    end: toIso(end),
    attendees: parseAttendees(),
  };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof events.data>>();
    for (const day of weekDays) {
      map.set(day.toDateString(), []);
    }
    for (const event of events.data ?? []) {
      if (!event.start) continue;
      const eventDate = new Date(event.start).toDateString();
      const list = map.get(eventDate);
      if (list) list.push(event);
    }
    return map;
  }, [events, weekDays]);

  const selectedEvent = events.data?.find((e) => e.id === selectedEventId);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Escape") {
        if (showCreate) {
          setShowCreate(false);
          e.preventDefault();
        } else if (selectedEventId) {
          setSelectedEventId(null);
          e.preventDefault();
        }
        return;
      }

      if (typing) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          setShowCreate(true);
          break;
        case "ArrowLeft":
          e.preventDefault();
          setWeekOffset((w) => w - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          setWeekOffset((w) => w + 1);
          break;
        case "t":
          e.preventDefault();
          setWeekOffset(0);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showCreate, selectedEventId]);

  const createModal = showCreate && (
    <div className="compose-overlay" onClick={() => setShowCreate(false)}>
      <div className="compose-panel" onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <span className="compose-title">New Event</span>
          <button type="button" className="btn-icon" onClick={() => setShowCreate(false)}>
            ✕
          </button>
        </div>
        <div className="compose-field">
          <span className="compose-field-label">Title</span>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Meeting title"
          />
        </div>
        <div className="compose-field">
          <span className="compose-field-label">When</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="compose-field">
          <span className="compose-field-label">End</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="compose-field">
          <span className="compose-field-label">Where</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
          />
        </div>
        <div className="compose-field">
          <span className="compose-field-label">Guests</span>
          <input
            type="text"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="email@example.com, …"
          />
        </div>
        <div className="compose-body">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ height: 80 }}
          />
        </div>
        <div className="compose-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sendInvite.mutate(eventInput)}
            disabled={
              sendInvite.isPending ||
              !summary ||
              !start ||
              !end ||
              parseAttendees().length === 0
            }
          >
            {sendInvite.isPending ? "Sending…" : "Send invite"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => createDraft.mutate(eventInput)}
            disabled={createDraft.isPending || !summary || !start || !end}
          >
            Save draft
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="calendar-pane">
      {createModal}

      <div className="calendar-header">
        <div className="week-nav-group">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          >
            ←
          </button>
          <span className="week-label">{weekLabel}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          >
            →
          </button>
        </div>
        {weekOffset !== 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => setWeekOffset(0)}>
            Today
          </button>
        )}
        <div className="topbar-actions" style={{ marginLeft: "auto" }}>
          <div className="search-bar">
            <span className="search-icon">⌕</span>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setActiveSearch(search);
                if (e.key === "Escape") {
                  setSearch("");
                  setActiveSearch("");
                }
              }}
              placeholder="Search events… (/)"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            + Event
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              refreshEvents.mutate({
                weekStart: week.start.toISOString(),
                weekEnd: week.end.toISOString(),
              })
            }
            disabled={refreshEvents.isPending}
          >
            {refreshEvents.isPending ? "…" : "↻"}
          </button>
        </div>
      </div>

      {events.isLoading && (
        <div style={{ padding: 20 }}>
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}
      {events.error && (
        <p style={{ padding: 20, color: "var(--accent-red)" }}>{events.error.message}</p>
      )}

      <div className="calendar-grid">
        {weekDays.map((day, dayIdx) => {
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          const isToday = day.toDateString() === today;

          return (
            <div key={day.toDateString()} className={`calendar-day ${isToday ? "today" : ""}`}>
              <div className="calendar-day-label">{DAY_NAMES[dayIdx]}</div>
              <div className="calendar-day-num">{day.getDate()}</div>
              {dayEvents.map((event, i) => (
                <div
                  key={event.id}
                  className={`calendar-event-chip ${CHIP_COLORS[i % CHIP_COLORS.length] ?? ""}`}
                  onClick={() => setSelectedEventId(event.id)}
                  title={event.summary}
                >
                  {event.start && (
                    <span style={{ opacity: 0.7, marginRight: 4 }}>
                      {new Date(event.start).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {event.summary || "Untitled"}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {selectedEvent && (
        <div
          className="compose-overlay"
          style={{ alignItems: "center", justifyContent: "center" }}
          onClick={() => setSelectedEventId(null)}
        >
          <div
            className="compose-panel"
            style={{ width: 480, maxHeight: "60vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="compose-header">
              <span className="compose-title">{selectedEvent.summary || "Event"}</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedEventId(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--text-secondary)" }}>
              {selectedEvent.start && (
                <p style={{ marginBottom: 8 }}>
                  {formatEventWhen(selectedEvent.start, selectedEvent.end)}
                </p>
              )}
              {selectedEvent.location && (
                <p style={{ marginBottom: 8 }}>📍 {selectedEvent.location}</p>
              )}
              {selectedEvent.description && (
                <p style={{ marginBottom: 8 }}>{selectedEvent.description}</p>
              )}
              {selectedEvent.htmlLink && (
                <a
                  href={selectedEvent.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-blue)" }}
                >
                  Open in Google Calendar
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
