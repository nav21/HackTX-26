/**
 * PanelPreview — a mode panel driven by sample data, with fake latency, so
 * previews behave like the real page without an API. Used by
 * /styleguide/panels and the styleguide's device page.
 *
 * Props
 *  device     DeviceDetail-shaped sample (its mode picks the panel)
 *  onPatch    (patch) => void — apply a device change (tone, armed, schedules…)
 *  canManage  owner?
 *  events     Event[] newest first (Security)
 *  now
 */
import { useState } from "react"
import { toast } from "sonner"
import { CarePersonDialog } from "@/components/device/CarePerson"
import { CarePanelView } from "@/components/panels/CarePanel"
import { HabitPanelView } from "@/components/panels/HabitPanel"
import { SecurityPanelView } from "@/components/panels/SecurityPanel"
import { Button } from "@/components/ui/button"
import {
  panelDoseHistory,
  panelFreshSummary,
  panelGroups,
  panelIncident,
  panelStreakHistory,
  panelSummary,
  sampleParse,
} from "@/mocks/panels"

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let seq = 100

function CarePreview({ device, onPatch, canManage }) {
  const [summary, setSummary] = useState(panelSummary)
  const [generating, setGenerating] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [editingPerson, setEditingPerson] = useState(false)
  const [demoPending, setDemoPending] = useState(false)
  const schedules = device.schedules ?? []

  async function runDemo() {
    setDemoPending(true)
    await wait(800)
    const at = new Date(Date.now() + 90_000)
    const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
    const doses = (device.doses_today ?? []).map((d) => (d.status === "upcoming" ? { ...d, time_of_day: hhmm } : d))
    onPatch({ doses_today: doses })
    setDemoPending(false)
    const [h, m] = hhmm.split(":").map(Number)
    toast.success(`Next dose moved to ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}.`, {
      description: "Reminder sent. Missed in about a minute if the box stays shut.",
    })
  }

  async function generate() {
    setGenerating(true)
    await wait(1400)
    setSummary({ ...panelFreshSummary, created_at: new Date().toISOString() })
    setGenerating(false)
  }

  async function markManual(dose) {
    setPendingId(dose.id)
    await wait(700)
    const doses = device.doses_today.map((d) =>
      d.id === dose.id ? { ...d, status: "taken", source: "manual", opened_at: new Date().toISOString() } : d,
    )
    onPatch({ doses_today: doses, today: { ...device.today, taken: device.today.taken + 1 } })
    setPendingId(null)
    toast.success(`${dose.label} marked as taken`, { description: "Logged as self-reported." })
  }

  const setSchedules = (next) => onPatch({ schedules: next })
  return (
    <>
      <CarePersonDialog
        open={editingPerson}
        onOpenChange={setEditingPerson}
        device={device}
        onSave={async (patch) => {
          await wait(500)
          onPatch(patch)
        }}
      />
      <CarePanelView
        onEditPerson={() => setEditingPerson(true)}
        demo={{ visible: true, onClick: runDemo, pending: demoPending }}
        device={device}
        canManage={canManage}
        history={{ doses: panelDoseHistory }}
        summary={{ insight: summary, onGenerate: generate, generating }}
        onManual={markManual}
        manualPendingId={pendingId}
        schedule={{
          onCreate: async (body) => {
            await wait(500)
            setSchedules([
              ...schedules,
              { window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true, ...body, id: `s${++seq}` },
            ])
          },
          onUpdate: async (id, patch) => {
            await wait(400)
            setSchedules(schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)))
          },
          onDelete: async (id) => {
            await wait(400)
            setSchedules(schedules.filter((s) => s.id !== id))
          },
        }}
        onParse={async (text) => {
          await wait(1200)
          return sampleParse(text)
        }}
        onConfirm={async (items) => {
          await wait(700)
          setSchedules([
            ...schedules,
            ...items.map((it) => ({
              window_before_min: 60,
              grace_min: 30,
              escalate_after_min: 30,
              active: true,
              ...it,
              id: `s${++seq}`,
            })),
          ])
        }}
      />
    </>
  )
}

function HabitPreview({ device, onPatch, canManage }) {
  const [saving, setSaving] = useState(null)
  const [groups, setGroups] = useState(panelGroups)

  async function save(field, patch) {
    setSaving(field)
    await wait(500)
    onPatch(patch)
    setSaving(null)
  }

  return (
    <HabitPanelView
      device={device}
      canManage={canManage}
      streak={{ current: device.streak?.current, best: device.streak?.best, history: panelStreakHistory }}
      onReminderChange={(reminder_time) => save("reminder", { reminder_time })}
      reminderSaving={saving === "reminder"}
      groups={{ list: groups }}
      onAttachGroup={(group_id) => save("group", { group_id })}
      attaching={saving === "group"}
      joinSlot={
        <Button
          variant="outline"
          onClick={() => {
            const g = { id: `g${++seq}`, name: "New group", invite_code: "NEW123", member_count: 1 }
            setGroups((list) => [...list, g])
            save("group", { group_id: g.id })
          }}
        >
          Join or create a group
        </Button>
      }
    />
  )
}

function SecurityPreview({ device, onPatch, canManage, events, now }) {
  const [pending, setPending] = useState(false)
  async function send(patch) {
    setPending(true)
    await wait(600)
    onPatch(patch)
    setPending(false)
  }
  return (
    <SecurityPanelView
      device={device}
      canManage={canManage}
      events={events}
      now={now}
      onArmedChange={(armed) => send({ armed, led: armed ? "R" : "OFF", today: { ...device.today, armed } })}
      onSilentChange={(silent) => send({ silent })}
      pending={pending}
      incident={{ insight: panelIncident }}
    />
  )
}

export default function PanelPreview({ device, onPatch = () => {}, canManage = true, events = [], now }) {
  const props = { device, onPatch, canManage, events, now }
  if (device.mode === "habit") return <HabitPreview {...props} />
  if (device.mode === "security") return <SecurityPreview {...props} />
  return <CarePreview {...props} />
}
