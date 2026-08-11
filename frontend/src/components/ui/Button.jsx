// Every action gets its own color so the screen reads at a glance: butter =
// primary brand action (sign in), green = create something new, blue = save/
// update something existing, red = destructive, white = secondary/cancel.
const VARIANTS = {
  primary: 'bg-butter-400 text-neutral-900 hover:bg-butter-300 shadow-sm shadow-butter-500/30',
  create: 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm shadow-emerald-500/30',
  update: 'bg-sky-500 text-white hover:bg-sky-400 shadow-sm shadow-sky-500/30',
  destructive: 'bg-red-500 text-white hover:bg-red-400 shadow-sm shadow-red-500/30',
  // Secondary — white, bordered.
  secondary: 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 shadow-sm',
  // Tertiary — white/transparent, no border, subtle butter hover tint.
  ghost: 'bg-white text-neutral-700 hover:bg-butter-50',
  // A slightly bolder butter tone for the rare screen that needs two CTAs
  // of the same brand color to read at different weights.
  accent: 'bg-butter-500 text-neutral-900 hover:bg-butter-400 shadow-sm shadow-butter-600/30',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-[15px]',
};

export default function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-butter-600 focus-visible:ring-offset-2 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
