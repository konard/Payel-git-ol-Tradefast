import { writeFileSync } from 'node:fs';

import { render } from 'ink-testing-library';
import React from 'react';

import type { Lostfast } from '../src/app/lostfast.js';
import { App } from '../src/cli/App.js';

const app = {
  driver: 'pglite',
  config: {
    symbols: ['BTCUSDT'],
    interval: '1h',
    candleLimit: 120,
    accountBalance: 10_000,
    model: 'claude-opus-4-7',
    theme: 'violet',
    apiEnabled: true,
    apiHost: '127.0.0.1',
    apiPort: 0,
  },
  close: async () => {},
  strategies: () => [],
} as unknown as Lostfast;

const { lastFrame, stdin, unmount } = render(
  <App app={app} version="0.2.0" apiUrl="http://127.0.0.1:8787/graphql" />,
);

await new Promise((resolve) => setTimeout(resolve, 50));
stdin.write('/theme');
await new Promise((resolve) => setTimeout(resolve, 50));
stdin.write('\r');
await new Promise((resolve) => setTimeout(resolve, 50));

writeFileSync(new URL('./frame.ansi', import.meta.url), lastFrame() ?? '');
unmount();
