// Human microcopy for every event type (API.md "Event types").
import {
  ArrowLeftRight,
  BellRing,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Flame,
  FlameKindling,
  Hand,
  Package,
  PackageOpen,
  Power,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Siren,
  Wifi,
  WifiOff,
} from "lucide-react"
import { formatTimeOfDay } from "@/lib/format"
import { MODES } from "@/lib/modes"

// tone → color token: neutral | accent | success | warning | danger | info
const doseLabel = (p) => p?.label || (p?.time_of_day ? `${formatTimeOfDay(p.time_of_day)} dose` : "Dose")

const COPY = {
  opened: () => ({ title: "Lid opened", icon: PackageOpen, tone: "accent" }),
  closed: () => ({ title: "Lid closed", icon: Package, tone: "neutral" }),
  boot: (p) => ({
    title: "Box started up",
    detail: p?.fw_version ? `Firmware ${p.fw_version}` : null,
    icon: Power,
    tone: "neutral",
  }),
  reminder_sent: (p) => ({ title: `Reminder sent for ${doseLabel(p)}`, icon: BellRing, tone: "info" }),
  dose_taken: (p) => ({ title: `${doseLabel(p)} taken`, detail: "On time", icon: CircleCheck, tone: "success" }),
  dose_late: (p) => ({
    title: `${doseLabel(p)} taken late`,
    detail: p?.minutes_late ? `${p.minutes_late} min late` : null,
    icon: Clock,
    tone: "warning",
  }),
  dose_missed: (p) => ({ title: `${doseLabel(p)} missed`, icon: CircleAlert, tone: "danger" }),
  escalated: (p) => ({ title: `Caregivers alerted about ${doseLabel(p)}`, icon: Siren, tone: "danger" }),
  manual_taken: (p) => ({ title: `${doseLabel(p)} marked taken`, icon: Hand, tone: "success" }),
  habit_done: (p) => ({
    title: "Done for today",
    detail: p?.streak ? `${p.streak}-day streak` : null,
    icon: Flame,
    tone: "accent",
  }),
  habit_reminder: () => ({ title: "Nudge sent", icon: BellRing, tone: "info" }),
  streak_broken: (p) => ({
    title: "Streak reset",
    detail: p?.previous ? `Was ${p.previous} ${p.previous === 1 ? "day" : "days"}` : null,
    icon: FlameKindling,
    tone: "neutral",
  }),
  alert: (p) => ({
    title: "Opened while armed",
    detail: p?.silent ? "Silent alarm" : null,
    icon: ShieldAlert,
    tone: "danger",
  }),
  alert_still_open: () => ({ title: "Still open while armed", icon: ShieldAlert, tone: "danger" }),
  armed: () => ({ title: "Armed", icon: ShieldCheck, tone: "accent" }),
  disarmed: () => ({ title: "Disarmed", icon: ShieldOff, tone: "neutral" }),
  mode_changed: (p) => ({
    title: `Switched to ${MODES[p?.to]?.label ?? "a new"} mode`,
    detail: MODES[p?.from] ? `Was ${MODES[p.from].label}` : null,
    icon: ArrowLeftRight,
    tone: "neutral",
  }),
  offline: () => ({ title: "Went offline", icon: WifiOff, tone: "warning" }),
  online: () => ({ title: "Back online", icon: Wifi, tone: "neutral" }),
}

function humanize(type) {
  const s = String(type || "event").replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** → { title, detail, icon, tone } */
export function describeEvent(event) {
  const fn = COPY[event?.type]
  const base = fn ? fn(event?.payload ?? {}) : { title: humanize(event?.type), icon: CircleDot, tone: "neutral" }
  return { detail: null, ...base }
}

export const SOURCE_LABELS = {
  device: "sensor",
  simulator: "simulator",
  manual: "self-reported",
  server: "system",
}

/** Text + icon classes per tone (tokens only). */
export const TONE_CLASSES = {
  neutral: "text-subtle bg-raised",
  accent: "text-accent bg-accent/12",
  success: "text-success bg-success/12",
  warning: "text-warning bg-warning/12",
  danger: "text-danger bg-danger/12",
  info: "text-info bg-info/12",
}
