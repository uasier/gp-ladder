import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react"

export const LONG_PRESS_MS = 480
const MOVE_CANCEL_PX = 14

type Point = { x: number; y: number }

function clearTimer(timer: { current: number | null }) {
  if (timer.current != null) {
    window.clearTimeout(timer.current)
    timer.current = null
  }
}

/** 卡片/行上的长按：手机代替右键，桌面仍可用右键菜单。 */
export function useLongPress(onLongPress: (x: number, y: number) => void, ms = LONG_PRESS_MS) {
  const timer = useRef<number | null>(null)
  const consumed = useRef(false)
  const start = useRef<Point>({ x: 0, y: 0 })
  const cb = useRef(onLongPress)
  cb.current = onLongPress

  useEffect(() => () => clearTimer(timer), [])

  const cancel = () => clearTimer(timer)

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      consumed.current = false
      start.current = { x: e.clientX, y: e.clientY }
      cancel()
      timer.current = window.setTimeout(() => {
        timer.current = null
        consumed.current = true
        cb.current(start.current.x, start.current.y)
      }, ms)
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (timer.current == null) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    consumeClick: (e: SyntheticEvent) => {
      if (!consumed.current) return false
      e.preventDefault()
      e.stopPropagation()
      consumed.current = false
      return true
    },
  }
}
