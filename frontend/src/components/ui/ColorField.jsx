const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** A native color-picker swatch paired with an editable hex input, kept in
 * sync both ways — used for per-tenant branding (primary/secondary color). */
export default function ColorField({ id, label, value, onChange }) {
  const isValid = HEX_PATTERN.test(value);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-neutral-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={isValid ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
        />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#f5c518"
          maxLength={7}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition focus:ring-2 focus:ring-butter-500/20 ${
            isValid ? 'border-neutral-300 focus:border-butter-600' : 'border-red-300 focus:border-red-500'
          }`}
        />
      </div>
      {!isValid && <p className="mt-1 text-xs text-red-600">Enter a 6-digit hex color, e.g. #f5c518.</p>}
    </div>
  );
}
