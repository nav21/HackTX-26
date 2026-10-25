/**
 * /styleguide — every token and every component in every state (SPEC §11.3).
 * Public route. Uses sample data shaped like API.md (src/mocks/sample.js).
 * Preview pages named src/pages/Preview*.jsx are linked automatically.
 */
import { useMemo, useState } from "react"
import { Plus, RotateCcw } from "lucide-react"
import { Link } from "react-router-dom"
import BigStat from "@/components/common/BigStat"
import EmptyState from "@/components/common/EmptyState"
import InlineError from "@/components/common/InlineError"
import Logo from "@/components/common/Logo"
import Surface from "@/components/common/Surface"
import AddDeviceCard from "@/components/device/AddDeviceCard"
import DeviceCard, { DeviceCardSkeleton } from "@/components/device/DeviceCard"
import DeviceView from "@/components/device/DeviceView"
import EventTimeline from "@/components/device/EventTimeline"
import LidIndicator from "@/components/device/LidIndicator"
import MembersPanel from "@/components/device/MembersPanel"
import ModeBadge from "@/components/device/ModeBadge"
import ModeSwitcher from "@/components/device/ModeSwitcher"
import StatusPill from "@/components/device/StatusPill"
import { VerifiedBadgeView } from "@/components/device/VerifiedBadge"
import PanelPreview from "@/components/panels/PanelPreview"
import { NotificationBellView } from "@/components/shell/NotificationBell"
import VirtualBox from "@/components/VirtualBox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LED_STATES, parseLed } from "@/lib/led"
import { MODE_ORDER, MODES } from "@/lib/modes"
import { cn } from "@/lib/utils"
import {
  sampleDeviceDetail,
  sampleDevices,
  sampleEvents,
  sampleHabitDetail,
  sampleMembers,
  sampleNotifications,
  sampleNow,
  sampleSecurityDetail,
  sampleSecurityEvents,
} from "@/mocks/sample"
import Claim from "@/pages/Claim"
import { NotificationList } from "@/pages/Notifications"
import { SimulatorView } from "@/pages/Simulator"

const previewPages = Object.keys(import.meta.glob("./Preview*.jsx")).map((p) => {
  const name = p.replace("./Preview", "").replace(".jsx", "")
  return { name, path: `/styleguide/${name.toLowerCase()}` }
})

const SECTIONS = [
  ["color", "Color"],
  ["type", "Type"],
  ["shape", "Shape & space"],
  ["motion", "Motion"],
  ["box", "The box"],
  ["indicators", "Badges & indicators"],
  ["controls", "Controls"],
  ["cards", "Device cards"],
  ["timeline", "Timeline"],
  ["members", "People"],
  ["notifications", "Notifications"],
  ["panels", "Mode panels"],
  ["states", "Empty & error"],
  ["claim", "Claim flow"],
  ["device-page", "Device page"],
  ["simulator", "Simulator"],
]

const COLOR_GROUPS = [
  {
    title: "Neutrals",
    tokens: [
      ["--bws-bg", "Background"],
      ["--bws-surface", "Surface"],
      ["--bws-raised", "Raised"],
      ["--bws-hover", "Hover"],
      ["--bws-border", "Border"],
      ["--bws-border-strong", "Border strong"],
      ["--bws-text", "Text"],
      ["--bws-muted", "Muted text"],
      ["--bws-faint", "Faint text"],
    ],
  },
  {
    title: "Mode accents",
    tokens: [
      ["--bws-care", "Care"],
      ["--bws-habit", "Habit"],
      ["--bws-security", "Security"],
    ],
  },
  {
    title: "Status",
    tokens: [
      ["--bws-success", "Success"],
      ["--bws-info", "Info"],
      ["--bws-warning", "Warning"],
      ["--bws-danger", "Danger"],
    ],
  },
  {
    title: "Box illustration",
    tokens: [
      ["--box-front", "Front"],
      ["--box-side", "Side"],
      ["--box-top", "Lid top"],
      ["--box-inner-wall", "Inside"],
      ["--box-stroke", "Line"],
      ["--box-light", "Light"],
    ],
  },
]

const TYPE_SCALE = [
  ["text-hero", "72", "display", "6"],
  ["text-display", "48", "display", "1/2"],
  ["text-3xl", "36", "display", "Grandma's pillbox"],
  ["text-2xl", "28", "display", "Good evening, Nav"],
  ["text-xl", "22", "display", "Creatine"],
  ["text-lg", "18", "display", "Activity"],
  ["text-md", "16", "body", "Inputs on phones and emphasized body text."],
  ["text-base", "15", "body", "Body. Grandma took her 8 AM meds at 8:12, verified by sensor."],
  ["text-sm", "13", "body", "Secondary lines: 1 of 2 doses taken · next 8 PM"],
  ["text-xs", "12", "body", "Tags and timestamps · 8:12 AM"],
]

function useTokenValues(names) {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()]))
  }, [names])
}

function Section({ id, title, children, description }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-12">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {description ? <p className="mt-2 max-w-2xl text-base text-subtle">{description}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  )
}

function Specimen({ label, children, className }) {
  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <div className="flex min-h-12 flex-wrap items-center gap-4">{children}</div>
      <figcaption className="text-xs text-subtle">{label}</figcaption>
    </figure>
  )
}

function ColorSection() {
  const names = useMemo(() => COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t[0])), [])
  const values = useTokenValues(names)
  return (
    <div className="flex flex-col gap-8">
      {COLOR_GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="text-lg font-semibold">{g.title}</h3>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {g.tokens.map(([name, label]) => (
              <div key={name} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="h-16 border-b border-line" style={{ background: `var(${name})` }} />
                <div className="px-3 py-2">
                  <p className="text-sm text-text">{label}</p>
                  <p className="truncate text-xs text-subtle">
                    {name} · {values[name] || "…"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-sm text-subtle">
        The page accent <code className="text-text">--accent</code> follows the mode (set with{" "}
        <code className="text-text">data-mode</code>) and is used sparingly: mode badge, primary button, active states,
        the big number.
      </p>
    </div>
  )
}

function TypeSection() {
  return (
    <div className="flex flex-col divide-y divide-line">
      {TYPE_SCALE.map(([cls, px, family, sample]) => (
        <div key={cls} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:gap-8">
          <span className="w-40 shrink-0 text-xs text-subtle">
            {cls} · {px}px · {family === "display" ? "Space Grotesk" : "Inter"}
          </span>
          <span className={cn(cls, family === "display" ? "font-display font-semibold tracking-tight" : "font-sans", "min-w-0 truncate")}>
            {sample}
          </span>
        </div>
      ))}
    </div>
  )
}

function ShapeSection() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <Specimen label="Radius · 16 cards · 12 controls · 8 inner tiles · pill">
        <div className="size-16 rounded-card border border-line-strong bg-surface" />
        <div className="size-16 rounded-control border border-line-strong bg-surface" />
        <div className="size-16 rounded-inner border border-line-strong bg-surface" />
        <div className="h-8 w-16 rounded-pill border border-line-strong bg-surface" />
      </Specimen>
      <Specimen label="Shadows · raised · pop · accent glow (per mode)">
        <div className="size-16 rounded-card bg-raised shadow-raised" />
        <div className="size-16 rounded-card bg-raised shadow-pop" />
        {MODE_ORDER.map((m) => (
          <div key={m} data-mode={m} className="size-16 rounded-card bg-raised shadow-glow" />
        ))}
      </Specimen>
      <Specimen label="Spacing · 8 px grid · 8 16 24 32 40 48 64 80 · gutter 24 · max width 1200">
        <div className="flex items-end gap-2">
          {[2, 4, 6, 8, 10, 12, 16, 20].map((n) => (
            <div key={n} className="w-4 rounded-sm bg-line-strong" style={{ height: `calc(var(--spacing) * ${n})` }} />
          ))}
        </div>
      </Specimen>
    </div>
  )
}

function MotionSection() {
  const [mode, setMode] = useState("care")
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-3 text-sm text-subtle">
        <p>
          <span className="text-text">150 ms</span> hovers and presses · <span className="text-text">200 ms</span> chip
          crossfades · <span className="text-text">300 ms</span> mode recolor · <span className="text-text">600 ms</span>{" "}
          page reveals
        </p>
        <p>Lid: spring (stiffness 150, damping 15) with a small bounce. Timeline items slide in from the left.</p>
        <p>Everything respects prefers-reduced-motion: transitions collapse and the LED stops blinking.</p>
      </div>
      <div data-mode={mode} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <ModeSwitcher value={mode} onChange={setMode} />
        <div className="flex items-center gap-6">
          <BigStat value={mode === "care" ? "1/2" : mode === "habit" ? "6" : "Armed"} unit={mode === "habit" ? "day streak" : undefined} />
        </div>
        <div className="flex gap-2">
          <Button>Primary</Button>
          <ModeBadge mode={mode} />
        </div>
      </div>
    </div>
  )
}

function BoxSection() {
  const [open, setOpen] = useState(false)
  const [led, setLed] = useState("G,BLINK")
  const [mode, setMode] = useState("care")
  return (
    <div className="flex flex-col gap-12">
      <div data-mode={mode} className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-md">
          <VirtualBox size="fluid" open={open} led={led} onToggle={() => setOpen((o) => !o)} />
        </div>
        <div className="flex flex-col gap-6">
          <p className="text-base text-subtle">
            Click the box (or focus it and press Space). The lid swings on its back hinge, light spills out in the
            mode's color, and the sensor inside lights up: that's what the real one notices.
          </p>
          <ModeSwitcher value={mode} onChange={setMode} size="sm" />
          <div className="flex flex-wrap gap-2">
            {LED_STATES.map((s) => (
              <Button key={s} size="sm" variant={led === s ? "secondary" : "ghost"} onClick={() => setLed(s)}>
                <span
                  className={cn("size-2.5 rounded-full", parseLed(s).blink && "animate-led-blink")}
                  style={{ background: parseLed(s).cssColor }}
                  aria-hidden
                />
                {s}
              </Button>
            ))}
          </div>
          <Button variant="outline" className="self-start" onClick={() => setOpen((o) => !o)}>
            {open ? "Close the lid" : "Open the lid"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Every LED</h3>
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
          {LED_STATES.map((s) => (
            <Specimen key={s} label={s} className="items-center">
              <VirtualBox size="sm" led={s} />
            </Specimen>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Sizes and states</h3>
        <div className="mt-4 flex flex-wrap items-end gap-8">
          <Specimen label="xs · closed">
            <VirtualBox size="xs" />
          </Specimen>
          <Specimen label="sm · peek">
            <VirtualBox size="sm" peek />
          </Specimen>
          <Specimen label="md · open, care">
            <div data-mode="care">
              <VirtualBox size="md" open led="G" />
            </div>
          </Specimen>
          <Specimen label="md · open, habit">
            <div data-mode="habit">
              <VirtualBox size="md" open led="G" />
            </div>
          </Specimen>
          <Specimen label="md · open, security">
            <div data-mode="security">
              <VirtualBox size="md" open led="R,BLINK" />
            </div>
          </Specimen>
          <Specimen label="lg · closed, full frame">
            <VirtualBox size="lg" led="Y,BLINK" />
          </Specimen>
        </div>
      </div>
    </div>
  )
}

function IndicatorsSection() {
  const [lid, setLid] = useState("closed")
  const now = sampleNow
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <Specimen label="ModeBadge · sm · md">
        {MODE_ORDER.map((m) => (
          <ModeBadge key={m} mode={m} />
        ))}
        {MODE_ORDER.map((m) => (
          <ModeBadge key={`${m}-md`} mode={m} size="md" />
        ))}
      </Specimen>
      <Specimen label="LidIndicator · open · closed · unknown · live toggle">
        {MODE_ORDER.map((m) => (
          <span key={m} data-mode={m}>
            <LidIndicator state="open" />
          </span>
        ))}
        <LidIndicator state="closed" />
        <LidIndicator state="unknown" />
        <span data-mode="care" className="inline-flex items-center gap-3">
          <LidIndicator state={lid} size="lg" />
          <Button size="xs" variant="secondary" onClick={() => setLid((l) => (l === "open" ? "closed" : "open"))}>
            Toggle
          </Button>
        </span>
      </Specimen>
      <Specimen label="StatusPill · online · offline">
        <StatusPill status="online" lastSeenAt={new Date(now).toISOString()} now={now} />
        <StatusPill status="offline" lastSeenAt={new Date(now - 42 * 60_000).toISOString()} now={now} />
        <StatusPill status="offline" />
      </Specimen>
      <Specimen label="VerifiedBadge · idle · checking · verified · broken · error">
        <VerifiedBadgeView onVerify={() => {}} />
        <VerifiedBadgeView loading />
        <VerifiedBadgeView result={{ valid: true, checked: 128 }} onVerify={() => {}} />
        <VerifiedBadgeView result={{ valid: false, checked: 128, brokenAt: 1042 }} onVerify={() => {}} />
        <VerifiedBadgeView error="Network" onVerify={() => {}} />
      </Specimen>
      <Specimen label="NotificationBell · none · 3 unread · 12 unread">
        <NotificationBellView count={0} to="#" />
        <NotificationBellView count={3} to="#" />
        <NotificationBellView count={12} to="#" />
      </Specimen>
      <Specimen label="BigStat · accent (care) · neutral">
        <div data-mode="care">
          <BigStat value="1/2" caption="doses taken today" />
        </div>
        <BigStat value="Disarmed" tone="neutral" size="display" />
      </Specimen>
    </div>
  )
}

function ControlsSection() {
  const [mode, setMode] = useState("habit")
  const [on, setOn] = useState(true)
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <Specimen label="ModeSwitcher · interactive · small · disabled (not owner)">
        <div data-mode={mode} className="flex flex-col gap-3">
          <ModeSwitcher value={mode} onChange={setMode} />
          <ModeSwitcher value={mode} onChange={setMode} size="sm" />
          <ModeSwitcher value="care" disabled disabledReason="Only the owner can switch modes" />
        </div>
      </Specimen>
      <Specimen label="Button · primary (accent) · secondary · outline · ghost · destructive · disabled">
        {MODE_ORDER.map((m) => (
          <span key={m} data-mode={m}>
            <Button>{MODES[m].label}</Button>
          </span>
        ))}
        <Button>Neutral primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Remove device</Button>
        <Button disabled>Disabled</Button>
      </Specimen>
      <Specimen label="Button sizes · sm 32 · default 40 · lg 48 · icon">
        <Button size="sm">
          <Plus /> Small
        </Button>
        <Button>
          <Plus /> Default
        </Button>
        <Button size="lg">
          <Plus /> Large
        </Button>
        <Button size="icon" variant="secondary" aria-label="Retry">
          <RotateCcw />
        </Button>
      </Specimen>
      <Specimen label="Input · empty · filled · invalid · disabled · Select · Switch">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-1" className="text-sm text-text">
              Name
            </Label>
            <Input id="sg-1" placeholder="Grandma's pillbox" />
          </div>
          <Input defaultValue="Creatine" aria-label="Filled" />
          <Input defaultValue="not-an-email" aria-invalid aria-label="Invalid" />
          <Input defaultValue="Disabled" disabled aria-label="Disabled" />
          <Select defaultValue="caregiver">
            <SelectTrigger className="w-full" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="caregiver">Caregiver</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-3 text-sm text-text">
            <Switch checked={on} onCheckedChange={setOn} />
            Silent alarm
          </label>
        </div>
      </Specimen>
      <Specimen label="Tabs">
        <Tabs defaultValue="a" className="w-full max-w-sm">
          <TabsList className="w-full">
            <TabsTrigger value="a">Sign in</TabsTrigger>
            <TabsTrigger value="b">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="pt-2 text-sm text-subtle">
            Tab content
          </TabsContent>
          <TabsContent value="b" className="pt-2 text-sm text-subtle">
            Other tab
          </TabsContent>
        </Tabs>
      </Specimen>
    </div>
  )
}

function CardsSection({ devices, now }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="@container">
        <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} now={now} to="#cards" />
          ))}
          <AddDeviceCard to="#cards" />
          <DeviceCardSkeleton />
        </div>
      </div>
      <p className="text-sm text-subtle">
        Care, Habit (lid open → glow), Security (caregiver view), offline, Add device (hover it), loading.
      </p>
    </div>
  )
}

function TimelineSection({ events, now }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Surface>
        <EventTimeline
          events={events}
          now={now}
          timeZone="America/Chicago"
          hasMore
          onLoadMore={() => {}}
          header={<VerifiedBadgeView result={{ valid: true, checked: 128 }} onVerify={() => {}} />}
        />
      </Surface>
      <div className="flex flex-col gap-6">
        <Surface>
          <EventTimeline events={sampleSecurityEvents} now={now} title="Every other event type" />
        </Surface>
        <Surface>
          <EventTimeline loading title="Loading" />
        </Surface>
        <Surface>
          <EventTimeline events={[]} title="Empty" />
        </Surface>
        <Surface>
          <EventTimeline error="Can't reach the TSwift server. Check your connection and try again." onRetry={() => {}} title="Error" />
        </Surface>
      </div>
    </div>
  )
}

function MembersSection() {
  const [members, setMembers] = useState(sampleMembers)
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Surface data-mode="care">
        <MembersPanel
          members={members}
          canManage
          currentUserId="u-nav"
          onInvite={async ({ email, role }) => {
            await new Promise((r) => setTimeout(r, 500))
            if (!email.includes("@example.com")) {
              const err = new Error("No TSwift account with that email")
              err.response = { data: { error: { code: "not_found", message: "No TSwift account with that email" } } }
              throw err
            }
            setMembers((m) => [...m, { user_id: email, display_name: null, email, avatar_url: null, role }])
          }}
          onRemove={async (id) => setMembers((m) => m.filter((x) => x.user_id !== id))}
          title="Owner view"
          description="Try inviting someone@example.com (works) or anyone else (error)."
        />
      </Surface>
      <div className="flex flex-col gap-6">
        <Surface>
          <MembersPanel members={sampleMembers} currentUserId="u-mom" title="Caregiver view (read only)" />
        </Surface>
        <Surface>
          <MembersPanel loading title="Loading" description={null} />
        </Surface>
        <Surface>
          <MembersPanel error="Can't reach the TSwift server." onRetry={() => {}} title="Error" description={null} />
        </Surface>
      </div>
    </div>
  )
}

function PanelsSection() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-subtle">
        The full Care, Habit and Security panels, on sample data. Every role and the phone layout are on{" "}
        <Link to="/styleguide/panels" className="text-accent underline-offset-4 hover:underline">
          /styleguide/panels
        </Link>
        .
      </p>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {[sampleDeviceDetail, sampleHabitDetail, { ...sampleSecurityDetail, role: "owner" }].map((d) => (
          <div key={d.id} data-mode={d.mode}>
            <PanelSample device={d} />
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelSample({ device: initial }) {
  const [device, setDevice] = useState(initial)
  return <PanelPreview device={device} onPatch={(p) => setDevice((d) => ({ ...d, ...p }))} events={sampleSecurityEvents} />
}

function StatesSection() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          boxSize="lg"
          peek
          title="Add your first TSwift"
          body="Put the sensor in any container: a pillbox, a drawer, a backpack. You decide what an opening means."
          action={
            <Button size="lg">
              <Plus /> Add a device
            </Button>
          }
        />
      </div>
      <div className="flex flex-col gap-4">
        <InlineError message="Can't reach the TSwift server. Check your connection and try again." onRetry={() => {}} />
        <InlineError message="That code doesn't match a box." />
        <div className="rounded-card border border-line bg-surface">
          <EmptyState title="No notifications yet" body="Reminders, check-ins and alerts from your boxes land here." />
        </div>
      </div>
    </div>
  )
}

function DevicePageSection({ now }) {
  const [device, setDevice] = useState(sampleDeviceDetail)
  const [events, setEvents] = useState(sampleEvents)
  const [nextId, setNextId] = useState(5000)

  function toggleLid() {
    const open = device.lid_state !== "open"
    setDevice((d) => ({ ...d, lid_state: open ? "open" : "closed", led: open ? "G" : d.led }))
    setEvents((evs) => [
      {
        id: nextId,
        device_id: device.id,
        type: open ? "opened" : "closed",
        source: "simulator",
        seq: null,
        occurred_at: new Date().toISOString(),
        payload: {},
        hash: "x",
      },
      ...evs,
    ])
    setNextId((n) => n + 1)
  }

  const view = (
    <DeviceView
      device={device}
      now={now}
      canManage
      panel={<PanelPreview device={device} onPatch={(p) => setDevice((d) => ({ ...d, ...p }))} events={events} now={now} />}
      onOpenSettings={() => {}}
      liveHere
      backTo="#device-page"
      verifyBadge={<VerifiedBadgeView result={{ valid: true, checked: events.length + 117 }} onVerify={() => {}} />}
      timeline={{ events }}
    />
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={toggleLid}>
          {device.lid_state === "open" ? "Close the box" : "Open the box"}
        </Button>
        <p className="text-sm text-subtle">Simulates a live event: lid, LED, card glow and the timeline update together.</p>
      </div>
      <div>
        <h3 className="mb-4 text-lg font-semibold">Desktop</h3>
        <div className="rounded-card border border-line bg-bg p-6">{view}</div>
      </div>
      <div>
        <h3 className="mb-4 text-lg font-semibold">Phone · 375 px</h3>
        <div className="mx-auto w-[375px] max-w-full overflow-hidden rounded-card border border-line-strong bg-bg">
          <div className="flex h-16 items-center justify-between border-b border-line px-6">
            <Logo to="#device-page" />
            <NotificationBellView count={2} to="#device-page" />
          </div>
          <div className="px-6 pt-8 pb-16">{view}</div>
        </div>
      </div>
    </div>
  )
}

const sampleHabitDetailPart = { streak: sampleHabitDetail.streak, today: { done: true, streak: 6 } }
const sampleSecurityPart = { armed: true, today: { armed: true, alerts_today: 0 } }

function SimulatorSection() {
  const [lid, setLid] = useState("closed")
  const device = { ...sampleDevices[1], led: lid === "open" ? "G" : "Y,BLINK" }
  return (
    <div className="overflow-hidden rounded-card border border-line-strong">
      <SimulatorView
        device={device}
        lid={lid}
        onToggle={() => setLid((l) => (l === "open" ? "closed" : "open"))}
        className="min-h-0 py-4"
      />
    </div>
  )
}

export default function Styleguide() {
  const now = sampleNow
  return (
    <div className="min-h-svh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="page flex h-16 items-center justify-between gap-4">
          <Logo to="/" />
          <nav className="flex items-center gap-1 text-sm">
            {previewPages.map((p) => (
              <Link key={p.path} to={p.path} className="rounded-md px-3 py-2 text-subtle hover:bg-raised hover:text-text">
                {p.name}
              </Link>
            ))}
            <Link to="/login" className="rounded-md px-3 py-2 text-subtle hover:bg-raised hover:text-text">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <div className="page grid gap-12 pt-12 pb-24 xl:grid-cols-[184px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <nav className="sticky top-24 flex flex-col gap-1 text-sm" aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-md px-3 py-1.5 text-subtle hover:bg-raised hover:text-text">
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex min-w-0 flex-col gap-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h1 className="text-3xl font-semibold">TSwift design system</h1>
              <p className="mt-2 text-base text-subtle">
                Calm, warm, a little playful. Every page is built from these tokens and components, shown here in each
                state with sample data.
              </p>
            </div>
            <div data-mode="care" className="w-40 self-center sm:w-48">
              <VirtualBox size="fluid" framing="tight" peekOnHover led="G" />
            </div>
          </div>

          <Section id="color" title="Color">
            <ColorSection />
          </Section>
          <Section id="type" title="Type" description="Space Grotesk for headings and big numbers. Inter for everything you read.">
            <TypeSection />
          </Section>
          <Section id="shape" title="Shape & space">
            <ShapeSection />
          </Section>
          <Section id="motion" title="Motion" description="Switch modes: the page accent recolors over 300 ms.">
            <MotionSection />
          </Section>
          <Section id="box" title="The box" description="One drawn box, used everywhere: empty states, the claim flow, the device page and the simulator.">
            <BoxSection />
          </Section>
          <Section id="indicators" title="Badges & indicators">
            <IndicatorsSection />
          </Section>
          <Section id="controls" title="Controls">
            <ControlsSection />
          </Section>
          <Section id="cards" title="Device cards" description="The home grid. Each card carries its own mode accent.">
            <CardsSection devices={sampleDevices} now={now} />
          </Section>
          <Section id="timeline" title="Timeline" description="Newest first, grouped by day, with where each event came from.">
            <TimelineSection events={sampleEvents} now={now} />
          </Section>
          <Section id="members" title="People">
            <MembersSection />
          </Section>
          <Section id="notifications" title="Notifications" description="Grouped by day. Urgent and unread ones stand out.">
            <div className="max-w-2xl">
              <NotificationList items={sampleNotifications} now={now} />
            </div>
          </Section>
          <Section id="panels" title="Mode panels" description="Thin shells for now, built on real fields (doses_today, streak, armed).">
            <PanelsSection />
          </Section>
          <Section id="states" title="Empty & error">
            <StatesSection />
          </Section>
          <Section id="claim" title="Claim flow" description="The real page, live. Steps: code, name and container, mode. Pairing only happens when you're signed in.">
            <div className="rounded-card border border-line bg-bg p-6">
              <Claim embedded />
            </div>
          </Section>
          <Section id="device-page" title="Device page" description="The full composition with sample data, desktop and phone.">
            <DevicePageSection now={now} />
          </Section>
          <Section id="simulator" title="Simulator" description="Huge, clean and projectable. Click the box.">
            <SimulatorSection />
          </Section>
        </main>
      </div>
    </div>
  )
}
