import { Link } from "react-router-dom"
import { MotionConfig } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import HeroScene from "@/components/landing/HeroScene"
import HowItWorks from "@/components/landing/HowItWorks"
import LandingNav from "@/components/landing/LandingNav"
import BoxMark from "@/components/common/BoxMark"
import ModeCards from "@/components/landing/ModeCards"

export default function Landing() {
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const primary = signedIn ? { to: "/app", label: "Open the app" } : { to: "/login", label: "Get started" }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-svh overflow-x-clip bg-bg">
        <LandingNav signedIn={signedIn} />

        <main>
          <section className="page grid items-center gap-10 pt-6 pb-16 sm:gap-12 sm:pt-12 lg:grid-cols-[1fr_minmax(0,560px)] lg:gap-16 lg:pt-16 lg:pb-24">
            <div className="max-w-[560px]">
              <h1 className="text-display font-semibold tracking-[-0.03em] sm:text-hero">
                Make any container smart.
              </h1>
              <p className="mt-4 max-w-[44ch] text-md text-subtle sm:mt-6 sm:text-lg">
                BWS is a small sensor you drop into a pillbox, a supplement tub or a backpack. It notices when the lid
                opens, and the app tells the people who should know.
              </p>
              <div className="mt-6 flex flex-wrap sm:mt-8 items-center gap-3">
                <Button asChild size="lg">
                  <Link to={primary.to}>{primary.label}</Link>
                </Button>
                {!signedIn && (
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">Sign in</Link>
                  </Button>
                )}
              </div>
            </div>
            <HeroScene />
          </section>

          <ModeCards />
          <HowItWorks />

          <section className="page flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:py-24">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">Put a sensor in something that matters.</h2>
              <p className="mt-2 text-base text-subtle">Pair a box with its 4-digit code and pick a mode. It takes a minute.</p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to={primary.to}>{primary.label}</Link>
            </Button>
          </section>
        </main>

        <footer className="border-t border-line">
          <div className="page flex flex-col gap-2 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-subtle">
              <BoxMark className="size-5" />
              Box With Sensor
            </span>
            <span>Built at HackTX 2026. Updates are informational, not medical advice.</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}
