/**
 * HabitPanel — the Habit-mode body of the device page.
 *
 * Streak counter · 30-day consistency grid · nudge settings (tone + daily
 * reminder) · the habit group (open it, or join / create one).
 *
 * `HabitPanel` fetches (streak, groups) and wires the PATCHes.
 * `HabitPanelView` is presentational, so previews can pass sample data.
 *
 * HabitPanel props:     device (DeviceDetail), canManage (owner?)
 * HabitPanelView props: device, canManage,
 *   streak     { current, best, history, loading, error, onRetry }   GET /streak?days=30
 *   onToneChange(tone), toneSaving
 *   onReminderChange("HH:MM" | null), reminderSaving                  PATCH reminder_time
 *   groups     { list, loading }                                      GET /api/groups
 *   onAttachGroup(groupId), attaching                                  PATCH group_id
 *   joinSlot   node — the "Join or create" control (connected: GroupJoinCreate)
 */
import { ChevronRight, Plus, Users } from "lucide-react"
import { Link } from "react-router-dom"
import { PanelCard, PanelHeader } from "@/components/care/states"
import GroupJoinCreate from "@/components/group/GroupJoinCreate"
import ConsistencyGrid from "@/components/habit/ConsistencyGrid"
import HabitReminderSetting from "@/components/habit/HabitReminderSetting"
import StreakCounter from "@/components/habit/StreakCounter"
import ToneToggle from "@/components/habit/ToneToggle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/errors"
import { useGroups, useRefreshGroups, useStreak, useUpdateDevice } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function memberLine(n) {
  if (!n) return "Just you so far"
  return n === 1 ? "1 member" : `${n} members`
}

function GroupCard({ device, canManage, groups = {}, onAttachGroup, attaching, joinSlot }) {
  const list = groups.list ?? []
  const current = device?.group_id ? list.find((g) => g.id === device.group_id) : null
  const others = list.filter((g) => g.id !== device?.group_id)

  let body
  if (device?.group_id) {
    body = (
      <Link
        to={`/app/groups/${device.group_id}`}
        className="group/link flex items-center gap-4 rounded-inner bg-raised p-4 ring-1 ring-line transition-colors duration-150 hover:bg-hover"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-inner bg-accent/12 text-accent">
          <Users className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {groups.loading && !current ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <span className="block truncate text-md font-medium text-text">{current?.name ?? "Your group"}</span>
          )}
          <span className="block text-sm text-subtle">
            {current ? `${memberLine(current.member_count)} · see who's done today` : "See who's done today"}
          </span>
        </span>
        <ChevronRight
          className="size-5 shrink-0 text-subtle transition-transform duration-150 group-hover/link:translate-x-0.5"
          aria-hidden
        />
      </Link>
    )
  } else if (!canManage) {
    body = <p className="text-sm text-subtle">Not in a group. The owner can add it to one.</p>
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {others.length ? (
          <ul className="flex flex-col gap-2">
            {others.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-inner bg-raised px-4 py-3 ring-1 ring-line">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{g.name}</span>
                  <span className="block text-xs text-subtle">{memberLine(g.member_count)}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => onAttachGroup?.(g.id)} disabled={attaching}>
                  <Plus aria-hidden />
                  Add here
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div>{joinSlot}</div>
      </div>
    )
  }

  return (
    <PanelCard aria-labelledby="habit-group-title">
      <PanelHeader
        id="habit-group-title"
        icon={Users}
        title="Group"
        description={device?.group_id ? null : "Keep a streak with friends. Everyone sees who's done for the day."}
      />
      {body}
    </PanelCard>
  )
}

export function HabitPanelView({
  device,
  canManage = false,
  streak = {},
  onToneChange,
  toneSaving = false,
  onReminderChange,
  reminderSaving = false,
  groups,
  onAttachGroup,
  attaching = false,
  joinSlot,
  className,
}) {
  const tz = device?.timezone
  const current = streak.current ?? device?.streak?.current ?? device?.today?.streak ?? 0
  const best = streak.best ?? device?.streak?.best ?? current
  const history = streak.history ?? []
  const doneToday = Boolean(device?.today?.done ?? history.at(-1)?.done)

  return (
    <div className={cn("@container flex flex-col gap-6", className)}>
      <div className="grid grid-cols-1 gap-6 @[44rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PanelCard aria-label="Streak">
          <StreakCounter
            current={current}
            best={best}
            doneToday={doneToday}
            loading={streak.loading && !device?.streak}
          />
        </PanelCard>
        <ConsistencyGrid
          history={history}
          today={history.at(-1)?.date}
          timeZone={tz}
          loading={streak.loading}
          error={streak.error}
          onRetry={streak.onRetry}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 @[44rem]:grid-cols-2">
        <PanelCard aria-label="Nudges" className="gap-6">
          <ToneToggle value={device?.tone} onChange={onToneChange} saving={toneSaving} disabled={!canManage} />
          <div className="border-t border-line pt-6">
            <HabitReminderSetting
              value={device?.reminder_time ?? null}
              onChange={onReminderChange}
              saving={reminderSaving}
              disabled={!canManage}
            />
          </div>
        </PanelCard>
        <GroupCard
          device={device}
          canManage={canManage}
          groups={groups}
          onAttachGroup={onAttachGroup}
          attaching={attaching}
          joinSlot={joinSlot}
        />
      </div>
    </div>
  )
}

export default function HabitPanel({ device, canManage = false, className }) {
  const id = device?.id
  const streak = useStreak(id)
  const groups = useGroups()
  const tone = useUpdateDevice(id)
  const reminder = useUpdateDevice(id)
  const group = useUpdateDevice(id)
  const refreshGroups = useRefreshGroups()

  const save = (mutation, patch, fallback, success) =>
    mutation.mutateAsync(patch).then(
      () => success && toast.success(success),
      (err) => toast.error(errorMessage(err, fallback))
    )

  function attach(groupId, name) {
    return save(group, { group_id: groupId }, "Couldn't add it to that group.", name ? `${device.name} is in ${name}` : null)
  }

  return (
    <HabitPanelView
      device={device}
      canManage={canManage}
      className={className}
      streak={{
        current: streak.data?.current,
        best: streak.data?.best,
        history: streak.data?.history ?? [],
        loading: streak.isLoading,
        error: streak.error ? errorMessage(streak.error, "Couldn't load your streak.") : null,
        onRetry: () => streak.refetch(),
      }}
      onToneChange={(next) => save(tone, { tone: next }, "Couldn't change the tone.")}
      toneSaving={tone.isPending}
      onReminderChange={(next) =>
        save(reminder, { reminder_time: next }, "Couldn't save the reminder.", next ? "Reminder saved" : "Reminder off")
      }
      reminderSaving={reminder.isPending}
      groups={{ list: groups.data ?? [], loading: groups.isLoading }}
      onAttachGroup={(gid) => attach(gid, groups.data?.find((g) => g.id === gid)?.name)}
      attaching={group.isPending}
      joinSlot={
        <GroupJoinCreate
          trigger={
            <Button variant="outline">
              <Users aria-hidden />
              Join or create a group
            </Button>
          }
          onDone={(g) => {
            refreshGroups()
            attach(g.id)
          }}
        />
      }
    />
  )
}
