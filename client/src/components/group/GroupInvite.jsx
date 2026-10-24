import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement("textarea")
  el.value = text
  el.setAttribute("readonly", "")
  el.style.position = "fixed"
  el.style.opacity = "0"
  document.body.appendChild(el)
  el.select()
  document.execCommand("copy")
  el.remove()
}

export default function GroupInvite({ code, className }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])

  async function handleCopy() {
    try {
      await copyText(code)
      setCopied(true)
      toast.success("Invite code copied", { description: "Friends enter it under Join a group." })
    } catch {
      toast.error("Couldn't copy. Select the code and copy it by hand.")
    }
  }

  return (
    <div className={cn("flex items-center gap-4 rounded-card bg-surface py-3 pr-3 pl-5 ring-1 ring-line", className)}>
      <div className="min-w-0">
        <p className="text-xs text-subtle">Invite code</p>
        <p className="font-display text-xl font-semibold tracking-[0.18em] tabular text-text select-all">{code}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleCopy}
        className="ml-auto"
        aria-label={copied ? "Invite code copied" : `Copy invite code ${code}`}
      >
        {copied ? <Check className="text-accent" aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
