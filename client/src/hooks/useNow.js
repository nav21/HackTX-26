import { useEffect, useState } from "react"

/** Current time, re-rendering every `intervalMs` (for "4 min ago" and online/offline). */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
