import VirtualBox from "@/components/VirtualBox"
import { cn } from "@/lib/utils"

/** Friendly empty state with the box illustration. */
export default function EmptyState({ title, body, action, boxSize = "md", open = false, peek = false, className }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <VirtualBox size={boxSize} open={open} peek={peek} label="TSwift" />
      <h3 className="mt-6 text-xl font-semibold">{title}</h3>
      {body ? <p className="mt-2 max-w-sm text-base text-subtle">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
