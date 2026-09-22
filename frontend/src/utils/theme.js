/**
 * Reads a colour out of the theme at runtime.
 *
 * The canvas 2D API takes literal colour strings and cannot use a utility
 * class, so the photo watermark would otherwise be the one place in src/ that
 * hardcodes a hex value. Pulling it from the custom property keeps index.css
 * the single source of truth for the palette.
 */
export function themeColor(token, fallback = '#000000') {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
  return value || fallback;
}

/** The same colour with an alpha channel, for canvas fills. */
export function themeColorAlpha(token, alpha, fallback = '#000000') {
  const hex = themeColor(token, fallback);
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}
