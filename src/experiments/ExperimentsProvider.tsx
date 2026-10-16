import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EXPERIMENTAL_TABS, UI_VARIANTS } from './registry';
import type { ExperimentalTab, UiVariant } from './registry';
import { queriesEqual, readStoredSelection, resolveExperiments, selectionToSearch, writeStoredSelection } from './flags';
import type { ExperimentSelection } from './flags';
import './experiments.css';

const uiIds = UI_VARIANTS.map(variant => variant.id);
const tabIds = EXPERIMENTAL_TABS.map(tab => tab.id);

type ExperimentsValue = {
  selection: ExperimentSelection;
  variant: UiVariant;
  enabledTabs: ExperimentalTab[];
  setUi: (ui: string) => void;
  setTabEnabled: (id: string, enabled: boolean) => void;
};

const ExperimentsContext = createContext<ExperimentsValue | null>(null);

function selectionKey(selection: ExperimentSelection) {
  return `${selection.ui}|${selection.tabs.join(',')}`;
}

export function ExperimentsProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ExperimentSelection>(() => resolveExperiments(window.location.search, readStoredSelection(), uiIds, tabIds));

  useEffect(() => {
    writeStoredSelection(selection);
    const next = selectionToSearch(selection, window.location.search);
    if (!queriesEqual(window.location.search, next)) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [selection]);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = resolveExperiments(window.location.search, readStoredSelection(), uiIds, tabIds);
      setSelection(current => selectionKey(current) === selectionKey(next) ? current : next);
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const setUi = useCallback((ui: string) => {
    setSelection(current => resolveExperiments(`?ui=${encodeURIComponent(ui)}&tabs=${current.tabs.join(',')}`, null, uiIds, tabIds));
  }, []);

  const setTabEnabled = useCallback((id: string, enabled: boolean) => {
    setSelection(current => {
      const tabs = enabled ? [...current.tabs, id] : current.tabs.filter(tab => tab !== id);
      return resolveExperiments(`?ui=${encodeURIComponent(current.ui)}&tabs=${tabs.join(',')}`, null, uiIds, tabIds);
    });
  }, []);

  const variant = UI_VARIANTS.find(item => item.id === selection.ui) ?? UI_VARIANTS[0];
  const enabledTabs = useMemo(() => EXPERIMENTAL_TABS.filter(tab => selection.tabs.includes(tab.id)), [selection.tabs]);

  const value = useMemo<ExperimentsValue>(() => ({ selection, variant, enabledTabs, setUi, setTabEnabled }), [selection, variant, enabledTabs, setUi, setTabEnabled]);

  return (
    <ExperimentsContext.Provider value={value}>
      <div className={`experiment-root ${variant.className ?? ''}`} data-ui={variant.id}>
        {variant.css ? <style>{variant.css}</style> : null}
        {children}
        <ExperimentsPanel />
      </div>
    </ExperimentsContext.Provider>
  );
}

export function useExperiments() {
  const value = useContext(ExperimentsContext);
  if (!value) throw new Error('useExperiments must be used inside ExperimentsProvider');
  return value;
}

function ExperimentsPanel() {
  const { selection, setUi, setTabEnabled } = useExperiments();
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: MouseEvent) => { if (!dockRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const query = `?ui=${selection.ui}&tabs=${selection.tabs.join(',')}`;

  return (
    <div className="experiments-dock" ref={dockRef}>
      {open && (
        <div className="experiments-panel" role="dialog" aria-label="Experiment settings">
          <div className="experiments-panel-head">
            <b>Experiments</b>
            <button type="button" className="experiments-close" aria-label="Close experiments" onClick={() => setOpen(false)}>×</button>
          </div>
          <p>Switch a UI variant or turn experimental tabs on. This browser remembers the choice, and the address bar stays in sync.</p>
          <fieldset>
            <legend>UI VARIANT</legend>
            {UI_VARIANTS.map(variant => (
              <label className="experiments-choice" key={variant.id}>
                <input type="radio" name="ui-variant" value={variant.id} checked={selection.ui === variant.id} onChange={() => setUi(variant.id)} />
                <span><b>{variant.label}</b><small>{variant.description}</small></span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>EXPERIMENTAL TABS</legend>
            {EXPERIMENTAL_TABS.map(tab => (
              <label className="experiments-choice" key={tab.id}>
                <input type="checkbox" checked={selection.tabs.includes(tab.id)} onChange={event => setTabEnabled(tab.id, event.target.checked)} />
                <span><b>{tab.label}</b><small>{tab.description}</small></span>
              </label>
            ))}
          </fieldset>
          <code className="experiments-query">{query}</code>
        </div>
      )}
      <button type="button" className="experiments-launcher" aria-expanded={open} onClick={() => setOpen(value => !value)}>Experiments</button>
    </div>
  );
}
