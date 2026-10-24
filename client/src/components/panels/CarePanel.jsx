/**
 * CarePanel — the Care-mode body of the device page.
 *
 * Today (hero + dose list) · 14-day adherence · AI daily summary · schedules
 * (+ plain-English schedule input for the owner). Caregivers and viewers get
 * read-only versions; caregivers can still ask for a fresh summary.
 *
 * `CarePanel` fetches (doses, insights) and wires the mutations.
 * `CarePanelView` is presentational, so previews can pass sample data.
 *
 * Today card header: who takes the meds (person_name; owner edits it in a
 * dialog) and, when GET /api/health says demo, the owner's "Demo · dose in 1 min".
 *
 * CarePanel props:     device (DeviceDetail), canManage (owner?)
 * CarePanelView props: device, canManage,
 *   history   { doses, loading, error, onRetry }                     GET /doses (14 days)
 *   summary   { insight, loading, error, onRetry, onGenerate, generating, generateError }
 *   onManual(dose), manualPendingId                                   owner only
 *   schedule  { onCreate(body), onUpdate(id, patch), onDelete(id) }   promises (owner)
 *   onParse(text), onConfirm(proposed[])                              AI schedule input (owner)
 *   onEditPerson()                                                    opens the "who takes these" editor
 *   demo      { visible, onClick, pending }                           DEMO_MODE shortcut (owner)
 */
import { useState } from "react"
import { CalendarClock, LoaderCircle, Pencil, Timer, UserRound, UserRoundPlus } from "lucide-react"
import { CarePersonDialog } from "@/components/device/CarePerson"
import { Button } from "@/components/ui/button"
import AdherenceCalendar from "@/components/care/AdherenceCalendar"
import AIScheduleInput from "@/components/care/AIScheduleInput"
import CareTodayHero from "@/components/care/CareTodayHero"
import DailySummaryCard from "@/components/care/DailySummaryCard"
import DoseList from "@/components/care/DoseList"
import ScheduleEditor from "@/components/care/ScheduleEditor"
import { PanelCard } from "@/components/care/states"
import { todayKey } from "@/components/care/scheduleUtils"
import { errorMessage } from "@/lib/errors"
import { formatTimeOfDay } from "@/lib/format"
import {
  useDemoScheduleNow,
  useDoses,
  useGenerateDaily,
  useHealth,
  useLatestInsight,
  useManualDose,
  useScheduleMutations,
  useUpdateDevice,
} from "@/lib/queries"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Today's rows from the device are fresher than the history fetch; prefer them. */
function mergeToday(history = [], todayDoses = [], today) {
  if (!todayDoses.length) return history
  return [...history.filter((d) => d.date !== today), ...todayDoses]
}

/** Who the doses are for (owner can edit) · the demo shortcut when the server runs DEMO_MODE. */
function TodayHeader({ device, canManage, onEditPerson, demo }) {
  const name = device?.person_name
  let who = null
  if (name && canManage && onEditPerson) {
    who = (
      <button
        type="button"
        onClick={onEditPerson}
        className="group -mx-2 inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-control px-2 py-1 text-sm font-medium text-text transition-colors duration-150 hover:bg-raised"
        aria-label={`Doses for ${name}. Change who takes these meds`}
      >
        <UserRound className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{name}</span>
        <Pencil className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-subtle" aria-hidden />
      </button>
    )
  } else if (name) {
    who = (
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-text">
        <UserRound className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{name}</span>
      </span>
    )
  } else if (canManage && onEditPerson) {
    who = (
      <Button variant="ghost" size="sm" onClick={onEditPerson} className="-ml-2 text-subtle">
        <UserRoundPlus aria-hidden />
        Who takes these meds?
      </Button>
    )
  }
  const showDemo = canManage && demo?.visible
  if (!who && !showDemo) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">{who}</div>
      {showDemo ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={demo.onClick}
          disabled={demo.pending}
          className="-mr-2 text-subtle"
          title="Moves the next dose to about a minute from now"
        >
          {demo.pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Timer aria-hidden />}
          Demo · dose in 1 min
        </Button>
      ) : null}
    </div>
  )
}

export function CarePanelView({
  device,
  canManage = false,
  history = {},
  summary = {},
  onManual,
  manualPendingId = null,
  schedule = {},
  onParse,
  onConfirm,
  onEditPerson,
  demo,
  className,
}) {
  const tz = device?.timezone
  const doses = device?.doses_today ?? []
  const today = doses[0]?.date ?? todayKey(tz)
  const taken = device?.today?.taken ?? doses.filter((d) => d.status === "taken" || d.status === "late").length
  const total = device?.today?.total ?? doses.length
  const schedules = device?.schedules ?? []
  const canGenerate = device?.role !== "viewer"

  return (
    <div className={cn("@container flex flex-col gap-6", className)}>
      <PanelCard aria-label="Today">
        <TodayHeader device={device} canManage={canManage} onEditPerson={onEditPerson} demo={demo} />
        <CareTodayHero taken={taken} total={total} nextDose={device?.today?.next_dose ?? null} doses={doses} />
        {doses.length ? (
          <div className="border-t border-line pt-4">
            <DoseList
              bare
              doses={doses}
              isOwner={canManage}
              onManual={canManage ? onManual : undefined}
              pendingId={manualPendingId}
              timeZone={tz}
            />
          </div>
        ) : (
          <p className="text-sm text-subtle">
            {schedules.length
              ? "No doses fall on today."
              : canManage
                ? "Add a schedule below and today's doses show up here."
                : "No schedules yet."}
          </p>
        )}
      </PanelCard>

      <div className="grid grid-cols-1 gap-6 @[44rem]:grid-cols-2">
        <AdherenceCalendar
          doses={mergeToday(history.doses, doses, today)}
          today={today}
          timeZone={tz}
          loading={history.loading}
          error={history.error}
          onRetry={history.onRetry}
        />
        <DailySummaryCard
          insight={summary.insight ?? null}
          onGenerate={summary.onGenerate}
          generating={summary.generating}
          generateError={summary.generateError}
          canGenerate={canGenerate}
          timeZone={tz}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.onRetry}
        />
      </div>

      <ScheduleEditor
        schedules={schedules}
        onCreate={schedule.onCreate}
        onUpdate={schedule.onUpdate}
        onDelete={schedule.onDelete}
        canEdit={canManage}
      />

      {canManage ? (
        <AIScheduleInput onParse={onParse} onConfirm={onConfirm} />
      ) : (
        <p className="flex items-center gap-2 px-1 text-sm text-subtle">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          Only the owner can change schedules.
        </p>
      )}
    </div>
  )
}

export default function CarePanel({ device, canManage = false, className }) {
  const id = device?.id
  const doses = useDoses(id)
  const summary = useLatestInsight(id, "daily_summary")
  const generate = useGenerateDaily(id)
  const manual = useManualDose(id)
  const { create, update, remove, parse } = useScheduleMutations(id)
  const patch = useUpdateDevice(id)
  const health = useHealth()
  const demo = useDemoScheduleNow(id)
  const [editingPerson, setEditingPerson] = useState(false)

  async function runDemo() {
    try {
      const res = await demo.mutateAsync()
      const hhmm = res?.dose?.time_of_day ?? res?.schedule?.time_of_day
      toast.success(hhmm ? `Next dose moved to ${formatTimeOfDay(hhmm)}.` : "Next dose moved up.", {
        description: "Reminder in about a minute.",
      })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't move the dose."))
    }
  }

  async function markManual(dose) {
    try {
      await manual.mutateAsync(dose.id)
      toast.success(`${dose.label} marked as taken`, { description: "Logged as self-reported." })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't mark it as taken."))
    }
  }

  async function confirmProposed(items) {
    // one at a time so a bad item stops the rest and the error shows inline
    for (const item of items) await create.mutateAsync(item)
  }

  return (
    <>
      <CarePanelView
        device={device}
        canManage={canManage}
        className={className}
        onEditPerson={() => setEditingPerson(true)}
        demo={{ visible: Boolean(health.data?.demo), onClick: runDemo, pending: demo.isPending }}
        history={{
          doses: doses.data ?? [],
          loading: doses.isLoading,
          error: doses.error ? errorMessage(doses.error, "Couldn't load the last two weeks.") : null,
          onRetry: () => doses.refetch(),
        }}
        summary={{
          insight: summary.data ?? null,
          loading: summary.isLoading,
          error: summary.error ? errorMessage(summary.error, "Couldn't load the summary.") : null,
          onRetry: () => summary.refetch(),
          onGenerate: () => generate.mutateAsync().catch(() => {}),
          generating: generate.isPending,
          generateError: generate.error ? errorMessage(generate.error, "Couldn't write a summary right now.") : null,
        }}
        onManual={markManual}
        manualPendingId={manual.isPending ? manual.variables : null}
        schedule={{
          onCreate: (body) => create.mutateAsync(body),
          onUpdate: (sid, patch) => update.mutateAsync({ sid, patch }),
          onDelete: (sid) => remove.mutateAsync(sid),
        }}
        onParse={(text) => parse.mutateAsync(text)}
        onConfirm={confirmProposed}
      />
      {canManage ? (
        <CarePersonDialog
          open={editingPerson}
          onOpenChange={setEditingPerson}
          device={device}
          onSave={async (body) => {
            await patch.mutateAsync(body)
            toast.success(body.person_name ? `Alerts will say ${body.person_name}` : "Name cleared")
          }}
        />
      ) : null}
    </>
  )
}
