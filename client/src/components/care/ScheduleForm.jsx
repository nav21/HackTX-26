import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DAY_LETTER,
  DAY_SHORT,
  EVERY_DAY,
  SCHEDULE_DEFAULTS,
  WEEKDAYS,
  errorMessage,
  isPreset,
  timingSentence,
} from "./scheduleUtils"
import { ErrorState } from "./states"

function DayPills({ value, onChange, labelId }) {
  const toggle = (d) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))
  return (
    <div className="flex gap-1.5" role="group" aria-labelledby={labelId}>
      {DAY_LETTER.map((letter, d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={DAY_SHORT[d]}
            onClick={() => toggle(d)}
            className={cn(
              "h-10 min-w-0 max-w-12 flex-1 cursor-pointer rounded-pill font-display text-sm font-medium transition-colors duration-150",
              on ? "bg-accent text-on-accent" : "bg-raised text-subtle hover:bg-hover hover:text-text",
            )}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}

function PresetChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 cursor-pointer rounded-pill px-3 text-sm transition-colors duration-150 ring-1",
        active ? "bg-accent/12 text-accent ring-accent/30" : "text-subtle ring-line hover:text-text hover:ring-line-strong",
      )}
    >
      {children}
    </button>
  )
}

function MinutesField({ id, label, value, onChange }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-subtle">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          step={5}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="pr-10 tabular"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-faint">
          min
        </span>
      </div>
    </div>
  )
}

/**
 * Add / edit form for one schedule. Used by ScheduleEditor and AIScheduleInput.
 * onSubmit(values) may return a promise; a rejection shows inline.
 */
export default function ScheduleForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = "Save schedule",
  showAdvanced = true,
  className,
}) {
  const reduce = useReducedMotion()
  const uid = useId()
  const [label, setLabel] = useState(initial.label ?? "")
  const [time, setTime] = useState(initial.time_of_day ?? "08:00")
  const [days, setDays] = useState(initial.days ?? EVERY_DAY)
  const [windowBefore, setWindowBefore] = useState(initial.window_before_min ?? SCHEDULE_DEFAULTS.window_before_min)
  const [grace, setGrace] = useState(initial.grace_min ?? SCHEDULE_DEFAULTS.grace_min)
  const [escalate, setEscalate] = useState(initial.escalate_after_min ?? SCHEDULE_DEFAULTS.escalate_after_min)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [touched, setTouched] = useState(false)

  const labelMissing = !label.trim()
  const daysMissing = days.length === 0
  const num = (v, d) => (v === "" || Number.isNaN(v) ? d : v)

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (labelMissing || daysMissing || !time) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit?.({
        label: label.trim(),
        time_of_day: time,
        days,
        ...(showAdvanced
          ? {
              window_before_min: num(windowBefore, SCHEDULE_DEFAULTS.window_before_min),
              grace_min: num(grace, SCHEDULE_DEFAULTS.grace_min),
              escalate_after_min: num(escalate, SCHEDULE_DEFAULTS.escalate_after_min),
            }
          : {}),
      })
    } catch (err) {
      setError(errorMessage(err, "Couldn't save this schedule. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-5", className)} noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${uid}-label`}>Name</Label>
          <Input
            id={`${uid}-label`}
            value={label}
            placeholder="Morning meds"
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            aria-invalid={touched && labelMissing ? true : undefined}
          />
        </div>
        <div className="w-36 space-y-1.5">
          <Label htmlFor={`${uid}-time`}>Time</Label>
          <Input
            id={`${uid}-time`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="tabular"
            required
          />
        </div>
      </div>
      {touched && labelMissing ? <p className="-mt-3 text-xs text-danger">Give it a name, like "Morning meds".</p> : null}

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={`${uid}-days`} className="text-sm font-medium">
            Days
          </span>
          <div className="flex gap-2">
            <PresetChip active={isPreset(days, EVERY_DAY)} onClick={() => setDays(EVERY_DAY)}>
              Every day
            </PresetChip>
            <PresetChip active={isPreset(days, WEEKDAYS)} onClick={() => setDays(WEEKDAYS)}>
              Weekdays
            </PresetChip>
          </div>
        </div>
        <DayPills value={days} onChange={setDays} labelId={`${uid}-days`} />
        {touched && daysMissing ? <p className="text-xs text-danger">Pick at least one day.</p> : null}
      </div>

      {showAdvanced ? (
        <div className="rounded-inner bg-raised/50 ring-1 ring-line">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">Timing</span>
              <span className="block text-xs text-subtle tabular">
                {num(windowBefore, 60)} min early · {num(grace, 30)} min grace · alert after {num(escalate, 30)} min
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-subtle transition-transform duration-200", advancedOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
            {advancedOpen ? (
              <motion.div
                key="adv"
                initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-3 px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    <MinutesField id={`${uid}-win`} label="Early" value={windowBefore} onChange={setWindowBefore} />
                    <MinutesField id={`${uid}-grace`} label="Grace" value={grace} onChange={setGrace} />
                    <MinutesField id={`${uid}-esc`} label="Alert after" value={escalate} onChange={setEscalate} />
                  </div>
                  <p className="text-xs text-subtle">
                    {timingSentence({
                      time_of_day: time,
                      window_before_min: num(windowBefore, 60),
                      grace_min: num(grace, 30),
                      escalate_after_min: num(escalate, 30),
                    })}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {error ? <ErrorState message={error} compact /> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
