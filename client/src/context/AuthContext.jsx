import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

const AuthContext = createContext(null)

const notConfiguredError = new Error(
  "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => {
    async function signIn(email, password) {
      if (!supabase) throw notConfiguredError
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    }

    async function signUp(email, password) {
      if (!supabase) throw notConfiguredError
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      return data
    }

    async function signOut() {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }

    return {
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signOut,
    }
  }, [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
