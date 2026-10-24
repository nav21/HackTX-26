import { Navigate, useLocation } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-svh bg-bg" aria-busy="true">
        <div className="page flex h-16 items-center justify-between border-b border-line">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="page flex flex-col gap-4 pt-8">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-44 w-full rounded-card" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
