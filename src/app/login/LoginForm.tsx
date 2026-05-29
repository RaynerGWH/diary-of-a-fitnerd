"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="card d1">
      <div className="font-bold text-[19px]">magic link sign-in</div>
      <div className="text-[13.5px] text-[color:var(--muted)] mt-1">
        drop your email — we&apos;ll send a one-tap link.
      </div>

      {status === "sent" ? (
        <div className="mt-4 text-[15px]">
          check your inbox for the link to <span className="font-bold">{email}</span>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <button
            type="submit"
            className="sticker-btn primary"
            disabled={status === "sending"}
          >
            {status === "sending" ? "sending..." : "send the link"}
          </button>
          {error && (
            <div className="text-[13px] text-[color:var(--ada)]">{error}</div>
          )}
        </form>
      )}
    </div>
  );
}
