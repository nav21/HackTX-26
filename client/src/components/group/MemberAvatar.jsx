import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initials } from "./groupUtils"

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
}

export default function MemberAvatar({ name, src, size = "md", tone = "neutral", className }) {
  return (
    <Avatar className={cn(SIZES[size], "after:hidden", className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "font-display font-semibold",
          tone === "accent" ? "bg-accent/15 text-accent" : "bg-hover text-text"
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
