import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  generateAuthorizationCode,
  CODE_TTL_SECONDS,
} from "@/lib/mcp/oauth";
import { MCP_SCOPES, SCOPE_LABELS, toMcpScope } from "@/lib/mcp/catalog";

export const dynamic = "force-dynamic";

interface SP {
  client_id?: string;
  client_name?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

export default async function ConsentPage(props: {
  searchParams: Promise<SP>;
}) {
  const t = await getTranslations("settings");
  const sp = await props.searchParams;
  const {
    client_id,
    client_name,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
    resource,
  } = sp;
  const displayClient = client_name || t("consent.unknownClient");

  if (
    !client_id ||
    !redirect_uri ||
    !code_challenge ||
    code_challenge_method !== "S256"
  ) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <h1 className="text-xl font-semibold text-foreground">
          {t("consent.invalidTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("consent.invalidBody")}
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
    const resourceVal = formData.get("resource");
    // The user picks the MCP scope on this screen; it is stored on the grant
    // (and propagated to the issued token) and enforced in registerTools().
    const grantedScope = toMcpScope(String(formData.get("mcp_scope") ?? "manage"));
    const { error } = await service.from("mcp_oauth_codes").insert({
      code,
      client_id: String(formData.get("client_id")),
      user_id: u.id,
      redirect_uri: String(formData.get("redirect_uri")),
      code_challenge: String(formData.get("code_challenge")),
      code_challenge_method: "S256",
      scope: grantedScope,
      resource: resourceVal ? String(resourceVal) : null,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    // RFC 9207: include `iss` so the client can verify the response came
    // from the expected authorization server. Some clients (Claude.ai
    // included) reject the callback if this is missing.
    const hdrs = await headers();
    const xfHost = hdrs.get("x-forwarded-host");
    const xfProto = hdrs.get("x-forwarded-proto") ?? "https";
    const host = xfHost ?? hdrs.get("host") ?? "fin.vibelife.sg";
    const issuer = `${xfProto}://${host}`;

    const cb = new URL(String(formData.get("redirect_uri")));
    cb.searchParams.set("code", code);
    cb.searchParams.set("iss", issuer);
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
        {t("consent.title")}
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        {t.rich("consent.subtitle", {
          client: () => (
            <span className="font-medium text-foreground">{displayClient}</span>
          ),
        })}
      </p>
      <div className="card mt-4">
        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("consent.signedInAs")}
            </div>
            <div className="text-foreground">{user!.email}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("consent.redirectTarget")}
            </div>
            <div className="text-foreground font-mono text-xs">{displayHost}</div>
          </div>
          <div>
            <label
              htmlFor="mcp_scope"
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {t("consent.scope")}
            </label>
            <select
              id="mcp_scope"
              name="mcp_scope"
              form="consent-form"
              defaultValue="manage"
              className="mt-1 w-full bg-background/50 border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              {MCP_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {t.rich("consent.scopeDesc", {
                link: (chunks) => (
                  <Link href="/mcp" className="underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
      </div>

      <form id="consent-form" className="mt-4 flex gap-2">
        <input type="hidden" name="client_id" value={client_id} />
        <input type="hidden" name="redirect_uri" value={redirect_uri} />
        <input type="hidden" name="code_challenge" value={code_challenge} />
        {state ? <input type="hidden" name="state" value={state} /> : null}
        {resource ? <input type="hidden" name="resource" value={resource} /> : null}

        <button
          formAction={approve}
          className="flex-1 px-4 py-2 rounded-lg bg-primary/20 border border-primary/50 text-foreground hover:bg-primary/30 text-sm"
        >
          {t("consent.approve")}
        </button>
        <button
          formAction={deny}
          className="flex-1 px-4 py-2 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground hover:border-red-400/40 text-sm"
        >
          {t("consent.deny")}
        </button>
      </form>

      <p className="text-[10px] text-muted-foreground mt-4">
        {t.rich("consent.revokeAnyTime", {
          link: (chunks) => (
            <Link href="/settings" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
