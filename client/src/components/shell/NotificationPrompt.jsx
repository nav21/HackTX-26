import { BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { markNotificationsAsked, requestNotificationPermission } from "@/lib/browserNotifications"

/** One-time explanation before the browser's own permission prompt. */
export default function NotificationPrompt({ open, onOpenChange }) {
  async function allow() {
    await requestNotificationPermission()
    onOpenChange(false)
  }
  function later() {
    markNotificationsAsked()
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : later())}>
      <DialogContent className="gap-0 p-6 sm:max-w-md" showCloseButton={false}>
        <span className="inline-flex size-12 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <BellRing className="size-6" aria-hidden />
        </span>
        <DialogTitle className="mt-4 text-xl font-semibold">Get alerts on this device?</DialogTitle>
        <DialogDescription className="mt-2 text-base text-subtle">
          BWS can pop up a notification when a dose is missed or the box opens while armed, even when this tab is in the
          background. You can change this in your browser any time.
        </DialogDescription>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={later}>
            Not now
          </Button>
          <Button onClick={allow}>Turn on alerts</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
