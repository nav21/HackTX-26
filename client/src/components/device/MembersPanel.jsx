import { useState } from "react"
import { UserPlus, X } from "lucide-react"
import InlineError from "@/components/common/InlineError"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/errors"
import { initials } from "@/lib/format"
import { ROLES } from "@/lib/modes"
import { cn } from "@/lib/utils"

function RoleChip({ role }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-medium",
        role === "owner" ? "bg-accent/12 text-accent" : "bg-raised text-subtle"
      )}
    >
      {ROLES[role]?.label ?? role}
    </span>
  )
}

/**
 * People on a device: list, invite by email, remove.
 * members: Member[] · canManage (owner) · currentUserId
 * onInvite({ email, role }) → Promise · onRemove(userId) → Promise
 * loading · error (string) · onRetry · copy: "caregivers" wording for Care/Security
 */
export default function MembersPanel({
  members = [],
  canManage = false,
  currentUserId,
  onInvite,
  onRemove,
  loading = false,
  error,
  onRetry,
  title = "People",
  description = "Caregivers get updates and alerts. Viewers can see activity.",
  className,
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("caregiver")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [removeError, setRemoveError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!onInvite || !email.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      await onInvite({ email: email.trim(), role })
      setEmail("")
    } catch (err) {
      setInviteError(errorMessage(err))
    } finally {
      setInviting(false)
    }
  }

  async function remove(userId) {
    setRemoving(userId)
    setRemoveError(null)
    try {
      await onRemove?.(userId)
    } catch (err) {
      setRemoveError(errorMessage(err))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-label={title}>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-subtle">{description}</p> : null}
      </div>

      {error ? (
        <InlineError message={error} onRetry={onRetry} />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {members.length === 0 ? (
            <li className="px-4 py-4 text-sm text-subtle">Just you so far.</li>
          ) : (
            members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-10">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} alt="" /> : null}
                  <AvatarFallback className="bg-raised text-sm text-text">{initials(m.display_name, m.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-text">
                    {m.display_name || m.email}
                    {m.user_id === currentUserId ? <span className="text-subtle"> (you)</span> : null}
                  </p>
                  {m.display_name ? <p className="truncate text-xs text-subtle">{m.email}</p> : null}
                </div>
                <RoleChip role={m.role} />
                {canManage && m.role !== "owner" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(m.user_id)}
                    disabled={removing === m.user_id}
                    aria-label={`Remove ${m.display_name || m.email}`}
                  >
                    <X />
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
      {removeError ? <InlineError message={removeError} /> : null}

      {canManage ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Label htmlFor="invite-email" className="text-sm font-medium text-text">
            Invite someone
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="mom@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="sm:flex-1"
              required
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caregiver">Caregiver</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="secondary" disabled={inviting || !email.trim()} className="self-start">
            <UserPlus aria-hidden />
            {inviting ? "Adding…" : "Add person"}
          </Button>
          {inviteError ? <InlineError message={inviteError} /> : null}
          <p className="text-xs text-subtle">They need a TSwift account with this email.</p>
        </form>
      ) : null}
    </section>
  )
}
