const VARIANTS = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/10',
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-500/10',
  accent: 'bg-butter-100 text-butter-800 ring-butter-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

export default function Badge({ variant = 'neutral', className = '', ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
