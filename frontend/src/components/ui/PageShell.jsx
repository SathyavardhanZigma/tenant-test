export default function PageShell({ maxWidth = 'max-w-4xl', header, children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-amber-50/60">
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-amber-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-indigo-200/30 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        {header}
        <div className={`mx-auto ${maxWidth} px-6 py-10`}>{children}</div>
      </div>
    </div>
  );
}
