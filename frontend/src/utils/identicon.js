/** Deterministic string hash → seeded PRNG → GitHub-style 5x5 symmetric grid
 * identicon. No network calls, no external library — just a pure function of
 * whatever seed string it's given. */

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns { cells: boolean[5][5], hue } for the given seed string. The grid
 * is left-right symmetric, matching the classic identicon look. */
export function generateIdenticon(seed) {
  const rand = mulberry32(hashString(String(seed)));
  const hue = Math.floor(rand() * 360);

  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    const rowCells = [];
    for (let col = 0; col < 3; col += 1) {
      rowCells.push(rand() > 0.5);
    }
    cells.push([...rowCells, rowCells[1], rowCells[0]]);
  }

  return { cells, hue };
}
