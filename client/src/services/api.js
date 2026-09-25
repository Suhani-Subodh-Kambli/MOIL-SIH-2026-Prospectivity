const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function req(path, opt = {}) {
  const token = localStorage.getItem('oretwin_token');
  const headers = {
    ...(opt.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const r = await fetch(API + path, { ...opt, headers });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (r.status === 401) {
    localStorage.removeItem('oretwin_token');
    window.dispatchEvent(new Event('oretwin-auth-expired'));
  }
  if (!r.ok) throw Error(data.message || data.error || `HTTP ${r.status}`);
  return data;
}

export const api = {
  login: b => req('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  register: b => req('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  me: () => req('/auth/me'),
  health: () => req('/health'),
  targets: () => req('/exploration/targets'),
  grid: () => req('/exploration/grid'),
  boundary: () => req('/exploration/boundary'),
  occurrences: () => req('/exploration/occurrences'),
  zones: () => req('/exploration/zones'),
  summary: () => req('/exploration/summary'),
  analyze: selection => req('/exploration/analyze', { method: 'POST', body: JSON.stringify(selection) }),
  predict: b => req('/production/predict', { method: 'POST', body: JSON.stringify(b) }),
  productionHistory: (mine) => req('/production/history' + (mine ? `?mine=${encodeURIComponent(mine)}` : '')),
  productionMines: () => req('/production/mines'),
  productionScenarios: () => req('/production/scenarios'),
  productionMetrics: () => req('/production/metrics'),
};

export function decode(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return {}; }
}
