/**
 * Which session comes next, worked out from the synced workout history (so it
 * is the same on every device and doesn't depend on tapping Finish):
 * the most recent workout or skip that belongs to the current plan decides,
 * and the next session in plan order is suggested.
 *
 * @param {{label: string}[]} sessions - the current plan's sessions, in order
 * @param {Object<string, string>} lastDone - sessionLabel -> latest workout date (ISO)
 * @param {{label: string, at: string}|null} lastSkip - the most recent skip on this device
 * @returns {string|null}
 */
export function nextSessionLabel(sessions, lastDone, lastSkip) {
  if (!sessions?.length) return null
  let latest = null // { label, time }
  for (const s of sessions) {
    const t = Date.parse(lastDone?.[s.label] || '')
    if (t && (!latest || t > latest.time)) latest = { label: s.label, time: t }
  }
  const skipTime = Date.parse(lastSkip?.at || '')
  if (skipTime && sessions.some(s => s.label === lastSkip.label) && (!latest || skipTime > latest.time)) {
    latest = { label: lastSkip.label, time: skipTime }
  }
  if (!latest) return sessions[0].label
  const idx = sessions.findIndex(s => s.label === latest.label)
  return sessions[(idx + 1) % sessions.length].label
}
