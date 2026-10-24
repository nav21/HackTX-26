// Styleguide page for the mode components: every Care / Habit / Security piece in
// every state, with realistic sample data. Pure client-side, no API calls.
import { useState } from "react"
import { Flame, HeartHandshake, Play, RotateCcw, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import AdherenceCalendar from "@/components/care/AdherenceCalendar"
import AIScheduleInput from "@/components/care/AIScheduleInput"
import CareTodayHero from "@/components/care/CareTodayHero"
import DailySummaryCard from "@/components/care/DailySummaryCard"
import DoseList from "@/components/care/DoseList"
import ScheduleEditor from "@/components/care/ScheduleEditor"
import { PanelCard } from "@/components/care/states"
import { shiftDate, todayKey } from "@/components/care/scheduleUtils"
import ConsistencyGrid from "@/components/habit/ConsistencyGrid"
import HabitReminderSetting from "@/components/habit/HabitReminderSetting"
import StreakCounter from "@/components/habit/StreakCounter"
import ToneToggle from "@/components/habit/ToneToggle"
import AccessLog from "@/components/security/AccessLog"
import ArmToggle from "@/components/security/ArmToggle"
import IncidentCard from "@/components/security/IncidentCard"
import LiveLidState from "@/components/security/LiveLidState"

// ── sample data ────────────────────────────────────────────────────────────

const TODAY = todayKey()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Local wall-clock time `hhmm` on the day `daysAgo` days back → ISO. */
function at(daysAgo, hhmm) {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()

const SCHEDULES = [
  { id: "s1", label: "Morning meds", time_of_day: "08:00", days: [0, 1, 2, 3, 4, 5, 6], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
  { id: "s2", label: "Heart pill", time_of_day: "20:00", days: [1, 2, 3, 4, 5], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
  { id: "s3", label: "Vitamin D", time_of_day: "12:30", days: [0, 6], window_before_min: 30, grace_min: 30, escalate_after_min: 30, active: false },
]

// 14 days of history: mostly on time, one late evening, one missed morning, one self-reported.
function makeHistory() {
  const out = []
  for (let i = 13; i >= 1; i--) {
    const date = shiftDate(TODAY, -i)
    if (i === 11) continue // a travel day: nothing scheduled
    const morning = { id: `m${i}`, schedule_id: "s1", label: "Morning meds", time_of_day: "08:00", date, status: "taken", opened_at: at(i, "08:09"), source: "sensor", escalated: false }
    const evening = { id: `e${i}`, schedule_id: "s2", label: "Heart pill", time_of_day: "20:00", date, status: "taken", opened_at: at(i, "20:04"), source: "sensor", escalated: false }
    if (i === 6) Object.assign(morning, { status: "missed", opened_at: null, source: null, escalated: true })
    if (i === 3 || i === 2) Object.assign(evening, { status: "late", opened_at: at(i, "20:44") })
    if (i === 9) Object.assign(evening, { source: "manual", opened_at: at(i, "21:10") })
    out.push(morning, evening)
  }
  return out
}
const HISTORY = makeHistory()

const TODAY_DOSES = [
  { id: "t1", schedule_id: "s1", label: "Morning meds", time_of_day: "08:00", date: TODAY, status: "taken", opened_at: at(0, "08:12"), source: "sensor", escalated: false },
  { id: "t2", schedule_id: "s2", label: "Heart pill", time_of_day: "20:00", date: TODAY, status: "upcoming", opened_at: null, source: null, escalated: false },
]
const TODAY_ROUGH = [
  { ...TODAY_DOSES[0], status: "late", opened_at: at(0, "08:47") },
  { id: "t3", schedule_id: "s3", label: "Vitamin D", time_of_day: "12:30", date: TODAY, status: "taken", opened_at: at(0, "12:40"), source: "manual", escalated: false },
  { ...TODAY_DOSES[1], status: "missed", escalated: true },
]

const SUMMARY = {
  id: "i1",
  device_id: "d1",
  kind: "daily_summary",
  content:
    "Grandma took her morning meds at 8:12, right on schedule, and opened the box for her heart pill at 8:04 tonight. She's been on time 12 of the last 14 days.",
  data: { pattern_note: "Her evening dose has drifted about 40 minutes later than last week." },
  created_at: minutesAgo(32),
}
const SUMMARY_2 = {
  ...SUMMARY,
  id: "i2",
  content:
    "A steady day: both doses taken within ten minutes of their times, verified by the sensor. Nothing unusual this week.",
  data: {},
  created_at: new Date().toISOString(),
}

function streakHistory(pattern) {
  return pattern.split("").map((c, i) => ({ date: shiftDate(TODAY, i - (pattern.length - 1)), done: c === "1" }))
}
const HABIT_HISTORY = streakHistory("110111011111101101111110111111")

const SEC_EVENTS = [
  { id: 210, type: "closed", source: "device", occurred_at: minutesAgo(3), payload: {} },
  { id: 209, type: "opened", source: "device", occurred_at: minutesAgo(5), payload: {} },
  { id: 208, type: "disarmed", source: "server", occurred_at: minutesAgo(18), payload: {} },
  { id: 207, type: "closed", source: "device", occurred_at: minutesAgo(41), payload: {} },
  { id: 206, type: "alert_still_open", source: "server", occurred_at: minutesAgo(42), payload: { silent: false } },
  { id: 205, type: "alert", source: "device", occurred_at: minutesAgo(43), payload: { silent: false } },
  { id: 204, type: "armed", source: "server", occurred_at: minutesAgo(95), payload: {} },
  { id: 203, type: "mode_changed", source: "server", occurred_at: minutesAgo(96), payload: { from: "habit", to: "security" } },
  { id: 202, type: "closed", source: "simulator", occurred_at: at(1, "15:51"), payload: {} },
  { id: 201, type: "alert", source: "simulator", occurred_at: at(1, "15:50"), payload: { silent: true } },
  { id: 200, type: "armed", source: "server", occurred_at: at(1, "09:02"), payload: {} },
]
const INCIDENT = {
  id: "x1",
  device_id: "d3",
  kind: "incident",
  content:
    "Backpack opened at 3:42 PM while armed and stayed open for about a minute. That's the 2nd armed opening this week, both between 3 and 4 PM.",
  data: {},
  created_at: minutesAgo(42),
}
const INCIDENT_OLD = { ...INCIDENT, id: "x0", created_at: at(1, "15:52"), content: "Backpack opened at 3:50 PM while armed, from the simulator. Closed a minute later." }

// ── preview scaffolding ────────────────────────────────────────────────────

function Specimen({ label, note, className, children }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="flex items-baseline justify-between gap-3 px-1">
        <span className="text-sm font-medium text-text">{label}</span>
        {note ? <span className="text-xs text-faint">{note}</span> : null}
      </figcaption>
      {children}
    </figure>
  )
}

function ModeSection({ mode, icon: Icon, title, blurb, children }) {
  return (
    <section data-mode={mode} className="flex flex-col gap-8 border-t border-line pt-12" aria-labelledby={`${mode}-h`}>
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-control bg-accent/12 text-accent ring-1 ring-accent/25">
          <Icon className="size-6" aria-hidden />
        </span>
        <div>
          <h2 id={`${mode}-h`} className="font-display text-2xl font-medium">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-base text-subtle">{blurb}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function Group({ title, children, className }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-lg font-medium text-subtle">{title}</h3>
      <div className={cn("grid gap-6", className)}>{children}</div>
    </div>
  )
}

// ── Care ───────────────────────────────────────────────────────────────────

function CarePreview() {
  const [doses, setDoses] = useState(TODAY_DOSES)
  const [schedules, setSchedules] = useState(SCHEDULES)
  const [summary, setSummary] = useState(SUMMARY)
  const [generating, setGenerating] = useState(false)
  const [manualDoses, setManualDoses] = useState(TODAY_ROUGH)
  const [manualPending, setManualPending] = useState(null)

  const taken = doses.filter((d) => d.status === "taken" || d.status === "late").length
  const next = doses.find((d) => d.status === "upcoming")

  function simulateOpen() {
    setDoses((list) =>
      list.map((d) =>
        d.status === "upcoming" ? { ...d, status: "taken", opened_at: new Date().toISOString(), source: "sensor" } : d,
      ),
    )
  }

  async function markManual(dose) {
    setManualPending(dose.id)
    await wait(900)
    setManualDoses((list) =>
      list.map((d) =>
        d.id === dose.id ? { ...d, status: "taken", source: "manual", opened_at: new Date().toISOString() } : d,
      ),
    )
    setManualPending(null)
  }

  return (
    <ModeSection
      mode="care"
      icon={HeartHandshake}
      title="Care"
      blurb="Grandma's pillbox. Doses, the two-week calendar, schedules and the evening summary."
    >
      <Group title="Today" className="lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Specimen label="Today hero" note="live: tap Simulate open">
          <PanelCard>
            <CareTodayHero taken={taken} total={doses.length} nextDose={next ?? null} doses={doses} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={simulateOpen} disabled={!next}>
                <Play aria-hidden />
                Simulate open
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDoses(TODAY_DOSES)}>
                <RotateCcw aria-hidden />
                Reset
              </Button>
            </div>
          </PanelCard>
        </Specimen>
        <Specimen label="Dose list" note="caregiver view">
          <DoseList doses={doses} />
        </Specimen>
      </Group>

      <Group title="Dose list states" className="md:grid-cols-2">
        <Specimen label="Owner, rough day" note="Mark as taken works">
          <DoseList doses={manualDoses} isOwner onManual={markManual} pendingId={manualPending} />
        </Specimen>
        <Specimen label="Loading">
          <DoseList loading />
        </Specimen>
        <Specimen label="Empty">
          <DoseList doses={[]} emptyAction={<Button size="sm">Add a schedule</Button>} />
        </Specimen>
        <Specimen label="Error">
          <DoseList error="Couldn't load today's doses." onRetry={() => {}} />
        </Specimen>
      </Group>

      <Group title="Hero states" className="sm:grid-cols-2 xl:grid-cols-4">
        <Specimen label="All done">
          <PanelCard>
            <CareTodayHero taken={2} total={2} />
          </PanelCard>
        </Specimen>
        <Specimen label="Missed one">
          <PanelCard>
            <CareTodayHero doses={TODAY_ROUGH} nextDose={null} />
          </PanelCard>
        </Specimen>
        <Specimen label="Nothing scheduled">
          <PanelCard>
            <CareTodayHero taken={0} total={0} />
          </PanelCard>
        </Specimen>
        <Specimen label="Loading">
          <PanelCard>
            <CareTodayHero loading />
          </PanelCard>
        </Specimen>
      </Group>

      <Group title="Adherence" className="md:grid-cols-2 xl:grid-cols-3">
        <Specimen label="Two weeks" note="hover a day">
          <AdherenceCalendar doses={[...HISTORY, ...TODAY_DOSES]} today={TODAY} />
        </Specimen>
        <Specimen label="Loading">
          <AdherenceCalendar loading />
        </Specimen>
        <Specimen label="Error">
          <AdherenceCalendar error="Couldn't load the last two weeks." onRetry={() => {}} />
        </Specimen>
      </Group>

      <Group title="Schedules" className="lg:grid-cols-2">
        <Specimen label="Editor" note="add, edit, pause, delete">
          <ScheduleEditor
            schedules={schedules}
            onCreate={async (body) => {
              await wait(600)
              setSchedules((s) => [...s, { ...body, id: `s${Date.now()}`, active: true }])
            }}
            onUpdate={async (id, patch) => {
              await wait(400)
              setSchedules((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
            }}
            onDelete={async (id) => {
              await wait(500)
              setSchedules((s) => s.filter((x) => x.id !== id))
            }}
          />
        </Specimen>
        <Specimen label="Describe it in words" note="AI parse → confirm">
          <AIScheduleInput
            initialText="She takes her heart pill at 8 in the morning and 8 at night, weekdays only"
            onParse={async () => {
              await wait(1600)
              return {
                proposed: [
                  { label: "Heart pill (morning)", time_of_day: "08:00", days: [1, 2, 3, 4, 5] },
                  { label: "Heart pill (evening)", time_of_day: "20:00", days: [1, 2, 3, 4, 5] },
                ],
              }
            }}
            onConfirm={async (proposed) => {
              await wait(700)
              setSchedules((s) => [
                ...s,
                ...proposed.map((p, i) => ({ ...p, id: `ai${Date.now()}${i}`, window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true })),
              ])
            }}
          />
        </Specimen>
        <Specimen label="Empty, read-only" note="caregiver">
          <ScheduleEditor schedules={[]} canEdit={false} />
        </Specimen>
        <Specimen label="AI unavailable" note="parse fails">
          <AIScheduleInput
            initialText="Two pills after breakfast"
            onParse={async () => {
              await wait(900)
              throw new Error("Muse is busy right now. Try again in a minute, or add it by hand.")
            }}
          />
        </Specimen>
        <Specimen label="Loading">
          <ScheduleEditor loading />
        </Specimen>
        <Specimen label="Error">
          <ScheduleEditor error="Couldn't load schedules." onRetry={() => {}} />
        </Specimen>
      </Group>

      <Group title="Daily summary" className="md:grid-cols-2">
        <Specimen label="With pattern note" note="Generate now works">
          <DailySummaryCard
            insight={summary}
            generating={generating}
            onGenerate={async () => {
              setGenerating(true)
              await wait(1800)
              setSummary((s) => (s.id === "i1" ? SUMMARY_2 : SUMMARY))
              setGenerating(false)
            }}
          />
        </Specimen>
        <Specimen label="Empty">
          <DailySummaryCard insight={null} onGenerate={() => {}} />
        </Specimen>
        <Specimen label="Loading">
          <DailySummaryCard loading />
        </Specimen>
        <Specimen label="Error">
          <DailySummaryCard error="Couldn't load the summary." onRetry={() => {}} />
        </Specimen>
      </Group>
    </ModeSection>
  )
}

// ── Habit ──────────────────────────────────────────────────────────────────

function HabitPreview() {
  const [streak, setStreak] = useState({ current: 6, best: 14, done: false })
  const [tone, setTone] = useState("roast")
  const [reminder, setReminder] = useState("20:00")
  const [history, setHistory] = useState(HABIT_HISTORY.map((h, i, a) => (i === a.length - 1 ? { ...h, done: false } : h)))

  function open() {
    if (streak.done) return
    setStreak((s) => ({ ...s, current: s.current + 1, done: true, best: Math.max(s.best, s.current + 1) }))
    setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, done: true } : x)))
  }
  function reset() {
    setStreak({ current: 6, best: 14, done: false })
    setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, done: false } : x)))
  }

  return (
    <ModeSection mode="habit" icon={Flame} title="Habit" blurb="Nav's creatine tub. One open a day keeps the streak alive.">
      <Group title="Streak" className="lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Specimen label="Streak counter" note="live: tap Open the box">
          <PanelCard>
            <StreakCounter current={streak.current} best={streak.best} doneToday={streak.done} habitLabel="creatine" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={open} disabled={streak.done}>
                <Play aria-hidden />
                Open the box
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcw aria-hidden />
                Reset
              </Button>
            </div>
          </PanelCard>
        </Specimen>
        <Specimen label="Consistency grid">
          <ConsistencyGrid history={history} today={TODAY} />
        </Specimen>
      </Group>

      <Group title="Settings" className="md:grid-cols-2">
        <Specimen label="Tone toggle">
          <PanelCard>
            <ToneToggle value={tone} onChange={setTone} />
          </PanelCard>
        </Specimen>
        <Specimen label="Reminder" note="toggle on and off">
          <PanelCard>
            <HabitReminderSetting value={reminder} onChange={setReminder} />
          </PanelCard>
        </Specimen>
        <Specimen label="Tone toggle, saving / read-only">
          <PanelCard className="gap-6">
            <ToneToggle value="supportive" saving />
            <ToneToggle value="roast" disabled />
          </PanelCard>
        </Specimen>
        <Specimen label="Reminder off">
          <PanelCard>
            <HabitReminderSetting value={null} onChange={() => {}} />
          </PanelCard>
        </Specimen>
      </Group>

      <Group title="States" className="md:grid-cols-2 xl:grid-cols-3">
        <Specimen label="Best yet, done">
          <PanelCard>
            <StreakCounter current={21} best={21} doneToday />
          </PanelCard>
        </Specimen>
        <Specimen label="No streak yet">
          <PanelCard>
            <StreakCounter current={0} best={9} habitLabel="creatine" />
          </PanelCard>
        </Specimen>
        <Specimen label="Loading">
          <PanelCard>
            <StreakCounter loading />
          </PanelCard>
        </Specimen>
        <Specimen label="Grid empty">
          <ConsistencyGrid history={[]} today={TODAY} />
        </Specimen>
        <Specimen label="Grid loading">
          <ConsistencyGrid loading />
        </Specimen>
        <Specimen label="Error">
          <ConsistencyGrid error="Couldn't load your streak." onRetry={() => {}} />
        </Specimen>
      </Group>
    </ModeSection>
  )
}

// ── Security ───────────────────────────────────────────────────────────────

function SecurityPreview() {
  const [armed, setArmed] = useState(true)
  const [silent, setSilent] = useState(false)
  const [pending, setPending] = useState(false)
  const [lid, setLid] = useState("closed")
  const [lastOpened, setLastOpened] = useState(minutesAgo(5))
  const [events, setEvents] = useState(SEC_EVENTS)

  async function flipArmed(next) {
    setPending(true)
    await wait(450)
    setArmed(next)
    setPending(false)
    setEvents((e) => [{ id: Date.now(), type: next ? "armed" : "disarmed", source: "server", occurred_at: new Date().toISOString(), payload: {} }, ...e])
  }

  function toggleLid() {
    const opening = lid !== "open"
    const now = new Date().toISOString()
    setLid(opening ? "open" : "closed")
    if (opening) setLastOpened(now)
    const type = opening ? (armed ? "alert" : "opened") : "closed"
    setEvents((e) => [{ id: Date.now(), type, source: "simulator", occurred_at: now, payload: { silent } }, ...e])
  }

  return (
    <ModeSection mode="security" icon={Shield} title="Security" blurb="A backpack on the desk. Arm it, and any opening is an alert.">
      <Group title="Live" className="lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Specimen label="Arm toggle" note="tap it">
            <ArmToggle
              armed={armed}
              silent={silent}
              pending={pending}
              onArmedChange={flipArmed}
              onSilentChange={setSilent}
            />
          </Specimen>
          <Specimen label="Live lid state" note="live: open / close">
            <LiveLidState lidState={lid} lastOpenedAt={lastOpened} armed={armed} />
            <Button size="sm" variant="secondary" className="self-start" onClick={toggleLid}>
              <Play aria-hidden />
              {lid === "open" ? "Close the lid" : "Open the lid"}
            </Button>
          </Specimen>
        </div>
        <div className="flex flex-col gap-6">
          <Specimen label="Access log">
            <AccessLog events={events} hasMore onLoadMore={() => {}} />
          </Specimen>
          <Specimen label="Incident summary" note="fresh">
            <IncidentCard insight={INCIDENT} />
          </Specimen>
        </div>
      </Group>

      <Group title="States" className="md:grid-cols-2 xl:grid-cols-3">
        <Specimen label="Disarmed, read-only" note="caregiver">
          <ArmToggle armed={false} silent disabled />
        </Specimen>
        <Specimen label="Arm failed">
          <ArmToggle armed={false} onArmedChange={() => {}} onSilentChange={() => {}} error="Couldn't arm the box. Check your connection." onRetry={() => {}} />
        </Specimen>
        <Specimen label="Arm loading">
          <ArmToggle loading />
        </Specimen>
        <Specimen label="Open, disarmed">
          <LiveLidState lidState="open" lastOpenedAt={minutesAgo(2)} />
        </Specimen>
        <Specimen label="Offline">
          <LiveLidState lidState="unknown" status="offline" lastSeenAt={minutesAgo(14)} />
        </Specimen>
        <Specimen label="Lid loading / error">
          <div className="flex flex-col gap-4">
            <LiveLidState loading />
            <LiveLidState error="Lost the live connection." onRetry={() => {}} />
          </div>
        </Specimen>
        <Specimen label="Log empty">
          <AccessLog events={[]} />
        </Specimen>
        <Specimen label="Log loading">
          <AccessLog loading />
        </Specimen>
        <Specimen label="Log error">
          <AccessLog error="Couldn't load the access log." onRetry={() => {}} />
        </Specimen>
        <Specimen label="Incident, older">
          <IncidentCard insight={INCIDENT_OLD} />
        </Specimen>
        <Specimen label="No incidents">
          <IncidentCard insight={null} />
        </Specimen>
        <Specimen label="Incident loading / error">
          <div className="flex flex-col gap-4">
            <IncidentCard loading />
            <IncidentCard error="Couldn't load the summary." onRetry={() => {}} />
          </div>
        </Specimen>
      </Group>
    </ModeSection>
  )
}

export default function PreviewModes() {
  return (
    <div className="page flex flex-col gap-12 py-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-medium">Mode components</h1>
        <p className="mt-2 text-base text-subtle">
          Everything inside the Care, Habit and Security panels, in every state, with sample data. Each section sets
          its own mode accent.
        </p>
      </header>
      <CarePreview />
      <HabitPreview />
      <SecurityPreview />
    </div>
  )
}
