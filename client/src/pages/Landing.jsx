import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export default function Landing() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">HackTX</h1>
      <p className="max-w-md text-muted-foreground">Landing page placeholder.</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/login">Log in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app">Open app</Link>
        </Button>
      </div>
    </main>
  )
}
