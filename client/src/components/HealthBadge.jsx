import { useEffect, useState } from "react"
import { api } from "@/lib/api"

const styles = {
  loading: "bg-muted text-muted-foreground",
  ok: "bg-emerald-500/15 text-emerald-400",
  error: "bg-destructive/15 text-destructive",
}

export default function HealthBadge() {
  const [state, setState] = useState({ status: "loading", data: null })

  useEffect(() => {
    let active = true
    api
      .get("/api/health")
      .then((res) => {
        if (!active) return
        const ok = res.data?.status === "ok" && res.data?.db === "ok"
        setState({ status: ok ? "ok" : "error", data: res.data })
      })
      .catch(() => {
        if (active) setState({ status: "error", data: null })
      })
    return () => {
      active = false
    }
  }, [])

  const { status, data } = state
  let label = "Checking API…"
  if (status !== "loading") {
    label = data
      ? `API: ${data.status ?? "?"} · DB: ${data.db ?? "?"}`
      : "API: unreachable"
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      <span className="size-2 rounded-full bg-current" />
      {label}
    </span>
  )
}
