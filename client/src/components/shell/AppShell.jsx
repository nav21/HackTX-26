import { useState } from "react"
import { Outlet, useMatch, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import AppHeader from "@/components/shell/AppHeader"
import NameDialog from "@/components/shell/NameDialog"
import NotificationBell from "@/components/shell/NotificationBell"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/errors"
import { useMe, useUpdateMe } from "@/lib/queries"

/** Signed-in layout: header + page (max 1200, 24 px gutters). */
export default function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const updateMe = useUpdateMe()
  const [editingName, setEditingName] = useState(false)
  // GroupView brings its own page container
  const bare = useMatch("/app/groups/:id")

  async function handleSignOut() {
    try {
      await signOut()
      navigate("/login", { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't sign out. Try again."))
    }
  }

  return (
    <div className="min-h-svh bg-bg">
      <AppHeader
        name={me?.display_name || user?.user_metadata?.display_name}
        email={me?.email || user?.email}
        avatarUrl={me?.avatar_url}
        onSignOut={handleSignOut}
        onEditName={() => setEditingName(true)}
        bell={<NotificationBell />}
      />
      <main className={bare ? undefined : "page pt-8 pb-16"}>
        <Outlet />
      </main>
      <NameDialog
        open={editingName}
        onOpenChange={setEditingName}
        initial={me?.display_name ?? ""}
        onSave={async (display_name) => {
          await updateMe.mutateAsync({ display_name })
          toast.success("Name saved")
        }}
      />
    </div>
  )
}
