export const EXPERIMENTS_STORAGE_KEY = 'ticker-arena.experiments';
export const DEFAULT_UI_ID = 'default';

export type ExperimentSelection = {
  ui: string;
  tabs: string[];
};

export type ParsedExperimentSearch = {
  hasUi: boolean;
  ui: string;
  hasTabs: boolean;
  tabs: string[];
};

export function parseExperimentSearch(search: string): ParsedExperimentSearch {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawTabs = params.get('tabs') ?? '';
  return {
    hasUi: params.has('ui'),
    ui: (params.get('ui') ?? '').trim(),
    hasTabs: params.has('tabs'),
    tabs: rawTabs.split(',').map(id => id.trim()).filter(Boolean),
  };
}

export function normalizeSelection(selection: ExperimentSelection, uiIds: readonly string[], tabIds: readonly string[]): ExperimentSelection {
  const fallback = uiIds.includes(DEFAULT_UI_ID) ? DEFAULT_UI_ID : uiIds[0] ?? DEFAULT_UI_ID;
  const ui = uiIds.includes(selection.ui) ? selection.ui : fallback;
  const wanted = new Set(selection.tabs);
  return { ui, tabs: tabIds.filter(id => wanted.has(id)) };
}

export function resolveExperiments(search: string, stored: ExperimentSelection | null, uiIds: readonly string[], tabIds: readonly string[]): ExperimentSelection {
  const parsed = parseExperimentSearch(search);
  const ui = parsed.hasUi ? parsed.ui : stored?.ui ?? DEFAULT_UI_ID;
  const tabs = parsed.hasTabs ? parsed.tabs : stored?.tabs ?? [];
  return normalizeSelection({ ui, tabs }, uiIds, tabIds);
}

export function selectionToSearch(selection: ExperimentSelection, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  params.set('ui', selection.ui);
  params.set('tabs', selection.tabs.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function queriesEqual(left: string, right: string): boolean {
  const a = new URLSearchParams(left.startsWith('?') ? left.slice(1) : left);
  const b = new URLSearchParams(right.startsWith('?') ? right.slice(1) : right);
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if (a.getAll(key).join('\0') !== b.getAll(key).join('\0')) return false;
  }
  return true;
}

export function parseStoredSelection(raw: string | null): ExperimentSelection | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { ui?: unknown; tabs?: unknown };
    if (!data || typeof data !== 'object') return null;
    const ui = typeof data.ui === 'string' ? data.ui : DEFAULT_UI_ID;
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter((id): id is string => typeof id === 'string') : [];
    return { ui, tabs };
  } catch {
    return null;
  }
}

export function readStoredSelection(): ExperimentSelection | null {
  try {
    return parseStoredSelection(window.localStorage.getItem(EXPERIMENTS_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredSelection(selection: ExperimentSelection): void {
  try {
    window.localStorage.setItem(EXPERIMENTS_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Private mode and blocked storage should not break the sandbox UI.
  }
}
