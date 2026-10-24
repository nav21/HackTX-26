import { useState } from "react"
import { Plus } from "lucide-react"
import { Link } from "react-router-dom"
import VirtualBox from "@/components/VirtualBox"
import { cn } from "@/lib/utils"

/** "Add device" tile → /app/claim. The little box peeks open on hover. */
export default function AddDeviceCard({ to = "/app/claim", className }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      to={to}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={cn(
        "group flex min-h-44 items-center gap-4 rounded-card border border-dashed border-line-strong p-6 text-subtle outline-none transition-colors duration-200 hover:border-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
    >
      <VirtualBox size="sm" peek={hover} label="" rays={false} title="" />
      <span className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text">
          <Plus className="size-4" aria-hidden />
          Add device
        </span>
        <span className="text-sm">Pair a box with the code on its label.</span>
      </span>
    </Link>
  )
}
