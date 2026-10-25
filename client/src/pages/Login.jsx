import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { HeartHandshake } from "lucide-react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import Logo from "@/components/common/Logo"
import InlineError from "@/components/common/InlineError"
import VirtualBox from "@/components/VirtualBox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/context/AuthContext"
import { isSupabaseConfigured } from "@/lib/supabase"

function AuthForm({ mode, onSubmit }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const signUp = mode === "signup"

  async function handleSubmit(e) {
    e.preventDefault()
    if (signUp && !name.trim()) {
      setError("Tell us your name so family and friends know who you are.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(email, password, name.trim())
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {signUp ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-name" className="text-sm font-medium text-text">
            Your name
          </Label>
          <Input
            id="signup-name"
            placeholder="Nav"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
            className="h-12"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${mode}-email`} className="text-sm font-medium text-text">
          Email
        </Label>
        <Input
          id={`${mode}-email`}
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-12"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${mode}-password`} className="text-sm font-medium text-text">
          Password
        </Label>
        <Input
          id={`${mode}-password`}
          type="password"
          placeholder={signUp ? "At least 6 characters" : ""}
          autoComplete={signUp ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          className="h-12"
        />
      </div>
      {error ? <InlineError message={error} /> : null}
      <Button type="submit" size="lg" disabled={submitting} className="mt-2">
        {submitting ? "One moment…" : signUp ? "Create account" : "Sign in"}
      </Button>
    </form>
  )
}

/** The one orchestrated moment: the lid opens, a check-in slides in. */
function Hero() {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(Boolean(reduce))
  useEffect(() => {
    if (reduce) return undefined
    const t = setTimeout(() => setOpen(true), 700)
    return () => clearTimeout(t)
  }, [reduce])
  return (
    <div data-mode="care" className="relative flex w-full max-w-lg flex-col items-center">
      <div className="w-36 sm:w-56 lg:w-full">
        <VirtualBox size="fluid" framing="full" open={open} led={open ? "G" : "Y,BLINK"} />
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.5, type: "spring", stiffness: 260, damping: 24 }}
            className="-mt-4 hidden w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-raised p-4 shadow-pop lg:flex"
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-care/12 text-care">
              <HeartHandshake className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-text">Grandma took her 8 AM meds</span>
              <span className="mt-1 block text-sm text-subtle">8:12 AM · verified by sensor</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default function Login() {
  const { session, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || "/app"
  const [notice, setNotice] = useState(null)

  if (session) return <Navigate to={redirectTo} replace />

  async function handleSignIn(email, password) {
    await signIn(email, password)
    navigate(redirectTo, { replace: true })
  }

  async function handleSignUp(email, password, name) {
    const { session: newSession } = await signUp(email, password, name)
    if (newSession) navigate(redirectTo, { replace: true })
    else setNotice("Check your email to confirm your account, then sign in.")
  }

  return (
    <div className="min-h-svh bg-bg">
      <div className="page flex h-16 items-center">
        <Logo to="/" />
      </div>
      <main className="page grid items-center gap-6 pt-0 pb-16 lg:min-h-[calc(100svh-8rem)] lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:gap-6 lg:text-left">
          <Hero />
          <div className="max-w-md">
            <h1 className="text-2xl font-semibold sm:text-3xl">Make any container smart.</h1>
            <p className="mt-2 text-base text-subtle">One lid sensor. You decide what an opening means.</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-raised">
          <h2 className="text-xl font-semibold">Welcome to TSWIFT</h2>
          <p className="mt-1 text-sm text-subtle">Sign in, or create an account to pair your first box.</p>
          {!isSupabaseConfigured ? (
            <InlineError className="mt-4" message="Sign-in isn't set up on this build yet (Supabase keys are missing)." />
          ) : null}
          {notice ? (
            <p role="status" className="mt-4 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-text">
              {notice}
            </p>
          ) : null}
          <Tabs defaultValue="login" className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <AuthForm mode="login" onSubmit={handleSignIn} />
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <AuthForm mode="signup" onSubmit={handleSignUp} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
