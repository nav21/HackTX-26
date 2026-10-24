import { Backpack, Dumbbell, Pill } from "lucide-react"

// Landing copy for the three modes. One source for the hero scene and the mode cards.
export const MODES = [
  {
    id: "care",
    name: "Care",
    audience: "For family",
    icon: Pill,
    container: "Grandma's pillbox",
    example: "Grandma's pillbox tells the family she took her 8 AM meds.",
    rule: "Opened on time counts as taken. If it stays shut past the grace period, the family gets an alert.",
    clock: "8:12",
    notification: { title: "Grandma's pillbox", body: "Grandma took her 8 AM meds · 8:12" },
    led: "G",
  },
  {
    id: "habit",
    name: "Habit",
    audience: "For friends",
    icon: Dumbbell,
    container: "Creatine tub",
    example: "Your creatine tub keeps the group streak alive.",
    rule: "The first opening each day keeps your streak. Your group sees it in the feed.",
    clock: "7:30",
    notification: { title: "Gym crew", body: "Nav took creatine 💪 · 6-day streak" },
    led: "G",
  },
  {
    id: "security",
    name: "Security",
    audience: "For your stuff",
    icon: Backpack,
    container: "Backpack",
    example: "Your backpack pings you if it's opened while armed.",
    rule: "Arm it from the app. Any opening while armed alerts you and your trusted contacts.",
    clock: "3:42",
    notification: { title: "Backpack", body: "Opened at 3:42 PM while armed" },
    led: "R,BLINK",
  },
]
