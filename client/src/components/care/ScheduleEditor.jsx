import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlarmClock, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import TimeLabel from "./TimeLabel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import ScheduleForm from "./ScheduleForm"
import { daysSummary, errorMessage } from "./scheduleUtils"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "./states"

function ScheduleRow({ schedule, canEdit, onEdit, onToggle, onAskDelete, busy }) {
  const text = (
    <>
      <span className="block truncate text-md font-medium">{schedule.label}</span>
      <span className="block truncate text-sm text-subtle">
        {schedule.active ? daysSummary(schedule.days) : `Paused · ${daysSummary(schedule.days)}`}
      </span>
    </>
  )
  return (
    <div className={cn("flex items-center gap-3 py-4", !schedule.active && "opacity-60")}>
      <TimeLabel hhmm={schedule.time_of_day} className="w-20 shrink-0 text-lg" />
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${schedule.label}`}
          className="-mx-2 min-w-0 flex-1 cursor-pointer rounded-inner px-2 py-1 text-left transition-colors duration-150 hover:bg-raised"
        >
          {text}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={schedule.active}
            onCheckedChange={(v) => onToggle(v)}
            disabled={busy}
            aria-label={schedule.active ? `Pause ${schedule.label}` : `Resume ${schedule.label}`}
            className="mr-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`Edit ${schedule.label}`}
            className="hidden sm:inline-flex"
          >
            <Pencil aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onAskDelete} aria-label={`Delete ${schedule.label}`}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ConfirmDelete({ schedule, onCancel, onConfirm, busy }) {
  return (
    <div className="my-2 flex flex-col gap-3 rounded-inner bg-danger/8 p-4 ring-1 ring-danger/20 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm">
        Delete <span className="font-medium">{schedule.label}</span>? Past doses stay in the log.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Keep it
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          Delete
        </Button>
      </div>
    </div>
  )
}

/**
 * Care schedules: list with edit / delete / active toggle, plus an add form.
 *
 * Props
 * - schedules: Schedule[] (GET /devices/:id/schedules or DeviceDetail.schedules)
 * - onCreate(body) → POST /schedules        body: {label,time_of_day,days,window_before_min,grace_min,escalate_after_min}
 * - onUpdate(id, patch) → PATCH /schedules/:sid   (also used for {active})
 * - onDelete(id) → DELETE /schedules/:sid
 *   All three may return promises; rejections show inline.
 * - canEdit: owner only (others see a read-only list)
 * - loading, error, onRetry
 */
export default function ScheduleEditor({
  schedules = [],
  onCreate,
  onUpdate,
  onDelete,
  canEdit = true,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()
  const [editingId, setEditingId] = useState(null) // schedule id, "new", or null
  const [confirmId, setConfirmId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rowError, setRowError] = useState(null)

  const sorted = [...schedules].sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))

  async function run(id, fn) {
    setBusyId(id)
    setRowError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setRowError({ id, message: errorMessage(err, "That didn't save. Try again.") })
      return false
    } finally {
      setBusyId(null)
    }
  }

  const motionProps = reduce
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto" },
        exit: { opacity: 0, height: 0 },
        transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
      }

  const addButton =
    canEdit && editingId !== "new" ? (
      <Button variant="secondary" size="sm" onClick={() => setEditingId("new")}>
        <Plus aria-hidden />
        Add
      </Button>
    ) : null

  let body
  if (loading) {
    body = (
      <div className="space-y-4" aria-busy="true" aria-label="Loading schedules">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-6 w-14" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-6 w-10 rounded-pill" />
          </div>
        ))}
      </div>
    )
  } else if (error) {
    body = <ErrorState message={error} onRetry={onRetry} />
  } else {
    body = (
      <>
        {sorted.length === 0 && editingId !== "new" ? (
          <EmptyState
            icon={AlarmClock}
            title="No schedules yet"
            body="Add the times meds should be taken. Reminders and family updates follow from these."
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setEditingId("new")}>
                  <Plus aria-hidden />
                  Add a schedule
                </Button>
              ) : null
            }
          />
        ) : null}

        {sorted.length ? (
          <ul className="-my-4 divide-y divide-line">
            {sorted.map((s) => (
              <li key={s.id}>
                {editingId === s.id ? (
                  <div className="py-4">
                    <ScheduleForm
                      initial={s}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (values) => {
                        await onUpdate?.(s.id, values)
                        setEditingId(null)
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <ScheduleRow
                      schedule={s}
                      canEdit={canEdit}
                      busy={busyId === s.id}
                      onEdit={() => {
                        setConfirmId(null)
                        setEditingId(s.id)
                      }}
                      onAskDelete={() => setConfirmId(s.id)}
                      onToggle={(active) => run(s.id, () => onUpdate?.(s.id, { active }))}
                    />
                    <AnimatePresence initial={false}>
                      {confirmId === s.id ? (
                        <motion.div key="confirm" {...motionProps} className="overflow-hidden">
                          <ConfirmDelete
                            schedule={s}
                            busy={busyId === s.id}
                            onCancel={() => setConfirmId(null)}
                            onConfirm={async () => {
                              const ok = await run(s.id, () => onDelete?.(s.id))
                              if (ok) setConfirmId(null)
                            }}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    {rowError?.id === s.id ? <ErrorState message={rowError.message} compact className="mb-4" /> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <AnimatePresence initial={false}>
          {editingId === "new" ? (
            <motion.div key="new" {...motionProps} className="overflow-hidden">
              <div className={cn("rounded-inner bg-raised/40 p-4 ring-1 ring-line", sorted.length && "mt-4")}>
                <p className="mb-4 font-display text-md font-medium">New schedule</p>
                <ScheduleForm
                  submitLabel="Add schedule"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values) => {
                    await onCreate?.(values)
                    setEditingId(null)
                  }}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    )
  }

  return (
    <PanelCard className={className} aria-labelledby="schedules-title">
      <PanelHeader
        id="schedules-title"
        icon={AlarmClock}
        title="Schedules"
        action={!loading && !error && sorted.length ? addButton : null}
      />
      {body}
    </PanelCard>
  )
}
