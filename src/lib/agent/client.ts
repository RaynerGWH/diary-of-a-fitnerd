import { createHmac, randomUUID } from "crypto";

// The Python agent service. Everything model-facing lives there; this file is
// the only thing in the Next app that knows how to reach it.
//
// The agent holds the service_role key and so bypasses RLS entirely. It has no
// Supabase session and no idea who is signed in, so it has to be told — and a
// user id in a request body is attacker-controlled, while a signature is not.
// Hence a signed token per request, minted here, verified there.

const AUDIENCE = "rayner-agent";

// Long enough for one hop over TLS, short enough that a leaked token is
// worthless by the time anyone finds it. The agent independently refuses
// anything claiming a longer life, so widening this alone achieves nothing.
const TOKEN_LIFETIME_SECONDS = 60;

// A slow model call is normal here; a hung one should not pin a serverless
// function until the platform kills it.
const REQUEST_TIMEOUT_MS = 60_000;

export type PendingConfirmation = {
  action: "edit" | "delete";
  entry_id?: string;
  target?: string;
  scope?: "occurrence" | "series";
  affected?: number;
  changes?: Record<string, unknown>;
};

export type AgentTurn = {
  reply: string;
  thread_id: string;
  // Set when the agent paused for confirmation. Nothing has been written yet:
  // the graph is suspended mid-run and waiting on `resumeAgent`.
  pending: PendingConfirmation | null;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// HS256 by hand, the same way oauth.ts does its crypto rather than pulling in
// a JWT library. Symmetric is right here because both halves are ours and
// deploy together: there is no third party who must verify a signature they
// cannot also produce.
function mintToken(userId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      aud: AUDIENCE,
      iat: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
    }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function agentConfig(): { url: string; secret: string } {
  const url = process.env.AGENT_URL;
  const secret = process.env.AGENT_SHARED_SECRET;
  if (!url || !secret) {
    throw new Error("AGENT_URL and AGENT_SHARED_SECRET must be set");
  }
  return { url: url.replace(/\/$/, ""), secret };
}

async function post<T>(path: string, userId: string, body: unknown): Promise<T> {
  const { url, secret } = agentConfig();

  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${mintToken(userId, secret)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // The agent being down or slow is the most likely failure in the whole
    // flow, so it gets a message that says so rather than a raw fetch error.
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new Error(`the capture agent is ${reason}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent returned ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function newThreadId(): string {
  return randomUUID();
}

export async function sendToAgent(
  userId: string,
  message: string,
  threadId: string,
): Promise<AgentTurn> {
  return post<AgentTurn>("/agents/capture/invoke", userId, {
    message,
    thread_id: threadId,
  });
}

export async function resumeAgent(
  userId: string,
  threadId: string,
  approved: boolean,
): Promise<AgentTurn> {
  return post<AgentTurn>("/agents/capture/resume", userId, {
    thread_id: threadId,
    approved,
  });
}
