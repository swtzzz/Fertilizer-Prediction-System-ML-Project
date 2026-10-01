import React, { useEffect, useMemo, useState } from 'react'

const API_BASE = '/api'

const DEFAULTS = {
  temperature: 25,
  humidity: 50,
  moisture: 40,
  nitrogen: 30,
  potassium: 10,
  phosphorous: 10,
}

/* ------------------------------------------------------------------ */
/*  Domain lookups — soil / crop visuals and known fertilizer grades   */
/* ------------------------------------------------------------------ */

const SOIL_META = {
  Sandy: { tone: '#D9B276', texture: 'Coarse, fast-draining' },
  Loamy: { tone: '#8A5A34', texture: 'Balanced, fertile' },
  Black: { tone: '#3A332C', texture: 'Moisture-retentive' },
  Red: { tone: '#A64A2E', texture: 'Iron-rich, porous' },
  Clayey: { tone: '#6E5A47', texture: 'Dense, slow-draining' },
}
const soilMeta = (name) =>
  SOIL_META[name] || { tone: '#7C8A6B', texture: 'Field soil' }

const CROP_ICONS = {
  Maize: 'leaf',
  Sugarcane: 'leaf',
  Cotton: 'leaf',
  Tobacco: 'leaf',
  Paddy: 'leaf',
  Barley: 'sprout',
  Wheat: 'sprout',
  Millets: 'sprout',
  'Oil seeds': 'leaf',
  Pulses: 'leaf',
  'Ground Nuts': 'sprout',
}
const cropIcon = (name) => CROP_ICONS[name] || 'sprout'

// Standard published N-P-K grades. Grade-named fertilizers (e.g. "14-35-14")
// already encode their own composition; the rest use their well-known ratios.
const FERTILIZER_NPK = {
  Urea: [46, 0, 0],
  DAP: [18, 46, 0],
  MOP: [0, 0, 60],
}
function npkForFertilizer(name) {
  if (!name) return null
  if (FERTILIZER_NPK[name]) return FERTILIZER_NPK[name]
  const parts = name.split('-').map((p) => Number(p.trim()))
  if (parts.length >= 2 && parts.every((p) => Number.isFinite(p))) {
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  return null
}

function confidenceTier(pct) {
  if (pct >= 75) return { key: 'high', label: 'High confidence', color: 'var(--sage-500)' }
  if (pct >= 60) return { key: 'mid', label: 'Moderate confidence', color: 'var(--amber-500)' }
  return { key: 'low', label: 'Low confidence', color: 'var(--clay-500)' }
}

function bandLabel(kind, value) {
  if (kind === 'temperature') {
    if (value < 15) return 'Cool'
    if (value <= 30) return 'Mild'
    return 'Hot'
  }
  if (kind === 'humidity') {
    if (value < 30) return 'Dry air'
    if (value <= 70) return 'Balanced'
    return 'Humid'
  }
  if (kind === 'moisture') {
    if (value < 30) return 'Dry soil'
    if (value <= 60) return 'Moist'
    return 'Saturated'
  }
  return ''
}

/* ------------------------------------------------------------------ */
/*  Small inline icon set — no external icon library                   */
/* ------------------------------------------------------------------ */

function Icon({ name, ...props }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', ...props }
  switch (name) {
    case 'thermometer':
      return (
        <svg {...common}>
          <path d="M12 3a2 2 0 0 0-2 2v9.1a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="17" r="2" fill="currentColor" />
        </svg>
      )
    case 'droplet':
      return (
        <svg {...common}>
          <path d="M12 3.5s6 6.7 6 10.6a6 6 0 1 1-12 0c0-3.9 6-10.6 6-10.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'soil-drop':
      return (
        <svg {...common}>
          <path d="M12 3.5s5.4 6 5.4 9.7A5.4 5.4 0 1 1 6.6 13.2C6.6 9.5 12 3.5 12 3.5Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 20.5h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'sprout':
      return (
        <svg {...common}>
          <path d="M12 21V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 12C12 8 9 6 5 6c0 4.5 3 6.5 7 6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 9c0-3 2.5-5 6-5 0 4-2.5 6-6 5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'flask':
      return (
        <svg {...common}>
          <path d="M10 3h4M9.5 3v6.2L5 18a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 18l-4.5-8.8V3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7.2 15.5h9.6" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'radar':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.3" opacity="0.4" />
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.3" opacity="0.6" />
          <path d="M12 12 12 3.5A8.5 8.5 0 0 1 20.5 12Z" fill="currentColor" opacity="0.55" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'leaf':
      return (
        <svg {...common}>
          <path d="M5 19c8.5 0 14-5.5 14-14-8.5 0-14 5.5-14 14Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5 19c0-5 2.6-8.6 6.2-10.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'layers':
      return (
        <svg {...common}>
          <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="m3.5 12 8.5 4.5L20.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="m3.5 16 8.5 4.5L20.5 16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'flag':
      return (
        <svg {...common}>
          <path d="M6 3v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 4.5h11.5L14 9l3.5 4.5H6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
  }
}

/* ------------------------------------------------------------------ */
/*  Radial gauge — used for env dials and the confidence ring          */
/* ------------------------------------------------------------------ */

function RadialGauge({ pct, size = 96, stroke = 9, color = 'var(--sage-500)', track = 'rgba(20,40,30,0.1)', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(Math.max(pct, 0), 100) / 100)
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="gauge-arc"
        />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Environmental control — dial readout + slider                      */
/* ------------------------------------------------------------------ */

function EnvControl({ id, label, icon, value, min, max, unit, kind, accent, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="env-control">
      <div className="env-control__gauge">
        <RadialGauge pct={pct} size={82} stroke={7} color={accent}>
          <Icon name={icon} width={16} height={16} />
          <span className="env-control__value">{value}<small>{unit}</small></span>
        </RadialGauge>
      </div>
      <div className="env-control__body">
        <div className="env-control__head">
          <label htmlFor={id}>{label}</label>
          <span className="env-control__band">{bandLabel(kind, value)}</span>
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--fill': `${pct}%`, '--accent': accent }}
          aria-valuetext={`${value}${unit}`}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Nutrient core sample — N / P / K soil-level inputs                 */
/* ------------------------------------------------------------------ */

function NutrientCore({ id, symbol, label, value, onChange, color, max = 150 }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="nutrient-core">
      <div className="nutrient-core__tube" aria-hidden="true">
        <div className="nutrient-core__fill" style={{ height: `${pct}%`, background: color }} />
        <span className="nutrient-core__symbol">{symbol}</span>
      </div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  N-P-K composition bars for the recommended fertilizer              */
/* ------------------------------------------------------------------ */

function NpkComposition({ npk }) {
  if (!npk) return null
  const total = npk.reduce((a, b) => a + b, 0) || 1
  const rows = [
    { key: 'N', v: npk[0], color: 'var(--forest-500)' },
    { key: 'P', v: npk[1], color: 'var(--soil-500)' },
    { key: 'K', v: npk[2], color: 'var(--lime-500)' },
  ]
  return (
    <div className="npk-comp">
      {rows.map((row) => (
        <div className="npk-comp__row" key={row.key}>
          <span className="npk-comp__label">{row.key}</span>
          <div className="npk-comp__track">
            <div
              className="npk-comp__fill"
              style={{ width: `${(row.v / total) * 100}%`, background: row.color }}
            />
          </div>
          <span className="npk-comp__val">{row.v}%</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [options, setOptions] = useState({ soil_types: [], crop_types: [] })
  const [optionsError, setOptionsError] = useState(null)

  const [form, setForm] = useState({
    soil_type: '',
    crop_type: '',
    ...DEFAULTS,
  })

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/options`)
      .then((res) => {
        if (!res.ok) throw new Error('Could not reach the backend API')
        return res.json()
      })
      .then((data) => {
        setOptions(data)
        setForm((f) => ({
          ...f,
          soil_type: data.soil_types?.[0] ?? '',
          crop_type: data.crop_types?.[0] ?? '',
        }))
      })
      .catch((err) => setOptionsError(err.message))
  }, [])

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong while predicting.')
      }
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const topFertilizerName = result?.recommended_fertilizer
  const confidencePct = result ? result.confidence * 100 : 0
  const tier = result ? confidenceTier(confidencePct) : null
  const npk = topFertilizerName ? npkForFertilizer(topFertilizerName) : null

  const nutrientTotal = form.nitrogen + form.potassium + form.phosphorous
  const envSummary = useMemo(() => {
    const t = bandLabel('temperature', form.temperature)
    const h = bandLabel('humidity', form.humidity)
    return `${t} · ${h.toLowerCase()}`
  }, [form.temperature, form.humidity])

  const sm = soilMeta(form.soil_type)

  return (
    <div className="page">
      {/* ---------------- Top bar ---------------- */}
      <nav className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">
            <Icon name="sprout" width={16} height={16} />
          </span>
          Field &amp; Soil Lab
        </div>
        <div className="topbar__links">
          <a href="#intelligence">Field intelligence</a>
          <a href="#console">Console</a>
          <span className={`topbar__status ${optionsError ? 'is-down' : 'is-up'}`}>
            <i /> {optionsError ? 'Backend offline' : 'Model online'}
          </span>
        </div>
      </nav>

      {/* ---------------- Hero ---------------- */}
      <header className="hero">
        <div className="hero__terrain" aria-hidden="true">
          <svg viewBox="0 0 1200 400" preserveAspectRatio="none">
            <path d="M0,300 C150,260 300,340 450,300 C600,260 750,320 900,280 C1050,250 1150,300 1200,270 L1200,400 L0,400 Z" className="terrain-line terrain-line--1" />
            <path d="M0,340 C180,310 320,370 480,330 C640,300 800,350 960,320 C1080,300 1150,330 1200,320 L1200,400 L0,400 Z" className="terrain-line terrain-line--2" />
            <path d="M0,370 C200,355 400,385 600,365 C800,345 1000,380 1200,360 L1200,400 L0,400 Z" className="terrain-line terrain-line--3" />
          </svg>
          <div className="hero__scan" />
        </div>
        <div className="hero__content">
          <h1>Know exactly what your field needs</h1>
          <p className="hero__sub">
            Enter your plot's soil and crop conditions and the model returns a ranked
            fertilizer recommendation, an application dosage, and a cost &amp;
            sustainability comparison — trained on real soil and crop data.
          </p>
          <div className="hero__stats">
            <div><strong>Random Forest</strong><span>classifier</span></div>
            <div><strong>Regression</strong><span>dosage model</span></div>
            <div><strong>Top 3</strong><span>ranked alternatives</span></div>
          </div>
          <a className="hero__cta" href="#console">
            Open the field console
            <Icon name="check" width={14} height={14} />
          </a>
        </div>
      </header>

      {/* ---------------- Field intelligence strip ---------------- */}
      <section className="intel" id="intelligence" aria-label="Field intelligence summary">
        <div className="intel__card">
          <span className="intel__icon" style={{ background: sm.tone }}>
            <Icon name="layers" width={16} height={16} color="#fff" />
          </span>
          <div>
            <p className="intel__label">Soil condition</p>
            <p className="intel__value">{form.soil_type || '—'}</p>
            <p className="intel__meta">{sm.texture}</p>
          </div>
        </div>

        <div className="intel__card">
          <span className="intel__icon intel__icon--sage">
            <Icon name="sprout" width={16} height={16} color="#fff" />
          </span>
          <div>
            <p className="intel__label">Crop condition</p>
            <p className="intel__value">{form.crop_type || '—'}</p>
            <p className="intel__meta">Selected for this scan</p>
          </div>
        </div>

        <div className="intel__card">
          <span className="intel__icon intel__icon--forest">
            <Icon name="droplet" width={16} height={16} color="#fff" />
          </span>
          <div>
            <p className="intel__label">Environment</p>
            <p className="intel__value">{envSummary}</p>
            <p className="intel__meta">{form.moisture}% soil moisture</p>
          </div>
        </div>

        <div className="intel__card">
          <span className="intel__icon intel__icon--soil">
            <Icon name="flask" width={16} height={16} color="#fff" />
          </span>
          <div>
            <p className="intel__label">Nutrient balance</p>
            <div className="intel__minibars" aria-hidden="true">
              <i style={{ height: `${Math.min(100, (form.nitrogen / 150) * 100)}%`, background: 'var(--forest-500)' }} />
              <i style={{ height: `${Math.min(100, (form.phosphorous / 150) * 100)}%`, background: 'var(--soil-500)' }} />
              <i style={{ height: `${Math.min(100, (form.potassium / 150) * 100)}%`, background: 'var(--lime-500)' }} />
            </div>
            <p className="intel__meta">{nutrientTotal} ppm combined</p>
          </div>
        </div>

        <div className="intel__card">
          <span className={`intel__icon intel__icon--status ${loading ? 'is-scanning' : ''}`}>
            <Icon name="radar" width={16} height={16} color="#fff" />
          </span>
          <div>
            <p className="intel__label">AI status</p>
            <p className="intel__value">
              {loading ? 'Analyzing…' : result ? 'Ready' : 'Awaiting scan'}
            </p>
            <p className="intel__meta">{result ? topFertilizerName : 'Run the console below'}</p>
          </div>
        </div>
      </section>

      {/* ---------------- Console ---------------- */}
      <main className="console" id="console">
        {/* ---------------- Form ---------------- */}
        <section className="panel form-panel">
          <div className="panel__head">
            <h2>Field console</h2>
            <p className="hint">
              These readings feed the trained model directly — set them to match
              your plot.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="control-block">
              <span className="control-block__label">Soil type</span>
              <div className="swatch-grid" role="radiogroup" aria-label="Soil type">
                {options.soil_types.length === 0 && <span className="hint">Loading…</span>}
                {options.soil_types.map((s) => {
                  const meta = soilMeta(s)
                  const active = form.soil_type === s
                  return (
                    <button
                      type="button"
                      key={s}
                      className={`swatch ${active ? 'is-active' : ''}`}
                      style={{ '--tone': meta.tone }}
                      onClick={() => updateField('soil_type', s)}
                      role="radio"
                      aria-checked={active}
                    >
                      <span className="swatch__chip" />
                      <span className="swatch__name">{s}</span>
                      <span className="swatch__texture">{meta.texture}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="control-block">
              <span className="control-block__label">Crop type</span>
              <div className="chip-grid" role="radiogroup" aria-label="Crop type">
                {options.crop_types.length === 0 && <span className="hint">Loading…</span>}
                {options.crop_types.map((c) => {
                  const active = form.crop_type === c
                  return (
                    <button
                      type="button"
                      key={c}
                      className={`chip ${active ? 'is-active' : ''}`}
                      onClick={() => updateField('crop_type', c)}
                      role="radio"
                      aria-checked={active}
                    >
                      <Icon name={cropIcon(c)} width={14} height={14} />
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="control-block">
              <span className="control-block__label">Environmental readings</span>
              <div className="env-grid">
                <EnvControl
                  id="temperature"
                  label="Temperature"
                  icon="thermometer"
                  kind="temperature"
                  value={form.temperature}
                  min={0}
                  max={50}
                  unit="°C"
                  accent="var(--clay-500)"
                  onChange={(v) => updateField('temperature', v)}
                />
                <EnvControl
                  id="humidity"
                  label="Humidity"
                  icon="droplet"
                  kind="humidity"
                  value={form.humidity}
                  min={0}
                  max={100}
                  unit="%"
                  accent="var(--forest-500)"
                  onChange={(v) => updateField('humidity', v)}
                />
                <EnvControl
                  id="moisture"
                  label="Soil moisture"
                  icon="soil-drop"
                  kind="moisture"
                  value={form.moisture}
                  min={0}
                  max={100}
                  unit="%"
                  accent="var(--soil-500)"
                  onChange={(v) => updateField('moisture', v)}
                />
              </div>
            </div>

            <div className="control-block">
              <span className="control-block__label">Soil nutrient core sample (ppm)</span>
              <div className="core-grid">
                <NutrientCore
                  id="nitrogen"
                  symbol="N"
                  label="Nitrogen"
                  value={form.nitrogen}
                  color="var(--forest-500)"
                  onChange={(v) => updateField('nitrogen', v)}
                />
                <NutrientCore
                  id="phosphorous"
                  symbol="P"
                  label="Phosphorous"
                  value={form.phosphorous}
                  color="var(--soil-500)"
                  onChange={(v) => updateField('phosphorous', v)}
                />
                <NutrientCore
                  id="potassium"
                  symbol="K"
                  label="Potassium"
                  value={form.potassium}
                  color="var(--lime-500)"
                  onChange={(v) => updateField('potassium', v)}
                />
              </div>
            </div>

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="submit-btn__spinner" /> Analyzing field data…
                </>
              ) : (
                <>Run field analysis</>
              )}
            </button>

            {error && (
              <div className="notice notice--error">
                <Icon name="flag" width={15} height={15} />
                {error}
              </div>
            )}
            {optionsError && (
              <div className="notice notice--error">
                <Icon name="flag" width={15} height={15} />
                {optionsError} — make sure the Flask backend is running on port 5000.
              </div>
            )}
          </form>

          <p className="api-note">
            Model: Random Forest classifier + dosage regressor, served from{' '}
            <code>backend/app.py</code>.
          </p>
        </section>

        {/* ---------------- Results ---------------- */}
        <section className="panel results-panel">
          {!result && !loading && (
            <div className="state-panel">
              <div className="state-panel__radar" aria-hidden="true">
                <Icon name="radar" width={28} height={28} />
              </div>
              <p className="state-panel__title">No scan yet</p>
              <p className="state-panel__body">
                Set your field's conditions on the left, then run the analysis to
                see the recommended fertilizer, dosage, and cost comparison here.
              </p>
            </div>
          )}

          {loading && (
            <div className="state-panel">
              <div className="state-panel__radar is-scanning" aria-hidden="true">
                <Icon name="radar" width={28} height={28} />
              </div>
              <p className="state-panel__title">Scanning field data…</p>
              <p className="state-panel__body">
                Running your inputs through the trained model.
              </p>
            </div>
          )}

          {result && (
            <div className="result">
              <div className="headline-card">
                <div className="headline-card__top">
                  <div>
                    <p className="eyebrow">AI recommendation</p>
                    <p className="fert-name">{topFertilizerName}</p>
                    <p className="fert-sub">Best match for this field profile</p>
                  </div>
                  <RadialGauge pct={confidencePct} size={116} stroke={10} color={tier.color}>
                    <span className="conf-num">{confidencePct.toFixed(0)}<small>%</small></span>
                    <span className="conf-lbl">{tier.label}</span>
                  </RadialGauge>
                </div>

                {npk && (
                  <div className="headline-card__npk">
                    <p className="section-caption">Nutrient composition</p>
                    <NpkComposition npk={npk} />
                  </div>
                )}

                {result.low_confidence && (
                  <div className="inline-flag">
                    <Icon name="flag" width={15} height={15} />
                    Confidence is below 60% — consider a manual soil test before
                    applying this recommendation.
                  </div>
                )}
              </div>

              <div className="section-block">
                <h3>Alternative options</h3>
                <div className="alt-list">
                  {result.alternatives.map((alt, i) => (
                    <div
                      className={`alt-row ${alt.fertilizer === topFertilizerName ? 'is-top' : ''}`}
                      key={alt.fertilizer}
                    >
                      <span className="alt-row__rank">{String(i + 1).padStart(2, '0')}</span>
                      <span className="alt-row__name">{alt.fertilizer}</span>
                      <div className="alt-row__bar">
                        <div
                          className="alt-row__fill"
                          style={{ width: `${alt.probability * 100}%` }}
                        />
                      </div>
                      <span className="alt-row__pct">{(alt.probability * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-block">
                <h3>Estimated dosage</h3>
                <div className="dosage-strip">
                  <span className="dosage-strip__num">
                    {result.estimated_dosage_kg_per_hectare}
                  </span>
                  <span className="dosage-strip__unit">kg / hectare</span>
                  <span className="dosage-strip__note">for your field profile</span>
                </div>
              </div>

              <div className="section-block">
                <h3>Cost &amp; sustainability comparison</h3>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Fertilizer</th>
                      <th>ML confidence</th>
                      <th>Price / kg</th>
                      <th>Env. impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparison.map((row) => (
                      <tr
                        key={row.fertilizer}
                        className={row.fertilizer === topFertilizerName ? 'is-top' : ''}
                      >
                        <td>{row.fertilizer}</td>
                        <td>
                          <div className="mini-bar">
                            <div className="mini-bar__fill" style={{ width: `${row.confidence * 100}%` }} />
                          </div>
                        </td>
                        <td className="mono">{row.price_per_kg != null ? `₹${row.price_per_kg}` : '—'}</td>
                        <td>
                          {row.env_impact != null ? (
                            <span className="impact-dots" aria-label={`Environmental impact ${row.env_impact} of 10`}>
                              {Array.from({ length: 10 }).map((_, i) => (
                                <i key={i} className={i < row.env_impact ? 'is-filled' : ''} />
                              ))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="table-legend">Fewer filled markers means lower environmental impact.</p>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="page-footer">
        <span>Field &amp; Soil Lab — Fertilizer Recommendation Console</span>
        <span>React + Flask, running locally</span>
      </footer>
    </div>
  )
}
