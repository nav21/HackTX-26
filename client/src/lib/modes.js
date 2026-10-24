// Mode, container and role vocabularies shared across the app.
import {
  Archive,
  Backpack,
  Box,
  Dumbbell,
  Flame,
  FlaskConical,
  HeartHandshake,
  Pill,
  Shield,
} from "lucide-react"

export const MODE_ORDER = ["care", "habit", "security"]

export const MODES = {
  care: {
    id: "care",
    label: "Care",
    icon: HeartHandshake,
    blurb: "Medication check-ins. Family hears when a dose is taken, late or missed.",
    example: "Grandma took her 8 AM meds · 8:12",
  },
  habit: {
    id: "habit",
    label: "Habit",
    icon: Flame,
    blurb: "One open a day keeps the streak alive. Solo or with friends.",
    example: "Nav took creatine · 6-day streak",
  },
  security: {
    id: "security",
    label: "Security",
    icon: Shield,
    blurb: "Arm it, and any opening sends an instant alert.",
    example: "Backpack opened at 3:42 PM while armed",
  },
}

export const CONTAINER_ORDER = ["pillbox", "supplement", "backpack", "drawer", "other"]

export const CONTAINERS = {
  pillbox: { id: "pillbox", label: "Pillbox", icon: Pill },
  supplement: { id: "supplement", label: "Supplement", icon: FlaskConical },
  backpack: { id: "backpack", label: "Backpack", icon: Backpack },
  drawer: { id: "drawer", label: "Drawer", icon: Archive },
  other: { id: "other", label: "Something else", icon: Box },
}

// `devices.icon` can override the container icon with a lucide name.
const ICON_OVERRIDES = {
  pill: Pill,
  dumbbell: Dumbbell,
  flask: FlaskConical,
  flaskconical: FlaskConical,
  backpack: Backpack,
  archive: Archive,
  box: Box,
}

export function containerIcon(device) {
  const key = device?.icon?.toLowerCase().replace(/[^a-z]/g, "")
  if (key && ICON_OVERRIDES[key]) return ICON_OVERRIDES[key]
  return CONTAINERS[device?.container_type]?.icon ?? Box
}

export const ROLES = {
  owner: { label: "Owner", blurb: "Full control" },
  caregiver: { label: "Caregiver", blurb: "Gets updates and alerts" },
  viewer: { label: "Viewer", blurb: "Can see activity" },
}
