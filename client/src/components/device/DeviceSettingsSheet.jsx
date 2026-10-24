import { useState } from "react"
import { Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import InlineError from "@/components/common/InlineError"
import { CarePersonForm } from "@/components/device/CarePerson"
import MembersPanel from "@/components/device/MembersPanel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/errors"
import { CONTAINER_ORDER, CONTAINERS } from "@/lib/modes"
import { useAddMember, useDeleteDevice, useMembers, useRemoveMember, useUpdateDevice } from "@/lib/queries"

function NameForm({ device, canManage }) {
  const update = useUpdateDevice(device.id)
  const [name, setName] = useState(device.name)
  const [error, setError] = useState(null)
  const dirty = name.trim() && name.trim() !== device.name

  async function save(e) {
    e.preventDefault()
    setError(null)
    try {
      await update.mutateAsync({ name: name.trim() })
      toast.success("Name saved")
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function setContainer(container_type) {
    setError(null)
    try {
      await update.mutateAsync({ container_type })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="device-name" className="text-sm font-medium text-text">
          Name
        </Label>
        <div className="flex gap-2">
          <Input
            id="device-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
          />
          {canManage ? (
            <Button type="submit" variant="secondary" disabled={!dirty || update.isPending}>
              Save
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-text">Container</Label>
        <Select value={device.container_type} onValueChange={setContainer} disabled={!canManage}>
          <SelectTrigger className="w-full" aria-label="Container">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTAINER_ORDER.map((c) => {
              const Icon = CONTAINERS[c].icon
              return (
                <SelectItem key={c} value={c}>
                  <Icon className="size-4" aria-hidden />
                  {CONTAINERS[c].label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      {device.pairing_code ? (
        <p className="text-sm text-subtle">
          Pairing code <span className="font-display font-semibold tracking-widest text-text">{device.pairing_code}</span>
        </p>
      ) : null}
      {error ? <InlineError message={error} /> : null}
    </form>
  )
}

function CareSection({ device }) {
  const update = useUpdateDevice(device.id)
  return (
    <section className="flex flex-col gap-3" aria-label="Care">
      <h3 className="text-md font-semibold">Care</h3>
      <CarePersonForm
        key={`${device.person_name}-${device.person_pronoun}`}
        device={device}
        onSave={async (patch) => {
          await update.mutateAsync(patch)
          toast.success(patch.person_name ? `Alerts will say ${patch.person_name}` : "Name cleared")
        }}
      />
    </section>
  )
}

function Members({ device, canManage }) {
  const { user } = useAuth()
  const q = useMembers(device.id, device.members)
  const add = useAddMember(device.id)
  const remove = useRemoveMember(device.id)
  return (
    <MembersPanel
      members={q.data ?? []}
      loading={q.isLoading}
      error={q.error ? errorMessage(q.error) : null}
      onRetry={() => q.refetch()}
      canManage={canManage}
      currentUserId={user?.id}
      onInvite={async (body) => {
        const m = await add.mutateAsync(body)
        toast.success(`Added ${m?.display_name || m?.email || body.email}`)
      }}
      onRemove={(userId) => remove.mutateAsync(userId)}
      title={device.mode === "habit" ? "People" : "Caregivers & viewers"}
    />
  )
}

function DangerZone({ device, onDeleted }) {
  const del = useDeleteDevice(device.id)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(null)
  async function run() {
    setError(null)
    try {
      await del.mutateAsync()
      setConfirm(false)
      toast.success(`${device.name} removed`)
      onDeleted?.()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Remove device</h3>
      <p className="text-sm text-subtle">
        Unpairs the box from your account and removes everyone's access. The activity log is kept, and the pairing code
        works again.
      </p>
      <Button variant="destructive" className="self-start" onClick={() => setConfirm(true)}>
        <Trash2 aria-hidden />
        Remove device
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="gap-0 p-6 sm:max-w-md">
          <DialogTitle className="text-xl font-semibold">Remove {device.name}?</DialogTitle>
          <DialogDescription className="mt-2 text-base text-subtle">
            It stops sending updates to you and {device.members?.length > 1 ? "everyone you shared it with" : "anyone else"}.
          </DialogDescription>
          {error ? <InlineError message={error} className="mt-4" /> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={run} disabled={del.isPending}>
              {del.isPending ? "Removing…" : "Remove device"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** Settings drawer: rename, container, members, remove. */
export default function DeviceSettingsSheet({ device, open, onOpenChange }) {
  const navigate = useNavigate()
  const canManage = device?.role === "owner"
  if (!device) return null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-mode={device.mode}
        className="w-full gap-0 overflow-y-auto border-line bg-surface p-0 data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="text-xl font-semibold">Settings</SheetTitle>
          <SheetDescription className="text-sm text-subtle">{device.name}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-8 p-6">
          <NameForm key={device.name} device={device} canManage={canManage} />
          <Separator className="bg-line" />
          {device.mode === "care" && canManage ? (
            <>
              <CareSection device={device} />
              <Separator className="bg-line" />
            </>
          ) : null}
          <Members device={device} canManage={canManage} />
          {canManage ? (
            <>
              <Separator className="bg-line" />
              <DangerZone device={device} onDeleted={() => navigate("/app", { replace: true })} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
