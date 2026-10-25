import { Link } from "react-router-dom"
import BoxMark from "@/components/common/BoxMark"
import { cn } from "@/lib/utils"

export default function Logo({ to = "/app", className }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 rounded-md", className)} aria-label="TSWIFT home">
      <BoxMark />
      <span className="font-display text-lg font-bold tracking-wide">TSWIFT</span>
    </Link>
  )
}
