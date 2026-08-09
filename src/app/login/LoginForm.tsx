"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing-in" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("signing-in");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="card d1">
      <div className="font-bold text-[19px]">sign in</div>
      <div className="text-[13.5px] text-[color:var(--muted)] mt-1">
        email + password.
      </div>

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
        <input
          type="password"
          required
          placeholder="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button
          type="submit"
          className="sticker-btn primary"
          disabled={status === "signing-in"}
        >
          {status === "signing-in" ? "signing in..." : "sign in"}
        </button>
        {error && (
          <div className="text-[13px] text-[color:var(--urgent)]">{error}</div>
        )}
      </form>
    </div>
  );
}
