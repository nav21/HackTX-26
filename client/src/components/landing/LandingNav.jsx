import { Link } from "react-router-dom"
import Logo from "@/components/common/Logo"
import { Button } from "@/components/ui/button"

export default function LandingNav({ signedIn }) {
  return (
    <header className="page flex h-16 items-center justify-between sm:h-20">
      <Logo to="/" className="text-text" />
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
        {signedIn ? (
          <Button asChild size="sm">
            <Link to="/app">Open the app</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/login">Get started</Link>
            </Button>
          </>
        )}
      </nav>
    </header>
  )
}
