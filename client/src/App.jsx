import { lazy, Suspense } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AppShell from "@/components/shell/AppShell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/context/AuthContext"
import { queryClient } from "@/lib/queries"
import { RealtimeProvider } from "@/lib/realtime"
import Claim from "@/pages/Claim"
import DevicePage from "@/pages/DevicePage"
import DevicesHome from "@/pages/DevicesHome"
import Group from "@/pages/Group"
import Landing from "@/pages/Landing"
import Login from "@/pages/Login"
import Notifications from "@/pages/Notifications"
import Simulator from "@/pages/Simulator"
import Styleguide from "@/pages/Styleguide"

// Any src/pages/Preview<Name>.jsx is mounted at /styleguide/<name> (public, sample data).
const previewRoutes = Object.entries(import.meta.glob("./pages/Preview*.jsx")).map(([file, load]) => {
  const name = file.replace("./pages/Preview", "").replace(".jsx", "").toLowerCase()
  return { path: `/styleguide/${name}`, Component: lazy(load) }
})

function Protected() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <RealtimeProvider>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/styleguide" element={<Styleguide />} />
                  {previewRoutes.map(({ path, Component }) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <Suspense fallback={<div className="min-h-svh bg-bg" />}>
                          <Component />
                        </Suspense>
                      }
                    />
                  ))}
                  <Route element={<Protected />}>
                    <Route path="/app" element={<AppShell />}>
                      <Route index element={<DevicesHome />} />
                      <Route path="claim" element={<Claim />} />
                      <Route path="devices/:id" element={<DevicePage />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="groups/:id" element={<Group />} />
                    </Route>
                    <Route path="/simulator/:id" element={<Simulator />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </RealtimeProvider>
            </BrowserRouter>
            <Toaster position="top-center" />
          </TooltipProvider>
        </MotionConfig>
      </AuthProvider>
    </QueryClientProvider>
  )
}
