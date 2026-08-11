export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-butter-600 focus:ring-2 focus:ring-butter-500/20 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', ...props }) {
  return (
    <select
      className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-butter-600 focus:ring-2 focus:ring-butter-500/20 ${className}`}
      {...props}
    />
  );
}

export function Label({ className = '', ...props }) {
  return <label className={`mb-1 block text-sm font-medium text-neutral-700 ${className}`} {...props} />;
}
