import { useMemo } from 'react';
import { generateIdenticon } from '../../utils/identicon';

/** Per-user/session identicon avatar — deterministic from `seed`, so pass a
 * per-login session seed (see api/auth.js) to get a fresh look each login
 * while staying stable for the duration of that session. */
export default function Avatar({ seed, size = 32, className = '' }) {
  const { cells, hue } = useMemo(() => generateIdenticon(seed || 'guest'), [seed]);
  const cellSize = size / 5;
  const fg = `hsl(${hue} 65% 55%)`;
  const bg = `hsl(${hue} 45% 94%)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-lg ${className}`}
      role="img"
      aria-label="User avatar"
    >
      <rect width={size} height={size} fill={bg} />
      {cells.map((row, rowIndex) =>
        row.map((filled, colIndex) =>
          filled ? (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex * cellSize}
              y={rowIndex * cellSize}
              width={cellSize}
              height={cellSize}
              fill={fg}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
