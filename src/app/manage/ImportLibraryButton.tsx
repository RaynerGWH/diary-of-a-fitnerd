"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importExerciseLibrary, type ImportResult } from "./actions";

export function ImportLibraryButton({ alreadyLoaded }: { alreadyLoaded: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <button
        className="sticker-btn primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await importExerciseLibrary();
            setResult(res);
            router.refresh();
          })
        }
      >
        {pending
          ? "importing…"
          : alreadyLoaded
            ? "↻ update exercise library"
            : "＋ load exercise library (~870)"}
      </button>
      {result && (
        <div className="text-[13px]">
          {result.error ? (
            <span className="text-[color:var(--ada)]">import failed: {result.error}</span>
          ) : (
            <span>imported {result.imported} exercises ✓</span>
          )}
        </div>
      )}
    </div>
  );
}
