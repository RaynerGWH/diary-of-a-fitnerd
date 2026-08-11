"use server";

import { redirect } from "next/navigation";
import { requireAllowedUser } from "@/lib/auth/require-user";
import {
  appOrigin,
  isAllowedRedirectUri,
  isKnownClient,
  issueAuthCode,
  SUPPORTED_SCOPES,
} from "@/lib/mcp/oauth";

// Every parameter is re-validated here rather than trusted from the hidden
// form fields. The page already checked them, but a form POST is its own HTTP
// entry point and anyone can craft one; the page's checks decide what to
// render, not what is safe to sign.
export async function approveAuthorization(formData: FormData) {
  const user = await requireAllowedUser();

  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const state = String(formData.get("state") ?? "");
  const codeChallenge = String(formData.get("code_challenge") ?? "");
  const resource = String(formData.get("resource") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!isKnownClient(clientId)) throw new Error("unknown client");
  if (!isAllowedRedirectUri(redirectUri)) throw new Error("redirect_uri not allowed");
  if (!codeChallenge) throw new Error("missing code challenge");

  const scopes = scope.split(/\s+/).filter(Boolean);
  if (scopes.length === 0 || scopes.some((s) => !SUPPORTED_SCOPES.includes(s))) {
    throw new Error("unsupported scope");
  }

  const target = new URL(redirectUri);
  // RFC 9207: identifying ourselves on the way back is what lets the client
  // detect a mix-up between two authorization servers. It goes on the error
  // response too, not just the success one.
  target.searchParams.set("iss", appOrigin());
  if (state) target.searchParams.set("state", state);

  if (decision !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const code = await issueAuthCode({
    userId: user.id,
    clientId,
    redirectUri,
    scope: scopes.join(" "),
    codeChallenge,
    resource: resource || null,
  });

  target.searchParams.set("code", code);
  redirect(target.toString());
}
