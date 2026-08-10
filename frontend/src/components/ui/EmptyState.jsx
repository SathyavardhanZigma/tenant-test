export default function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <span className="mb-1 text-3xl">{icon}</span>
      <p className="font-medium text-neutral-600">{title}</p>
      {hint && <p className="text-sm text-neutral-400">{hint}</p>}
    </div>
  );
}
