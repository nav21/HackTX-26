import axios from "axios"
import { supabase } from "@/lib/supabase"

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
})

// Attach the current Supabase access token, if logged in.
api.interceptors.request.use(async (config) => {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

export default api
