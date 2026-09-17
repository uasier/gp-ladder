import { parseAnalysis, type AnalysisBlock, type InlineSpan } from "../analysisView"

function Inline({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.t === "strong" ? <strong key={i}>{span.v}</strong> : <span key={i}>{span.v}</span>,
      )}
    </>
  )
}

function BlockView({ block }: { block: AnalysisBlock }) {
  if (block.type === "lead") {
    return (
      <section className="an-lead">
        <div className="an-kicker">短线结论</div>
        <p>
          <Inline spans={block.text} />
        </p>
      </section>
    )
  }
  if (block.type === "focus") {
    if (block.items.length === 0) return null
    return (
      <section className="an-focus">
        <div className="an-kicker">操作要点</div>
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline spans={item} />
            </li>
          ))}
        </ol>
      </section>
    )
  }
  if (block.type === "plan") {
    if (block.items.length === 0) return null
    return (
      <section className="an-plan">
        <div className="an-kicker">操作计划</div>
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline spans={item} />
            </li>
          ))}
        </ul>
      </section>
    )
  }
  if (block.type === "h") {
    return <h3 className="an-h">{block.text}</h3>
  }
  if (block.type === "p") {
    return (
      <p className="an-p">
        <Inline spans={block.text} />
      </p>
    )
  }
  if (block.type === "item") {
    return (
      <div className="an-item">
        {block.index ? <span className="an-idx">{block.index}</span> : <span className="an-dot" />}
        <div>
          {block.title ? <div className="an-item-title">{block.title}</div> : null}
          <div className="an-item-text">
            <Inline spans={block.text} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <section className="an-risk">
      <div className="an-kicker">短线风险</div>
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline spans={item} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AnalysisArticle({ text }: { text: string }) {
  const blocks = parseAnalysis(text)
  if (blocks.length === 0) {
    return <p className="an-p">没有返回分析内容</p>
  }
  return (
    <article className="an-article">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </article>
  )
}
