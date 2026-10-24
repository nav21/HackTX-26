// Browser notifications (Notification API). Asked once, after the first claim.

const ASKED_KEY = "bws:notifications-asked"

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported"
}

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode — fine, we may ask again */
  }
}

/** True when we haven't asked yet and the browser could still say yes. */
export function shouldAskForNotifications() {
  return notificationPermission() === "default" && !safeGet(ASKED_KEY)
}

export function markNotificationsAsked() {
  safeSet(ASKED_KEY, "1")
}

export async function requestNotificationPermission() {
  markNotificationsAsked()
  if (!notificationsSupported()) return "unsupported"
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Show a system notification for a notifications row, if permitted. */
export function showBrowserNotification(row, onClick) {
  if (notificationPermission() !== "granted") return
  try {
    const n = new Notification(row.title, {
      body: row.body ?? undefined,
      tag: `bws-${row.id}`,
      requireInteraction: Boolean(row.urgent),
      icon: "/favicon.svg",
    })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
