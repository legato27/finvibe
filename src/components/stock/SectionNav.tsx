"use client";

/**
 * In-page section links for the stock page. Replaces the tab bar: the
 * sections are all on the page, this just gets the reader to one of them.
 * Links, not tabs, so middle-click and the URL hash keep working.
 */
import { useEffect, useState } from "react";

export type SectionLink = { id: string; label: string };

export function SectionNav({ sections, ariaLabel }: { sections: SectionLink[]; ariaLabel: string }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav aria-label={ariaLabel} className="sticky top-[58px] z-30 -mx-1 flex gap-1 overflow-x-auto bg-background/85 px-1 py-2 backdrop-blur [scrollbar-width:none]">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? "location" : undefined}
          className={`whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11.5px] transition-colors ${
            active === s.id ? "border-signal bg-signal-bg text-signal" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
