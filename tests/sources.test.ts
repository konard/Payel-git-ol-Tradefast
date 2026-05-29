import { describe, expect, it } from 'vitest';

import { DEFAULT_NEWS_SOURCES } from '../src/services/news-crawler.js';
import {
  DEFAULT_ENABLED_GROUPS,
  getSourceGroup,
  resolveSourceIds,
  sourceGroupIds,
} from '../src/cli/sources.js';

describe('research platform groups', () => {
  const sourceIds = new Set(DEFAULT_NEWS_SOURCES.map((source) => source.id));

  it('exposes the crypto-focused groups in /serching-platforms', () => {
    expect(sourceGroupIds()).toEqual([
      'economic-calendars',
      'news-portals',
      'crypto-news',
      'reddit-communities',
      'crypto-communities',
      'exchange-communities',
    ]);
  });

  it('references only configured sources from every group', () => {
    for (const id of sourceGroupIds()) {
      const group = getSourceGroup(id)!;
      expect(group.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of group.sourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }
    }
  });

  it('assigns every configured source to exactly one group', () => {
    const grouped = sourceGroupIds().flatMap((id) => getSourceGroup(id)!.sourceIds);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(new Set(grouped)).toEqual(sourceIds);
  });

  it('enables all groups by default and resolves every source', () => {
    expect(new Set(DEFAULT_ENABLED_GROUPS)).toEqual(new Set(sourceGroupIds()));
    expect(new Set(resolveSourceIds(DEFAULT_ENABLED_GROUPS))).toEqual(sourceIds);
  });
});
