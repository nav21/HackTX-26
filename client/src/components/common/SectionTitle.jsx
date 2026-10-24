import { cn } from "@/lib/utils"

export default function SectionTitle({ children, action, className, as: Comp = "h2" }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <Comp className="text-lg font-semibold">{children}</Comp>
      {action}
    </div>
  )
}
