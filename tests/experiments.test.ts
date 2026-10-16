import { describe, expect, it } from 'vitest';
import { EXPERIMENTAL_TABS, UI_VARIANTS } from '../src/experiments/registry.js';
import { DEFAULT_UI_ID, normalizeSelection, parseExperimentSearch, parseStoredSelection, queriesEqual, resolveExperiments, selectionToSearch } from '../src/experiments/flags.js';

const uiIds = UI_VARIANTS.map(variant => variant.id);
const tabIds = EXPERIMENTAL_TABS.map(tab => tab.id);

describe('experiment registry', () => {
  it('ships a default variant, one alternate, and one experimental tab', () => {
    expect(uiIds).toContain(DEFAULT_UI_ID);
    expect(uiIds).toContain('compact');
    expect(tabIds).toContain('pulse');
    expect(new Set(uiIds).size).toBe(uiIds.length);
    expect(new Set(tabIds).size).toBe(tabIds.length);
  });
});

describe('experiment flags', () => {
  it('parses ui and comma-separated tabs, including blanks', () => {
    expect(parseExperimentSearch('?ui=compact&tabs=pulse, heat')).toMatchObject({ hasUi: true, ui: 'compact', hasTabs: true, tabs: ['pulse', 'heat'] });
    expect(parseExperimentSearch('?tabs=')).toMatchObject({ hasUi: false, hasTabs: true, tabs: [] });
    expect(parseExperimentSearch('')).toMatchObject({ hasUi: false, hasTabs: false, tabs: [] });
  });

  it('lets the URL override stored choices and drops unknown ids', () => {
    const stored = { ui: 'compact', tabs: ['pulse'] };
    expect(resolveExperiments('?ui=default&tabs=', stored, uiIds, tabIds)).toEqual({ ui: 'default', tabs: [] });
    expect(resolveExperiments('?ui=nope&tabs=pulse,missing', stored, uiIds, tabIds)).toEqual({ ui: 'default', tabs: ['pulse'] });
    expect(resolveExperiments('', stored, uiIds, tabIds)).toEqual({ ui: 'compact', tabs: ['pulse'] });
    expect(resolveExperiments('', null, uiIds, tabIds)).toEqual({ ui: 'default', tabs: [] });
  });

  it('keeps tab order stable and preserves unrelated query params', () => {
    expect(normalizeSelection({ ui: 'compact', tabs: ['pulse', 'pulse', 'missing'] }, uiIds, tabIds)).toEqual({ ui: 'compact', tabs: ['pulse'] });
    expect(selectionToSearch({ ui: 'compact', tabs: ['pulse'] }, '?season=3')).toBe('?season=3&ui=compact&tabs=pulse');
    expect(queriesEqual('?ui=compact&tabs=pulse', '?tabs=pulse&ui=compact')).toBe(true);
    expect(queriesEqual('?ui=default&tabs=', '?ui=compact&tabs=')).toBe(false);
  });

  it('reads a stored selection and ignores corrupt JSON', () => {
    expect(parseStoredSelection(JSON.stringify({ ui: 'compact', tabs: ['pulse', 3] }))).toEqual({ ui: 'compact', tabs: ['pulse'] });
    expect(parseStoredSelection('not-json')).toBeNull();
    expect(parseStoredSelection(null)).toBeNull();
  });
});
