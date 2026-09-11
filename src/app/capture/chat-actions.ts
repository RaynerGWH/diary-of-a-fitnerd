"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAllowedUser } from "@/lib/auth/require-user";
import {
  newThreadId,
  resumeAgent,
  sendToAgent,
  type PendingConfirmation,
} from "@/lib/agent/client";
import { CHAT_SESSION_WINDOW_MS } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/db/types";

// Everything that used to live here (intent parsing, candidate search, entry
// insertion, weekly expansion) now runs in the Python agent. What is left is
// the part that genuinely belongs to the app: proving who is signed in,
// deciding which conversation this message belongs to, and recording the
// transcript.

// Nothing typed by hand into a capture box comes close to this. It exists to
// bound what a single request can cost: `message` is forwarded to a paid model
// call, so an unbounded string is an unbounded bill. The agent enforces the
// same limit independently.
const MAX_MESSAGE_LENGTH = 2000;

// created_at defaults to now(), which is the TRANSACTION timestamp: both rows
// of a single insert get an identical value, leaving their relative order
// undefined once the thread is reloaded from the DB. Stamping them a
// millisecond apart is what keeps a reply below the message it answers.
function chatTimestamps(): { userAt: string; assistantAt: string } {
  const t = Date.now();
  return { userAt: new Date(t).toISOString(), assistantAt: new Date(t + 1).toISOString() };
}

export type SendCaptureMessageResult = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  threadId: string;
  // Set when the agent paused to ask. Nothing has been written yet.
  pending: PendingConfirmation | null;
};

// Which conversation a new message belongs to.
//
// Reuse the newest row's thread when it is recent enough, otherwise mint one.
// The thread id is now the conversation boundary, which is what replaced the
// `after` timestamp the client used to carry for "restart chat": restarting is
// just refusing to reuse.
async function resolveThreadId(userId: string, restart: boolean): Promise<string> {
  if (restart) return newThreadId();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capture_chat")
    .select("thread_id, created_at")
    .eq("user_id", userId)
    .not("thread_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const latest = data?.[0];
  if (!latest) return newThreadId();

  const age = Date.now() - new Date(latest.created_at).getTime();
  return age > CHAT_SESSION_WINDOW_MS ? newThreadId() : (latest.thread_id as string);
}

async function recordTurn(
  userId: string,
  threadId: string,
  userText: string,
  replyText: string,
): Promise<[ChatMessage, ChatMessage]> {
  const supabase = await createClient();
  const { userAt, assistantAt } = chatTimestamps();
  const { data, error } = await supabase
    .from("capture_chat")
    .insert([
      {
        user_id: userId,
        role: "user",
        content: userText,
        entry_id: null,
        thread_id: threadId,
        created_at: userAt,
      },
      {
        user_id: userId,
        role: "assistant",
        content: replyText,
        entry_id: null,
        thread_id: threadId,
        created_at: assistantAt,
      },
    ])
    .select();
  if (error) throw new Error(error.message);
  return data as [ChatMessage, ChatMessage];
}

export async function sendCaptureMessage(
  message: string,
  opts: { restart?: boolean } = {},
): Promise<SendCaptureMessageResult> {
  const text = message.trim();
  if (!text) throw new Error("message is required");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error("message is too long");

  // Before the agent call, not after: see requireAllowedUser.
  const user = await requireAllowedUser();
  const threadId = await resolveThreadId(user.id, opts.restart === true);

  const turn = await sendToAgent(user.id, text, threadId);

  // A paused turn has no reply yet. The confirmation card is what the user
  // sees, and the transcript gets the reply once they answer.
  const replyText = turn.pending ? "waiting on you" : turn.reply;
  const [userMessage, assistantMessage] = await recordTurn(user.id, threadId, text, replyText);

  // The agent writes entries directly, so the pages that read them are stale
  // by the time this returns.
  revalidatePath("/");
  revalidatePath("/entries");

  return { userMessage, assistantMessage, threadId, pending: turn.pending };
}

export async function confirmPendingAction(
  threadId: string,
  approved: boolean,
): Promise<{ reply: string }> {
  const user = await requireAllowedUser();
  const turn = await resumeAgent(user.id, threadId, approved);

  const supabase = await createClient();
  // Correct the placeholder written when the turn paused, rather than adding a
  // second assistant bubble for one exchange.
  const { data } = await supabase
    .from("capture_chat")
    .select("id")
    .eq("user_id", user.id)
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = data?.[0];
  if (latest) {
    await supabase.from("capture_chat").update({ content: turn.reply }).eq("id", latest.id);
  }

  revalidatePath("/");
  revalidatePath("/entries");

  return { reply: turn.reply };
}
