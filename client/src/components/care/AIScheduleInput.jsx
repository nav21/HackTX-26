import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, CircleCheck, LoaderCircle, Pencil, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import TimeLabel from "./TimeLabel"
import { Button } from "@/components/ui/button"
import ScheduleForm from "./ScheduleForm"
import { daysSummary, errorMessage } from "./scheduleUtils"
import { ErrorState, PanelCard, PanelHeader, Shimmer } from "./states"

const EXAMPLE = "She takes her heart pill at 8 in the morning and 8 at night, weekdays only"

let keySeq = 0
const withKeys = (list) => list.map((p) => ({ ...p, _key: `p${++keySeq}` }))
const stripKey = (p) => ({ label: p.label, time_of_day: p.time_of_day, days: p.days })

function ProposedCard({ item, editing, onEdit, onRemove, onSave, onCancel, reduce }) {
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-inner bg-raised p-4 ring-1 ring-line"
    >
      {editing ? (
        <ScheduleForm
          initial={item}
          showAdvanced={false}
          submitLabel="Update"
          onCancel={onCancel}
          onSubmit={(values) => onSave(values)}
        />
      ) : (
        <div className="flex items-center gap-4">
          <TimeLabel hhmm={item.time_of_day} className="w-20 shrink-0 text-xl text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-md font-medium">{item.label}</p>
            <p className="truncate text-sm text-subtle">{daysSummary(item.days)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${item.label}`}>
              <Pencil aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${item.label}`}>
              <X aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </motion.li>
  )
}

/**
 * "Describe it in words" → AI-proposed schedules → confirm.
 *
 * Props
 * - onParse(text) → Promise<{ proposed: [{label,time_of_day,days}] }>   (POST /schedules/parse)
 * - onConfirm(proposed[]) → Promise   (save each via POST /schedules; nothing saves before this)
 * - disabled: e.g. non-owners
 * - initialText: prefill (preview / demos)
 */
export default function AIScheduleInput({ onParse, onConfirm, disabled = false, initialText = "", className }) {
  const reduce = useReducedMotion()
  const uid = useId()
  const [text, setText] = useState(initialText)
  const [phase, setPhase] = useState("idle") // idle | parsing | review | saving | saved
  const [error, setError] = useState(null)
  const [proposed, setProposed] = useState([])
  const [editingKey, setEditingKey] = useState(null)
  const [savedCount, setSavedCount] = useState(0)

  const busy = phase === "parsing" || phase === "saving"

  async function parse(e) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setPhase("parsing")
    setError(null)
    try {
      const res = await onParse?.(value)
      const list = res?.proposed ?? []
      if (!list.length) {
        setPhase("idle")
        setError("No times found in that. Try including when, like \"8 AM\" or \"after dinner at 7\".")
        return
      }
      setProposed(withKeys(list))
      setPhase("review")
    } catch (err) {
      setPhase("idle")
      setError(errorMessage(err, "Couldn't read that right now. Try again, or add it by hand."))
    }
  }

  async function confirm() {
    setPhase("saving")
    setError(null)
    try {
      await onConfirm?.(proposed.map(stripKey))
      setSavedCount(proposed.length)
      setProposed([])
      setText("")
      setPhase("saved")
    } catch (err) {
      setPhase("review")
      setError(errorMessage(err, "Couldn't save these. Try again."))
    }
  }

  function discard() {
    setProposed([])
    setEditingKey(null)
    setError(null)
    setPhase("idle")
  }

  const showInput = phase === "idle" || phase === "parsing" || phase === "saved"

  return (
    <PanelCard className={className} aria-labelledby={`${uid}-title`}>
      <PanelHeader
        id={`${uid}-title`}
        icon={Sparkles}
        title="Describe it in words"
        description="Muse turns it into schedules. Nothing saves until you confirm."
      />

      {phase === "saved" ? (
        <p className="-mt-1 inline-flex items-center gap-2 text-sm text-success" role="status">
          <CircleCheck className="size-4" aria-hidden />
          Added {savedCount} {savedCount === 1 ? "schedule" : "schedules"}.
        </p>
      ) : null}

      {showInput ? (
        <form onSubmit={parse} className="flex flex-col gap-3">
          <label htmlFor={`${uid}-text`} className="sr-only">
            Describe the routine
          </label>
          <textarea
            id={`${uid}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) parse(e)
            }}
            placeholder={EXAMPLE}
            rows={3}
            maxLength={500}
            disabled={disabled || busy}
            className="min-h-24 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-md leading-relaxed text-text outline-none transition-colors placeholder:text-faint hover:border-line-strong focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:opacity-60 sm:text-base"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-faint tabular">{text.length ? `${text.length}/500` : ""}</span>
            <Button type="submit" disabled={disabled || busy || !text.trim()}>
              {phase === "parsing" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {phase === "parsing" ? "Reading…" : "Make schedules"}
            </Button>
          </div>
        </form>
      ) : null}

      {phase === "parsing" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm text-subtle">Reading your routine…</p>
          <Shimmer className="h-16" />
          <Shimmer className="h-16 opacity-70" />
        </motion.div>
      ) : null}

      {error ? <ErrorState message={error} compact /> : null}

      {phase === "review" || phase === "saving" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-subtle">
            Here's what I understood from{" "}
            <span className="text-text">"{text.trim().length > 60 ? `${text.trim().slice(0, 60)}…` : text.trim()}"</span>
          </p>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {proposed.map((item) => (
                <ProposedCard
                  key={item._key}
                  item={item}
                  reduce={reduce}
                  editing={editingKey === item._key}
                  onEdit={() => setEditingKey(item._key)}
                  onCancel={() => setEditingKey(null)}
                  onRemove={() => {
                    const next = proposed.filter((p) => p._key !== item._key)
                    setProposed(next)
                    if (!next.length) discard()
                  }}
                  onSave={(values) => {
                    setProposed((list) => list.map((p) => (p._key === item._key ? { ...p, ...values } : p)))
                    setEditingKey(null)
                  }}
                />
              ))}
            </AnimatePresence>
          </ul>
          <div className={cn("flex flex-wrap justify-end gap-2", editingKey && "opacity-50")}>
            <Button variant="ghost" onClick={discard} disabled={phase === "saving"}>
              Discard
            </Button>
            <Button onClick={confirm} disabled={phase === "saving" || !!editingKey}>
              {phase === "saving" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {phase === "saving" ? "Saving…" : "Looks right"}
            </Button>
          </div>
        </div>
      ) : null}
    </PanelCard>
  )
}
