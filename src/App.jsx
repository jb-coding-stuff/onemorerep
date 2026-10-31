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
import { supabase } from './db/supabase'
import { setCurrentUser, claimLocalData } from './db/auth'
import AuthScreen from './components/AuthScreen'
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

/**
 * Shows the sign-in screen until there is a session. Supabase keeps the
 * session on the device and refreshes it, so this is a one-time step.
 */
function AuthGate({ children }) {
  const [userId, setUserId] = useState(undefined) // undefined = checking

  useEffect(() => {
    let current // undefined until the first answer
    async function apply(session) {
      const user = session?.user || null
      if ((user?.id ?? null) === current) return
      current = user?.id ?? null
      setCurrentUser(user)
      if (user && (await claimLocalData(user.id))) {
        // Another account's data was cleared; start fresh.
        window.location.reload()
        return
      }
      setUserId(current)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    // Don't call Supabase inside this callback (it can deadlock the client).
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => apply(session), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (userId === undefined) return <div className="w-full h-full" />
  if (!userId) return <AuthScreen />
  return children
}

export default function App() {
  return (
    <SettingsProvider>
      <RestTimerProvider>
        <AuthGate>
          <AppContent />
        </AuthGate>
      </RestTimerProvider>
    </SettingsProvider>
  )
}
