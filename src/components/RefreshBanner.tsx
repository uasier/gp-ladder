type Props = {
  text: string
  tone: "busy" | "success" | "error" | null
  onDiagnose?: () => void
}

export function RefreshBanner({ text, tone, onDiagnose }: Props) {
  if (!text || !tone) return null
  return (
    <div className={`refresh-banner is-visible ${tone === "error" ? "is-error" : ""} ${tone === "success" ? "is-success" : ""}`} role="status">
      {tone === "busy" ? <span className="refresh-banner-spinner" aria-hidden="true" /> : null}
      <span className="refresh-banner-text">{text}</span>
      {tone === "error" && onDiagnose ? (
        <button type="button" className="btn refresh-banner-action" onClick={onDiagnose}>查看诊断</button>
      ) : null}
    </div>
  )
}
