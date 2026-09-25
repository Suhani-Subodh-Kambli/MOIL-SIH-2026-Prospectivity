import React, { useEffect, useMemo, useState } from 'react';
import { api, decode } from './services/api';
import Logo from './components/Logo';
import MapView from './components/MapView';

const NAV = [
  ['overview', '⌂', 'Overview'],
  ['exploration', '◈', 'Exploration'],
  ['production', '◒', 'Production'],
  ['account', '◎', 'My Account'],
];

const KNOWN_OCCURRENCES = [
  ['BALAGHAT', 21.816667, 80.166667],
  ['BHANDARBOLI', 21.383333, 79.45],
  ['DHANSUA-LAUGHAR-JAGANTOLI', 22.0, 80.233333],
  ['NETRA', 21.533333, 79.983333],
  ['PANCHALA', 21.45, 79.766667],
  ['PAWNIA', 21.716667, 79.75],
  ['TIRODI', 21.683333, 79.733333],
  ['UKWA', 21.966667, 80.466667],
  ['LAUGHAR-KAMHATOLA', 21.833333, 80.366667],
].map(([name, lat, lon]) => ({ name, lat, lon }));

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('oretwin_token'));
  const [user, setUser] = useState(token ? decode(token) : null);
  const [page, setPage] = useState('overview');
  const [targets, setTargets] = useState(null);
  const [zones, setZones] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState(() => readActivity());

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([api.targets(), api.zones()]).then(([a, b]) => {
      if (a.status === 'fulfilled') setTargets(a.value);
      if (b.status === 'fulfilled') setZones(Array.isArray(b.value) ? b.value : (b.value?.zones || []));
    });
  }, [token]);

  const saveActivity = (item) => {
    const next = [{ ...item, time: new Date().toISOString() }, ...activity].slice(0, 8);
    setActivity(next);
    localStorage.setItem('oretwin_activity', JSON.stringify(next));
  };

  const save = (t) => {
    localStorage.setItem('oretwin_token', t);
    setToken(t);
    setUser(decode(t));
    setPage('overview');
  };

  if (!token) return <Auth save={save} />;

  const logout = () => {
    localStorage.removeItem('oretwin_token');
    setToken(null);
    setUser(null);
  };

  async function predict(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries([...fd].map(([k, v]) => [k, Number(v)]));
    try {
      const prediction = await api.predict(body);
      setResult(prediction);
      saveActivity({ type: 'Production scenario', detail: `${Number(prediction.shortfall_percent).toFixed(1)}% predicted shortfall` });
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  const navigate = (next) => {
    setPage(next);
    if (next === 'exploration') saveActivity({ type: 'Exploration workspace', detail: 'Opened India prospectivity map' });
  };

  return (
    <div className="shell">
      <aside>
        <Logo />
        <div className="navtitle">COMMAND CENTER</div>
        {NAV.map((n) => (
          <button className={page === n[0] ? 'nav active' : 'nav'} onClick={() => navigate(n[0])} key={n[0]}>
            <span>{n[1]}</span>{n[2]}
          </button>
        ))}
        <div className="usercard">
          <div className="avatar">{initial(user)}</div>
          <div><b>{user?.name || 'Explorer'}</b><small>{user?.role || 'exploration'}</small></div>
        </div>
        <button className="signout" onClick={logout}>↪ Sign out</button>
      </aside>
      <main>
        <header>
          <div>
            <small>ORETWIN / {page.toUpperCase()}</small>
            <h1>{page === 'overview' ? 'Overview' : page === 'exploration' ? 'Exploration Intelligence' : page === 'production' ? 'Production Intelligence' : 'My Account'}</h1>
            <p>{page === 'overview' ? 'A unified view of exploration and operational intelligence.' : page === 'exploration' ? 'AI-assisted prospectivity screening across India.' : page === 'production' ? 'Scenario-based production shortfall decision support.' : 'Profile, access and recent workspace activity.'}</p>
          </div>
          <button className="profile" onClick={() => setPage('account')}><div className="avatar">{initial(user)}</div><span>{user?.name || 'User'}</span>⌄</button>
        </header>
        {error && <div className="error">{error}<button onClick={() => setError('')}>×</button></div>}
        <div className="content">
          {page === 'overview' && <Overview setPage={navigate} targets={targets} zones={zones} />}
          {page === 'exploration' && <Exploration targets={targets} zones={zones} saveActivity={saveActivity} />}
          {page === 'production' && <Production result={result} busy={busy} predict={predict} />}
          {page === 'account' && <Account user={user} logout={logout} activity={activity} />}
        </div>
      </main>
    </div>
  );
}

function Auth({ save }) {
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const b = Object.fromEntries(f);
    try {
      // Public self-registration is intentionally limited to exploration access.
      const r = mode === 'login' ? await api.login({ email: b.email, password: b.password }) : await api.register({ name: b.name, email: b.email, password: b.password, role: 'exploration' });
      save(r.token);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return <div className="auth">
    <section className="authhero"><Logo /><div className="hero"><span className="tag">AI × EARTH OBSERVATION × OPERATIONS</span><h2>From geological signals to <em>mine intelligence.</em></h2><p>OreTwin brings mineral prospectivity, spatial evidence and production-risk intelligence into one command center.</p><div className="bullets"><b>01</b> India-wide exploration screening <b>02</b> AI-assisted target prioritization <b>03</b> Production shortfall scenarios</div></div><small>SIH 2026 • MOIL use case • Prototype decision support</small></section>
    <section className="authbox"><form onSubmit={go}><small>ORETWIN COMMAND CENTER</small><h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>{err && <div className="error">{err}</div>}{mode === 'register' && <input name="name" placeholder="Full name" required />}<input name="email" type="email" placeholder="Email" required/><input name="password" type="password" placeholder="Password" required/><button className="gold" disabled={busy}>{busy ? 'Connecting…' : mode === 'login' ? 'Enter Command Center →' : 'Create account →'}</button></form><button className="switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New to OreTwin? Create an account' : 'Already have an account? Sign in'}</button></section>
  </div>;
}

function Overview({ setPage, targets, zones }) {
  const stats = useMemo(() => summarize(targets, zones), [targets, zones]);
  return <>
    <section className="heroBanner"><div><span className="tag">INDIA-WIDE EXPLORATION INTELLIGENCE</span><h2>Know where to look. Know what could delay production.</h2><p>OreTwin connects exploration prospectivity with operational decision support in a single mining intelligence workspace.</p><button className="gold" onClick={() => setPage('exploration')}>Open exploration workspace →</button><button className="darkbtn" onClick={() => setPage('production')}>Run production scenario</button></div><div className="orb"><i/><i/><b>OT</b></div></section>
    <div className="stats"><Stat n={stats.cells.toLocaleString()} l="SCREENING CELLS" m="Detailed India-wide samples"/><Stat n={zones.length || 3} l="PRIORITY ZONES" m="Detailed zones available" gold/><Stat n={stats.high.toLocaleString()} l="HIGH-PRIORITY CELLS" m="Top 10% screening threshold" green/><Stat n="0–100" l="PROSPECTIVITY" m="Relative exploration score"/></div>
    <div className="grid overviewGrid">
      <section className="panel"><Head e="PRIORITY ZONES" t="Where OreTwin is focusing attention"/><div className="zoneCards">{zones.slice(0, 3).map((z, i) => <ZoneCard key={i} z={z} onClick={() => setPage('exploration')} />)}</div></section>
      <section className="panel"><Head e="DECISION SIGNALS" t="What the platform is telling you"/><div className="signal"><span>01</span><div><b>Exploration screening</b><small>AI-ranked surface and geological indicators identify areas for follow-up.</small></div></div><div className="signal"><span>02</span><div><b>Target prioritization</b><small>Scores rank locations for field investigation; they do not prove reserves.</small></div></div><div className="signal"><span>03</span><div><b>Production risk</b><small>Scenario modelling estimates potential shortfall under operational conditions.</small></div></div></section>
    </div>
    <div className="grid overviewBottom"><section className="panel"><Head e="SPATIAL INTELLIGENCE" t="India prospectivity overview"/><MapView targets={targets} zones={zones} occurrences={KNOWN_OCCURRENCES} compact/></section><section className="panel"><Head e="PLATFORM STATUS" t="System readiness"/><Status name="Exploration model" ok="READY"/><Status name="India-wide screening" ok="READY"/><Status name="Production predictor" ok="READY"/><Status name="MongoDB workspace" ok="CONNECTED"/><div className="note">Prospectivity is a relative exploration-priority score, not mineral concentration or a proven reserve.</div></section></div>
  </>;
}

function Exploration({ targets, zones, saveActivity }) {
  const [mode, setMode] = useState('point');
  const [analysis, setAnalysis] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);

  const onAnalysis = (a) => {
    setAnalysis(a); setSelectedZone(null);
    saveActivity({ type: 'Exploration analysis', detail: a.kind === 'point' ? `Point ${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}` : `${a.kind} analysis: ${a.count} cells` });
  };

  const clear = () => { setAnalysis(null); setSelectedZone(null); };

  return <>
    <div className="intro"><div><small>EXPLORATION INTELLIGENCE</small><h2>Prospectivity command map</h2><p>Inspect AI-ranked targets, known manganese occurrences and priority zones.</p></div><span className="online">● MODEL PIPELINE ONLINE</span></div>
    <section className="exploreToolbar panel">
      <div className="toolbarIntro"><div><small>ANALYSIS MODE</small><b>Select a point or draw an area on the map</b></div><button className="clearBtn" onClick={clear}>Clear selection</button></div>
      <div className="modeButtons">{[['point','⌖ Select point'],['rectangle','□ Draw rectangle'],['polygon','◇ Draw polygon']].map(([v,t]) => <button key={v} className={mode === v ? 'mode active' : 'mode'} onClick={() => { setMode(v); setAnalysis(null); }}>{t}</button>)}</div>
      <div className="toolbarHint">{mode === 'point' ? 'Click anywhere on the map to inspect the nearest modelled target.' : mode === 'rectangle' ? 'Click one corner, then click the opposite corner to analyse the selected area.' : 'Click vertices around an area. Double-click the final vertex to finish the polygon.'}</div>
    </section>
    <div className="exploreLayout">
      <section className="panel mapPanel"><Head e="LIVE SPATIAL VIEW" t="India target geography"/><MapView targets={targets} zones={zones} occurrences={KNOWN_OCCURRENCES} mode={mode} onAnalysis={onAnalysis} onZoneSelect={setSelectedZone} /></section>
      <section className="panel analysisPanel"><AnalysisPanel analysis={analysis} zone={selectedZone} onOpen={() => { setAnalysis({ kind: 'zone', ...selectedZone }); }} />
        <div className="zoneList"><div className="miniLabel">PRIORITY ZONES</div>{zones.slice(0, 3).map((z, i) => <ZoneRow key={i} z={z} onClick={() => { setSelectedZone(zoneFrom(z)); setAnalysis(null); }} />)}</div>
      </section>
    </div>
    <div className="scienceNote"><b>Scientific interpretation</b><span>OreTwin provides AI-assisted exploration prioritization from geospatial indicators. A high score identifies an area for investigation; it is not manganese concentration, a reserve estimate or a substitute for geological field validation and drilling.</span></div>
  </>;
}

function AnalysisPanel({ analysis, zone }) {
  if (zone) return <div className="analysisBox"><div className="miniLabel">PRIORITY ZONE</div><h3>{zone.name}</h3><div className="scoreHero"><b>{zone.score.toFixed(1)}</b><span>mean prospectivity</span></div><div className="analysisMetrics"><Metric l="Maximum" v={zone.max != null ? `${zone.max.toFixed(1)}` : '—'}/><Metric l="High cells" v={zone.high != null ? zone.high.toLocaleString() : '—'}/><Metric l="High fraction" v={zone.fraction != null ? `${(zone.fraction * 100).toFixed(1)}%` : '—'}/></div><div className="evidence"><b>Interpretation</b><p>This zone is part of the detailed India-wide screening layer. Use it to prioritize further geological investigation.</p></div></div>;
  if (!analysis) return <div className="empty analysisEmpty"><div className="crosshair">⌖</div><h3>Select an exploration area</h3><p>Use point, rectangle or polygon mode to inspect prospectivity statistics.</p></div>;
  if (analysis.kind === 'point') return <div className="analysisBox"><div className="miniLabel">POINT ANALYSIS</div><h3>Selected location</h3><div className="coords"><span>LATITUDE <b>{analysis.lat.toFixed(6)}</b></span><span>LONGITUDE <b>{analysis.lon.toFixed(6)}</b></span></div>{analysis.score != null ? <><div className="scoreHero"><b>{analysis.score.toFixed(1)}</b><span>prospectivity / 100</span></div><PriorityBadge score={analysis.score}/><div className="evidence"><b>Model evidence</b><p>Nearest available modelled cell: {analysis.distanceKm != null ? `${analysis.distanceKm.toFixed(2)} km away.` : 'within the loaded screening layer.'}</p><p>Use this result to prioritize field investigation, not to establish a reserve.</p></div></> : <div className="empty smallEmpty"><h3>No modelled cell nearby</h3><p>The selected location is outside the loaded detailed prediction layer.</p></div>}</div>;
  return <div className="analysisBox"><div className="miniLabel">AREA ANALYSIS</div><h3>{analysis.kind === 'rectangle' ? 'Selected rectangle' : 'Selected polygon'}</h3><div className="analysisMetrics"><Metric l="Cells" v={analysis.count.toLocaleString()}/><Metric l="Mean score" v={analysis.mean.toFixed(1)}/><Metric l="Maximum" v={analysis.max.toFixed(1)}/><Metric l="High cells" v={analysis.high.toLocaleString()}/></div><div className="scoreBar"><span style={{ width: `${Math.min(100, analysis.mean)}%` }}/></div><div className="areaHeadline"><b>{analysis.highFraction.toFixed(1)}%</b><span>of selected modelled cells are high-priority</span></div><div className="evidence"><b>Decision support</b><p>Prioritize field checks around the highest-scoring cells inside this area. Geological confirmation remains necessary.</p></div></div>;
}

function Production({ result, busy, predict }) { return <><div className="intro"><div><small>OPERATIONS INTELLIGENCE</small><h2>Production shortfall simulator</h2><p>Model operational conditions and estimate potential production impact.</p></div></div><div className="grid prod"><section className="panel"><Head e="SCENARIO INPUT" t="Operational conditions"/><form className="form" onSubmit={predict}><Field n="target_mt" l="Target production (MT)" v="1000"/><Field n="equipment_downtime_hours" l="Equipment downtime (hours)" v="20"/><Field n="rainfall_mm" l="Rainfall (mm)" v="50"/><Field n="blasting_delay_hours" l="Blasting delay (hours)" v="10"/><Field n="maintenance_hours" l="Maintenance (hours)" v="15"/><Field n="equipment_availability" l="Equipment availability (0–1)" v="0.85" step="0.01"/><button className="gold full" disabled={busy}>{busy ? 'Running scenario…' : 'Run AI scenario →'}</button></form><div className="note">Current training source: demo/synthetic data. Verified mine-level history is required for deployment.</div></section><section className="panel result">{!result ? <div className="empty"><b>OT</b><h3>Awaiting scenario</h3><p>Enter operating conditions and run the model.</p></div> : <><span className={'risk '+result.risk.toLowerCase()}>{result.risk} RISK</span><div className="big">{Number(result.shortfall_percent).toFixed(1)}<i>%</i></div><small>predicted production shortfall</small><div className="metrics"><Metric l="Target" v={`${Number(result.target_mt).toLocaleString()} MT`}/><Metric l="Forecast" v={`${Number(result.forecast_mt).toLocaleString()} MT`}/><Metric l="Shortfall" v={`${Number(result.predicted_shortfall_mt).toLocaleString()} MT`}/></div><h4>TOP DRIVERS</h4>{result.top_drivers?.map((d, i) => <div className="driver" key={i}><span>{i + 1}</span><b>{d.factor.replaceAll('_', ' ')}</b><em>{d.impact_index}</em></div>)}<h4>RECOMMENDED ACTIONS</h4>{result.recommended_actions?.map((x, i) => <p className="action" key={i}>✓ {x}</p>)}<div className="modelBadge">MODEL: {result.model || 'RandomForestRegressor'} · SOURCE: {result.training_source || 'demo'}</div></>}</section></div></> }

function Account({ user, logout, activity }) { return <><div className="intro"><div><small>MY ACCOUNT</small><h2>Profile & workspace</h2><p>Your OreTwin identity, access and recent activity.</p></div></div><div className="accountGrid"><section className="panel profilePanel"><div className="profileBig">{initial(user)}</div><h2>{user?.name || 'OreTwin User'}</h2><p>{user?.email || '—'}</p><span className="role">{user?.role || 'exploration'}</span><div className="accountStatus"><span>●</span> Account active</div><div className="profileMeta"><div><small>ACCESS LEVEL</small><b>{user?.role === 'admin' ? 'Administrator' : user?.role === 'production' ? 'Production intelligence' : 'Exploration intelligence'}</b></div><div><small>SESSION</small><b>Authenticated workspace</b></div></div><button className="darkbtn" onClick={logout}>Sign out</button></section><section className="panel"><Head e="WORKSPACE ACCESS" t="Your intelligence modules"/><Access n="Exploration intelligence" d="India-wide prospectivity and target zones"/><Access n="Production intelligence" d="Operational shortfall scenario modelling"/><Access n="Decision support" d="AI-assisted evidence and recommendations"/></section><section className="panel activityPanel"><Head e="RECENT ACTIVITY" t="Your latest workspace actions"/>{activity.length ? activity.map((a, i) => <div className="activity" key={i}><span>{i + 1}</span><div><b>{a.type}</b><small>{a.detail}</small></div><time>{formatTime(a.time)}</time></div>) : <div className="empty smallEmpty"><h3>No activity yet</h3><p>Exploration analyses and production scenarios will appear here.</p></div>}</section><section className="panel accountNote"><Head e="DATA & PRIVACY" t="Prototype workspace"/><p>Your account identity is authenticated through the OreTwin API. Recent activity shown here is stored locally in this browser for the prototype. Production deployment should persist activity and user permissions server-side.</p></section></div></> }

const Field = ({ n, l, v, step }) => <label><span>{l}</span><input name={n} type="number" defaultValue={v} step={step || 'any'} required /></label>;
const Stat = ({ n, l, m, gold, green }) => <div className={'stat ' + (gold ? 'gold ' : '') + (green ? 'green' : '')}><small>{l}</small><b>{n}</b><span>{m}</span></div>;
const Metric = ({ l, v }) => <div><small>{l}</small><b>{v}</b></div>;
const Head = ({ e, t }) => <div className="head"><div><small>{e}</small><h3>{t}</h3></div></div>;
const Status = ({ name, ok }) => <div className="status"><span>{name}</span><b>● {ok}</b></div>;
const Access = ({ n, d }) => <div className="access"><b>◈</b><div><strong>{n}</strong><small>{d}</small></div><em>ACTIVE</em></div>;
const PriorityBadge = ({ score }) => <span className={'priorityBadge ' + (score >= 90 ? 'high' : score >= 60 ? 'medium' : 'low')}>{score >= 90 ? 'HIGH PRIORITY' : score >= 60 ? 'MEDIUM PRIORITY' : 'LOW PRIORITY'}</span>;

function ZoneCard({ z, onClick }) { const x = zoneFrom(z); return <button className="zoneCard" onClick={onClick}><div className="zoneTop"><span>{x.name}</span><PriorityBadge score={x.score}/></div><b>{x.score.toFixed(1)}</b><small>mean prospectivity</small><div className="zoneStats"><span>{x.high?.toLocaleString() || '—'} high cells</span><span>{x.fraction != null ? `${(x.fraction * 100).toFixed(1)}%` : '—'} high area</span></div><span className="zoneOpen">Open analysis →</span></button>; }
function ZoneRow({ z, onClick }) { const x = zoneFrom(z); return <button className="zoneRow" onClick={onClick}><span className="zoneDot"/><div><b>{x.name}</b><small>{x.high?.toLocaleString() || '—'} high cells · mean {x.score.toFixed(1)}</small></div><strong>{x.score.toFixed(1)}</strong></button>; }

function zoneFrom(z) { return { name: z?.zone_id || z?.name || 'Priority Zone', score: Number(z?.mean_score ?? z?.score ?? 0), max: Number(z?.max_score ?? z?.max ?? NaN), high: Number(z?.high_cells ?? z?.high ?? NaN), fraction: Number(z?.high_fraction ?? z?.fraction ?? NaN), lat: Number(z?.center_lat ?? z?.latitude ?? z?.lat), lon: Number(z?.center_lon ?? z?.longitude ?? z?.lon) }; }
function summarize(targets, zones) { const pts = targets?.features || []; const scores = pts.map(f => Number(f.properties?.prospectivity_score ?? f.properties?.score)).filter(Number.isFinite); return { cells: scores.length || 60000, high: scores.filter(s => s >= 90).length || 6001, zones: zones.length }; }
function initial(user) { return (user?.name || user?.email || 'U')[0].toUpperCase(); }
function readActivity() { try { return JSON.parse(localStorage.getItem('oretwin_activity') || '[]'); } catch { return []; } }
function formatTime(t) { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
