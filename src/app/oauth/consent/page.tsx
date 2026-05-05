import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  generateAuthorizationCode,
  CODE_TTL_SECONDS,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

interface SP {
  client_id?: string;
  client_name?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
}

export default async function ConsentPage(props: {
  searchParams: Promise<SP>;
}) {
  const sp = await props.searchParams;
  const {
    client_id,
    client_name = "an unknown client",
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scope = "mcp.full",
    state,
  } = sp;

  if (
    !client_id ||
    !redirect_uri ||
    !code_challenge ||
    code_challenge_method !== "S256"
  ) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <h1 className="text-xl font-semibold text-foreground">
          Invalid OAuth request
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          The MCP client sent missing or invalid parameters. Close this tab
          and try connecting again.
        </p>
      </div>
    );
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = `/oauth/consent?${new URLSearchParams(sp as Record<string, string>).toString()}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  async function approve(formData: FormData) {
    "use server";
    const sb = await createServerSupabase();
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) throw new Error("not signed in");

    const code = generateAuthorizationCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

    const service = createServiceSupabase();
    const { error } = await service.from("mcp_oauth_codes").insert({
      code,
      client_id: String(formData.get("client_id")),
      user_id: u.id,
      redirect_uri: String(formData.get("redirect_uri")),
      code_challenge: String(formData.get("code_challenge")),
      code_challenge_method: "S256",
      scope: String(formData.get("scope") ?? "mcp.full"),
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    const cb = new URL(String(formData.get("redirect_uri")));
    cb.searchParams.set("code", code);
    const st = formData.get("state");
    if (st) cb.searchParams.set("state", String(st));
    redirect(cb.toString());
  }

  async function deny(formData: FormData) {
    "use server";
    const cb = new URL(String(formData.get("redirect_uri")));
    cb.searchParams.set("error", "access_denied");
    cb.searchParams.set(
      "error_description",
      "The user denied the authorization request",
    );
    const st = formData.get("state");
    if (st) cb.searchParams.set("state", String(st));
    redirect(cb.toString());
  }

  let displayHost = redirect_uri;
  try {
    displayHost = new URL(redirect_uri).host;
  } catch {
    // keep raw
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-xl font-semibold text-foreground">
        Authorize MCP access
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        <span className="font-medium text-foreground">{client_name}</span>{" "}
        wants to access your vibefin account on your behalf.
      </p>
      <div className="card mt-4">
        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Signed in as
            </div>
            <div className="text-foreground">{user!.email}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Redirect target
            </div>
            <div className="text-foreground font-mono text-xs">{displayHost}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Scope
            </div>
            <div className="text-foreground">{scope}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Manage your watchlists, portfolios, holdings, sells, and read
              market data. See the{" "}
              <Link href="/mcp" className="underline">
                full tool list
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <form className="mt-4 flex gap-2">
        <input type="hidden" name="client_id" value={client_id} />
        <input type="hidden" name="redirect_uri" value={redirect_uri} />
        <input type="hidden" name="code_challenge" value={code_challenge} />
        <input type="hidden" name="scope" value={scope} />
        {state ? <input type="hidden" name="state" value={state} /> : null}

        <button
          formAction={approve}
          className="flex-1 px-4 py-2 rounded-lg bg-primary/20 border border-primary/50 text-foreground hover:bg-primary/30 text-sm"
        >
          Approve
        </button>
        <button
          formAction={deny}
          className="flex-1 px-4 py-2 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground hover:border-red-400/40 text-sm"
        >
          Deny
        </button>
      </form>

      <p className="text-[10px] text-muted-foreground mt-4">
        You can revoke this access any time at{" "}
        <Link href="/settings" className="underline">
          /settings
        </Link>
        .
      </p>
    </div>
  );
}
