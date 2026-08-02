import { useEffect, useRef } from 'react'

/** Keep the screen awake while the timer is running, where supported. */
export function useWakeLock(active) {
  const lockRef = useRef(null)

  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined
    let cancelled = false

    const acquire = async () => {
      try {
        lockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Denied or unsupported — the timer still works, the screen may dim.
      }
    }

    const release = () => {
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active && !cancelled) acquire()
    }

    if (active) acquire()
    else release()

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active])
}
