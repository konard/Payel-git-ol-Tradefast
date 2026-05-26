import type { BacktestReport } from '../services/backtest.js';

export type BacktestColumnKey = 'symbol' | 'trades' | 'winRate' | 'expectancy' | 'profitFactor';

const columns: { key: BacktestColumnKey; label: string }[] = [
  { key: 'symbol', label: 'Currency' },
  { key: 'trades', label: 'Trades' },
  { key: 'winRate', label: 'Win %' },
  { key: 'expectancy', label: 'Exp (R)' },
  { key: 'profitFactor', label: 'Profit factor' },
];

export interface BacktestCell {
  key: BacktestColumnKey;
  text: string;
  value: string;
}

export type BacktestRenderPart =
  | { kind: 'title'; text: string }
  | { kind: 'border'; text: string }
  | { kind: 'header' | 'row' | 'total'; cells: BacktestCell[] };

function formatPercent(rate: number, decided: number): string {
  return decided > 0 ? `${(rate * 100).toFixed(1)}%` : '—';
}

function formatR(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatFactor(value: number, trades: number): string {
  if (trades === 0) return '—';
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(2);
}

type DisplayRow = Record<BacktestColumnKey, string>;

function displayRows(report: BacktestReport): DisplayRow[] {
  const rows = report.results.map((result): DisplayRow => ({
    symbol: result.symbol,
    trades: String(result.trades),
    winRate: formatPercent(result.winRate, result.wins + result.losses),
    expectancy: formatR(result.expectancy),
    profitFactor: formatFactor(result.profitFactor, result.trades),
  }));

  return rows.length > 0
    ? rows
    : [{ symbol: '', trades: '0', winRate: '—', expectancy: formatR(0), profitFactor: '—' }];
}

function totalRow(report: BacktestReport): DisplayRow {
  const t = report.totals;
  return {
    symbol: 'TOTAL',
    trades: String(t.trades),
    winRate: formatPercent(t.winRate, t.wins + t.losses),
    expectancy: formatR(t.expectancy),
    profitFactor: formatFactor(t.profitFactor, t.trades),
  };
}

function rowCells(
  row: Record<BacktestColumnKey, string>,
  widths: Record<BacktestColumnKey, number>,
): BacktestCell[] {
  return columns.map(({ key }) => ({
    key,
    value: row[key],
    text: ` ${row[key].padEnd(widths[key])} `,
  }));
}

function borderLine(
  widths: Record<BacktestColumnKey, number>,
  chars: { left: string; join: string; right: string },
): string {
  const segments = columns.map(({ key }) => '─'.repeat(widths[key] + 2));
  return `${chars.left}${segments.join(chars.join)}${chars.right}`;
}

function cellsLine(cells: readonly BacktestCell[]): string {
  return `│${cells.map((cell) => cell.text).join('│')}│`;
}

/** Render structured backtest table parts so Ink can colour individual cells. */
export function renderBacktestParts(report: BacktestReport): BacktestRenderPart[] {
  const rows = displayRows(report);
  const total = totalRow(report);
  const allRows = [...rows, total];
  const widths = Object.fromEntries(
    columns.map(({ key, label }) => [key, Math.max(label.length, ...allRows.map((row) => row[key].length))]),
  ) as Record<BacktestColumnKey, number>;

  const header = rowCells(
    Object.fromEntries(columns.map(({ key, label }) => [key, label])) as Record<BacktestColumnKey, string>,
    widths,
  );
  const top = borderLine(widths, { left: '╭', join: '┬', right: '╮' });
  const separator = borderLine(widths, { left: '├', join: '┼', right: '┤' });
  const bottom = borderLine(widths, { left: '╰', join: '┴', right: '╯' });

  return [
    { kind: 'title', text: 'Backtest — forecast accuracy (TP before SL)' },
    { kind: 'border', text: top },
    { kind: 'header', cells: header },
    { kind: 'border', text: separator },
    ...rows.map((row): BacktestRenderPart => ({ kind: 'row', cells: rowCells(row, widths) })),
    { kind: 'border', text: separator },
    { kind: 'total', cells: rowCells(total, widths) },
    { kind: 'border', text: bottom },
  ];
}

/** Render a terminal backtest table for interactive and headless output. */
export function renderBacktestLines(report: BacktestReport): string[] {
  return renderBacktestParts(report).map((part) => ('cells' in part ? cellsLine(part.cells) : part.text));
}
