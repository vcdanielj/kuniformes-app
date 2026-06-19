"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
}: SearchCreateSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const showCreate = !!onCreate && normalizedQuery.length > 0 && !options.some((option) => option.label.toLowerCase() === normalizedQuery);

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

      {open ? (
        <div className="search-create-dropdown">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
