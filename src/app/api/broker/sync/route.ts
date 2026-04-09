import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// IBKR Flex Query Web Service endpoints
const FLEX_SEND = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest";
const FLEX_GET = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement";

export const maxDuration = 30;

interface NormalizedPosition {
  symbol: string;
  shares: number;
  avg_cost: number;
  currency: string;
}

// ── IBKR Flex Query ────────────────────────────────────────────

async function fetchIBKRPositions(flexToken: string, flexQueryId: string): Promise<NormalizedPosition[]> {
  // Step 1: Request the statement
  const sendUrl = `${FLEX_SEND}?t=${flexToken}&q=${flexQueryId}&v=3`;
  const sendRes = await fetch(sendUrl);
  const sendXml = await sendRes.text();

  const refMatch = sendXml.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
  if (!refMatch) {
    const errMatch = sendXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    throw new Error(errMatch?.[1] || `IBKR Flex request failed: ${sendXml.slice(0, 200)}`);
  }
  const referenceCode = refMatch[1];

  // Step 2: Poll for the statement
  let xml = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const getUrl = `${FLEX_GET}?t=${flexToken}&q=${referenceCode}&v=3`;
    const getRes = await fetch(getUrl);
    xml = await getRes.text();

    if (xml.includes("<FlexStatements") || xml.includes("<OpenPosition")) break;
    if (xml.includes("Statement is being generated")) continue;

    const errMatch = xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    if (errMatch) throw new Error(errMatch[1]);
  }

  if (!xml.includes("<OpenPosition")) return [];

  // Step 3: Parse positions from XML
  const positions: NormalizedPosition[] = [];
  const posRegex = /<OpenPosition\s[^>]*?>/g;
  let match;

  while ((match = posRegex.exec(xml)) !== null) {
    const tag = match[0];
    const attr = (name: string) => {
      const m = tag.match(new RegExp(`${name}="([^"]*)"`));
      return m?.[1] || "";
    };

    if (attr("assetCategory") !== "STK") continue;
    const shares = parseFloat(attr("position")) || 0;
    if (shares === 0) continue;

    positions.push({
      symbol: attr("symbol"),
      shares,
      avg_cost: parseFloat(attr("costBasisPrice")) || 0,
      currency: attr("currency") || "USD",
    });
  }

  return positions;
}

// ── Moomoo CSV Parser ──────────────────────────────────────────

function parseMoomooCSV(csvText: string): NormalizedPosition[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const colMap = {
    symbol: header.findIndex((h) => h === "symbol" || h === "code" || h === "ticker"),
    shares: header.findIndex((h) => h === "qty" || h === "quantity" || h === "shares" || h === "position"),
    avg_cost: header.findIndex((h) => h.includes("cost") || h.includes("avg") || h === "cost price"),
    currency: header.findIndex((h) => h === "currency" || h === "ccy"),
  };

  if (colMap.symbol === -1 || colMap.shares === -1) {
    throw new Error("CSV missing required columns: symbol/code and qty/shares");
  }

  const positions: NormalizedPosition[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/['"]/g, ""));
    if (cols.length <= colMap.symbol) continue;

    let symbol = cols[colMap.symbol];
    if (symbol.includes(".")) symbol = symbol.split(".").pop() || symbol;
    symbol = symbol.toUpperCase();
    if (!symbol) continue;

    const shares = parseFloat(cols[colMap.shares]) || 0;
    if (shares === 0) continue;

    positions.push({
      symbol,
      shares,
      avg_cost: colMap.avg_cost >= 0 ? parseFloat(cols[colMap.avg_cost]) || 0 : 0,
      currency: colMap.currency >= 0 ? cols[colMap.currency] || "USD" : "USD",
    });
  }

  return positions;
}

// ── POST /api/broker/sync ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, csv_data } = body;

    if (!connection_id) {
      return NextResponse.json({ error: "Missing connection_id" }, { status: 400 });
    }

    // Fetch connection (RLS ensures user owns it)
    const { data: conn, error: connErr } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("id", connection_id)
      .single();

    if (connErr || !conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Mark as syncing
    await supabase
      .from("broker_connections")
      .update({ last_sync_status: "syncing", last_sync_error: null })
      .eq("id", connection_id);

    let positions: NormalizedPosition[];

    if (conn.broker === "ibkr") {
      if (!conn.flex_token || !conn.flex_query_id) {
        return NextResponse.json({ error: "IBKR Flex Token and Query ID required" }, { status: 400 });
      }
      positions = await fetchIBKRPositions(conn.flex_token, conn.flex_query_id);
    } else if (conn.broker === "moomoo") {
      if (!csv_data) {
        return NextResponse.json({ error: "CSV data required for Moomoo sync" }, { status: 400 });
      }
      positions = parseMoomooCSV(csv_data);
    } else {
      return NextResponse.json({ error: `Unknown broker: ${conn.broker}` }, { status: 400 });
    }

    // Get existing synced holdings for this connection
    const { data: existing } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("portfolio_id", conn.portfolio_id)
      .eq("broker_connection_id", connection_id);

    const existingByTicker: Record<string, any> = {};
    for (const row of existing || []) {
      existingByTicker[row.ticker] = row;
    }

    let added = 0, updated = 0, removed = 0;
    const brokerTickers = new Set<string>();

    for (const pos of positions) {
      const ticker = pos.symbol.toUpperCase();
      brokerTickers.add(ticker);

      // Ensure ticker in stock_catalog
      const { data: cat } = await supabase
        .from("stock_catalog")
        .select("id")
        .eq("ticker", ticker)
        .single();

      if (!cat) {
        await supabase.from("stock_catalog").insert({
          ticker,
          enrichment_status: "pending",
        });
      }

      const now = new Date().toISOString().split("T")[0];

      if (existingByTicker[ticker]) {
        const row = existingByTicker[ticker];
        if (row.shares !== pos.shares || Math.abs(row.cost_basis - pos.avg_cost) > 0.01) {
          await supabase
            .from("portfolio_holdings")
            .update({
              shares: pos.shares,
              cost_basis: pos.avg_cost,
              notes: `Synced from ${conn.broker} on ${now}`,
            })
            .eq("id", row.id);
          updated++;
        }
      } else {
        await supabase.from("portfolio_holdings").insert({
          user_id: user.id,
          portfolio_id: conn.portfolio_id,
          ticker,
          shares: pos.shares,
          cost_basis: pos.avg_cost,
          source: conn.broker,
          broker_connection_id: connection_id,
          notes: `Synced from ${conn.broker} on ${now}`,
        });
        added++;
      }
    }

    // Remove positions no longer in broker
    for (const [ticker, row] of Object.entries(existingByTicker)) {
      if (!brokerTickers.has(ticker)) {
        await supabase.from("portfolio_holdings").delete().eq("id", row.id);
        removed++;
      }
    }

    // Update connection status
    await supabase
      .from("broker_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
        sync_count: (conn.sync_count || 0) + 1,
      })
      .eq("id", connection_id);

    return NextResponse.json({ status: "success", synced: positions.length, added, updated, removed });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message }, { status: 500 });
  }
}
