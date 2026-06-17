"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Plus, 
  Grid,
  List,
  RefreshCw,
  X
} from "lucide-react";
import { api } from "@/trpc/react";

type ViewMode = "month" | "week" | "day" | "agenda";

export function CalendarPanel() {
  // Swapped default view state to "month" view mode automatically
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Form State
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [attendees, setAttendees] = useState("");

  const utils = api.useUtils();

  // Compute bounding search parameters based on active date views
  const searchRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === "month") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else if (viewMode === "week") {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setDate(end.getDate() + (6 - day));
    } else {
      // Day and Agenda
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return {
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
    };
  }, [currentDate, viewMode]);

  // Fetch items via existing router schemas
  const { data: events = [], isLoading } = api.calendar.searchEvents.useQuery({
    query: "",
    weekStart: searchRange.weekStart,
    weekEnd: searchRange.weekEnd,
    limit: 100,
    offset: 0
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

  // Force automatic background refresh fetch when view parameters spin up empty
  useEffect(() => {
    if (!isLoading && events.length === 0 && !refreshEvents.isPending && !refreshEvents.isError) {
      refreshEvents.mutate({
        weekStart: searchRange.weekStart,
        weekEnd: searchRange.weekEnd,
      });
    }
  }, [searchRange.weekStart, searchRange.weekEnd, isLoading, events.length, refreshEvents]);

  // Date Calculation Core Grid Mappers
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const blankCells: (Date | null)[] = Array.from(
      { length: firstDayIndex },
      () => null,
    );
    const validCells = Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1));
    return [...blankCells, ...validCells] satisfies (Date | null)[];
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const handleNavigate = (direction: "prev" | "next") => {
    const nextDate = new Date(currentDate);
    const modifier = direction === "prev" ? -1 : 1;

    if (viewMode === "month") {
      nextDate.setMonth(nextDate.getMonth() + modifier);
    } else if (viewMode === "week") {
      nextDate.setDate(nextDate.getDate() + modifier * 7);
    } else {
      nextDate.setDate(nextDate.getDate() + modifier);
    }
    setCurrentDate(nextDate);
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  // Helper formatting match expressions
  const getEventsForDate = (date: Date) => {
    return events.filter(e => {
      if (!e.start) return false;
      const eventDate = new Date(e.start);
      return eventDate.getDate() === date.getDate() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getFullYear() === date.getFullYear();
    });
  };

  return (
    <div className="calendar-pane" style={{ display: "flex", height: "100vh", background: "#111", color: "#e8eaed", fontFamily: "Roboto, sans-serif" }}>
      
      {/* SIDEBAR: Google Mini Picker Panel & Actions */}
      <div style={{ width: "256px", background: "#1f1f1f", borderRight: "1px solid #282828", padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <button 
          onClick={() => {
            setStartTime(new Date().toISOString().slice(0, 16));
            setEndTime(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
            setShowScheduleModal(true);
          }}
          style={{ width: "100%", background: "#303134", color: "#fff", border: "none", borderRadius: "24px", padding: "12px 24px", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
        >
          <Plus size={20} style={{ color: "#1a73e8" }} /> Create Event
        </button>

        {/* Navigation Short View Targets */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <button onClick={() => setViewMode("month")} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", background: viewMode === "month" ? "#004a77" : "transparent", color: viewMode === "month" ? "#c2e7ff" : "#e8eaed", border: "none", padding: "10px 16px", borderRadius: "20px", textAlign: "left", cursor: "pointer", fontSize: "14px" }}><Grid size={16} /> Month View</button>
          <button onClick={() => setViewMode("week")} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", background: viewMode === "week" ? "#004a77" : "transparent", color: viewMode === "week" ? "#c2e7ff" : "#e8eaed", border: "none", padding: "10px 16px", borderRadius: "20px", textAlign: "left", cursor: "pointer", fontSize: "14px" }}><CalendarIcon size={16} /> Week View</button>
          <button onClick={() => setViewMode("day")} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", background: viewMode === "day" ? "#004a77" : "transparent", color: viewMode === "day" ? "#c2e7ff" : "#e8eaed", border: "none", padding: "10px 16px", borderRadius: "20px", textAlign: "left", cursor: "pointer", fontSize: "14px" }}><Clock size={16} /> Day View</button>
          <button onClick={() => setViewMode("agenda")} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", background: viewMode === "agenda" ? "#004a77" : "transparent", color: viewMode === "agenda" ? "#c2e7ff" : "#e8eaed", border: "none", padding: "10px 16px", borderRadius: "20px", textAlign: "left", cursor: "pointer", fontSize: "14px" }}><List size={16} /> Agenda List</button>
        </div>
      </div>

      {/* DASHBOARD WORKSPACE WORKFLOW */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* Top Control Bar Header */}
        <div style={{ height: "64px", borderBottom: "1px solid #282828", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1f1f1f" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "22px", color: "#fff", fontWeight: "400" }}>Calendar</span>
            <button onClick={() => setCurrentDate(new Date())} style={{ background: "transparent", border: "1px solid #5f6368", color: "#e8eaed", borderRadius: "4px", padding: "6px 12px", fontSize: "14px", cursor: "pointer" }}>Today</button>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button onClick={() => handleNavigate("prev")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: "6px" }}><ChevronLeft size={18} /></button>
              <button onClick={() => handleNavigate("next")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: "6px" }}><ChevronRight size={18} /></button>
            </div>
            <span style={{ fontSize: "18px", fontWeight: "500", color: "#fff", marginLeft: "8px" }}>
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
          </div>

          <button 
            onClick={() => refreshEvents.mutate({ weekStart: searchRange.weekStart, weekEnd: searchRange.weekEnd })}
            disabled={refreshEvents.isPending}
            style={{ background: "transparent", border: "none", color: "#9aa0a6", cursor: "pointer" }}
          >
            <RefreshCw size={18} className={refreshEvents.isPending ? "animate-spin" : ""} />
          </button>
        </div>

        {/* WORKSPACE CENTRAL WORKSPACE GRID VIEWS CONTAINER */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#111" }}>
          
          {/* VIEW: MONTH GRID */}
          {viewMode === "month" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", height: "100%", borderTop: "1px solid #282828", borderLeft: "1px solid #282828" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} style={{ textAlign: "center", padding: "8px 0", fontSize: "12px", color: "#9aa0a6", fontWeight: "500", borderRight: "1px solid #282828", background: "#161616" }}>{day}</div>
              ))}
              {monthDays.map((date, idx) => {
                const dayEvents = date ? getEventsForDate(date) : [];
                return (
                  <div key={idx} style={{ borderRight: "1px solid #282828", borderBottom: "1px solid #282828", minHeight: "100px", padding: "6px", background: date ? "transparent" : "#161616" }}>
                    {date && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                        <span style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", borderRadius: "50%", background: isToday(date) ? "#1a73e8" : "transparent", color: isToday(date) ? "#fff" : "#9aa0a6", fontSize: "12px", fontWeight: "600", justifyContent: "center" }}>
                          {date.getDate()}
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflowY: "hidden" }}>
                      {dayEvents.slice(0, 3).map(event => (
                        <div key={event.id} style={{ background: "#004a77", color: "#c2e7ff", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {event.summary}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div style={{ fontSize: "10px", color: "#9aa0a6", paddingLeft: "4px" }}>+ {dayEvents.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: WEEK HOURLY SPLIT */}
          {viewMode === "week" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", height: "100%" }}>
              {weekDays.map((day, idx) => {
                const dayEvents = getEventsForDate(day);
                return (
                  <div key={idx} style={{ background: "#1f1f1f", borderRadius: "8px", border: isToday(day) ? "1px solid #1a73e8" : "1px solid #282828", display: "flex", flexDirection: "column", minHeight: "450px" }}>
                    <div style={{ padding: "12px", background: "#161616", borderRadius: "8px 8px 0 0", textAlign: "center", borderBottom: "1px solid #282828" }}>
                      <div style={{ fontSize: "12px", color: "#9aa0a6" }}>{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", margin: "4px 0", color: isToday(day) ? "#1a73e8" : "#fff" }}>{day.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", padding: "10px" }}>
                      {dayEvents.map(event => (
                        <div key={event.id} style={{ background: "rgba(26,115,232,0.15)", borderLeft: "3px solid #1a73e8", padding: "8px", borderRadius: "4px" }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{event.summary}</div>
                          {event.start && (
                            <div style={{ fontSize: "11px", color: "#9aa0a6", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                              <Clock size={12} /> {new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: SINGLE DAY EXPANDED */}
          {viewMode === "day" && (
            <div style={{ background: "#1f1f1f", border: "1px solid #282828", borderRadius: "8px", padding: "24px", maxWidth: "800px" }}>
              <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "20px" }}>
                {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {getEventsForDate(currentDate).length === 0 ? (
                  <div style={{ color: "#9aa0a6", fontStyle: "italic" }}>No scheduling blocks found for this calendar index date.</div>
                ) : (
                  getEventsForDate(currentDate).map(event => (
                    <div key={event.id} style={{ background: "#161616", border: "1px solid #282828", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "16px", fontWeight: "bold", color: "#fff" }}>{event.summary}</div>
                      {event.location && <div style={{ fontSize: "13px", color: "#9aa0a6", display: "flex", alignItems: "center", gap: "6px" }}><MapPin size={14} /> {event.location}</div>}
                      {event.description && <div style={{ fontSize: "13px", color: "#9aa0a6" }}>{event.description}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* VIEW: AGENDA LIST SUMMARY */}
          {viewMode === "agenda" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "800px" }}>
              {events.length === 0 ? (
                <div style={{ color: "#9aa0a6", padding: "24px" }}>No scheduled upcoming pipeline invites.</div>
              ) : (
                events.map(event => (
                  <div key={event.id} style={{ display: "flex", background: "#1f1f1f", padding: "16px", borderRadius: "8px", gap: "20px", alignItems: "center", border: "1px solid #282828" }}>
                    <div style={{ minWidth: "100px" }}>
                      <div style={{ fontSize: "12px", color: "#9aa0a6" }}>{event.start ? new Date(event.start).toLocaleDateString([], { weekday: "short" }) : ""}</div>
                      <div style={{ fontSize: "18px", fontWeight: "bold" }}>{event.start ? new Date(event.start).toLocaleDateString([], { day: "numeric", month: "short" }) : ""}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "15px", fontWeight: "600", color: "#fff" }}>{event.summary}</div>
                      <div style={{ display: "flex", gap: "16px", marginTop: "4px", fontSize: "12px", color: "#9aa0a6" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Clock size={12} /> {event.start ? new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                        {event.location && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={12} /> {event.location}</span>}
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

        </div>
      </div>

      {/* MODAL WINDOW VIEW OVERLAY FOR FAST INDEPENDENT SCHEDULING */}
      {showScheduleModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", zIndex: 1000, justifyContent: "center" }}>
          <div style={{ background: "#1f1f1f", border: "1px solid #3c4043", borderRadius: "8px", width: "480px", display: "flex", flexDirection: "column", boxShadow: "0px 12px 24px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", borderBottom: "1px solid #282828", justifyContent: "space-between" }}>
              <span style={{ fontSize: "16px", fontWeight: "bold" }}>Schedule New Event</span>
              <X size={18} style={{ cursor: "pointer", color: "#9aa0a6" }} onClick={() => setShowScheduleModal(false)} />
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="text" placeholder="Add title" value={summary} onChange={e => setSummary(e.target.value)} style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #3c4043", color: "#fff", fontSize: "18px", padding: "6px 0", outline: "none" }} />
              
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", color: "#9aa0a6" }}>Start Date & Time</label>
                  <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: "100%", background: "#282828", border: "1px solid #3c4043", color: "#fff", padding: "6px", borderRadius: "4px", marginTop: "4px" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", color: "#9aa0a6" }}>End Date & Time</label>
                  <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: "100%", background: "#282828", border: "1px solid #3c4043", color: "#fff", padding: "6px", borderRadius: "4px", marginTop: "4px" }} />
                </div>
              </div>

              <input type="text" placeholder="Add Location" value={location} onChange={e => setLocation(e.target.value)} style={{ width: "100%", background: "#282828", border: "1px solid #3c4043", borderRadius: "4px", color: "#fff", padding: "8px", fontSize: "13px", marginTop: "4px" }} />
              <input type="text" placeholder="Add Guests (comma separated emails)" value={attendees} onChange={e => setAttendees(e.target.value)} style={{ width: "100%", background: "#282828", border: "1px solid #3c4043", borderRadius: "4px", color: "#fff", padding: "8px", fontSize: "13px" }} />
              <textarea placeholder="Add Description" value={description} onChange={e => setDescription(e.target.value)} style={{ width: "100%", height: "80px", background: "#282828", border: "1px solid #3c4043", borderRadius: "4px", color: "#fff", padding: "8px", fontSize: "13px", resize: "none" }} />
            </div>
            <div style={{ padding: "16px", display: "flex", gap: "10px", background: "#161616", borderRadius: "0 0 8px 8px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowScheduleModal(false)} style={{ background: "transparent", border: "none", color: "#1a73e8", cursor: "pointer", fontWeight: "500", padding: "6px 12px" }}>Cancel</button>
              <button 
                onClick={() => {
                  const emailsArr = attendees.split(",").map(e => e.trim()).filter(Boolean);
                  sendInvite.mutate({
                    summary,
                    description,
                    location,
                    start: new Date(startTime).toISOString(),
                    end: new Date(endTime).toISOString(),
                    attendees: emailsArr
                  });
                }}
                disabled={sendInvite.isPending || !summary || !startTime || !endTime}
                style={{ background: "#1a73e8", color: "#fff", border: "none", borderRadius: "4px", padding: "6px 16px", cursor: "pointer", fontWeight: "500" }}
              >
                {sendInvite.isPending ? "Inviting..." : "Save & Send"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
