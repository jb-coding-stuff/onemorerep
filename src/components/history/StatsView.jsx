import { useMemo, useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { normalizeName } from '../../program/schema'
import {
  RANGES, filterByRange, setRows, setsPerRegion, setsPerMuscle, topExercises,
  exerciseProgression, weeklyVolume, weeklySets, recentSessions
} from '../../utils/stats'
import { Donut, BarList, LineChart, REGION_COLORS } from './charts'

const MUSCLE_LABELS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves', glutes: 'Glutes', core: 'Core',
  general: 'Other'
}

/** Build a resolver from a logged exercise to { id, name, muscleGroup }. */
function makeIdentify(catalog, program) {
  const byId = new Map(catalog.map(e => [e.canonicalId, e]))
  const byName = new Map()
  for (const e of catalog) {
    for (const n of [e.displayName, ...(e.aliases || [])]) byName.set(normalizeName(n), e)
  }
  const programMuscle = new Map(
    (program?.sessions || []).flatMap(s => s.exercises || []).map(e => [e.exerciseId, e.muscleGroup])
  )
  return ex => {
    const entry = byId.get(ex.exerciseId) || byName.get(normalizeName(ex.name))
    const muscle = entry?.muscleGroup && entry.muscleGroup !== 'general'
      ? entry.muscleGroup
      : programMuscle.get(ex.exerciseId) || entry?.muscleGroup || 'general'
    return {
      id: entry?.canonicalId || ex.exerciseId,
      name: entry?.displayName || ex.name || ex.exerciseId,
      muscleGroup: muscle
    }
  }
}

function Section({ title, children }) {
  return (
    <section className="py-6 border-t border-white/[.06]">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="glass-segmented overflow-x-auto">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`flex-1 shrink-0 px-3 py-1.5 text-sm transition-colors whitespace-nowrap ${
            value === o.id ? 'font-semibold' : 'text-secondary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function StatsView({ workouts }) {
  const catalog = useLiveQuery(() => db.exerciseCatalog.toArray(), [], [])
  const program = useLiveQuery(() => db.program.toArray().then(p => p[0]), [], null)
  const [range, setRange] = useState('3m')
  const [mode, setMode] = useState('muscles') // 'muscles' | 'exercises'
  const [region, setRegion] = useState('all')
  const [exerciseId, setExerciseId] = useState(null)

  const identify = useMemo(() => makeIdentify(catalog, program), [catalog, program])
  const allRows = useMemo(
    () => setRows(filterByRange(workouts, range), identify),
    [workouts, range, identify]
  )
  const exerciseOptions = topExercises(allRows, 100)

  useEffect(() => {
    if (exerciseOptions.length && !exerciseOptions.some(e => e.id === exerciseId)) {
      setExerciseId(exerciseOptions[0].id)
    }
  }, [exerciseOptions, exerciseId])

  // Everything below is computed from the selected subject only.
  const rows = mode === 'exercises'
    ? allRows.filter(r => r.exerciseId === exerciseId)
    : region === 'all' ? allRows : allRows.filter(r => r.region === region)

  const sessionCount = new Set(rows.map(r => r.workoutDate)).size
  const volumeTotal = rows.reduce((s, r) => s + r.weight * r.reps, 0)
  const volume = weeklyVolume(rows)
  const sets = weeklySets(rows)

  const regionOptions = [{ id: 'all', label: 'All' }, ...setsPerRegion(allRows).filter(r => r.key !== 'other').map(r => ({ id: r.key, label: r.label }))]

  return (
    <div className="pb-10 space-y-3">
      <Segmented
        options={[{ id: 'muscles', label: 'Muscle groups' }, { id: 'exercises', label: 'Exercises' }]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'muscles' ? (
        <Segmented options={regionOptions} value={region} onChange={setRegion} />
      ) : (
        <select
          value={exerciseId || ''}
          onChange={e => setExerciseId(e.target.value)}
          className="btn-glass w-full px-4 py-2.5 text-sm appearance-none"
          aria-label="Exercise"
        >
          {exerciseOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      )}
      <Segmented options={RANGES} value={range} onChange={setRange} />

      {rows.length === 0 ? (
        <p className="text-secondary text-sm py-8">No completed sets in this period.</p>
      ) : mode === 'muscles' ? (
        <MuscleStats rows={rows} region={region} sessionCount={sessionCount} volumeTotal={volumeTotal} sets={sets} volume={volume} />
      ) : (
        <ExerciseStats rows={rows} exerciseId={exerciseId} sessionCount={sessionCount} volumeTotal={volumeTotal} volume={volume} />
      )}
    </div>
  )
}

function Totals({ items }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-6">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-secondary">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  )
}

const fmtTons = kg => `${(kg / 1000).toFixed(kg < 10000 ? 1 : 0)}t`
const fmtKg = w => `${Number(w.toFixed(2))} kg`

function WeeklyCharts({ sets, volume }) {
  return (
    <>
      {sets && (
        <Section title="Sets per week">
          {sets.length < 2 ? (
            <p className="text-sm text-secondary">Needs at least two weeks of training to show a trend.</p>
          ) : (
            <LineChart zeroBased points={sets.map(w => ({ t: w.t, y: w.sets }))} format={p => `${p.y} sets · week of`} />
          )}
        </Section>
      )}
      <Section title="Weekly volume (kg × reps)">
        {volume.length < 2 ? (
          <p className="text-sm text-secondary">Needs at least two weeks of training to show a trend.</p>
        ) : (
          <LineChart
            zeroBased
            points={volume.map(v => ({ t: v.t, y: v.volume }))}
            format={p => `${p.y.toLocaleString('de-DE')} kg · week of`}
          />
        )}
      </Section>
    </>
  )
}

function MuscleStats({ rows, region, sessionCount, volumeTotal, sets, volume }) {
  const regions = setsPerRegion(rows)
  const muscles = setsPerMuscle(rows)
  const top = topExercises(rows)
  return (
    <>
      <Totals items={[['Workouts', sessionCount], ['Sets', rows.length], ['Volume', fmtTons(volumeTotal)]]} />

      {region === 'all' ? (
        <Section title="Sets per muscle group">
          <div className="flex items-center gap-4">
            <Donut
              centerLabel="sets"
              data={regions.map(r => ({ key: r.key, label: r.label, value: r.sets, color: REGION_COLORS[r.key] }))}
            />
            <ul className="flex-1 space-y-1.5 text-sm">
              {regions.map(r => (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: REGION_COLORS[r.key] }} />
                  <span className="flex-1">{r.label}</span>
                  <span className="tabular-nums">{r.sets}</span>
                  <span className="tabular-nums text-secondary w-9 text-right">
                    {Math.round((r.sets / rows.length) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-5">
            <BarList data={muscles.map(m => ({ key: m.key, label: MUSCLE_LABELS[m.key] || m.key, value: m.sets }))} />
          </div>
        </Section>
      ) : muscles.length > 1 && (
        <Section title="Sets per muscle">
          <BarList data={muscles.map(m => ({ key: m.key, label: MUSCLE_LABELS[m.key] || m.key, value: m.sets }))} />
        </Section>
      )}

      <Section title="Most trained exercises">
        <BarList data={top.map(e => ({ key: e.id, label: e.name, value: e.sets }))} valueSuffix=" sets" />
      </Section>

      <WeeklyCharts sets={sets} volume={volume} />
    </>
  )
}

function ExerciseStats({ rows, exerciseId, sessionCount, volumeTotal, volume }) {
  const progression = exerciseProgression(rows, exerciseId)
  const best = progression.reduce((b, p) => (!b || p.weight > b.weight || (p.weight === b.weight && p.reps > b.reps) ? p : b), null)
  const recent = recentSessions(rows, exerciseId)
  return (
    <>
      <Totals items={[
        ['Sessions', sessionCount],
        ['Sets', rows.length],
        ['Best set', best ? `${Number(best.weight.toFixed(2))}×${best.reps}` : '–']
      ]} />

      <Section title="Weight progression">
        {progression.length < 2 ? (
          <p className="text-sm text-secondary">Log this exercise at least twice to see a trend.</p>
        ) : (
          <LineChart
            points={progression.map(p => ({ t: p.t, y: p.weight, reps: p.reps, e1rm: p.e1rm }))}
            format={p => `${p.y} kg × ${p.reps} · est. 1RM ${Math.round(p.e1rm)} kg`}
          />
        )}
      </Section>

      <WeeklyCharts volume={volume} />

      <Section title="Recent sessions">
        <ul className="space-y-3 text-sm">
          {recent.map(s => (
            <li key={s.t} className="flex gap-4">
              <span className="w-16 shrink-0 text-secondary">
                {new Date(s.t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
              </span>
              <span className="flex-1 tabular-nums">
                {s.sets.map(x => `${fmtKg(x.weight)} × ${x.reps}`).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-secondary mt-4">Total volume {fmtTons(volumeTotal)}</p>
      </Section>
    </>
  )
}
