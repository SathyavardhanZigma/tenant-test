export default function Checkbox({ className = '', ...props }) {
  return (
    <input
      type="checkbox"
      className={`size-4 rounded border-neutral-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/30 ${className}`}
      {...props}
    />
  );
}
