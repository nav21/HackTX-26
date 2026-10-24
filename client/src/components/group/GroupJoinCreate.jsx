import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import api from "@/lib/api"
import { apiErrorMessage } from "./groupUtils"

/*
 * Join a group with an invite code, or start a new one.
 * Pass any element as `trigger`. On success it navigates to the group
 * (and calls `onDone(group)` if given).
 */
export default function GroupJoinCreate({ trigger, defaultTab = "join", onDone }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(defaultTab)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function reset(nextOpen) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const joining = tab === "join"
    const value = joining ? code.trim().toUpperCase() : name.trim()
    if (!value) {
      setError(joining ? "Enter the invite code from your friend." : "Give your group a name.")
      return
    }
    setBusy(true)
    try {
      const { data } = joining
        ? await api.post("/api/groups/join", { invite_code: value })
        : await api.post("/api/groups", { name: value })
      toast.success(joining ? `Joined ${data.name}` : `Created ${data.name}`, {
        description: joining ? undefined : `Share code ${data.invite_code} so friends can join.`,
      })
      setOpen(false)
      setCode("")
      setName("")
      onDone?.(data)
      navigate(`/app/groups/${data.id}`)
    } catch (err) {
      const status = err?.response?.status
      setError(joining && status === 404 ? "That code doesn't match a group. Check it and try again." : apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger ?? <Button variant="outline">Join or create a group</Button>}</DialogTrigger>
      <DialogContent data-mode="habit" className="gap-6 p-6 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Habit groups</DialogTitle>
          <DialogDescription>Keep streaks together. Everyone sees when the others are done for the day.</DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v)
            setError(null)
          }}
          className="gap-6"
        >
          <TabsList className="w-full">
            <TabsTrigger value="join">Join a group</TabsTrigger>
            <TabsTrigger value="create">Create one</TabsTrigger>
          </TabsList>

          <form onSubmit={submit} noValidate>
            <TabsContent value="join" className="flex flex-col gap-2">
              <Label htmlFor="group-code">Invite code</Label>
              <Input
                id="group-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7Q2MX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "group-error" : undefined}
                className="font-display tracking-[0.18em] uppercase"
              />
            </TabsContent>
            <TabsContent value="create" className="flex flex-col gap-2">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gym crew"
                maxLength={40}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "group-error" : undefined}
              />
            </TabsContent>

            {error && (
              <p id="group-error" role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
              {busy ? (tab === "join" ? "Joining…" : "Creating…") : tab === "join" ? "Join group" : "Create group"}
            </Button>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
