import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { CactusIcon } from "@/components/Doodle";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  isKnownClient,
  isAllowedRedirectUri,
  SCOPE_JOBS_WRITE,
  SUPPORTED_SCOPES,
  mcpResourceUrl,
} from "@/lib/mcp/oauth";
import { approveAuthorization } from "./actions";

type Params = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

// A failure here must never bounce back to redirect_uri, because at this point
// the redirect_uri itself is the thing that failed validation. Render the
// reason in place instead.
function Rejected({ reason }: { reason: string }) {
  return (
    <PhoneFrame>
      <div className="card d2">
        <div className="text-[16px] font-bold">can&apos;t authorize this</div>
        <div className="mt-2 text-[13.5px] text-[color:var(--muted)]">{reason}</div>
      </div>
    </PhoneFrame>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  // Middleware sends an unauthenticated visitor to /login first, so reaching
  // this page without a profile means the account exists but isn't allow-listed.
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (!isKnownClient(params.client_id)) {
    return <Rejected reason="unknown client id." />;
  }
  if (!isAllowedRedirectUri(params.redirect_uri)) {
    return <Rejected reason="that redirect target isn't on the allow-list." />;
  }
  if (params.response_type !== "code") {
    return <Rejected reason="only the authorization code flow is supported." />;
  }
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return <Rejected reason="a PKCE S256 challenge is required." />;
  }

  // An unrecognised scope is refused rather than quietly narrowed, so the
  // client is never handed a token that silently does less than it asked for.
  const requested = (params.scope ?? SCOPE_JOBS_WRITE).split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !SUPPORTED_SCOPES.includes(s));
  if (unknown.length > 0) {
    return <Rejected reason={`unsupported scope: ${unknown.join(", ")}.`} />;
  }

  return (
    <PhoneFrame>
      <div className="card d2">
        <div className="flex items-center gap-2">
          <CactusIcon size={26} />
          <div className="text-[17px] font-bold">connect Claude</div>
        </div>

        <div className="mt-3 text-[13.5px] text-[color:var(--muted)]">
          Claude wants to connect to Rayner OS as <strong>{profile.email}</strong>.
        </div>

        <div className="chips">
          <span className="chip hi">write job listings</span>
        </div>

        <div className="mt-3 text-[12px] text-[color:var(--muted)]">
          it will be able to add and update rows on your jobs board. it can&apos;t read your
          entries, tasks, or chat history.
        </div>

        <form action={approveAuthorization} className="mt-4 flex gap-2">
          <input type="hidden" name="client_id" value={params.client_id ?? ""} />
          <input type="hidden" name="redirect_uri" value={params.redirect_uri ?? ""} />
          <input type="hidden" name="scope" value={requested.join(" ")} />
          <input type="hidden" name="state" value={params.state ?? ""} />
          <input type="hidden" name="code_challenge" value={params.code_challenge} />
          <input type="hidden" name="resource" value={params.resource ?? mcpResourceUrl()} />
          <button type="submit" name="decision" value="allow" className="sticker-btn primary">
            allow
          </button>
          <button type="submit" name="decision" value="deny" className="sticker-btn">
            deny
          </button>
        </form>
      </div>
    </PhoneFrame>
  );
}
