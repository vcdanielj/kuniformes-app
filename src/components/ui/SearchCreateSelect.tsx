"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SearchCreateOption = {
  value: string;
  label: string;
  keywords?: string[];
  meta?: string;
  preview?: ReactNode;
};

type SearchCreateSelectProps = {
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  value: string;
  options: SearchCreateOption[];
  disabled?: boolean;
  allowClear?: boolean;
  createLabel?: (query: string) => string;
  onChange: (value: string) => void;
  onCreate?: (query: string) => Promise<void> | void;
  /**
   * When provided, shows a persistent "create new" action (visible without
   * typing). Clicking it hands control to the parent (typically to open a full
   * modal with all fields), passing whatever has been typed so it can prefill.
   */
  onRequestCreate?: (query: string) => void;
  createNewLabel?: string;
};

export function SearchCreateSelect({
  label,
  placeholder = "Buscar...",
  emptyMessage = "Sin coincidencias.",
  value,
  options,
  disabled = false,
  allowClear = false,
  createLabel,
  onChange,
  onCreate,
  onRequestCreate,
  createNewLabel,
}: SearchCreateSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Desktop positioning for the portaled dropdown. `null` while closed or on
  // mobile (where the dropdown is a CSS bottom sheet, not anchored to the trigger).
  const [coords, setCoords] = useState<
    { top: number; left: number; width: number; maxHeight: number; openUp: boolean } | null
  >(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCoords(null);
    }
  }, [open]);

  // Close on outside click. The dropdown is portaled to <body>, so it is NOT a
  // DOM descendant of the field — check both refs before treating a click as
  // "outside" (otherwise clicking an option would close it before selection).
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Anchor the fixed-position dropdown to the trigger, flipping upward when
  // there is little room below (e.g. near the bottom of a tall scrolled modal).
  // On mobile (<=768px) the CSS bottom-sheet takes over, so leave coords null.
  const recalc = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      setCoords(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const preferred = 320;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < Math.min(preferred, 240) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferred, openUp ? spaceAbove : spaceBelow));
    setCoords({
      top: openUp ? rect.top - margin : rect.bottom + margin,
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    recalc();
    window.addEventListener("resize", recalc);
    // Capture phase so scrolling inside the modal (not just the window) repositions it.
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open, recalc]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = [option.label, option.meta, ...(option.keywords || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);

  // When the parent wants to handle creation in a full modal, the inline
  // create-by-name path is suppressed in favor of the persistent action.
  const showCreate = !onRequestCreate && !!onCreate && normalizedQuery.length > 0 && !options.some((option) => option.label.toLowerCase() === normalizedQuery);

  async function handleCreate() {
    if (!onCreate || !normalizedQuery || creating) return;
    setCreating(true);
    try {
      await onCreate(query.trim());
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="search-create-field" ref={rootRef}>
      {label ? <label className="input-label">{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        className={`search-create-trigger ${disabled ? "is-disabled" : ""}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
      >
        <div className="search-create-trigger-copy">
          <span className={selectedOption ? "search-create-value" : "search-create-placeholder"}>
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption?.meta ? <span className="search-create-meta">{selectedOption.meta}</span> : null}
        </div>
        <span className="search-create-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={dropdownRef}
          className="search-create-dropdown"
          style={
            coords
              ? {
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                  maxHeight: coords.maxHeight,
                  right: "auto",
                  bottom: "auto",
                  transform: coords.openUp ? "translateY(-100%)" : undefined,
                }
              : undefined
          }
        >
          <input
            className="input search-create-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoFocus
          />

          <div className="search-create-options">
            {allowClear ? (
              <button
                type="button"
                className={`search-create-option ${!value ? "is-selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <div>
                  <div className="search-create-option-title">Sin seleccionar</div>
                  <div className="search-create-option-meta">Usar valor vacío</div>
                </div>
              </button>
            ) : null}

            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`search-create-option ${option.value === value ? "is-selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <div className="search-create-option-body">
                  {option.preview ? <div className="search-create-option-preview">{option.preview}</div> : null}
                  <div>
                    <div className="search-create-option-title">{option.label}</div>
                    {option.meta ? <div className="search-create-option-meta">{option.meta}</div> : null}
                  </div>
                </div>
              </button>
            ))}

            {!showCreate && filteredOptions.length === 0 ? (
              <div className="search-create-empty">{emptyMessage}</div>
            ) : null}

            {showCreate ? (
              <button
                type="button"
                className="search-create-create"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleCreate}
                disabled={creating}
              >
                {createLabel ? createLabel(query.trim()) : `+ Crear "${query.trim()}"`}
              </button>
            ) : null}

            {onRequestCreate ? (
              <button
                type="button"
                className="search-create-create"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const q = query.trim();
                  setOpen(false);
                  onRequestCreate(q);
                }}
              >
                {createNewLabel || (normalizedQuery ? `+ Crear "${query.trim()}"…` : "+ Crear nuevo…")}
              </button>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
