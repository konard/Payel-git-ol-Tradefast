import 'dotenv/config';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from 'ink';

import { Tradefast } from './app/tradefast.js';
import { startTradefastBackend, type TradefastBackendHandle } from './backend/server.js';
import { GraphqlTradefastRepository } from './cli/graphql/index.js';
import { App } from './cli/App.js';
import { renderBannerArt } from './cli/ascii.js';
import { COMMANDS, parseCommand } from './cli/commands.js';
import { getTheme, themeGradient, themeNames, type ThemeName } from './cli/theme.js';
import { getExchange, exchangeNames, type ExchangeName } from './cli/exchanges.js';
import { getInterval, intervalNames } from './cli/intervals.js';
import { getMode, modeNames, type ModeName } from './cli/modes.js';
import { getSearchLevel, searchLevelNames, type SearchLevelName } from './cli/search-level.js';
import { resolveSourceIds, selectablePlatformIds, type ResearchPlatformId } from './cli/sources.js';
import { loadPreferences, saveTheme, saveExchange, saveInterval, saveMode, saveSearchingLevel, saveSearchingPlatforms } from './cli/preferences.js';
import { renderBacktestLines } from './cli/backtest-log.js';
import { renderTradeLogLines } from './cli/trade-log.js';
import { loadConfig } from './config.js';

/** Read this package's version, walking up from the module location. */
function readVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === 'Tradefast') return pkg.version ?? '0.0.0';
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir);
  }
  return '0.0.0';
}

/** Non-interactive execution for scripts, CI and Docker (`Tradefast <command>`). */
async function runHeadless(command: string): Promise<number> {
  const { name, args } = parseCommand(command);
  if (name === 'unknown') {
    process.stderr.write(`Unknown command "${command}". Try: ${COMMANDS.map((c) => c.name).join(', ')}\n`);
    return 1;
  }
  if (name === 'help') {
    const gradient = themeGradient(getTheme(process.env.TRADEFAST_THEME));
    process.stdout.write(`${gradient(renderBannerArt())}\n\n`);
    for (const c of COMMANDS) process.stdout.write(`  ${c.name.padEnd(12)} ${c.summary}\n`);
    return 0;
  }
  if (name === 'theme') {
    const theme = getTheme(args[0]);
    if (args[0] && theme.name !== args[0].toLowerCase()) {
      process.stderr.write(`Unknown theme "${args[0]}". Available: ${themeNames().join(', ')}\n`);
      return 1;
    }
    if (args[0]) {
      await saveTheme(theme.name as ThemeName);
    }
    process.stdout.write(args[0] ? `Theme: ${theme.label}\n` : `Themes: ${themeNames().join(', ')}\n`);
    return 0;
  }
  if (name === 'exchange') {
    const ex = getExchange(args[0]);
    if (args[0] && ex.name !== args[0].toLowerCase()) {
      process.stderr.write(`Unknown exchange "${args[0]}". Available: ${exchangeNames().join(', ')}\n`);
      return 1;
    }
    if (args[0]) {
      await saveExchange(ex.name as ExchangeName);
    }
    process.stdout.write(args[0] ? `Exchange: ${ex.label}\n` : `Exchanges: ${exchangeNames().join(', ')}\n`);
    return 0;
  }
  if (name === 'operating-mode') {
    const md = getMode(args[0]);
    if (args[0] && md.name !== args[0].toLowerCase()) {
      process.stderr.write(`Unknown operating mode "${args[0]}". Available: ${modeNames().join(', ')}\n`);
      return 1;
    }
    if (args[0]) {
      await saveMode(md.name as ModeName);
      // A mode is a trading horizon, so applying it also shifts the timeframe.
      await saveInterval(md.interval);
    }
    process.stdout.write(
      args[0]
        ? `Operating mode: ${md.label} — ${md.description} (timeframe ${getInterval(md.interval).label})\n`
        : `Operating modes: ${modeNames().join(', ')}\n`,
    );
    return 0;
  }
  if (name === 'operating-mode-time') {
    const iv = getInterval(args[0]);
    if (args[0] && iv.name !== args[0].toLowerCase()) {
      process.stderr.write(`Unknown timeframe "${args[0]}". Available: ${intervalNames().join(', ')}\n`);
      return 1;
    }
    if (args[0]) {
      await saveInterval(iv.name as import('./cli/intervals.js').IntervalName);
    }
    process.stdout.write(args[0] ? `Trading timeframe: ${iv.label}\n` : `Timeframes: ${intervalNames().join(', ')}\n`);
    return 0;
  }
  if (name === 'serching-level') {
    const sl = getSearchLevel(args[0]);
    if (args[0] && sl.name !== args[0].toLowerCase()) {
      process.stderr.write(`Unknown search level "${args[0]}". Available: ${searchLevelNames().join(', ')}\n`);
      return 1;
    }
    if (args[0]) {
      await saveSearchingLevel(sl.name as SearchLevelName);
    }
    process.stdout.write(args[0] ? `Research depth: ${sl.label} — ${sl.description}\n` : `Levels: ${searchLevelNames().join(', ')}\n`);
    return 0;
  }
  if (name === 'serching-platforms') {
    if (args.length > 0) {
      const groups = args[0].split(',').map((s) => s.trim()).filter(Boolean);
      const selectable = selectablePlatformIds() as string[];
      const valid = groups.filter((g) => selectable.includes(g)) as ResearchPlatformId[];
      if (valid.length === 0) {
        process.stderr.write(`No valid platforms. Available: ${selectablePlatformIds().join(', ')}\n`);
        return 1;
      }
      await saveSearchingPlatforms(valid);
      const count = resolveSourceIds(valid).length;
      process.stdout.write(`Research platforms: ${valid.join(', ')} (${count} sources)\n`);
    } else {
      process.stdout.write(`Platforms: ${selectablePlatformIds().join(', ')}\n`);
    }
    return 0;
  }
  if (name === 'exit') return 0;

  // These commands map cleanly onto the GraphQL API, so the CLI routes them
  // through the backend (cli → graphql → backend) instead of touching the
  // application facade directly — the architecture the issue asks for.
  const viaGraphql = name === 'strategies' || name === 'status' || name === 'clear';
  const config = loadConfig(name === 'api' || viaGraphql ? { apiEnabled: true } : {});
  const app = await Tradefast.create(config);
  let backend: TradefastBackendHandle | null = null;
  try {
    if (name === 'api') {
      backend = await startTradefastBackend(app, { host: config.apiHost, port: config.apiPort });
      process.stdout.write(`GraphQL API: ${backend.url}\n`);
      await waitForShutdown();
    } else if (viaGraphql) {
      backend = await startTradefastBackend(app, { host: config.apiHost, port: config.apiPort });
      const repository = new GraphqlTradefastRepository(backend.url);
      if (name === 'strategies') {
        for (const s of await repository.strategies()) process.stdout.write(`  ${s.id.padEnd(20)} ${s.title}\n`);
      } else if (name === 'status') {
        const status = await repository.status();
        process.stdout.write(`db: ${status.driver}\n`);
        process.stdout.write(`${status.counts.map(({ name: k, count: v }) => `${k}=${v}`).join('  ')}\n`);
      } else {
        const pruned = await repository.clear();
        process.stdout.write(`Pruned ${pruned} outdated run(s). Search table preserved.\n`);
      }
    } else if (name === 'backtest') {
      const report = await app.backtest(reportProgress);
      process.stdout.write(`${renderBacktestLines(report).join('\n')}\n`);
    } else if (name === 'news') {
      const report = await app.news(reportProgress);
      const failed = report.sources.filter((source) => source.failed);
      process.stdout.write(
        `News crawl: ${report.items.length} item(s), +${report.inserted} ~${report.updated} =${report.unchanged}, ${failed.length} failed source(s).\n`,
      );
      for (const source of report.sources) {
        process.stdout.write(
          `  ${source.sourceId.padEnd(32)} ${
            source.failed ? `failed: ${source.error}` : `${source.accepted}/${source.fetched}`
          }\n`,
        );
      }
    } else {
      const runReport = await (name === 'start' ? app.start(reportProgress) : app.update(reportProgress));
      process.stdout.write(`${renderTradeLogLines(runReport).join('\n')}\n`);
      if (runReport.validation && runReport.validation.corrections.length > 0) {
        process.stdout.write(`\nAI: ${runReport.validation.summary}\n`);
        for (const c of runReport.validation.corrections) {
          process.stdout.write(`  ${c.symbol}: ${c.reason}\n`);
        }
      }
    }
    return 0;
  } finally {
    if (backend) await backend.close();
    await app.close();
  }
}

/** Stream headless run progress to stderr so stdout stays parseable. */
function reportProgress(event: { message: string; step: number; totalSteps: number }): void {
  process.stderr.write(`[${event.step}/${event.totalSteps}] ${event.message}\n`);
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      process.off('SIGINT', done);
      process.off('SIGTERM', done);
      resolve();
    };
    process.once('SIGINT', done);
    process.once('SIGTERM', done);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const version = readVersion();

  if (args.length > 0) {
    // Forward the whole invocation so argument-bearing commands (e.g.
    // `Tradefast operating-mode scalping`) reach their handlers intact.
    process.exitCode = await runHeadless(args.join(' '));
    return;
  }

  const saved = await loadPreferences();
  const baseConfig = loadConfig();
  const effectiveTheme = saved.theme ?? baseConfig.theme;
  const effectiveExchange = saved.exchange ?? baseConfig.exchange;
  const effectiveMode = saved.mode ?? baseConfig.mode;
  // Saving a mode also persists its timeframe, so a saved interval already
  // reflects the chosen mode (or a later fine-tune); honour it when present and
  // otherwise fall back to the mode's recommended timeframe.
  const effectiveInterval = saved.interval ?? (saved.mode ? getMode(effectiveMode).interval : baseConfig.interval);
  const effectiveSearchingLevel = saved.searchingLevel ?? baseConfig.searchingLevel;
  const effectiveSearchingPlatforms = saved.searchingPlatforms ?? baseConfig.searchingPlatforms;
  const config = loadConfig({
    theme: effectiveTheme,
    exchange: effectiveExchange,
    interval: effectiveInterval,
    mode: effectiveMode,
    searchingLevel: effectiveSearchingLevel,
    searchingPlatforms: effectiveSearchingPlatforms,
  });
  const app = await Tradefast.create(config);
  const backend = config.apiEnabled
    ? await startTradefastBackend(app, { host: config.apiHost, port: config.apiPort })
    : null;
  try {
    const { waitUntilExit } = render(
      <App app={app} version={version} apiUrl={backend?.url} promptOperatingMode={saved.mode === undefined} />,
    );
    await waitUntilExit();
  } finally {
    if (backend) await backend.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
