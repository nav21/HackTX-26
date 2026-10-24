import { Toaster as Sonner } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--bws-raised)",
        "--normal-text": "var(--bws-text)",
        "--normal-border": "var(--bws-border)",
        "--error-bg": "color-mix(in oklab, var(--bws-danger) 14%, var(--bws-raised))",
        "--error-text": "var(--bws-text)",
        "--error-border": "color-mix(in oklab, var(--bws-danger) 45%, transparent)",
        "--success-bg": "var(--bws-raised)",
        "--success-text": "var(--bws-text)",
        "--success-border": "var(--bws-border)",
        "--border-radius": "var(--bws-radius-control)",
        fontFamily: "var(--bws-font-body)",
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-pop",
          title: "text-base font-medium",
          description: "text-sm text-subtle!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
