"use client";
import { useTranslations } from "next-intl";

/* ── Terminal-style live market pulse for the public landing hero.
     Renders REAL data from /api/macro/dashboard when available; falls back to
     a clearly-badged static sample so the design never breaks. ── */

interface TerminalProps {
  data: any | undefined;
}

const SAMPLE = {
  regime: { state: "Expansion", prob: 0.78 },
  vix: { current: 14.3, change_pct: -2.1, desc: "Calm — risk-on" },
  breadth: { above50: 68.0, advDec: 2.1, signal: "broad_strength" },
  swarm: { score: 38, type: "White" },
};

function regimeTone(state: string) {
  if (state === "Expansion") return "text-signal-long";
  if (state === "Contraction") return "text-signal-short";
  return "text-signal-caution";
}
function vixTone(v: number) {
  if (v < 20) return "text-signal-long";
  if (v <= 30) return "text-signal-caution";
  return "text-signal-short";
}
function breadthTone(signal: string | undefined, above50: number) {
  // Match the backend breadth.signal enum first; fall back to the numeric
  // %-above-50dma when the signal string is absent/unknown.
  if (signal === "broad_weakness") return "text-signal-short";
  if (signal === "broad_strength") return "text-signal-long";
  if (signal === "narrowing") return "text-signal-caution";
  if (above50 < 40) return "text-signal-short";
  if (above50 >= 60) return "text-signal-long";
  return "text-signal-caution";
}
function swarmTone(type: string) {
  // Backend swarm.signal_type enum: White = risk-on, Black = risk-off,
  // Gray/Neutral = caution. (Matches SwarmIndicator.)
  if (type === "White") return "text-signal-long";
  if (type === "Black") return "text-signal-short";
  return "text-signal-caution";
}

// Static map so Tailwind's JIT sees every class name in source.
const BAR_CLASS: Record<string, string> = {
  "text-signal-long": "bg-signal-long",
  "text-signal-short": "bg-signal-short",
  "text-signal-caution": "bg-signal-caution",
};

function Row({
  label,
  value,
  tone,
  detail,
  delay,
  bar,
}: {
  label: string;
  value: string;
  tone: string;
  detail: string;
  delay: number;
  bar?: number | null;
}) {
  return (
    <div className="term-line grid grid-cols-[5.5rem_1fr] gap-2 items-baseline" style={{ animationDelay: `${delay}ms` }}>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-mono text-sm font-semibold ${tone}`}>{value}</span>
          {bar != null && (
            <span className="inline-flex h-1.5 w-16 rounded-full bg-muted overflow-hidden self-center" aria-hidden>
              <span className={`h-full rounded-full ${BAR_CLASS[tone] || "bg-primary"}`} style={{ width: `${Math.round(bar * 100)}%` }} />
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{detail}</div>
      </div>
    </div>
  );
}

export function LiveTerminal({ data }: TerminalProps) {
  const t = useTranslations("landingExtended");

  const bc = data?.business_cycle;
  const vix = data?.vix;
  const breadth = data?.breadth;
  const swarm = data?.swarm;
  const live = Boolean(bc?.state || vix?.current || breadth?.pct_above_50dma || swarm?.swarm_score);

  const regimeState: string = bc?.state || SAMPLE.regime.state;
  const regimeProb: number = bc?.probabilities?.[regimeState] ?? SAMPLE.regime.prob;
  const vixVal: number = vix?.current ?? SAMPLE.vix.current;
  const vixChg: number = vix?.change_pct ?? SAMPLE.vix.change_pct;
  const vixDesc: string = vix?.zone_description || SAMPLE.vix.desc;
  const above50: number = breadth?.pct_above_50dma ?? SAMPLE.breadth.above50;
  const advDec: number = breadth?.adv_dec_ratio ?? SAMPLE.breadth.advDec;
  const breadthSignal: string | undefined = breadth?.signal || SAMPLE.breadth.signal;
  const swarmScore: number = swarm?.swarm_score ?? SAMPLE.swarm.score;
  const swarmType: string = swarm?.signal_type || SAMPLE.swarm.type;

  const updated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border border-border bg-card/90 backdrop-blur shadow-2xl shadow-primary/10 overflow-hidden">
      {/* Chrome bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/70 bg-muted/40">
        <span className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--danger))]/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning))]/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]/70" />
        </span>
        <span className="flex-1 text-center font-mono text-[11px] text-muted-foreground truncate">
          vibefin · market pulse
        </span>
        <span
          className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
            live
              ? "text-signal-long border-green-500/40 bg-green-500/10"
              : "text-muted-foreground border-border bg-muted/40"
          }`}
        >
          {live ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" aria-hidden />
              {t("liveBadge")}
            </span>
          ) : (
            t("sampleBadge")
          )}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 sm:px-5 py-4 space-y-3.5">
        <div className="term-line font-mono text-[11px] text-muted-foreground" style={{ animationDelay: "0ms" }}>
          <span className="text-primary">$</span> vibefin pulse --today
        </div>

        <Row
          label={t("statRegime")}
          value={regimeState}
          tone={regimeTone(regimeState)}
          detail={`P ${(regimeProb * 100).toFixed(0)}%`}
          bar={regimeProb}
          delay={120}
        />
        <Row
          label="VIX"
          value={`${vixVal.toFixed(2)} ${vixChg <= 0 ? "▼" : "▲"} ${Math.abs(vixChg).toFixed(1)}%`}
          tone={vixTone(vixVal)}
          detail={vixDesc}
          delay={240}
        />
        <Row
          label={t("statBreadth")}
          value={`${above50.toFixed(1)}% ${t("above50dma")}`}
          tone={breadthTone(breadthSignal, above50)}
          detail={`adv/dec ${advDec.toFixed(1)}`}
          delay={360}
        />
        <Row
          label={t("statCrowd")}
          value={`${swarmScore.toFixed(0)} · ${swarmType}`}
          tone={swarmTone(swarmType)}
          detail={swarm?.signal_description?.split("—")[0]?.trim() || t("statCrowdDetail")}
          delay={480}
        />

        <div className="term-line font-mono text-[11px] text-muted-foreground pt-1" style={{ animationDelay: "620ms" }}>
          <span className="text-primary">$</span> {t("terminalUpdated", { time: updated })} — {t("terminalHint")}
          <span className="term-cursor inline-block w-[7px] h-[13px] ml-1 align-middle bg-primary/80" aria-hidden />
        </div>
      </div>
    </div>
  );
}
