import { ReactNode } from "react";

/**
 * Panel — the one card shape.
 *
 *   ┌ label · qualifier ─────────── aside ┐
 *   │ children                             │
 *   │ ── reading: a sentence saying what   │
 *   │    the numbers mean                  │
 *   └──────────────────────────────────────┘
 *
 * `label` is mono, uppercase, wide-tracked: the terminal signature. `reading`
 * is prose under the numbers; the current app keeps that in a separate guide
 * card, the skin puts it next to the data. A panel with no data keeps its
 * shape and uses `reading` to say why — it never returns null.
 */
export default function Panel({
  label,
  qualifier,
  aside,
  reading,
  tone = "plain",
  as: Tag = "section",
  className = "",
  bodyClassName = "",
  children,
}: {
  label?: ReactNode;
  qualifier?: ReactNode;
  /** Right-aligned content in the label row: a Freshness chip, a link, a toggle. */
  aside?: ReactNode;
  reading?: ReactNode;
  /** `signal` tints the border and ground; used for the lead panel only. */
  tone?: "plain" | "signal";
  as?: "section" | "div" | "article";
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const toneCls = tone === "signal" ? "border-signal/40 bg-signal-bg" : "";
  return (
    <Tag className={`card ${toneCls} ${className}`}>
      {(label || aside) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="card-title flex flex-wrap items-center gap-x-1.5">
            {label}
            {qualifier && (
              <span className="normal-case tracking-normal text-dim">· {qualifier}</span>
            )}
          </div>
          {aside && <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
      {reading && <p className="card-reading">{reading}</p>}
    </Tag>
  );
}

/** A panel that is still loading. Same shape as the real thing, so the page
 *  does not jump when the data lands. */
export function PanelPending({ label, text, className = "" }: { label: ReactNode; text: string; className?: string }) {
  return (
    <Panel label={label} className={className} as="div">
      <div role="status" className="animate-pulse py-6 text-center text-sm text-muted-foreground">{text}</div>
    </Panel>
  );
}

/** A panel whose data did not come back. It keeps its place and says why:
 *  a dashboard that silently drops cards changes shape from day to day. */
export function PanelUnavailable({
  label,
  reason,
  aside,
  className = "",
}: {
  label: ReactNode;
  reason: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Panel label={label} aside={aside} className={className} as="div" reading={reason}>
      <div className="nums font-mono text-3xl font-bold text-dim" aria-hidden="true">—</div>
    </Panel>
  );
}
