"use client";

/**
 * YourBookCard — the book in one sentence, for the Today aside.
 *
 * The same reading the Book risk panel leads with, every portfolio
 * combined, plus one Chip per bet and a link to the evidence. Signed out it
 * keeps its place and says what signing in would show; with one holding it
 * says what a second would show.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import { useUser } from "@/lib/supabase/hooks";
import { useBookRisk } from "@/lib/useBookRisk";
import { fmtBets } from "@/components/portfolio/BookRiskPanel";

const CHIP_MAX = 6;

export function YourBookCard() {
  const t = useTranslations("dashboard");
  const tb = useTranslations("portfolio.bookRisk");
  const { data: user, isPending: userPending } = useUser();
  const book = useBookRisk({ kind: "all" }, !!user);
  const label = t("yourBook");
  const aside = (
    <Link href="/portfolio#book-risk" className="inline-flex items-center gap-0.5 text-[11px] text-signal hover:underline">
      {t("yourBookOpen")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );

  if (userPending) return <PanelPending label={label} text={t("loadingGeneric")} />;
  if (!user) {
    return (
      <PanelUnavailable
        label={label}
        reason={t("yourBookSignedOut")}
        aside={<Link href="/login" className="text-signal hover:underline">{t("watchlistSignInCta")}</Link>}
      />
    );
  }
  if (book.status === "pending") return <PanelPending label={label} text={tb("pending")} />;
  if (book.status === "empty" || !book.risk) {
    return (
      <PanelUnavailable
        label={label}
        reason={book.names === 0 ? tb("needHoldings") : tb("needTwo")}
        aside={<Link href="/portfolio" className="text-signal hover:underline">{t("yourBookAdd")}</Link>}
      />
    );
  }

  const r = book.risk;
  const pct = r.largest ? Math.round(r.largest.weight * 100) : 0;
  const members = r.largest ? r.largest.members.slice(0, 3).join(", ") : "";
  const independent = r.effectiveBets >= r.names * 0.85;
  const lead = independent
    ? tb("leadIndependent", { names: r.names, pct, members })
    : tb("lead", { bets: fmtBets(r.effectiveBets), names: r.names, pct, members });

  return (
    <Panel label={label} qualifier={t("yourBookQualifier", { names: r.names })} aside={aside} reading={t("yourBookReading")}>
      <p className="text-sm leading-relaxed text-foreground">{lead}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.clusters.slice(0, CHIP_MAX).map((c) => (
          <Chip key={c.id} tone={c.id === 0 ? "signal" : "plain"}>
            <span className="font-mono">
              {c.members[0]}
              {c.members.length > 1 && <span className="opacity-70"> +{c.members.length - 1}</span>}
              <span className="opacity-70"> · {(c.weight * 100).toFixed(0)}%</span>
            </span>
          </Chip>
        ))}
        {r.clusters.length > CHIP_MAX && <Chip tone="plain">{tb("moreBets", { count: r.clusters.length - CHIP_MAX })}</Chip>}
      </div>
    </Panel>
  );
}
