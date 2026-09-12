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
