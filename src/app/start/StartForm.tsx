"use client";

import { useMemo, useState, useTransition } from "react";
import { startWorkout } from "./actions";
import type { FFClass, FFLocation } from "@/lib/db/types";

type Tab = "class" | "strength" | "cardio" | "other";

export function StartForm({
  locations,
  classes,
}: {
  locations: FFLocation[];
  classes: FFClass[];
}) {
  const [tab, setTab] = useState<Tab>("class");
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [classId, setClassId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [pending, start] = useTransition();

  const classesForLoc = useMemo(
    () => classes.filter((c) => c.location_id === locationId),
    [classes, locationId],
  );

  const todayDow = new Date().getDay();
  const todays = useMemo(
    () => classesForLoc.filter((c) => c.day_of_week === todayDow),
    [classesForLoc, todayDow],
  );

  function submit() {
    const fd = new FormData();
    fd.set("type", tab);
    if (tab === "class") {
      if (!locationId) return;
      fd.set("locationId", locationId);
      if (classId) fd.set("classId", classId);
    } else if (tab === "strength" || tab === "cardio" || tab === "other") {
      if (title.trim()) fd.set("title", title.trim());
    }
    start(() => startWorkout(fd));
  }

  return (
    <>
      <div className="card d1">
        <div className="font-bold text-[18px]">what kind of session?</div>
        <div className="chips mt-2">
          {(["class", "strength", "cardio", "other"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="chip"
              style={
                tab === t
                  ? { background: "var(--rayner)", color: "#fff", borderColor: "var(--ink)" }
                  : undefined
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "class" ? (
        <div className="card alt d2">
          <div className="label" style={{ margin: "0 0 8px" }}>where?</div>
          <select
            className="field"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setClassId("");
            }}
          >
            {locations.length === 0 && <option value="">no locations yet — add some in /manage</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <div className="label" style={{ margin: "12px 0 8px" }}>
            class {todays.length > 0 && <span className="sub" style={{ fontSize: 16 }}>· today</span>}
          </div>
          <select
            className="field"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">freeform — just log the location</option>
            {todays.length > 0 && (
              <optgroup label="today's schedule">
                {todays.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fmtTime(c.start_time)} · {c.name}
                    {c.instructor ? ` · ${c.instructor}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="all classes here">
              {classesForLoc.map((c) => (
                <option key={c.id} value={c.id}>
                  {DOW[c.day_of_week ?? 0]} {fmtTime(c.start_time)} · {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      ) : (
        <div className="card alt d2">
          <div className="label" style={{ margin: "0 0 8px" }}>session name</div>
          <input
            className="field"
            placeholder={tab === "strength" ? "push day, pull day, legs..." : "easy 5k, intervals..."}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      )}

      <button
        className="card start-hero d3"
        type="button"
        onClick={submit}
        disabled={pending || (tab === "class" && !locationId)}
        style={{ border: "none" }}
      >
        <div className="big">{pending ? "starting…" : "▶ START NOW"}</div>
        <div className="hint">timer rolls the second you tap</div>
      </button>
    </>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtTime(t: string | null): string {
  if (!t) return "";
  // Postgres time as 'HH:MM:SS' → 'HH:MM'
  return t.slice(0, 5);
}
