import figlet from 'figlet';

/** Custom Λ glyph: a pointed apex with legs spreading outward, matching the font. */
const LAMBDA = [
  '  ██╗   ',
  ' ████╗  ',
  '██╔██╗  ',
  '██╝╚██╗ ',
  '██╗ ╚██╗',
  '╚═╝  ╚═╝',
  '        ',
];

const BANNER_ROWS = 7;
type Glyph = string | string[];
/** T R A D E F Λ S T — the stylised Λ uses the custom glyph above. */
const WORDMARK: Glyph[] = ['T', 'R', 'A', 'D', 'E', 'F', LAMBDA, 'S', 'T'];

const glyphLines = (g: Glyph): string[] =>
  Array.isArray(g) ? g : figlet.textSync(g, { font: 'ANSI Shadow' }).split('\n');

/**
 * Builds the multi-line "TRADEFΛST" block banner by laying every glyph side by
 * side, preserving each glyph's native width. Returns the raw (uncoloured) art;
 * the gradient is applied by the renderer.
 */
export function renderBannerArt(): string {
  const lines = Array.from({ length: BANNER_ROWS }, () => '');
  for (const glyph of WORDMARK) {
    const g = glyphLines(glyph);
    const width = g[0]?.length ?? 0;
    for (let r = 0; r < BANNER_ROWS; r++) {
      lines[r] += (g[r] ?? '').padEnd(width, ' ');
    }
  }
  // Drop fully-blank trailing rows and right-trim each line.
  return lines
    .map((l) => l.replace(/\s+$/u, ''))
    .filter((l, i, arr) => l.length > 0 || i < arr.length - 1)
    .join('\n');
}
