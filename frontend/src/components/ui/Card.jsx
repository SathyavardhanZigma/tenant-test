export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }) {
  return <div className={`border-b border-neutral-100 px-6 py-4 ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }) {
  return <h2 className={`text-lg font-semibold text-neutral-900 ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }) {
  return <div className={`px-6 py-4 ${className}`} {...props} />;
}
