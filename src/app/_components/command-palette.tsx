"use client";

import { useEffect, useRef, useState } from "react";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  section?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[activeIdx]) {
        filtered[activeIdx].action();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, filtered, activeIdx, onClose]);

  if (!isOpen) return null;

  // Group by section
  const sections = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const s = item.section ?? "Actions";
    acc[s] ??= [];
    acc[s].push(item);
    return acc;
  }, {});

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <span className="cmd-search-icon">⌘</span>
          <input
            ref={inputRef}
            id="cmd-palette-input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="cmd-results">
          {filtered.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No results for &quot;{query}&quot;
            </div>
          ) : (
            Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <div className="cmd-section-label">{section}</div>
                {items.map((item) => {
                  const globalIdx = filtered.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      id={`cmd-item-${item.id}`}
                      className={`cmd-item ${globalIdx === activeIdx ? "active" : ""}`}
                      onClick={() => {
                        item.action();
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                    >
                      <div className="cmd-item-icon">{item.icon ?? "⚡"}</div>
                      <div style={{ flex: 1 }}>
                        <div className="cmd-item-label">{item.label}</div>
                        {item.description && (
                          <div className="cmd-item-desc">{item.description}</div>
                        )}
                      </div>
                      {item.shortcut && (
                        <div className="cmd-item-shortcut">{item.shortcut}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmd-footer">
          <div className="cmd-footer-hint">
            <span className="cmd-footer-key">↑↓</span> navigate
          </div>
          <div className="cmd-footer-hint">
            <span className="cmd-footer-key">↵</span> select
          </div>
          <div className="cmd-footer-hint">
            <span className="cmd-footer-key">Esc</span> close
          </div>
        </div>
      </div>
    </div>
  );
}
