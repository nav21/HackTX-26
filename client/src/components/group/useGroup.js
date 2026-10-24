import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import { supabase } from "@/lib/supabase"
import { apiErrorMessage } from "./groupUtils"

export const groupKey = (id) => ["group", id]

const isNotFound = (err) => err?.response?.status === 404 || err?.response?.data?.error?.code === "not_found"

/*
 * Group data: GET /api/groups/:id, plus a Realtime subscription to new
 * group_posts rows for this group. A new post shows up right away
 * (name filled in from the member list), then the summary is refetched,
 * since a post usually means someone's done_today / streak changed too.
 */
export function useGroup(id) {
  const qc = useQueryClient()
  const [live, setLive] = useState(false)

  const query = useQuery({
    queryKey: groupKey(id),
    queryFn: async () => (await api.get(`/api/groups/${id}`)).data,
    enabled: Boolean(id),
    retry: (count, err) => !isNotFound(err) && count < 2,
  })

  useEffect(() => {
    if (!supabase || !id) return
    const channel = supabase
      .channel(`group-posts-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_posts", filter: `group_id=eq.${id}` },
        (payload) => {
          const row = payload.new
          qc.setQueryData(groupKey(id), (g) => {
            if (!g || g.feed?.some((p) => p.id === row.id)) return g
            const member = g.members?.find((m) => m.user_id === row.user_id)
            const post = { ...row, display_name: row.display_name ?? member?.display_name ?? "Someone" }
            return { ...g, feed: [post, ...(g.feed ?? [])].slice(0, 50) }
          })
          qc.invalidateQueries({ queryKey: groupKey(id) })
        }
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"))

    return () => {
      setLive(false)
      supabase.removeChannel(channel)
    }
  }, [id, qc])

  let status = "ready"
  if (query.isPending) status = "loading"
  else if (query.isError && !query.data) status = isNotFound(query.error) ? "not_found" : "error"

  return {
    group: query.data ?? null,
    status,
    error: query.isError ? apiErrorMessage(query.error, "Couldn't load this group.") : null,
    live,
    reload: () => query.refetch(),
  }
}
