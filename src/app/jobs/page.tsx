import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { JobCard } from "@/components/JobCard";
import { JobsLive } from "@/components/JobsLive";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getJobListings, getJobStatusCounts } from "@/lib/db/queries";
import { JOB_STATUSES, type JobStatus } from "@/lib/db/types";

const FILTERS: { value: JobStatus | "all"; label: string }[] = [
  { value: "all", label: "open" },
  { value: "new", label: "new" },
  { value: "saved", label: "saved" },
  { value: "applied", label: "applied" },
  { value: "dismissed", label: "dismissed" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { status } = await searchParams;
  const active = JOB_STATUSES.includes(status as JobStatus) ? (status as JobStatus) : undefined;

  const [listings, counts] = await Promise.all([
    getJobListings(profile.id, { status: active }),
    getJobStatusCounts(profile.id),
  ]);

  return (
    <PhoneFrame nav={<BottomNav active="jobs" />}>
      <Header />
      <JobsLive userId={profile.id} />

      <div className="chips">
        {FILTERS.map((f) => {
          const isActive = f.value === "all" ? !active : f.value === active;
          const count =
            f.value === "all"
              ? counts.new + counts.saved + counts.applied
              : counts[f.value as JobStatus];
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/jobs" : `/jobs?status=${f.value}`}
              className={`chip ${isActive ? "hi" : ""}`.trim()}
            >
              {f.label} {count}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {listings.length === 0 ? (
          <div className="card alt d2">
            <div className="text-[14px] text-[color:var(--muted)]">
              nothing here yet. the Claude connector drops listings in every morning.
            </div>
          </div>
        ) : (
          listings.map((listing, i) => (
            <JobCard
              key={listing.id}
              listing={listing}
              variant={i % 2 === 0 ? undefined : "alt"}
              delayClass={`d${Math.min(6, 2 + (i % 4))}`}
            />
          ))
        )}
      </div>
    </PhoneFrame>
  );
}
