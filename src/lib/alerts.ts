/**
 * Telling someone the box is down.
 *
 * The staging tier's success is the problem this solves. Before it, an
 * outage announced itself — every page broke. Now the app keeps serving
 * from stored copies, which is the whole point and also means an outage can
 * run for hours with nothing but an amber banner to show for it. The 7h19m
 * one on 2026-08-25 was found by a person opening the app; that is not a
 * detection strategy.
 *
 * ── Where this runs, and why it has to be here ────────────────────────
 *
 * On Vercel, never on the box. The DGX host also runs n8n and the whole
 * docker compose stack, so anything hosted there is unavailable in exactly
 * the failure it would be reporting. An alerter that shares a fate with the
 * thing it watches is decoration.
 *
 * ── Channels ──────────────────────────────────────────────────────────
 *
 * Whichever of these is configured fires; both may be, neither is an error:
 *
 *   ALERT_WEBHOOK_URL                       JSON POST — Slack, Discord,
 *                                           n8n, PagerDuty, anything
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   push to a phone
 *
 * The webhook body carries `text` AND `content` with the same string, since
 * Slack reads the first and Discord the second — one payload, no per-vendor
 * branch, and the structured fields sit alongside for anything that wants
 * to parse rather than print.
 *
 * Nothing here ever throws. It runs on the failure path, inside `after()`,
 * behind a response the user has already been given.
 */

import { createServiceSupabase } from "@/lib/supabase/service";

const SEND_TIMEOUT_MS = 8_000;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fin.vibelife.sg";

export type AlertSource = "traffic" | "heartbeat";

type DownResult = {
  incident_id: number | null;
  is_new: boolean;
  should_notify: boolean;
};

type UpResult = {
  incident_id: number;
  started_at: string;
  duration_seconds: number;
  should_notify: boolean;
};

/**
 * Record that DGX is unreachable, and alert if this invocation is the one
 * that wins the right to.
 *
 * Returns whether an alert was actually sent, which is only interesting for
 * logs — the caller has nothing useful to do about it either way.
 */
export async function alertDgxDown(
  detail: string,
  path: string,
  source: AlertSource = "traffic",
): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("record_dgx_down", {
    p_detail: detail.slice(0, 500),
    p_path: path.slice(0, 300),
    p_source: source,
  });
  if (error) {
    console.error(`[alerts] record_dgx_down failed: ${error.message}`);
    return false;
  }

  const row = (Array.isArray(data) ? data[0] : data) as DownResult | undefined;
  if (!row?.should_notify || row.incident_id == null) return false;

  const sent = await send(
    `🔴 FinVibe: the analysis backend is unreachable`,
    [
      `First seen: ${new Date().toISOString()}`,
      `Failed request: ${path}`,
      `Error: ${detail.slice(0, 200)}`,
      `Detected by: ${source === "heartbeat" ? "scheduled probe" : "a real request"}`,
      ``,
      `The app is serving stored copies where it has them — check what is`,
      `covered at ${APP_URL}/settings/job-runs`,
    ].join("\n"),
  );

  // A claim taken but not delivered is worse than no claim: it tells every
  // later invocation that someone has this in hand. Give it back.
  if (!sent) {
    await supabase
      .rpc("release_dgx_notification", { p_incident_id: row.incident_id, p_resolved: false })
      .then(({ error: e }) => {
        if (e) console.error(`[alerts] could not release claim: ${e.message}`);
      });
  }
  return sent;
}

/** Close the open incident, if any, and send the all-clear. */
export async function alertDgxRecovered(): Promise<boolean> {
  const supabase = service();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("record_dgx_up", {});
  if (error) {
    console.error(`[alerts] record_dgx_up failed: ${error.message}`);
    return false;
  }

  const row = (Array.isArray(data) ? data[0] : data) as UpResult | undefined;
  if (!row?.should_notify || row.incident_id == null) return false;

  const sent = await send(
    `🟢 FinVibe: the analysis backend is answering again`,
    [
      `Down for ${humanDuration(row.duration_seconds)}.`,
      `Started: ${row.started_at}`,
      ``,
      `Live data is back. Any stale banners clear on the next poll.`,
    ].join("\n"),
  );

  if (!sent) {
    await supabase
      .rpc("release_dgx_notification", { p_incident_id: row.incident_id, p_resolved: true })
      .then(({ error: e }) => {
        if (e) console.error(`[alerts] could not release claim: ${e.message}`);
      });
  }
  return sent;
}

/**
 * Prove the channel works, on demand.
 *
 * Deliberately does not touch the incident table: a test that opened an
 * incident would either leave a fake outage on the record or teach you to
 * ignore the alert that follows it.
 */
export async function sendTestAlert(): Promise<boolean> {
  return send(
    "🔵 FinVibe: alert test",
    [
      "This is a test of the DGX outage alert, sent on request.",
      "",
      "If you are reading this, the channel works and a real outage will",
      "reach you the same way. No incident was recorded.",
    ].join("\n"),
  );
}

/**
 * Fan out to every configured channel. True if at least one delivered —
 * one channel working is enough for the message to have arrived, and
 * retrying because a second channel failed would double-send the first.
 */
async function send(title: string, body: string): Promise<boolean> {
  const text = `${title}\n\n${body}`;
  const targets: Array<Promise<boolean>> = [];

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook) targets.push(postJson(webhook, { text, content: text, title, body }));

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    targets.push(
      postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chat,
        text,
        disable_web_page_preview: true,
      }),
    );
  }

  if (!targets.length) {
    // Not an error — the incident is recorded either way and shows in the
    // app. But an alerting system nobody configured is worth saying out
    // loud, once, rather than looking like it worked.
    if (!warnedNoChannel) {
      warnedNoChannel = true;
      console.warn(
        "[alerts] no channel configured — set ALERT_WEBHOOK_URL or " +
          "TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID. Incident recorded only.",
      );
    }
    return false;
  }

  const results = await Promise.all(targets);
  return results.some(Boolean);
}

async function postJson(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[alerts] ${hostOf(url)} responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[alerts] ${hostOf(url)} send failed: ${(err as Error).message}`);
    return false;
  }
}

/** Host only — a Telegram URL carries the bot token in its path. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "alert target";
  }
}

function humanDuration(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} minutes`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

let warnedNoChannel = false;

function service() {
  try {
    return createServiceSupabase();
  } catch (err) {
    if (!warnedNoService) {
      warnedNoService = true;
      console.warn(`[alerts] disabled: ${(err as Error).message}`);
    }
    return null;
  }
}
let warnedNoService = false;
