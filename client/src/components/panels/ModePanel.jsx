import CarePanel from "@/components/panels/CarePanel"
import HabitPanel from "@/components/panels/HabitPanel"
import SecurityPanel from "@/components/panels/SecurityPanel"

/** Picks the main panel for the device's mode. Extra props pass through. */
export default function ModePanel({ device, ...props }) {
  if (device?.mode === "habit") return <HabitPanel device={device} {...props} />
  if (device?.mode === "security") return <SecurityPanel device={device} {...props} />
  return <CarePanel device={device} {...props} />
}
