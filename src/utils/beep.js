let ctx = null

/**
 * iOS only lets Web Audio play after a user gesture created/resumed the
 * context, so call this from tap handlers. 'ambient' mixes with music or
 * podcasts instead of pausing them (it also respects the silent switch).
 */
export function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'ambient'
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!ctx) ctx = new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
  } catch (err) {
    console.error('Audio unlock failed', err)
  }
}

export function playRestOverBeep() {
  if (!ctx) return
  try {
    if (ctx.state !== 'running') ctx.resume()
    const start = ctx.currentTime + 0.05
    for (let i = 0; i < 3; i++) {
      const t = start + i * 0.25
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  } catch (err) {
    console.error('Beep failed', err)
  }
}
