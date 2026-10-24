import { AnimatePresence, motion } from "framer-motion"
import { Check, HeartCrack, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import EmptyState from "@/components/common/EmptyState"
import { useNow } from "@/hooks/useNow"
import MemberAvatar from "./MemberAvatar"
import { groupByDay, postTime } from "./groupUtils"

const enter = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 420, damping: 34 },
}

function AiPost({ post, now }) {
  return (
    <div className="rounded-control bg-accent/8 p-4 ring-1 ring-accent/20">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent" aria-hidden />
        <span className="text-sm font-medium text-accent">Muse</span>
        <span className="text-xs text-subtle">group coach</span>
        <time dateTime={post.created_at} className="ml-auto text-xs text-faint">
          {postTime(post.created_at, now)}
        </time>
      </div>
      <p className="mt-2 text-base text-pretty text-text">{tidy(post.body)}</p>
    </div>
  )
}

// Keep "6-day" together so a streak never wraps as "6-" / "day".
const tidy = (text = "") => text.replace(/(\d+)-day/g, "$1‑day")

function MemberPost({ post, now }) {
  const broken = post.kind === "streak_broken"
  return (
    <div className="flex gap-3 py-1">
      <div className={cn("relative h-fit shrink-0", broken && "opacity-60")}>
        <MemberAvatar name={post.display_name} size="sm" tone={broken ? "neutral" : "accent"} />
        <span
          className={cn(
            "absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-pill ring-2 ring-surface",
            broken ? "bg-hover text-subtle" : "bg-accent text-on-accent"
          )}
          aria-hidden
        >
          {broken ? <HeartCrack className="size-2.5" /> : <Check className="size-2.5" strokeWidth={3} />}
        </span>
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className={cn("text-base text-pretty", broken ? "text-subtle" : "text-text")}>
          {tidy(post.body)}
        </p>
        <time dateTime={post.created_at} className="mt-0.5 block text-xs text-faint">
          {postTime(post.created_at, now)}
        </time>
      </div>
    </div>
  )
}

export function FeedEmpty() {
  return (
    <EmptyState
      boxSize="sm"
      title="No posts yet"
      body="When someone opens their box for the day, it shows up here."
    />
  )
}

export default function GroupFeed({ posts = [], live = false, className }) {
  const now = useNow(30_000)
  const days = groupByDay(posts, now)

  return (
    <section aria-labelledby="feed-title" className={cn("rounded-card bg-surface p-6 ring-1 ring-line sm:p-8", className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="feed-title" className="text-lg font-semibold">
          Feed
        </h2>
        {live && (
          <span className="flex items-center gap-2 text-xs text-subtle">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inset-0 animate-ping-once rounded-pill bg-accent" />
              <span className="relative size-2 rounded-pill bg-accent" />
            </span>
            Live
          </span>
        )}
      </div>

      {posts.length === 0 ? (
        <FeedEmpty />
      ) : (
        <div className="mt-4 flex flex-col gap-6" aria-live="polite">
          {days.map((day) => (
            <div key={day.label}>
              <h3 className="mb-2 font-sans text-sm font-medium text-subtle">{day.label}</h3>
              <ul className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {day.posts.map((post) => (
                    <motion.li key={post.id} layout="position" {...enter}>
                      {post.ai || post.kind === "ai" ? (
                        <AiPost post={post} now={now} />
                      ) : (
                        <MemberPost post={post} now={now} />
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
