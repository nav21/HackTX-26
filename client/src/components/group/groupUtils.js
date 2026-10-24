export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name = "") {
  return name.trim().split(/\s+/)[0] || "Someone"
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" })
const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })

// "Just now", "12 min ago", "3 h ago" for today; clock time otherwise.
export function postTime(iso, now = new Date()) {
  const t = new Date(iso)
  const diff = (now - t) / 1000
  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (startOfDay(t).getTime() === startOfDay(now).getTime() && diff < 6 * 3600) {
    return `${Math.floor(diff / 3600)} h ago`
  }
  return timeFmt.format(t)
}

export function dayLabel(iso, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(iso)) / 86400000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return weekdayFmt.format(new Date(iso))
  return dateFmt.format(new Date(iso))
}

export function groupByDay(posts, now = new Date()) {
  const out = []
  for (const post of posts) {
    const label = dayLabel(post.created_at, now)
    const last = out[out.length - 1]
    if (last && last.label === label) last.posts.push(post)
    else out.push({ label, posts: [post] })
  }
  return out
}

export function apiErrorMessage(err, fallback = "Something went wrong.") {
  return err?.response?.data?.error?.message || (err?.request && !err?.response ? "Can't reach the server. Check your connection." : null) || err?.message || fallback
}
