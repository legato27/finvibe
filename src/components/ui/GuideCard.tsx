"use client";

/**
 * GuideCard — collapsible in-context "how to use this" walkthrough.
 * Default-collapsed so it never crowds the data; steps are numbered <ol>
 * groups so screen readers announce the sequence.
 */
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

export interface GuideSection {
  title: string;
  steps: string[];
  tone?: "long" | "short" | "plain";
}

const TONE_TITLE: Record<string, string> = {
  long: "text-signal-long",
  short: "text-signal-short",
  plain: "text-foreground",
};

export default function GuideCard({
  title,
  intro,
  sections,
  footnote,
}: {
  title: string;
  intro?: string;
  sections: GuideSection[];
  footnote?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={title} className="card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {intro && <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sections.map((s) => (
              <div key={s.title} className="rounded-lg border border-border/60 p-3">
                <h3 className={`mb-2 text-sm font-semibold ${TONE_TITLE[s.tone ?? "plain"]}`}>
                  {s.title}
                </h3>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
        </div>
      )}
    </section>
  );
}
