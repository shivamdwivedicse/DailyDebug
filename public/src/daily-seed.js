const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const RANDOM_STEP = 0x6d2b79f5;
const UINT32_RANGE = 4_294_967_296;
const MIX_SHIFT_A = 15;
const ODD_MASK = 1;
const MIX_SHIFT_B = 7;
const MIX_MULTIPLIER = 61;
const MIX_SHIFT_C = 14;

/**
 * Creates a stable unsigned 32-bit seed from year and local calendar date.
 * @param {number} year
 * @param {string} date
 * @returns {number}
 */
export function dailySeed(year, date) {
  let hash = FNV_OFFSET_BASIS;
  for (const character of `${year}:${date}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Creates a seeded pseudo-random number generator.
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += RANDOM_STEP;
    let result = value;
    result = Math.imul(result ^ (result >>> MIX_SHIFT_A), result | ODD_MASK);
    result ^= result + Math.imul(result ^ (result >>> MIX_SHIFT_B), result | MIX_MULTIPLIER);
    return ((result ^ (result >>> MIX_SHIFT_C)) >>> 0) / UINT32_RANGE;
  };
}
