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
 * CarePanel props:     device (DeviceDetail), canManage (owner?)
 * CarePanelView props: device, canManage,
 *   history   { doses, loading, error, onRetry }                     GET /doses (14 days)
 *   summary   { insight, loading, error, onRetry, onGenerate, generating, generateError }
 *   onManual(dose), manualPendingId                                   owner only
 *   schedule  { onCreate(body), onUpdate(id, patch), onDelete(id) }   promises (owner)
 *   onParse(text), onConfirm(proposed[])                              AI schedule input (owner)
 */
import { CalendarClock } from "lucide-react"
import AdherenceCalendar from "@/components/care/AdherenceCalendar"
import AIScheduleInput from "@/components/care/AIScheduleInput"
import CareTodayHero from "@/components/care/CareTodayHero"
import DailySummaryCard from "@/components/care/DailySummaryCard"
import DoseList from "@/components/care/DoseList"
import ScheduleEditor from "@/components/care/ScheduleEditor"
import { PanelCard } from "@/components/care/states"
import { todayKey } from "@/components/care/scheduleUtils"
import { errorMessage } from "@/lib/errors"
import { useDoses, useGenerateDaily, useLatestInsight, useManualDose, useScheduleMutations } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Today's rows from the device are fresher than the history fetch; prefer them. */
function mergeToday(history = [], todayDoses = [], today) {
  if (!todayDoses.length) return history
  return [...history.filter((d) => d.date !== today), ...todayDoses]
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
    <CarePanelView
      device={device}
      canManage={canManage}
      className={className}
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
  )
}
