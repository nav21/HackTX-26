// Styleguide page for the composed mode panels: the full device page with each
// mode's panel on sample data, plus each panel at phone width. No API calls.
// Mounted at /styleguide/panels.
import { useState } from "react"
import { Box } from "lucide-react"
import { CarePersonFields } from "@/components/device/CarePerson"
import DeviceView from "@/components/device/DeviceView"
import NameDialog from "@/components/shell/NameDialog"
import ProfileMenu from "@/components/shell/ProfileMenu"
import { VerifiedBadgeView } from "@/components/device/VerifiedBadge"
import PanelPreview from "@/components/panels/PanelPreview"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNow } from "@/hooks/useNow"
import { MODES, MODE_ORDER, ROLES } from "@/lib/modes"
import { sampleDeviceDetail, sampleEvents } from "@/mocks/sample"
import { panelDosesToday, panelSchedules, panelSecurityEvents } from "@/mocks/panels"

const BASE = {
  ...sampleDeviceDetail,
  name: "Grandma's pillbox",
  last_seen_at: new Date().toISOString(),
  schedules: panelSchedules,
  doses_today: panelDosesToday,
  reminder_time: "20:00",
  group_id: null,
  streak: { current: 6, best: 14, last_done_date: null },
}

/** What `today` and the LED look like in each mode for the sample box. */
const MODE_STATE = {
  care: (d) => ({
    led: "Y,BLINK",
    today: {
      next_dose: { label: "Heart pill", time_of_day: "20:00" },
      taken: d.doses_today.filter((x) => x.status === "taken" || x.status === "late").length,
      total: d.doses_today.length,
    },
  }),
  habit: (d) => ({ led: "Y,BLINK", today: { done: false, streak: d.streak.current } }),
  security: (d) => ({ led: d.armed ? "R" : "OFF", today: { armed: d.armed, alerts_today: 1 } }),
}

const withMode = (d, mode) => ({ ...d, mode, ...MODE_STATE[mode]({ ...d, mode }) })

function useSampleDevice(mode, extra = {}) {
  const [device, setDevice] = useState(() => withMode({ ...BASE, ...extra }, mode))
  const patch = (p) => setDevice((d) => ({ ...d, ...p }))
  return [device, patch, setDevice]
}

function RoleTabs({ value, onChange }) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        {Object.entries(ROLES).map(([id, r]) => (
          <TabsTrigger key={id} value={id}>
            {r.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function FullPage({ now }) {
  const [device, patch, setDevice] = useSampleDevice("care")
  const [role, setRole] = useState("owner")
  const [events, setEvents] = useState(sampleEvents)
  const shown = { ...device, role }
  const allEvents = device.mode === "security" ? [...events.filter((e) => e.id >= 9000), ...panelSecurityEvents] : events

  function toggleLid() {
    const open = device.lid_state !== "open"
    patch({ lid_state: open ? "open" : "closed", last_seen_at: new Date().toISOString() })
    setEvents((list) => [
      {
        id: 9000 + list.length,
        device_id: device.id,
        type: open ? (device.mode === "security" && device.armed ? "alert" : "opened") : "closed",
        source: "simulator",
        seq: null,
        occurred_at: new Date().toISOString(),
        payload: {},
        hash: "x",
      },
      ...list,
    ])
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="full-h">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="full-h" className="font-display text-xl font-medium">
            Device page
          </h2>
          <p className="mt-1 max-w-xl text-sm text-subtle">
            Switch modes from the page itself: the box stays, the accent and the panel change. Try each role for the
            read-only versions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RoleTabs value={role} onChange={setRole} />
          <Button variant="secondary" onClick={toggleLid}>
            <Box aria-hidden />
            {device.lid_state === "open" ? "Close the box" : "Open the box"}
          </Button>
        </div>
      </div>
      <div className="rounded-card border border-line bg-bg p-4 sm:p-6">
        <DeviceView
          device={shown}
          now={now}
          canManage={role === "owner"}
          onModeChange={(mode) => setDevice((d) => withMode(d, mode))}
          onOpenSettings={() => {}}
          simulatorTo="#full-h"
          backTo="#full-h"
          verifyBadge={<VerifiedBadgeView result={{ valid: true, checked: allEvents.length + 117 }} onVerify={() => {}} />}
          timeline={{ events: allEvents }}
          panel={<PanelPreview device={shown} onPatch={patch} canManage={role === "owner"} events={allEvents} now={now} />}
        />
      </div>
    </section>
  )
}

function PhonePanel({ mode, now }) {
  const [device, patch] = useSampleDevice(mode, mode === "habit" ? { name: "Creatine", group_id: "g1" } : mode === "security" ? { name: "School backpack", armed: true } : {})
  return (
    <figure data-mode={mode} className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3 px-1">
        <span className="text-sm font-medium text-text">{MODES[mode].label}</span>
        <span className="text-xs text-faint">375 px</span>
      </figcaption>
      <div className="mx-auto w-[375px] max-w-full rounded-card border border-line-strong bg-bg px-4 py-6">
        <PanelPreview device={device} onPatch={patch} events={panelSecurityEvents} now={now} />
      </div>
    </figure>
  )
}

function NamesSection() {
  const [name, setName] = useState("navsh001")
  const [dialog, setDialog] = useState(null) // "prompt" | "edit" | null
  const [person, setPerson] = useState("")
  const [pronoun, setPronoun] = useState("her")
  const save = async (value) => {
    await new Promise((r) => setTimeout(r, 500))
    setName(value)
  }
  return (
    <section className="flex flex-col gap-6 border-t border-line pt-12" aria-labelledby="names-h">
      <div>
        <h2 id="names-h" className="font-display text-xl font-medium">
          Names
        </h2>
        <p className="mt-1 max-w-xl text-sm text-subtle">
          The one-time prompt on /app (shown when the name is empty or just the email's first part), the profile menu
          editor, and the Care "who takes these" fields from the claim flow.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-6">
          <ProfileMenu name={name} email="navsh001@gmail.com" onEditName={() => setDialog("edit")} onSignOut={() => {}} />
          <span className="text-sm text-subtle">Signed in as {name}</span>
          <Button variant="secondary" onClick={() => setDialog("prompt")}>
            Show name prompt
          </Button>
        </div>
        <div data-mode="care" className="rounded-card border border-line bg-surface p-6">
          <CarePersonFields
            label="Who takes these meds? (optional)"
            name={person}
            pronoun={pronoun}
            onNameChange={setPerson}
            onPronounChange={setPronoun}
          />
        </div>
      </div>
      <NameDialog
        open={dialog === "prompt"}
        onOpenChange={(o) => !o && setDialog(null)}
        initial=""
        title="What should people call you?"
        description="Your family and friends see this in alerts."
        cancelLabel="Later"
        onSave={save}
      />
      <NameDialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)} initial={name} onSave={save} />
    </section>
  )
}

export default function PreviewPanels() {
  const now = useNow(15_000)
  return (
    <div className="page flex flex-col gap-12 py-12">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-medium">Mode panels</h1>
        <p className="mt-2 text-base text-subtle">
          Care, Habit and Security panels composed from the mode components, on sample data with fake latency.
        </p>
      </header>
      <FullPage now={now} />
      <section className="flex flex-col gap-6 border-t border-line pt-12" aria-labelledby="phone-h">
        <h2 id="phone-h" className="font-display text-xl font-medium">
          On a phone
        </h2>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          {MODE_ORDER.map((mode) => (
            <PhonePanel key={mode} mode={mode} now={now} />
          ))}
        </div>
      </section>
      <NamesSection />
    </div>
  )
}
