import { useMemo, useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { normalizeName } from '../../program/schema'
import {
  RANGES, REGIONS, REGION_LABELS, filterByRange, setRows, setsPerRegion,
  setsPerMuscle, topExercises, exerciseProgression, weeklyVolume
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
    <section className="glass-card p-5 mt-4">
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
  const [exerciseId, setExerciseId] = useState(null)
  const [volumeRegion, setVolumeRegion] = useState('all')

  const identify = useMemo(() => makeIdentify(catalog, program), [catalog, program])
  const rows = useMemo(
    () => setRows(filterByRange(workouts, range), identify),
    [workouts, range, identify]
  )

  const regions = setsPerRegion(rows)
  const muscles = setsPerMuscle(rows)
  const top = topExercises(rows)
  const exerciseOptions = topExercises(rows, 50)

  useEffect(() => {
    if (exerciseOptions.length && !exerciseOptions.some(e => e.id === exerciseId)) {
      setExerciseId(exerciseOptions[0].id)
    }
  }, [exerciseOptions, exerciseId])

  const progression = exerciseId ? exerciseProgression(rows, exerciseId) : []
  const volume = weeklyVolume(rows, volumeRegion === 'all' ? null : volumeRegion)
  const workoutCount = filterByRange(workouts, range).length

  return (
    <div className="pb-10">
      <Segmented options={RANGES} value={range} onChange={setRange} />

      {rows.length === 0 ? (
        <p className="text-secondary text-sm py-8">No completed sets in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 pt-4">
            {[
              ['Workouts', workoutCount],
              ['Sets', rows.length],
              ['Volume', `${Math.round(rows.reduce((s, r) => s + r.weight * r.reps, 0) / 1000)}t`]
            ].map(([label, value]) => (
              <div key={label} className="glass-tile p-3">
                <div className="text-xs text-secondary">{label}</div>
                <div className="text-xl font-bold tabular-nums">{value}</div>
              </div>
            ))}
          </div>

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

          <Section title="Most trained exercises">
            <BarList data={top.map(e => ({ key: e.id, label: e.name, value: e.sets }))} valueSuffix=" sets" />
          </Section>

          <Section title="Weight progression">
            <select
              value={exerciseId || ''}
              onChange={e => setExerciseId(e.target.value)}
              className="btn-glass w-full mb-3 px-4 py-2.5 text-sm appearance-none"
            >
              {exerciseOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {progression.length < 2 ? (
              <p className="text-sm text-secondary">Log this exercise at least twice to see a trend.</p>
            ) : (
              <LineChart
                points={progression.map(p => ({ t: p.t, y: p.weight, reps: p.reps, e1rm: p.e1rm }))}
                format={p => `${p.y} kg × ${p.reps} · est. 1RM ${Math.round(p.e1rm)} kg`}
              />
            )}
          </Section>

          <Section title="Weekly volume (kg × reps)">
            <div className="mb-3">
              <Segmented
                options={[{ id: 'all', label: 'All' }, ...REGIONS.map(r => ({ id: r, label: REGION_LABELS[r] }))]}
                value={volumeRegion}
                onChange={setVolumeRegion}
              />
            </div>
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
      )}
    </div>
  )
}
