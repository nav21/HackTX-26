import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import HealthBadge from "@/components/HealthBadge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"

export default function Main() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      navigate("/login", { replace: true })
    } catch (err) {
      toast.error(err?.message || "Sign out failed")
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">App</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>
      <HealthBadge />
      <p className="text-muted-foreground">
        Main placeholder. Signed in as {user?.email}.
      </p>
    </main>
  )
}
