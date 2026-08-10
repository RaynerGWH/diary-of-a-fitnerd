import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { BottomNav } from "@/components/BottomNav";
import { EntryCard } from "@/components/EntryCard";
import { EntriesFilters } from "@/components/EntriesFilters";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getEntries } from "@/lib/db/queries";
import type { EntryType } from "@/lib/db/types";

const VALID_TYPES: EntryType[] = ["task", "log", "event"];

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string; q?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { category, type, q } = await searchParams;
  const validType = VALID_TYPES.includes(type as EntryType) ? (type as EntryType) : undefined;
  const entries = await getEntries(profile.id, { category, type: validType, search: q, limit: 50 });

  return (
    <PhoneFrame nav={<BottomNav active="entries" />}>
      <EntriesFilters>
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
      </EntriesFilters>
    </PhoneFrame>
  );
}
