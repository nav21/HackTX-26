import Logo from "@/components/common/Logo"
import { NotificationBellView } from "@/components/shell/NotificationBell"
import ProfileMenu from "@/components/shell/ProfileMenu"

/** Presentational header (logo · bell · profile). AppShell wires the data. */
export default function AppHeader({ unread = 0, name, email, avatarUrl, onSignOut, bell }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-1">
          {bell ?? <NotificationBellView count={unread} />}
          <ProfileMenu name={name} email={email} avatarUrl={avatarUrl} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  )
}
