import { useState } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/AuthContext"

function AuthForm({ submitLabel, onSubmit }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(email, password)
    } catch (err) {
      toast.error(err?.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder="Password"
        autoComplete={submitLabel === "Sign up" ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />
      <Button type="submit" disabled={submitting}>
        {submitting ? "Please wait…" : submitLabel}
      </Button>
    </form>
  )
}

export default function Login() {
  const { session, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || "/app"

  if (session) return <Navigate to={redirectTo} replace />

  async function handleSignIn(email, password) {
    await signIn(email, password)
    navigate(redirectTo, { replace: true })
  }

  async function handleSignUp(email, password) {
    const { session: newSession } = await signUp(email, password)
    if (newSession) {
      navigate(redirectTo, { replace: true })
    } else {
      // Email confirmation is enabled in Supabase.
      toast.success("Check your email to confirm your account.")
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Log in or create an account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-2">
              <AuthForm submitLabel="Log in" onSubmit={handleSignIn} />
            </TabsContent>
            <TabsContent value="signup" className="pt-2">
              <AuthForm submitLabel="Sign up" onSubmit={handleSignUp} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
