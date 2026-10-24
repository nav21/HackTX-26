import { useState } from "react"
import { MotionConfig } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import GroupJoinCreate from "@/components/group/GroupJoinCreate"
import GroupView from "@/components/group/GroupView"

// Dev-only preview of the group page with realistic sample data (no auth, no API).

const ME = "u-nav"
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()

const MEMBERS = [
  { user_id: ME, display_name: "Nav Shrivastava", avatar_url: null, done_today: true, current: 6, best: 14, device_id: "d1" },
  { user_id: "u-maya", display_name: "Maya Chen", avatar_url: null, done_today: true, current: 11, best: 11, device_id: "d2" },
  { user_id: "u-leo", display_name: "Leo Park", avatar_url: null, done_today: false, current: 3, best: 9, device_id: "d3" },
  { user_id: "u-sam", display_name: "Sam Ortiz", avatar_url: null, done_today: true, current: 2, best: 5, device_id: "d4" },
  { user_id: "u-priya", display_name: "Priya Raman", avatar_url: null, done_today: false, current: 0, best: 7, device_id: "d5" },
]

const FEED = [
  { id: "p7", kind: "ai", ai: true, user_id: null, display_name: "Muse", body: "Three of five before 9 AM. Leo and Priya, the tubs are getting lonely.", created_at: ago(14) },
  { id: "p6", kind: "habit_done", ai: false, user_id: "u-sam", display_name: "Sam Ortiz", body: "Sam took creatine 💪 · 2-day streak", created_at: ago(22) },
  { id: "p5", kind: "habit_done", ai: false, user_id: ME, display_name: "Nav Shrivastava", body: "Nav took creatine 💪 · 6-day streak", created_at: ago(48) },
  { id: "p4", kind: "habit_done", ai: false, user_id: "u-maya", display_name: "Maya Chen", body: "Maya took creatine 💪 · 11-day streak", created_at: ago(95) },
  { id: "p3", kind: "streak_broken", ai: false, user_id: "u-priya", display_name: "Priya Raman", body: "Priya's 7-day streak ended at midnight", created_at: ago(60 * 9) },
  { id: "p2", kind: "ai", ai: true, user_id: null, display_name: "Muse", body: "Maya is on 11 days and hasn't missed once. The rest of you are making it look easy for her.", created_at: ago(60 * 26) },
  { id: "p1", kind: "habit_done", ai: false, user_id: "u-leo", display_name: "Leo Park", body: "Leo took creatine 💪 · 3-day streak", created_at: ago(60 * 30) },
]

const GROUP = {
  id: "g1",
  name: "Gym crew",
  invite_code: "K7Q2MX",
  members: MEMBERS,
  leaderboard: [...MEMBERS]
    .sort((a, b) => b.current - a.current)
    .map(({ user_id, display_name, current }) => ({ user_id, display_name, current })),
  feed: FEED,
}

const STATES = [
  { id: "ready", label: "Loaded" },
  { id: "empty", label: "Empty feed" },
  { id: "loading", label: "Loading" },
  { id: "error", label: "Error" },
  { id: "not_found", label: "Not a member" },
]

export default function PreviewGroup() {
  const [state, setState] = useState("ready")
  const [group, setGroup] = useState(GROUP)

  function simulatePost() {
    setGroup((g) => {
      const leo = g.members.find((m) => m.user_id === "u-leo")
      if (leo.done_today) {
        return {
          ...g,
          feed: [
            { id: `ai-${Date.now()}`, kind: "ai", ai: true, user_id: null, display_name: "Muse", body: "Leo showed up. Priya, you're the last box standing.", created_at: new Date().toISOString() },
            ...g.feed,
          ],
        }
      }
      const members = g.members.map((m) => (m.user_id === "u-leo" ? { ...m, done_today: true, current: 4 } : m))
      return {
        ...g,
        members,
        leaderboard: g.leaderboard.map((r) => (r.user_id === "u-leo" ? { ...r, current: 4 } : r)),
        feed: [
          { id: `p-${Date.now()}`, kind: "habit_done", ai: false, user_id: "u-leo", display_name: "Leo Park", body: "Leo took creatine 💪 · 4-day streak", created_at: new Date().toISOString() },
          ...g.feed,
        ],
      }
    })
  }

  const viewStatus = state === "empty" ? "ready" : state
  const viewGroup = state === "empty" ? { ...group, feed: [] } : group

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-svh bg-bg">
        <div className="border-b border-line bg-surface">
          <div className="page flex flex-wrap items-center gap-2 py-3">
            <span className="mr-2 text-sm text-subtle">Group preview</span>
            {STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={state === s.id}
                onClick={() => setState(s.id)}
                className={cn(
                  "h-8 cursor-pointer rounded-pill px-3 text-sm transition-colors",
                  state === s.id ? "bg-raised text-text ring-1 ring-line-strong" : "text-subtle hover:text-text"
                )}
              >
                {s.label}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={simulatePost} disabled={state !== "ready"}>
                Simulate a post
              </Button>
              <GroupJoinCreate trigger={<Button size="sm" variant="outline">Join / create dialog</Button>} />
            </div>
          </div>
        </div>
        <GroupView
          status={viewStatus}
          group={viewGroup}
          error="Can't reach the server. Check your connection."
          onRetry={() => setState("ready")}
          currentUserId={ME}
          live
        />
      </div>
    </MotionConfig>
  )
}
