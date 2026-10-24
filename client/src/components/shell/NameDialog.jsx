/**
 * NameDialog — "Your name" editor (PATCH /api/me { display_name }).
 * Used from the profile menu and as the one-time prompt on /app.
 *
 * Props
 *  open, onOpenChange
 *  initial       current name (prefilled)
 *  onSave(name)  → Promise; rejections show inline
 *  title, description, cancelLabel ("Cancel" | "Later")
 */
import { useState } from "react"
import InlineError from "@/components/common/InlineError"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/lib/errors"

function NameForm({ initial, onSave, onCancel, cancelLabel }) {
  const [name, setName] = useState(initial ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const value = name.trim()
    if (!value) {
      setError("Add a name, even just a first name.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(value)
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your name. Try again."))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name" className="text-sm font-medium text-text">
          Your name
        </Label>
        <Input
          id="profile-name"
          placeholder="Nav"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoFocus
          className="h-12"
        />
      </div>
      {error ? <InlineError message={error} /> : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function NameDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title = "Your name",
  description = "Family and friends see this in alerts and groups.",
  cancelLabel = "Cancel",
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6 p-6 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* remount per open so the field starts from the current name */}
        {open ? (
          <NameForm
            initial={initial}
            cancelLabel={cancelLabel}
            onCancel={() => onOpenChange(false)}
            onSave={async (name) => {
              await onSave(name)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
