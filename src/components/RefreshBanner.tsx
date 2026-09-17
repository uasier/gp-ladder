type Props = {
  text: string
  tone: "busy" | "success" | "error" | null
}

export function RefreshBanner({ text, tone }: Props) {
  if (!text || !tone) return null
  return (
    <div className={`refresh-banner is-visible ${tone === "error" ? "is-error" : ""} ${tone === "success" ? "is-success" : ""}`} role="status">
      {tone === "busy" ? <span className="refresh-banner-spinner" aria-hidden="true" /> : null}
      <span>{text}</span>
    </div>
  )
}
