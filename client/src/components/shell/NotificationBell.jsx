import { motion, useReducedMotion } from "framer-motion"
import { Bell } from "lucide-react"
import { Link } from "react-router-dom"
import { useUnreadCount } from "@/lib/queries"
import { cn } from "@/lib/utils"

/** Bell with unread count. Wiggles when the count goes up. */
export function NotificationBellView({ count = 0, to = "/app/notifications", className }) {
  const reduce = useReducedMotion()
  const label = count ? `Notifications, ${count} unread` : "Notifications"
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-raised hover:text-text",
        className
      )}
    >
      <motion.span
        key={count}
        initial={reduce || !count ? false : { rotate: 0 }}
        animate={reduce || !count ? undefined : { rotate: [0, -14, 12, -8, 5, 0] }}
        transition={{ duration: 0.6 }}
        className="inline-flex origin-top"
      >
        <Bell className="size-5" aria-hidden />
      </motion.span>
      {count ? (
        <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-xs leading-none font-semibold text-on-accent tabular">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  )
}

export default function NotificationBell(props) {
  const count = useUnreadCount()
  return <NotificationBellView count={count} {...props} />
}
