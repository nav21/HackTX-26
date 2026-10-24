/**
 * Care: "Who takes these meds?" — person_name + person_pronoun on the device.
 * Alerts read "Grandma took her 8 AM meds"; when unset the server falls back
 * to the owner's name and "their".
 *
 * CarePersonFields  presentational inputs (claim flow, forms)
 *   { label, name, pronoun, onNameChange, onPronounChange, disabled, idPrefix }
 * CarePersonForm    fields + Save, for the settings sheet and the panel dialog
 *   { device, onSave({ person_name, person_pronoun }) → Promise, onDone, compact }
 * CarePersonDialog  { open, onOpenChange, device, onSave }
 */
import { useId, useState } from "react"
import InlineError from "@/components/common/InlineError"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/errors"
import { PRONOUNS } from "@/lib/modes"

export function CarePersonFields({
  label = "Who takes these meds?",
  name = "",
  pronoun = "their",
  onNameChange,
  onPronounChange,
  disabled = false,
  idPrefix,
}) {
  const uid = useId()
  const id = idPrefix ?? uid
  const who = name.trim() || "They"
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-person`} className="text-sm font-medium text-text">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={`${id}-person`}
          placeholder="Grandma"
          value={name}
          maxLength={40}
          onChange={(e) => onNameChange?.(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1"
        />
        <Select value={pronoun || "their"} onValueChange={onPronounChange} disabled={disabled}>
          <SelectTrigger className="w-28 shrink-0" aria-label="Pronoun">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRONOUNS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-subtle">
        Alerts will read “{who} took {pronoun || "their"} 8 AM meds.”
      </p>
    </div>
  )
}

export function CarePersonForm({ device, onSave, onDone, submitLabel = "Save", label }) {
  const [name, setName] = useState(device?.person_name ?? "")
  const [pronoun, setPronoun] = useState(device?.person_pronoun ?? "their")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const dirty = name.trim() !== (device?.person_name ?? "") || pronoun !== (device?.person_pronoun ?? "their")

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const person_name = name.trim() || null
      await onSave({ person_name, person_pronoun: person_name ? pronoun : null })
      onDone?.()
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <CarePersonFields
        label={label}
        name={name}
        pronoun={pronoun}
        onNameChange={setName}
        onPronounChange={setPronoun}
        disabled={saving}
      />
      {error ? <InlineError message={error} /> : null}
      <Button type="submit" variant="secondary" className="self-start" disabled={!dirty || saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  )
}

export function CarePersonDialog({ open, onOpenChange, device, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-mode="care" className="gap-6 p-6 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Who takes these meds?</DialogTitle>
          <DialogDescription>Caregivers see this name in reminders and alerts.</DialogDescription>
        </DialogHeader>
        {open ? (
          <CarePersonForm label="Name" device={device} onSave={onSave} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
