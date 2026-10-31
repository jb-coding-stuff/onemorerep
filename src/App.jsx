import { useEffect, useState } from 'react'
import { db } from './db/db'
import { SettingsProvider } from './contexts/SettingsContext'
import { RestTimerProvider } from './contexts/RestTimerContext'
import { useSettings } from './contexts/SettingsContext'
import HomeScreen from './components/HomeScreen'
import TodayTab from './components/today/TodayTab'
import HistoryTab from './components/history/HistoryTab'
import MeTab from './components/me/MeTab'
import RestTimerBar from './components/RestTimerBar'
import { restoreFromSupabase } from './db/sync'
import { syncWorkouts } from './db/workoutSync'
import { migrateLegacyCustomExercises } from './db/exerciseCatalog'
import { ensureProgramSystem, syncPacksFromRemote, activateInitialPack } from './program/localProvider'

function AppContent() {
  const [activeTab, setActiveTab] = useState(null) // null means home screen
  const [ready, setReady] = useState(false)
  const { loaded } = useSettings()

  useEffect(() => {
    async function restoreIfEmpty() {
      const [workoutCount, programCount] = await Promise.all([
        db.workoutLog.count(),
        db.program.count()
      ])
      if (workoutCount === 0 && programCount === 0) {
        await restoreFromSupabase()
      }
    }

    // First launch (or after a reset): load the plan published in Supabase,
    // or the built-in default, without asking.
    async function ensurePlan() {
      if ((await db.program.count()) === 0) await activateInitialPack()
    }

    restoreIfEmpty()
      .then(ensureProgramSystem)
      .then(ensurePlan)
      .then(migrateLegacyCustomExercises)
      .catch((err) => console.error('Startup chain failed:', err))
      .finally(() => setReady(true))
      // Pull any remotely-published packs (e.g. from the MCP server) after the
      // app has rendered; syncPacksFromRemote never throws.
      .then(() => syncPacksFromRemote())
      .then(() => syncWorkouts())
  }, [])

  // Retry uploads and pull other devices' workouts when the app comes back
  // to the foreground or the connection returns.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') syncWorkouts() }
    window.addEventListener('online', syncWorkouts)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', syncWorkouts)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!loaded || !ready) {
    return <div className="w-full h-full" />
  }

  return (
    // Scroll area starts below the status bar / Dynamic Island so content never
    // scrolls under it (iOS blurs that region in standalone mode).
    <div className="flex flex-col h-full w-full" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <main className="flex-1 overflow-y-auto">
        {activeTab === null && <HomeScreen onNavigate={setActiveTab} />}
        {activeTab === 'today' && <TodayTab onBack={() => setActiveTab(null)} />}
        {activeTab === 'history' && <HistoryTab onBack={() => setActiveTab(null)} onOpenWorkout={() => setActiveTab('today')} />}
        {activeTab === 'me' && <MeTab onBack={() => setActiveTab(null)} />}
      </main>
      <RestTimerBar />
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <RestTimerProvider>
        <AppContent />
      </RestTimerProvider>
    </SettingsProvider>
  )
}
