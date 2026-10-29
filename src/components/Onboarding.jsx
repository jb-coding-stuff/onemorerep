import { useState } from 'react'
import { db } from '../db/db'
import { activateInitialPack } from '../program/localProvider'

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)
    try {
      await activateInitialPack()

      // Mark onboarding as complete
      await db.settings.put({ key: 'onboardingComplete', value: true })
      onComplete()
    } catch (err) {
      console.error('Failed to complete onboarding:', err)
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        {step === 0 && (
          <div className="text-center space-y-8">
            <div>
              <h1 className="text-3xl font-bold">Your training.</h1>
              <p className="text-lg text-secondary mt-2">Nothing else.</p>
            </div>

            <button
              onClick={() => setStep(1)}
              className="btn-primary w-full py-3 font-medium transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="text-center space-y-8">
            <div>
              <h2 className="text-2xl font-bold">You're ready to go.</h2>
              <p className="text-secondary mt-2">Loading your training program...</p>
            </div>

            <button
              onClick={handleStart}
              disabled={loading}
              className="btn-primary w-full py-3 font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Setting up...' : "Let's go"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
