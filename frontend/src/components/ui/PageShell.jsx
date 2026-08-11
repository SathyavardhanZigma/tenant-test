export default function PageShell({ maxWidth = 'max-w-4xl', paddingX = 'px-6 sm:px-8', header, children }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      {header}
      <div className={`mx-auto ${maxWidth} ${paddingX} py-10`}>{children}</div>
    </div>
  );
}
