# The skin contract

Colour is declared in exactly two files. Everything else consumes semantic
names and knows nothing about lime.

| File | Role |
|---|---|
| `src/app/globals.css` | Every token, light in `:root`, dark in `.dark`. HSL triples so opacity modifiers work. |
| `src/components/heatmap/palette.ts` | Reads tokens at runtime for recharts, d3, canvas and inline SVG. `usePalette()` re-reads on theme change. |
| `tailwind.config.ts` | Maps tokens to Tailwind names. No literals. |

`node scripts/check-colors.mjs` runs before `next build` and fails on any hex,
`hsl()`/`rgb()`, arbitrary `bg-[...]` colour, or raw Tailwind palette class
(`text-green-600`) under `src/` outside those two files.

## Names

| Use | Class |
|---|---|
| Page, panel, chip surface, line | `bg-background` `bg-card` `bg-raised` / `bg-muted` `border-border` |
| Text | `text-foreground` `text-muted-foreground` `text-dim` (11px mono labels only) |
| Accent as **fill** (buttons, active nav) | `bg-primary text-primary-foreground` — lime with ink text in both themes |
| Accent as **text** (links, active labels) | `text-signal`, tint `bg-signal-bg` — lime in dark, olive in light |
| Up / long / positive | `signal-long` (+ `-bg`, `-strong`) |
| Down / short / negative | `signal-short` (+ `-bg`, `-strong`) |
| Amber: stale, watch | `signal-caution` (+ `-bg`) |
| Red: error, stand aside | `signal-break` (+ `-bg`) |
| Evidence disagrees | `signal-conflict` (+ `-bg`) |
| Informational, cyan | `protocol` (+ `-bg`) |
| Categorical chart series | `chart-1` … `chart-8`, or `pal.chart[i]` at runtime |

The lime rule: a filled accent always carries ink text and a button or pill
shape, and never sits directly beside a bare lime percentage.

## Type

`--font-sans` is Chivo (interface), `--font-mono` is JetBrains Mono (every
number, ticker, tool name and section label). Both are set once in
`src/app/layout.tsx`. Tabular figures via `.nums`.

## Primitives (`src/components/ui`)

`Panel` (label · qualifier / body / reading), `Stat` (label / figure /
subline), `Segmented` (the one tab and toggle control), `Chip` (filter or
tag pill), `VerdictBadge` (the one verdict pill), `Freshness` (the one
"how live is this" chip; `HeaderFreshness` is the header instance driven by
the staleness store), `DataTable` (the one table). A page that needs a new
visual asks for a new primitive rather than hand-rolling a section.

## Radius and shadow

`rounded-panel` (14px) for cards, `rounded-control` (10px) for controls,
`rounded-full` for pills, `shadow-float` for anything floating.
