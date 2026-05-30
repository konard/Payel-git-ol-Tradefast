import { isBinaryOptions } from './exchanges.js';
import type { RunReport, SymbolReport } from '../pipeline/collector.js';
import { buildForecast } from '../strategies/forecast.js';

interface TradeLogRow {
  currency: string;
  direction: 'long' | 'short' | '';
  tp: number | null;
  sl: number | null;
  expiryMinutes: number | null;
  entryPrice: number | null;
  assessment: string;
}

export type TradeLogColumnKey = 'currency' | 'direction' | 'tp' | 'sl' | 'expiry' | 'entryPrice' | 'assessment';

interface TradeLogColumn {
  key: TradeLogColumnKey;
  label: string;
}

/** Spot venues bracket trades with TP/SL. */
const SPOT_COLUMNS: TradeLogColumn[] = [
  { key: 'currency', label: 'Currency' },
  { key: 'direction', label: 'Dir' },
  { key: 'tp', label: 'TP' },
  { key: 'sl', label: 'SL' },
  { key: 'entryPrice', label: 'Price' },
  { key: 'assessment', label: 'AI' },
];

/** Binary-options venues (Pocket Option) have no TP/SL — only an expiry time. */
const BINARY_COLUMNS: TradeLogColumn[] = [
  { key: 'currency', label: 'Currency' },
  { key: 'direction', label: 'Dir' },
  { key: 'expiry', label: 'Time' },
  { key: 'entryPrice', label: 'Price' },
  { key: 'assessment', label: 'AI' },
];

/** Pick the column layout for a run based on its venue. */
function columnsFor(report: RunReport): TradeLogColumn[] {
  return isBinaryOptions(report.exchange) ? BINARY_COLUMNS : SPOT_COLUMNS;
}

export interface TradeLogCell {
  key: TradeLogColumnKey;
  text: string;
  value: string;
}

export type TradeLogRenderPart =
  | { kind: 'title'; text: string }
  | { kind: 'border'; text: string }
  | { kind: 'header' | 'row'; cells: TradeLogCell[] };

function isFinitePrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Map the shared forecast (single source of truth) onto a trade-log row. */
function buildTradeLogRow(symbol: SymbolReport, interval: string): TradeLogRow {
  const forecast = buildForecast(symbol.analysis, { interval });
  return {
    currency: forecast.symbol,
    direction: forecast.direction,
    tp: forecast.tp,
    sl: forecast.sl,
    expiryMinutes: forecast.expiryMinutes,
    entryPrice: forecast.entry,
    assessment: symbol.assessment,
  };
}

function formatPrice(value: number | null): string {
  if (!isFinitePrice(value)) return '';
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  if (value >= 0.0001) return value.toFixed(6);
  if (value >= 0.000001) return value.toFixed(8);
  return value.toFixed(12);
}

/** Render a binary-options expiry duration (minutes) as a compact `2h` / `30m` / `2d`. */
function formatDuration(minutes: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 60) return `${trimNumber(minutes)}m`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours}h` : `${trimNumber(minutes)}m`;
  }
  const days = minutes / 1440;
  return Number.isInteger(days) ? `${days}d` : `${trimNumber(minutes / 60)}h`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const MAX_ASSESSMENT_WIDTH = 50;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

type RowStrings = Record<TradeLogColumnKey, string>;

function displayRows(report: RunReport): RowStrings[] {
  const rows = report.symbols.map((symbol) => buildTradeLogRow(symbol, report.interval ?? '1h'));
  const formatted = rows.map((row): RowStrings => ({
    currency: row.currency,
    direction: row.direction,
    tp: formatPrice(row.tp),
    sl: formatPrice(row.sl),
    expiry: formatDuration(row.expiryMinutes),
    entryPrice: formatPrice(row.entryPrice),
    assessment: truncate(row.assessment, MAX_ASSESSMENT_WIDTH),
  }));

  return formatted.length > 0
    ? formatted
    : [{ currency: '', direction: '', tp: '', sl: '', expiry: '', entryPrice: '', assessment: '' }];
}

function rowCells(
  columns: TradeLogColumn[],
  row: RowStrings,
  widths: Record<TradeLogColumnKey, number>,
): TradeLogCell[] {
  return columns.map(({ key }) => ({
    key,
    value: row[key],
    text: ` ${row[key].padEnd(widths[key])} `,
  }));
}

function borderLine(
  columns: TradeLogColumn[],
  widths: Record<TradeLogColumnKey, number>,
  chars: { left: string; join: string; right: string },
): string {
  const segments = columns.map(({ key }) => '─'.repeat(widths[key] + 2));
  return `${chars.left}${segments.join(chars.join)}${chars.right}`;
}

function cellsLine(cells: readonly TradeLogCell[]): string {
  return `│${cells.map((cell) => cell.text).join('│')}│`;
}

/** Render structured table parts so Ink can color individual cells. */
export function renderTradeLogParts(report: RunReport): TradeLogRenderPart[] {
  const columns = columnsFor(report);
  const rows = displayRows(report);
  const widths = Object.fromEntries(
    columns.map(({ key, label }) => [key, Math.max(label.length, ...rows.map((row) => row[key].length))]),
  ) as Record<TradeLogColumnKey, number>;

  const header = rowCells(
    columns,
    Object.fromEntries(columns.map(({ key, label }) => [key, label])) as RowStrings,
    widths,
  );
  const top = borderLine(columns, widths, { left: '╭', join: '┬', right: '╮' });
  const separator = borderLine(columns, widths, { left: '├', join: '┼', right: '┤' });
  const bottom = borderLine(columns, widths, { left: '╰', join: '┴', right: '╯' });

  return [
    { kind: 'title', text: 'Trade Log' },
    { kind: 'border', text: top },
    { kind: 'header', cells: header },
    { kind: 'border', text: separator },
    ...rows.map((row): TradeLogRenderPart => ({ kind: 'row', cells: rowCells(columns, row, widths) })),
    { kind: 'border', text: bottom },
  ];
}

/** Render a terminal trade log table for interactive and headless output. */
export function renderTradeLogLines(report: RunReport): string[] {
  return renderTradeLogParts(report).map((part) => ('cells' in part ? cellsLine(part.cells) : part.text));
}
