// Full-screen loading state for admin pages that render before AdminLayout (e.g. while the session loads)
export default function AdminLoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-adm-bg">
      <div role="status" className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-adm-line border-t-adm-accent" aria-hidden="true" />
        <p className="text-sm text-adm-muted">Loading…</p>
      </div>
    </div>
  );
}
