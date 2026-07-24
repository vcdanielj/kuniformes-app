"use client";

import { useState } from "react";

export type QuickField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
};

type QuickCreateModalProps = {
  title: string;
  fields: QuickField[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (
    values: Record<string, string>
  ) => Promise<{ success: boolean; error?: string; id?: number | string }>;
  /** Called after a successful create, with the new record's id (if returned). */
  onCreated?: (result: { id?: number | string }, values: Record<string, string>) => void;
};

/**
 * Generic "create record" modal. Instead of creating an entity from just a typed
 * name, selectors open this with the full set of fields so the record is created
 * complete, then the parent selects it via onCreated.
 *
 * Mount it conditionally (e.g. `{open && <QuickCreateModal ... />}`) — it
 * initializes its form from `initial`/`fields` on mount.
 */
export function QuickCreateModal({
  title,
  fields,
  initial,
  submitLabel = "Crear",
  onClose,
  onSubmit,
  onCreated,
}: QuickCreateModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = initial?.[f.key] ?? (f.type === "select" ? f.options?.[0]?.value ?? "" : "");
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !String(values[f.key] ?? "").trim()) {
        setError(`${f.label} es obligatorio.`);
        return;
      }
    }
    setSubmitting(true);
    setError("");
    const res = await onSubmit(values);
    setSubmitting(false);
    if (res.success) {
      onCreated?.({ id: res.id }, values);
      onClose();
    } else {
      setError(res.error || "No se pudo crear el registro.");
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          {fields.map((f) => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label className="input-label">
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "select" ? (
                <select
                  className="input"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                >
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  autoFocus={f === fields[0]}
                />
              )}
            </div>
          ))}
          <div className="modal-footer-sticky">
            {error && (
              <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}>
                <p>{error}</p>
              </div>
            )}
            <div className="sales-form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Guardando..." : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
