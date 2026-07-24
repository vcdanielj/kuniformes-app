/**
 * Shared skeleton fallback for all dashboard routes. Shown during route
 * navigation/streaming so the user sees structured placeholders instead of a
 * blank screen.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Cargando">
      <div className="skeleton" style={{ height: 30, width: 220, marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 16, width: 320, marginBottom: 22 }} />

      <div className="grid-4" style={{ marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton" style={{ height: 13, width: "55%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 26, width: "70%", marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 12, width: "45%" }} />
          </div>
        ))}
      </div>

      <div className="skeleton-card">
        <div className="skeleton" style={{ height: 16, width: 180, marginBottom: 18 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "11px 0", borderTop: "1px solid var(--border-light)" }}>
            <div className="skeleton" style={{ height: 14, flex: 1 }} />
            <div className="skeleton" style={{ height: 14, width: 90 }} />
            <div className="skeleton" style={{ height: 14, width: 70 }} />
            <div className="skeleton" style={{ height: 14, width: 110 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
