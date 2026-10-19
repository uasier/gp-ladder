import { useEffect, useState } from "react"
import { formatTimeAgo, parseTimestamp } from "../time"

export function RelativeTime({ value }: { value: string | null }) {
  const [now, setNow] = useState(Date.now)
  const timestamp = parseTimestamp(value)

  useEffect(() => {
    if (timestamp === null) return
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 30_000)
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", update)
    }
  }, [timestamp])

  return (
    <time
      dateTime={timestamp === null ? undefined : new Date(timestamp).toISOString()}
      title={value || undefined}
    >
      {formatTimeAgo(value, now)}
    </time>
  )
}
