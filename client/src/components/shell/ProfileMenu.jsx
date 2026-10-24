import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initials } from "@/lib/format"

/** Avatar → menu with name, email and Sign out. */
export default function ProfileMenu({ name, email, avatarUrl, onSignOut }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-10 cursor-pointer items-center justify-center rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-accent"
        aria-label="Account"
      >
        <Avatar className="size-8">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-raised text-xs font-semibold text-text">{initials(name, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1">
        <DropdownMenuLabel className="px-2 py-2">
          <p className="truncate text-base font-medium text-text">{name || "You"}</p>
          {email ? <p className="truncate text-xs font-normal text-subtle">{email}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="h-9 gap-2 px-2 text-sm">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
