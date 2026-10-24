/**
 * CarePanel — main panel for a device in Care mode. THIN SHELL.
 * The next phase composes DoseList, AdherenceCalendar, ScheduleEditor,
 * DailySummaryCard (components/care/*) in here.
 *
 * Props
 *  device     DeviceDetail (uses doses_today, schedules, today, timezone, role)
 *  canManage  boolean — caller is the owner
 *  className
 */
import BigStat from "@/components/common/BigStat"
import Surface from "@/components/common/Surface"
import { formatClock, formatTimeOfDay } from "@/lib/format"
import { cn } from "@/lib/utils"

const STATUS = {
  upcoming: { label: "Upcoming", className: "bg-raised text-subtle" },
  taken: { label: "Taken", className: "bg-success/12 text-success" },
  late: { label: "Late", className: "bg-warning/12 text-warning" },
  missed: { label: "Missed", className: "bg-danger/12 text-danger" },
}

export default function CarePanel({ device, className }) {
  const doses = device?.doses_today ?? []
  const total = device?.today?.total ?? doses.length
  const taken = device?.today?.taken ?? doses.filter((d) => d.status === "taken" || d.status === "late").length
  const next = device?.today?.next_dose
  return (
    <Surface className={cn("@container flex flex-col gap-6", className)}>
      <BigStat
        value={total ? `${taken}/${total}` : "—"}
        caption={
          total
            ? `${taken === total ? "All doses taken today" : "doses taken today"}${next ? ` · next ${next.label} at ${formatTimeOfDay(next.time_of_day)}` : ""}`
            : "No doses scheduled yet"
        }
      />
      {doses.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {doses.map((d) => {
            const s = STATUS[d.status] ?? STATUS.upcoming
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-text">{d.label}</p>
                  <p className="text-xs text-subtle">
                    {formatTimeOfDay(d.time_of_day)}
                    {d.opened_at ? ` · opened ${formatClock(d.opened_at, device?.timezone)}` : ""}
                    {d.source === "sensor" ? " · verified by sensor" : d.source === "manual" ? " · self-reported" : ""}
                  </p>
                </div>
                <span className={cn("inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-medium transition-colors duration-200", s.className)}>
                  {s.label}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Surface>
  )
}
