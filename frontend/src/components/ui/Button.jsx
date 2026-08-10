const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
  secondary: 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 shadow-sm',
  ghost: 'text-indigo-600 hover:bg-indigo-50',
  destructive: 'text-red-600 hover:bg-red-50',
  accent: 'bg-amber-400 text-neutral-900 hover:bg-amber-300 shadow-sm',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export default function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
