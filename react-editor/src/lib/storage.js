const EDITOR_STATE_KEY = 'react-text-editor.state.v1';
const EDITOR_SETTINGS_KEY = 'react-text-editor.settings.v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(EDITOR_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / privacy mode issues
  }
}

export function clearState() {
  try {
    localStorage.removeItem(EDITOR_STATE_KEY);
  } catch {
    // ignore
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(EDITOR_SETTINGS_KEY);
  } catch {
    // ignore
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
