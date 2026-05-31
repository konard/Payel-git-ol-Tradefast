import { describe, expect, it } from 'vitest';

import { DEFAULT_NEWS_SOURCES } from '../src/services/news-crawler.js';
import {
  DEFAULT_ENABLED_GROUPS,
  DEFAULT_ENABLED_PLATFORMS,
  getPlatformDescription,
  getPlatformLabel,
  getSourceGroup,
  isWebSearchEnabled,
  resolveSourceIds,
  selectablePlatformIds,
  sourceGroupIds,
  WEB_SEARCH_PLATFORM_ID,
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

describe('selectable research platforms', () => {
  it('offers every news group followed by Web Search', () => {
    expect(selectablePlatformIds()).toEqual([...sourceGroupIds(), WEB_SEARCH_PLATFORM_ID]);
  });

  it('keeps Web Search out of the strict news-group contract', () => {
    // Web Search must not be a SourceGroup, so sourceGroupIds() stays unchanged.
    expect(sourceGroupIds()).not.toContain(WEB_SEARCH_PLATFORM_ID);
    expect(getSourceGroup(WEB_SEARCH_PLATFORM_ID)).toBeUndefined();
  });

  it('labels and describes Web Search and the news groups', () => {
    expect(getPlatformLabel(WEB_SEARCH_PLATFORM_ID)).toBe('Web Search');
    expect(getPlatformDescription(WEB_SEARCH_PLATFORM_ID)).toMatch(/entire Internet/i);
    expect(getPlatformLabel('news-portals')).toBe(getSourceGroup('news-portals')!.label);
  });

  it('contributes no curated sources for the Web Search platform', () => {
    expect(resolveSourceIds([WEB_SEARCH_PLATFORM_ID])).toEqual([]);
  });

  it('enables Web Search by default and detects it', () => {
    expect(DEFAULT_ENABLED_PLATFORMS).toContain(WEB_SEARCH_PLATFORM_ID);
    expect(isWebSearchEnabled(DEFAULT_ENABLED_PLATFORMS)).toBe(true);
    expect(isWebSearchEnabled(sourceGroupIds())).toBe(false);
  });
});
