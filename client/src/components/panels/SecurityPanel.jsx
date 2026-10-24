/**
 * SecurityPanel — main panel for a device in Security mode. THIN SHELL.
 * The next phase composes ArmToggle, LiveLidState, AccessLog, IncidentCard
 * (components/security/*) in here.
 *
 * Props
 *  device          DeviceDetail (uses armed, silent, today {alerts_today}, lid_state)
 *  canManage       boolean — caller is the owner (can arm / disarm)
 *  onToggleArmed   (nextArmed: boolean) => void
 *  pending         boolean — an arm/disarm request is in flight
 *  className
 */
import { ShieldCheck, ShieldOff } from "lucide-react"
import BigStat from "@/components/common/BigStat"
import Surface from "@/components/common/Surface"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function SecurityPanel({ device, canManage = false, onToggleArmed, pending = false, className }) {
  const armed = Boolean(device?.armed)
  const alerts = device?.today?.alerts_today ?? 0
  return (
    <Surface className={cn("@container flex flex-col gap-6", className)}>
      <BigStat
        value={armed ? "Armed" : "Disarmed"}
        tone={armed ? "accent" : "neutral"}
        caption={
          armed
            ? alerts
              ? `${alerts} ${alerts === 1 ? "alert" : "alerts"} today`
              : "Any opening sends an alert right away."
            : "Openings are logged, but no one is alerted."
        }
      />
      {canManage ? (
        <Button
          size="lg"
          variant={armed ? "secondary" : "default"}
          onClick={() => onToggleArmed?.(!armed)}
          disabled={pending}
          className="self-start"
        >
          {armed ? <ShieldOff aria-hidden /> : <ShieldCheck aria-hidden />}
          {armed ? "Disarm" : "Arm"}
        </Button>
      ) : null}
    </Surface>
  )
}
