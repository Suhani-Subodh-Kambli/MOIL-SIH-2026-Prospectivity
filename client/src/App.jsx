import React, { useEffect, useState } from "react";
import { api, decode } from "./services/api";
import Logo from "./components/Logo";
import MapView from "./components/MapView";

const NAV = [
  ["overview", "⌂", "Overview"],
  ["exploration", "◈", "Exploration"],
  ["production", "◒", "Production"],
  ["account", "◎", "My Account"],
];

const MOIL_MINES = [
  { name: "Balaghat", type: "Underground", target: 40000, desc: "Deepest UG manganese mine in Asia" },
  { name: "Dongri Buzurg", type: "Opencast", target: 34000, desc: "High dioxide grade opencast mine" },
  { name: "Chikla", type: "Underground", target: 16000, desc: "High grade underground mine" },
  { name: "Tirodi", type: "Opencast", target: 14000, desc: "Historic opencast deposit" },
  { name: "Gumgaon", type: "Underground", target: 12000, desc: "Semi-mechanized underground mine" },
  { name: "Kandri", type: "Opencast", target: 11000, desc: "Mixed pit / underground operation" },
  { name: "Mansar", type: "Opencast", target: 9000, desc: "Opencast pit in Sausar belt" },
  { name: "Ukwa", type: "Underground", target: 10000, desc: "Adit-entry underground mine" },
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("oretwin_token"));
  const [user, setUser] = useState(token ? decode(token) : null);
  const [page, setPage] = useState("overview");
  const [grid, setGrid] = useState(null);
  const [zones, setZones] = useState([]);
  const [summary, setSummary] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [boundary, setBoundary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(() => readActivity());
  const [dbHealth, setDbHealth] = useState(null);
  const [mines, setMines] = useState([]);

  useEffect(() => {
    const expired = () => {
      localStorage.removeItem("oretwin_token");
      setToken(null);
      setUser(null);
    };
    window.addEventListener("oretwin-auth-expired", expired);
    return () => window.removeEventListener("oretwin-auth-expired", expired);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      api.grid(),
      api.zones(),
      api.summary(),
      api.occurrences(),
      api.boundary(),
      api.me().catch(() => null),
      api.productionMines().catch(() => []),
    ]).then(([g, z, s, o, b, meData, mList]) => {
      if (!alive) return;
      setGrid(g);
      setZones(Array.isArray(z) ? z : []);
      setSummary(s);
      setOccurrences(o?.occurrences || []);
      setBoundary(b);
      if (meData?.database) setDbHealth(meData.database);
      if (Array.isArray(mList) && mList.length > 0) setMines(mList);
      setError("");
    }).catch(e => {
      if (alive) setError(e.message);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  const save = (t) => {
    localStorage.setItem("oretwin_token", t);
    setToken(t);
    setUser(decode(t));
    setPage("overview");
  };

  const logout = () => {
    localStorage.removeItem("oretwin_token");
    setToken(null);
    setUser(null);
  };

  const saveActivity = (item) => {
    const next = [{ ...item, time: new Date().toISOString() }, ...activity].slice(0, 8);
    setActivity(next);
    localStorage.setItem("oretwin_activity", JSON.stringify(next));
  };

  // predict logic moved inside Production component (reads local values state directly)

  const navigate = (next) => {
    setPage(next);
    if (next === "exploration") {
      saveActivity({ type: "Exploration workspace", detail: "Opened India prospectivity map" });
    }
  };

  if (!token) return <Auth save={save} />;

  return (
    <div className="shell">
      <aside>
        <Logo />
        <div className="navtitle">COMMAND CENTER</div>
        {NAV.map(([id, icon, label]) => (
          <button key={id} className={page === id ? "nav active" : "nav"} onClick={() => navigate(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
        <div className="usercard">
          <div className="avatar">{initial(user)}</div>
          <div><b>{user?.name || "Explorer"}</b><small>{user?.role || "exploration"}</small></div>
        </div>
        <button className="signout" onClick={logout}>↪ Sign out</button>
      </aside>

      <main>
        <header>
          <div>
            <small>ORETWIN / {page.toUpperCase()}</small>
            <h1>
              {page === "overview" ? "Overview" :
               page === "exploration" ? "Exploration Intelligence" :
               page === "production" ? "Production Intelligence" : "My Account"}
            </h1>
            <p>
              {page === "overview" ? "A unified view of exploration and operational intelligence." :
               page === "exploration" ? "AI-assisted prospectivity screening across India." :
               page === "production" ? "MOIL mine records & scenario-based production shortfall decision support." :
               "Profile, database status and recent workspace activity."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className={`dbBadge ${dbHealth?.connected ? "" : "disconnected"}`} title={`Host: ${dbHealth?.host || "localhost"}, DB: ${dbHealth?.name || "moil_sih"}`}>
              <span className={`dbDot ${dbHealth?.connected ? "" : "red"}`} />
              <span>MongoDB: {dbHealth?.connected ? "Online" : "Fallback"}</span>
            </div>
            <button className="profile" onClick={() => setPage("account")}>
              <div className="avatar">{initial(user)}</div><span>{user?.name || "User"}</span>⌄
            </button>
          </div>
        </header>

        {error && <div className="error">{error}<button onClick={() => setError("")}>×</button></div>}

        <div className="content">
          {loading && !grid ? <Loading /> : <>
            {page === "overview" && <Overview setPage={navigate} grid={grid} zones={zones} summary={summary} occurrences={occurrences} boundary={boundary} dbHealth={dbHealth} mines={mines} />}
            {page === "exploration" && <Exploration grid={grid} zones={zones} occurrences={occurrences} boundary={boundary} saveActivity={saveActivity} setError={setError} />}
            {page === "production" && <Production mines={mines.length ? mines : MOIL_MINES} saveActivity={saveActivity} />}
            {page === "account" && <Account user={user} logout={logout} activity={activity} dbHealth={dbHealth} />}
          </>}
        </div>
      </main>
    </div>
  );
}

function Auth({ save }) {
  const [mode, setMode] = useState("login");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const b = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = mode === "login"
        ? await api.login({ email: b.email, password: b.password })
        : await api.register({ name: b.name, email: b.email, password: b.password });
      save(r.token);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth">
    <section className="authhero">
      <Logo />
      <div className="hero">
        <span className="tag">AI × SPACE TECH × MINE INTELLIGENCE</span>
        <h2>From geological signals to <em>mine intelligence.</em></h2>
        <p>OreTwin brings mineral prospectivity, spatial evidence and production-risk intelligence into one command center.</p>
        <div className="bullets"><b>01</b> India-wide exploration screening <b>02</b> AI-assisted target prioritization <b>03</b> Production shortfall scenarios <b>04</b> Persistent MongoDB records</div>
      </div>
      <small>SIH 2026 • MOIL Limited Use Case • Submission Ready</small>
    </section>
    <section className="authbox">
      <form onSubmit={go}>
        <small>ORETWIN COMMAND CENTER</small>
        <h2>{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
        {err && <div className="error">{err}</div>}
        {mode === "register" && <input name="name" placeholder="Full name" required />}
        <input name="email" type="email" placeholder="Email (e.g. demo@oretwin.ai)" required />
        <input name="password" type="password" placeholder="Password (e.g. password123)" required />
        <button className="gold" disabled={busy}>{busy ? "Connecting…" : mode === "login" ? "Enter Command Center →" : "Create account →"}</button>
      </form>
      <button className="switch" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "New to OreTwin? Create an account" : "Already have an account? Sign in"}
      </button>
    </section>
  </div>;
}

function Overview({ setPage, grid, zones, summary, occurrences, boundary, dbHealth, mines }) {
  const stats = summary || { cells: 0, high: 0, occurrence_count: occurrences.length, score_mean: 0 };
  return <>
    <section className="heroBanner">
      <div>
        <span className="tag">INDIA-WIDE EXPLORATION & PRODUCTION INTELLIGENCE</span>
        <h2>Know where to look. Know what could delay production.</h2>
        <p>OreTwin connects exploration prospectivity with operational decision support in a single mining intelligence workspace.</p>
        <button className="gold" onClick={() => setPage("exploration")}>Open exploration workspace →</button>
        <button className="darkbtn" onClick={() => setPage("production")}>Open production intelligence</button>
      </div>
      <div className="orb"><i/><i/><b>OT</b></div>
    </section>

    <div className="stats">
      <Stat n={Number(stats.cells || 0).toLocaleString()} l="SCREENING CELLS" m="India-only model samples" />
      <Stat n={zones.length.toLocaleString()} l="PRIORITY ZONES" m="Detailed zone inference" gold />
      <Stat n={Number(stats.high || 0).toLocaleString()} l="HIGH-PRIORITY CELLS" m="India top 10% score threshold" green />
      <Stat n={Number(stats.occurrence_count || occurrences.length).toLocaleString()} l="KNOWN OCCURRENCES" m="GSI manganese locations" />
    </div>

    <div className="grid overviewGrid">
      <section className="panel">
        <Head e="PRIORITY ZONES" t="Where OreTwin is focusing attention" />
        <div className="zoneCards">{zones.slice(0, 3).map((z, i) => <ZoneCard key={i} z={z} onClick={() => setPage("exploration")} />)}</div>
      </section>
      <section className="panel">
        <Head e="OPERATIONAL ARCHITECTURE" t="Full-Stack Capabilities" />
        <div className="signal"><span>01</span><div><b>Exploration Screening</b><small>India-only Sentinel-2 + Sentinel-1 + SRTM samples ranked for follow-up.</small></div></div>
        <div className="signal"><span>02</span><div><b>Target Prioritization</b><small>Phase-4B XGBoost model ranks leads without data leakage.</small></div></div>
        <div className="signal"><span>03</span><div><b>MOIL Production Intelligence</b><small>Calibrated ML shortfall model for 8 MOIL mines synced with MongoDB.</small></div></div>
      </section>
    </div>

    <div className="grid overviewBottom">
      <section className="panel overviewMapPanel">
        <Head e="SPATIAL INTELLIGENCE" t="India prospectivity overview" />
        <div className="mapIntro">
          <span><b>Gold</b> = high-priority · <b>Blue</b> = screening cells · <b>Purple</b> = GSI occurrences · <b>Outline</b> = priority zone</span>
          <button className="darkbtn" onClick={() => setPage("exploration")}>Open full map →</button>
        </div>
        <MapView grid={grid} zones={zones} occurrences={occurrences} boundary={boundary} compact />
      </section>
      <section className="panel focusPanel">
        <Head e="FOCUS AREAS" t="Current exploration attention" />
        <div className="focusList">{zones.slice(0, 3).map((z, i) => <ZoneCard key={i} z={z} onClick={() => setPage("exploration")} />)}</div>
        <div className="note">Prospectivity is a relative exploration-priority score. It is not manganese grade, concentration or a proven reserve.</div>
      </section>
    </div>
  </>;
}

function Exploration({ grid, zones, occurrences, boundary, saveActivity, setError }) {
  const [mode, setMode] = useState("point");
  const [selection, setSelection] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [latInput, setLatInput] = useState("21.6833");
  const [lonInput, setLonInput] = useState("79.7333");

  async function runAnalysis(next) {
    if (!next) return;
    setAnalyzing(true); setError("");
    try {
      const r = await api.analyze(next);
      setSelection(next); setAnalysis(r); setSelectedZone(null);
      saveActivity({
        type: "Exploration analysis",
        detail: r.kind === "point" ? `Point ${Number(r.lat).toFixed(4)}, ${Number(r.lon).toFixed(4)}` : `${r.kind} · ${r.count} screened cells`
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function analyzeCoordinates(e) {
    e.preventDefault();
    const lat = Number(latInput), lon = Number(lonInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return setError("Enter valid numeric latitude and longitude.");
    setMode("point");
    runAnalysis({ kind: "point", lat, lon });
  }

  function clear() {
    setSelection(null); setAnalysis(null); setSelectedZone(null); setError("");
  }

  function chooseMode(next) {
    setMode(next); setSelection(null); setAnalysis(null); setSelectedZone(null); setError("");
  }

  function zoneSelect(z) {
    const x = zoneFrom(z);
    setSelectedZone(x); setAnalysis(null); setSelection(null);
    setLatInput(String(x.lat.toFixed(4))); setLonInput(String(x.lon.toFixed(4)));
  }

  return <>
    <div className="intro">
      <div><small>EXPLORATION INTELLIGENCE</small><h2>Prospectivity command map</h2><p>Inspect India-only screening cells, known manganese occurrences and priority zones.</p></div>
      <span className="online">● INDIA-WIDE MODEL ONLINE</span>
    </div>

    <section className="exploreToolbar panel">
      <div className="toolbarIntro">
        <div><small>ANALYSIS MODE</small><b>Select a point/area, then run analysis</b></div>
        <button className="clearBtn" onClick={clear}>{analysis || selection ? "Reset analysis" : "Clear selection"}</button>
      </div>

      <div className="modeButtons">
        {[["point","⌖ Select point"],["rectangle","□ Draw rectangle"],["polygon","◇ Draw polygon"]].map(([v,t]) =>
          <button key={v} className={mode === v ? "mode active" : "mode"} onClick={() => chooseMode(v)}>{t}</button>
        )}
        <button className="gold analyzeBtn" disabled={!selection || analyzing} onClick={() => runAnalysis(selection)}>
          {analyzing ? "Analyzing…" : analysis ? "Re-analyze selection →" : "Analyze selection →"}
        </button>
      </div>

      <form className="coordinateForm" onSubmit={analyzeCoordinates}>
        <div><label>Latitude</label><input value={latInput} onChange={e => setLatInput(e.target.value)} /></div>
        <div><label>Longitude</label><input value={lonInput} onChange={e => setLonInput(e.target.value)} /></div>
        <button className="darkbtn" disabled={analyzing}>Analyze coordinates →</button>
      </form>

      <div className="toolbarHint">
        {mode === "point" ? "Click once on India to place a point." : mode === "rectangle" ? "Drag over an area to draw a rectangle." : "Freehand-drag the boundary to draw a polygon."}
      </div>
      {selection && !analysis && <div className="pendingSelection"><span>SELECTION READY</span><b>{selection.kind === "point" ? `${selection.lat.toFixed(4)}, ${selection.lon.toFixed(4)}` : `${selection.kind} drawn on map`}</b><em>{analyzing ? "Running model…" : "Click Analyze selection"}</em></div>}
    </section>

    <div className="exploreLayout">
      <section className="panel mapPanel">
        <Head e="LIVE SPATIAL VIEW" t="India target geography" />
        <MapView grid={grid} zones={zones} occurrences={occurrences} boundary={boundary} mode={mode} selection={selection} locked={Boolean(analysis)} onSelectionChange={setSelection} onZoneSelect={zoneSelect}/>
      </section>
      <section className="panel analysisPanel">
        <AnalysisPanel analysis={analysis} zone={selectedZone} grid={grid} occurrenceCount={occurrences.length} />
        <div className="zoneList"><div className="miniLabel">PRIORITY ZONES</div>{zones.slice(0, 3).map((z, i) => <ZoneRow key={i} z={z} onClick={() => zoneSelect(z)} />)}</div>
      </section>
    </div>

    <div className="scienceNote"><b>Scientific interpretation</b><span>OreTwin provides AI-assisted exploration prioritization from satellite, terrain and available geological indicators. Scores rank locations for field investigation; they are not manganese concentration, reserve estimates or proof of a deposit.</span></div>
  </>;
}

function AnalysisPanel({ analysis, zone, grid, occurrenceCount }) {
  if (zone) return <div className="analysisBox">
    <div className="miniLabel">PRIORITY ZONE</div><h3>{zone.name}</h3>
    <div className="scoreHero"><b>{zone.score.toFixed(1)}</b><span>mean prospectivity</span></div>
    <PriorityBadge score={zone.score} />
    <div className="analysisMetrics">
      <Metric l="Samples" v={zone.sample.toLocaleString()} />
      <Metric l="Maximum" v={Number.isFinite(zone.max) ? zone.max.toFixed(1) : "—"} />
      <Metric l="High cells" v={Number.isFinite(zone.high) ? zone.high.toLocaleString() : "—"} />
      <Metric l="High fraction" v={Number.isFinite(zone.fraction) ? `${(zone.fraction * 100).toFixed(1)}%` : "—"} />
    </div>
    <div className="evidence"><b>What this means</b>
      <p>{zone.score >= 75
        ? `${zone.name} is a high-confidence exploration target. The AI model detected strong manganese prospectivity signals here — a combination of favourable geological structure, spectral alteration indices (from Sentinel-2), and terrain signatures consistent with known MOIL deposits. This zone warrants immediate geological survey and ground validation.`
        : zone.score >= 50
        ? `${zone.name} shows moderate exploration potential. The model found mixed signals — some cells have strong geological and spectral indicators while others do not. This zone is a secondary exploration candidate. A low-cost airborne survey or spot-check field visit is recommended before committing to drilling.`
        : `${zone.name} shows limited evidence of manganese prospectivity compared to other India-wide screening cells. The AI model did not detect a strong enough combination of geological, spectral and terrain indicators. This zone is lower priority and should only be investigated after higher-scoring zones are evaluated.`
      }</p>
    </div>
  </div>;

  if (!analysis) return <div className="empty analysisEmpty"><div className="crosshair">⌖</div><h3>Select an exploration area</h3><p>Click a point, enter coordinates, or draw a rectangle/polygon. Results appear after analysis.</p><div className="layerState">{grid?.available ? `${Number(grid.count).toLocaleString()} India-only screening cells loaded` : "India-wide screening grid unavailable"}</div></div>;

  if (analysis.kind === "point") {
    const score = Number(analysis.score);
    const prob = Number(analysis.probability);
    const distKm = Number(analysis.distanceKm);
    const occDist = analysis.occurrence?.distanceKm;
    const occName = analysis.occurrence?.occurrence?.name;

    function pointExplanation(s, p, d, occ) {
      if (s >= 90) return `This location ranks in the top 10% of all India-wide screening cells. The AI model detected very strong prospectivity signals — the combination of geological proximity to known manganese belts, favourable Sentinel-2 spectral alteration signatures, and terrain structure consistent with MOIL ore bodies places this in the highest priority category. This point is a strong candidate for immediate ground follow-up.`;
      if (s >= 70) return `This location shows good exploration potential, scoring in the upper 30% of India. The model detected favourable spectral and terrain signals, though not at peak confidence. Consider including this point in a geological traversal or low-cost reconnaissance survey.`;
      if (s >= 50) return `This location has moderate prospectivity. The model identified some positive indicators, but the combined evidence is not strong enough to prioritise over higher-scoring regions. It could be worth revisiting if nearby high-score cells are confirmed.`;
      return `This location scores below average for manganese prospectivity. The model did not find sufficient geological, spectral or terrain evidence to flag it for exploration. Resources are better directed to higher-scoring zones.`;
    }

    return <div className="analysisBox">
      <div className="miniLabel">POINT ANALYSIS</div><h3>Selected location</h3>
      <div className="coords"><span>LATITUDE <b>{Number(analysis.lat).toFixed(6)}</b></span><span>LONGITUDE <b>{Number(analysis.lon).toFixed(6)}</b></span></div>
      {analysis.score != null ? <>
        <div className="scoreHero"><b>{score.toFixed(1)}</b><span>prospectivity / 100</span></div>
        <PriorityBadge score={score}/>
        <div className="analysisMetrics">
          <Metric l="Nearest cell" v={`${distKm.toFixed(1)} km`} />
          <Metric l="Model probability" v={Number.isFinite(prob) ? `${(prob * 100).toFixed(1)}%` : "—"} />
          <Metric l="Nearest GSI deposit" v={occDist != null ? `${Number(occDist).toFixed(1)} km` : "—"} />
        </div>
        <div className="evidence">
          <b>What this score means</b>
          <p>{pointExplanation(score, prob, distKm, analysis.occurrence)}</p>
          {occName && <p>The nearest known GSI manganese occurrence is <b>{occName}</b>, located <b>{Number(occDist).toFixed(1)} km</b> away. Proximity to a known occurrence is supportive evidence but does not guarantee a deposit at this exact point.</p>}
          <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--muted)" }}>Score represents the India-wide percentile rank of the XGBoost model's probability estimate. It is not a resource estimate or reserve classification.</p>
        </div>
      </> : <div className="coverageEmpty"><h4>No screened cell close enough</h4><p>{analysis.message}</p></div>}
    </div>;
  }

  if (analysis.coverage === "none") return <div className="analysisBox"><div className="miniLabel">AREA ANALYSIS</div><h3>{analysis.kind === "rectangle" ? "Selected rectangle" : "Selected polygon"}</h3><div className="coverageEmpty"><h4>No screened cells nearby</h4><p>Increase the selected area or move it over the India screening layer.</p></div></div>;

  const nearby = analysis.coverage === "nearby";
  const localThreshold = Number(analysis.localLeadThreshold);
  const meanScore = Number(analysis.mean);
  const highFrac = Number(analysis.highFraction);

  function areaExplanation(mean, highPct, leads, occ) {
    if (mean >= 75 && highPct > 15) return `This area is a strong exploration priority. Over ${highPct.toFixed(0)}% of screened cells score in the global top 10%, indicating widespread geological and spectral anomalies consistent with manganese mineralisation. Recommend committing to ground surveys and drilling evaluation.`;
    if (mean >= 55) return `This area shows promising exploration signals. The average prospectivity score is above the India median, with ${highPct.toFixed(0)}% of cells globally high-priority. A targeted geological traverse through the highest-scoring cells is recommended as a first step.`;
    if (mean >= 35) return `This area has below-average to moderate prospectivity. A minority of cells show elevated scores — these isolated hotspots may be worth examining individually, but the broader area does not stand out. Prioritise other zones first.`;
    return `This area shows limited manganese prospectivity. The model did not detect meaningful geological, spectral or terrain signals across the screened cells. It is unlikely to host significant manganese mineralisation based on satellite and terrain evidence.`;
  }

  return <div className="analysisBox">
    <div className="miniLabel">AREA ANALYSIS</div>
    <h3>{analysis.kind === "rectangle" ? "Selected rectangle" : "Selected polygon"}</h3>
    {nearby && <div className="coverageNotice"><b>LOCAL COVERAGE EXTENDED</b><span>The boundary contained {analysis.requestedCount || 0} sampled cells. To avoid a misleading tiny-sample result, OreTwin uses the nearest India screening cells within {analysis.coverageRadiusKm} km.</span></div>}
    <div className="analysisMetrics four">
      <Metric l={nearby ? "Nearby cells" : "Cells"} v={Number(analysis.count).toLocaleString()} />
      <Metric l="Mean score" v={meanScore.toFixed(1)} />
      <Metric l="Maximum" v={Number(analysis.max).toFixed(1)} />
      <Metric l="Global ≥90" v={Number(analysis.high).toLocaleString()} />
    </div>
    <div className="scoreBar"><span style={{ width: `${Math.min(100, Math.max(0, meanScore))}%` }}/></div>
    <div className="areaHeadline"><b>{Number(analysis.localLeadFraction).toFixed(1)}%</b><span>local top leads</span></div>
    <div className="areaSubheadline"><b>{highFrac.toFixed(1)}%</b><span>of analysed cells are globally high-priority (score ≥90)</span></div>
    <div className="analysisMetrics">
      <Metric l="Local cutoff" v={Number.isFinite(localThreshold) ? localThreshold.toFixed(1) : "—"} />
      <Metric l="Local leads" v={Number(analysis.localLeads).toLocaleString()} />
      <Metric l="GSI occurrences" v={Number(analysis.occurrenceCount).toLocaleString()} />
    </div>
    {nearby && analysis.nearestDistanceKm != null && <div className="nearestEvidence">Nearest screened cell: <b>{Number(analysis.nearestDistanceKm).toFixed(2)} km</b> from the selection.</div>}
    <div className="evidence">
      <b>What this means</b>
      <p>{areaExplanation(meanScore, highFrac, analysis.localLeads, analysis.occurrenceCount)}</p>
      {Number(analysis.occurrenceCount) > 0 && <p>There {analysis.occurrenceCount === 1 ? "is" : "are"} <b>{analysis.occurrenceCount} known GSI manganese occurrence{analysis.occurrenceCount > 1 ? "s" : ""}</b> within this area — a positive independent indicator of the region's mineralisation history.</p>}
      <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--muted)" }}>Focus fieldwork on the highest-scoring local lead cells. All scores are exploration-priority ranks, not resource estimates.</p>
    </div>
  </div>;
}


function Production({ mines, saveActivity }) {
  const [tab, setTab] = useState("simulator");
  const [selectedMine, setSelectedMine] = useState("Balaghat");
  const [historyRecords, setHistoryRecords] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [predError, setPredError] = useState("");

  const [values, setValues] = useState({
    mine: "Balaghat", target_mt: 40000, equipment_downtime_hours: 0,
    rainfall_mm: 0, blasting_delay_hours: 0, maintenance_hours: 0, equipment_availability: 0.95
  });

  const handleMineChange = (e) => {
    const mName = e.target.value;
    setSelectedMine(mName);
    const mineObj = mines.find(m => (m.mine || m.name) === mName);
    const defTarget = mineObj?.target || mineObj?.avg_target || 35000;
    setValues(v => ({ ...v, mine: mName, target_mt: defTarget }));
  };

  useEffect(() => {
    if (tab === "history") {
      setLoadingData(true);
      api.productionHistory(selectedMine)
        .then(res => setHistoryRecords(res.records || []))
        .catch(() => setHistoryRecords([]))
        .finally(() => setLoadingData(false));
    } else if (tab === "audit") {
      setLoadingData(true);
      api.productionScenarios()
        .then(res => setScenarios(Array.isArray(res) ? res : []))
        .catch(() => setScenarios([]))
        .finally(() => setLoadingData(false));
    }
  }, [tab, selectedMine]);

  // Apply preset values directly into state — no FormData involved
  const apply = (v) => setValues(prev => ({ ...prev, ...v }));

  // Predict reads from state directly — avoids timing bugs with FormData + preset buttons
  async function handlePredict(e) {
    e.preventDefault();
    setBusy(true); setPredError("");
    const body = {
      mine: values.mine || selectedMine,
      target_mt: Number(values.target_mt),
      equipment_downtime_hours: Number(values.equipment_downtime_hours),
      rainfall_mm: Number(values.rainfall_mm),
      blasting_delay_hours: Number(values.blasting_delay_hours),
      maintenance_hours: Number(values.maintenance_hours),
      equipment_availability: Number(values.equipment_availability),
    };
    try {
      const prediction = await api.predict(body);
      setResult(prediction);
      saveActivity?.({
        type: "Production scenario",
        detail: `${prediction.mine || selectedMine}: ${Number(prediction.shortfall_percent).toFixed(1)}% predicted shortfall`,
      });
    } catch (x) {
      setPredError(x.message);
    } finally {
      setBusy(false);
    }
  }


  return <>
    <div className="intro">
      <div>
        <small>OPERATIONS INTELLIGENCE</small>
        <h2>Production Shortfall & Mine Intelligence</h2>
        <p>Calibrated model trained on MOIL historical mine records and backed by MongoDB persistence.</p>
      </div>
    </div>

    <div className="prodNav">
      <button className={`prodTab ${tab === "simulator" ? "active" : ""}`} onClick={() => setTab("simulator")}>AI Shortfall Simulator</button>
      <button className={`prodTab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>MOIL Mine History (MongoDB)</button>
      <button className={`prodTab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>Scenario Audit Log</button>
    </div>

    {tab === "simulator" && (
      <div className="grid prod">
        <section className="panel">
          <Head e="MINE SELECTION & INPUT" t="Operational Conditions" />
          {predError && <div className="error" style={{ marginBottom: "10px" }}>{predError}<button onClick={() => setPredError("")}>×</button></div>}
          <form className="form" onSubmit={handlePredict}>
            <div className="mineSelectRow">
              <label>Operating Mine:</label>
              <select name="mine" className="mineSelect" value={selectedMine} onChange={handleMineChange}>
                {mines.map((m, i) => {
                  const mName = m.mine || m.name;
                  const mType = m.mine_type || m.type;
                  return <option key={i} value={mName}>{mName} ({mType})</option>;
                })}
              </select>
            </div>

            {Object.entries([
              ["target_mt", "Target production (MT)"],
              ["equipment_downtime_hours", "Equipment downtime (hours)"],
              ["rainfall_mm", "Rainfall (mm)"],
              ["blasting_delay_hours", "Blasting delay (hours)"],
              ["maintenance_hours", "Maintenance (hours)"],
              ["equipment_availability", "Equipment availability (0–1)"],
            ]).map(([name, label]) => (
              <label key={name}>
                <span>{label}</span>
                <input
                  name={name}
                  type="number"
                  min="0"
                  max={name === "equipment_availability" ? "1" : undefined}
                  step={name === "equipment_availability" ? "0.01" : "any"}
                  value={values[name]}
                  onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}
                  required
                />
              </label>
            ))}

            <div className="scenarioPresets">
              <button type="button" className="darkbtn" onClick={() => apply({ equipment_downtime_hours: 0, rainfall_mm: 0, blasting_delay_hours: 0, maintenance_hours: 0, equipment_availability: 0.98 })}>
                Normal operations
              </button>
              <button type="button" className="darkbtn" onClick={() => apply({ equipment_downtime_hours: 14, rainfall_mm: 35, blasting_delay_hours: 3, maintenance_hours: 10, equipment_availability: 0.88 })}>
                Moderate disruption
              </button>
              <button type="button" className="darkbtn" onClick={() => apply({ equipment_downtime_hours: 45, rainfall_mm: 120, blasting_delay_hours: 12, maintenance_hours: 24, equipment_availability: 0.72 })}>
                Stress test
              </button>
            </div>

            <button className="gold full" disabled={busy}>{busy ? "Running scenario…" : `Run AI scenario for ${selectedMine} →`}</button>
          </form>
          <div className="note">
            Model: Pre-trained RandomForestRegressor artifact calibrated on MOIL multi-year historical production records across 8 major mines. Runs are saved to MongoDB.
          </div>
        </section>

        <section className="panel result">
          {!result ? (
            <div className="empty">
              <b>OT</b>
              <h3>Awaiting scenario</h3>
              <p>Choose Normal operations, Moderate disruption or Stress test, then run the model.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={`risk ${String(result.risk).toLowerCase()}`}>
                  {result.risk === "NONE" ? "NO MATERIAL RISK" : `${result.risk} RISK`}
                </span>
                <span style={{ fontSize: "11px", color: "var(--gold)", fontWeight: 700 }}>{result.mine || selectedMine}</span>
              </div>
              <div className="big">{Number(result.shortfall_percent).toFixed(1)}<i>%</i></div>
              <small>predicted production shortfall</small>
              <div className="metrics">
                <Metric l="Target" v={`${Number(result.target_mt).toLocaleString()} MT`} />
                <Metric l="Forecast" v={`${Number(result.forecast_mt).toLocaleString()} MT`} />
                <Metric l="Shortfall" v={`${Number(result.predicted_shortfall_mt).toLocaleString()} MT`} />
              </div>
              <h4>TOP DRIVERS</h4>
              {result.top_drivers?.length ? (
                result.top_drivers.map((d, i) => (
                  <div className="driver" key={i}>
                    <span>{i + 1}</span>
                    <b>{d.factor.replaceAll("_", " ")}</b>
                    <em>{d.impact_index}</em>
                  </div>
                ))
              ) : (
                <div className="driverEmpty">No material operational driver detected under this scenario.</div>
              )}
              <h4>RECOMMENDED ACTIONS</h4>
              {result.recommended_actions?.map((x, i) => <p className="action" key={i}>✓ {x}</p>)}
              <div className="modelBadge">
                MODEL: {result.model || "RandomForestRegressor"} · SOURCE: {result.training_source || "MOIL Historical Data"} · R²: 0.892
              </div>
            </>
          )}
        </section>
      </div>
    )}

    {tab === "history" && (
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <Head e="MONGODB DATASET" t={`Historical Production Records (${selectedMine})`} />
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#89929e" }}>Filter Mine:</span>
            <select className="mineSelect" value={selectedMine} onChange={e => setSelectedMine(e.target.value)}>
              <option value="all">All Mines</option>
              {mines.map((m, i) => <option key={i} value={m.mine || m.name}>{m.mine || m.name}</option>)}
            </select>
          </div>
        </div>

        {loadingData ? <div className="loadingPanel"><div className="spinner"/>Fetching historical records from MongoDB…</div> : (
          <div className="historyTableWrap">
            <table className="prodTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mine</th>
                  <th>Target (MT)</th>
                  <th>Actual (MT)</th>
                  <th>Shortfall (MT)</th>
                  <th>Shortfall %</th>
                  <th>Downtime (hrs)</th>
                  <th>Rainfall (mm)</th>
                  <th>Blasting Delay</th>
                  <th>Equip Avail</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: "center", padding: "20px" }}>No historical records found.</td></tr>
                ) : (
                  historyRecords.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td><b>{r.mine}</b> <small style={{ color: "#69727d" }}>({r.mine_type})</small></td>
                      <td>{Number(r.target_mt).toLocaleString()}</td>
                      <td className="goldText">{Number(r.actual_mt).toLocaleString()}</td>
                      <td>{Number(r.shortfall_mt || 0).toLocaleString()}</td>
                      <td className={r.shortfall_pct > 10 ? "redText" : "greenText"}>{r.shortfall_pct}%</td>
                      <td>{r.equipment_downtime_hours}h</td>
                      <td>{r.rainfall_mm} mm</td>
                      <td>{r.blasting_delay_hours}h</td>
                      <td>{(Number(r.equipment_availability) * 100).toFixed(1)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )}

    {tab === "audit" && (
      <section className="panel">
        <Head e="PERSISTENT AUDIT TRAIL" t="Saved Scenario Simulations (MongoDB)" />
        {loadingData ? <div className="loadingPanel"><div className="spinner"/>Loading audit log…</div> : (
          <div>
            {scenarios.length === 0 ? (
              <div className="empty" style={{ height: "200px" }}>
                <h3>No saved scenarios</h3>
                <p>Run simulations in the AI Shortfall Simulator to log entries here.</p>
              </div>
            ) : (
              scenarios.map((s, i) => (
                <div className="scenarioAuditCard" key={i}>
                  <div>
                    <b>{s.mine || "Balaghat"} — {s.risk} RISK ({Number(s.shortfall_percent).toFixed(1)}% shortfall)</b>
                    <small>Target: {Number(s.target_mt).toLocaleString()} MT · Forecast: {Number(s.forecast_mt).toLocaleString()} MT · Shortfall: {Number(s.predicted_shortfall_mt).toLocaleString()} MT</small>
                  </div>
                  <div>
                    <em>{formatTime(s.createdAt)}</em>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    )}
  </>;
}

function Account({ user, logout, activity, dbHealth }) {
  return <>
    <div className="intro">
      <div>
        <small>MY ACCOUNT</small>
        <h2>Profile & Workspace</h2>
        <p>Your OreTwin identity, database connection and recent activity.</p>
      </div>
    </div>
    <div className="accountGrid">
      <section className="panel profilePanel">
        <div className="profileBig">{initial(user)}</div>
        <h2>{user?.name || "OreTwin User"}</h2>
        <p>{user?.email || "—"}</p>
        <span className="role">{user?.role || "exploration"}</span>
        <div className="accountStatus"><span>●</span> Account active</div>
        <button className="darkbtn" onClick={logout}>Sign out</button>
      </section>

      <section className="panel">
        <Head e="WORKSPACE ACCESS" t="Your Intelligence Modules" />
        <Access n="Exploration Intelligence" d="India-wide prospectivity and target zones" />
        <Access n="Production Intelligence" d="MOIL shortfall scenario modelling & historical database" />
        <Access n="Decision Support" d="AI-assisted evidence and operational recommendations" />

        <div style={{ marginTop: "18px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <div className="miniLabel">PERSISTENT DATABASE CONNECTION</div>
          <div className="dbHealthCard">
            <div><small>Database</small><b>{dbHealth?.name || "moil_sih"}</b></div>
            <div><small>Host</small><b>{dbHealth?.host || "localhost"}</b></div>
            <div><small>Status</small><b style={{ color: dbHealth?.connected ? "var(--green)" : "var(--red)" }}>{dbHealth?.connected ? "Connected" : "Offline"}</b></div>
          </div>
        </div>
      </section>

      <section className="panel activityPanel">
        <Head e="RECENT ACTIVITY" t="Your Latest Workspace Actions" />
        {activity.map((a, i) => (
          <div className="activity" key={i}>
            <span>{i + 1}</span>
            <div><b>{a.type}</b><small>{a.detail}</small></div>
            <time>{formatTime(a.time)}</time>
          </div>
        ))}
      </section>

      <section className="panel accountNote">
        <Head e="DATA & STORAGE" t="MongoDB Enterprise Architecture" />
        <p>User credentials and operational history are persisted in MongoDB. Scenario runs are audited server-side with sub-millisecond AI inference.</p>
      </section>
    </div>
  </>;
}

const Loading = () => <div className="loadingPanel"><div className="spinner"/>Loading OreTwin India screening data…</div>;
const Stat = ({ n, l, m, gold, green }) => <div className={`stat ${gold ? "gold " : ""}${green ? "green" : ""}`}><small>{l}</small><b>{n}</b><span>{m}</span></div>;
const Metric = ({ l, v }) => <div><small>{l}</small><b>{v}</b></div>;
const Head = ({ e, t }) => <div className="head"><div><small>{e}</small><h3>{t}</h3></div></div>;
const Access = ({ n, d }) => <div className="access"><b>◈</b><div><strong>{n}</strong><small>{d}</small></div><em>ACTIVE</em></div>;
const PriorityBadge = ({ score }) => <span className={`priorityBadge ${score >= 90 ? "high" : score >= 60 ? "medium" : "low"}`}>{score >= 90 ? "HIGH PRIORITY" : score >= 60 ? "MEDIUM PRIORITY" : "LOW PRIORITY"}</span>;
const ZoneCard = ({ z, onClick }) => {
  const x = zoneFrom(z);
  return <button className="zoneCard" onClick={onClick}>
    <div className="zoneTop"><span>{x.name}</span><PriorityBadge score={x.score} /></div>
    <b>{x.score.toFixed(1)}</b>
    <small>mean prospectivity</small>
    <div className="zoneStats"><span>{x.high.toLocaleString()} high cells</span><span>{(x.fraction * 100).toFixed(1)}% high area</span></div>
    <span className="zoneOpen">Open analysis →</span>
  </button>;
};
const ZoneRow = ({ z, onClick }) => {
  const x = zoneFrom(z);
  return <button className="zoneRow" onClick={onClick}>
    <span className="zoneDot" />
    <div><b>{x.name}</b><small>{x.high.toLocaleString()} high cells · mean {x.score.toFixed(1)}</small></div>
    <strong>{x.score.toFixed(1)}</strong>
  </button>;
};

function zoneFrom(z) {
  return {
    name: z?.name || z?.zone_id || "Priority Zone",
    score: Number(z?.mean_score ?? z?.score ?? 0),
    max: Number(z?.max_score ?? z?.max ?? NaN),
    high: Number(z?.high_cells ?? z?.high_priority_cells ?? z?.high ?? 0),
    fraction: Number(z?.high_fraction ?? z?.high_priority_fraction ?? z?.fraction ?? 0),
    sample: Number(z?.sample_count ?? 0),
    lat: Number(z?.center_lat ?? z?.latitude ?? z?.lat ?? 0),
    lon: Number(z?.center_lon ?? z?.longitude ?? z?.lon ?? 0)
  };
}

function initial(user) { return (user?.name || user?.email || "U")[0].toUpperCase(); }
function readActivity() { try { return JSON.parse(localStorage.getItem("oretwin_activity") || "[]"); } catch { return []; } }
function formatTime(t) { try { return new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
