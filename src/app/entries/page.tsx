import { redirect } from "next/navigation";
import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { EntryCard } from "@/components/EntryCard";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getEntries } from "@/lib/db/queries";
import { CATEGORIES } from "@/lib/db/types";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { category } = await searchParams;
  const entries = await getEntries(profile.id, { category, limit: 50 });

  return (
    <PhoneFrame>
      <Header subtitle="everything you've logged" />

      <div className="chips">
        <Link href="/entries" className={`chip ${!category ? "hi" : ""}`}>
          all
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/entries?category=${c}`}
            className={`chip ${category === c ? "hi" : ""}`}
          >
            {c}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="card alt d2">
          <div className="text-[14px] text-[color:var(--muted)]">nothing here yet.</div>
        </div>
      ) : (
        entries.map((e, i) => (
          <EntryCard
            key={e.id}
            entry={e}
            variant={i % 2 === 0 ? undefined : "alt"}
            delayClass={`d${Math.min(6, 2 + (i % 4))}`}
          />
        ))
      )}

      <BottomNav active="entries" />
    </PhoneFrame>
  );
}
