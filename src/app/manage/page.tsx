import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  addExercise,
  addLocation,
  deleteClass,
  deleteExercise,
  deleteLocation,
  pasteSchedule,
} from "./actions";
import type { Exercise, FFClass, FFLocation } from "@/lib/db/types";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ManagePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: locs }, { data: classes }, { data: exercises }] = await Promise.all([
    supabase.from("ff_locations").select("*").order("name"),
    supabase.from("ff_classes").select("*").order("day_of_week").order("start_time"),
    supabase.from("exercises").select("*").order("name"),
  ]);

  const locations = (locs as FFLocation[]) ?? [];
  const klasses = (classes as FFClass[]) ?? [];
  const exs = (exercises as Exercise[]) ?? [];

  return (
    <PhoneFrame>
      <Header subtitle="catalog + schedule" />

      <div className="card d1">
        <div className="font-bold text-[18px]">locations</div>
        <div className="flex flex-col gap-2 mt-2">
          {locations.map((l) => (
            <form key={l.id} action={deleteLocation} className="flex items-center justify-between text-[14px]">
              <input type="hidden" name="id" value={l.id} />
              <span>{l.name}</span>
              <button type="submit" className="text-[color:var(--muted)] text-[12px]">remove</button>
            </form>
          ))}
        </div>
        <form action={addLocation} className="mt-3 flex gap-2">
          <input className="field" name="name" placeholder="FF Bugis, Anytime Tampines..." required />
          <button className="sticker-btn" type="submit">add</button>
        </form>
      </div>

      <div className="card alt d2">
        <div className="font-bold text-[18px]">bulk schedule paste</div>
        <div className="text-[12.5px] text-[color:var(--muted)] mt-1">
          pick a location, paste the weekly FF schedule. format: day on its own line, then
          rows like <span className="font-bold">07:00  HIIT 45  Jess  45</span>.
        </div>
        <form action={pasteSchedule} className="mt-3 flex flex-col gap-2">
          <select className="field" name="locationId" required>
            <option value="">— pick a location —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <textarea
            className="field"
            name="text"
            rows={8}
            placeholder={`Mon\n06:30  HIIT 45  Jess  45\n18:00  Spin     Anna  45\nTue\n07:00  Yoga     Mira  60`}
          />
          <label className="text-[12.5px] flex items-center gap-2">
            <input type="checkbox" name="replace" />
            replace this location&apos;s existing classes
          </label>
          <button className="sticker-btn primary" type="submit">parse + save</button>
        </form>
      </div>

      <div className="card d3">
        <div className="font-bold text-[18px]">classes</div>
        {klasses.length === 0 ? (
          <div className="text-[13px] text-[color:var(--muted)] mt-1">nothing here yet.</div>
        ) : (
          <div className="flex flex-col gap-1 mt-2">
            {klasses.map((c) => {
              const loc = locations.find((l) => l.id === c.location_id);
              return (
                <form key={c.id} action={deleteClass} className="flex items-center justify-between text-[13.5px]">
                  <input type="hidden" name="id" value={c.id} />
                  <span>
                    {DOW[c.day_of_week ?? 0]} {c.start_time?.slice(0, 5)} · {c.name}
                    {c.instructor ? ` · ${c.instructor}` : ""} <span className="text-[color:var(--muted)]">({loc?.name})</span>
                  </span>
                  <button type="submit" className="text-[color:var(--muted)] text-[12px]">×</button>
                </form>
              );
            })}
          </div>
        )}
      </div>

      <div className="card alt d4">
        <div className="font-bold text-[18px]">exercises</div>
        <form action={addExercise} className="mt-2 grid grid-cols-2 gap-2">
          <input className="field" name="name" placeholder="name (bench press)" required />
          <input className="field" name="category" placeholder="push / pull / legs / core / cardio" />
          <input className="field" name="primary_muscle" placeholder="chest, quads..." />
          <input className="field" name="equipment" placeholder="barbell, db, machine..." />
          <button className="sticker-btn col-span-2" type="submit">add exercise</button>
        </form>
        {exs.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {exs.map((e) => (
              <form key={e.id} action={deleteExercise} className="flex items-center justify-between text-[13.5px]">
                <input type="hidden" name="id" value={e.id} />
                <span>
                  {e.name}
                  {e.category ? <span className="text-[color:var(--muted)]"> · {e.category}</span> : null}
                </span>
                <button type="submit" className="text-[color:var(--muted)] text-[12px]">×</button>
              </form>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="manage" />
    </PhoneFrame>
  );
}
