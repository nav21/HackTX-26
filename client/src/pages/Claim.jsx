import { useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, ChevronLeft } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { CarePersonFields } from "@/components/device/CarePerson"
import InlineError from "@/components/common/InlineError"
import VirtualBox from "@/components/VirtualBox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { errorCode, errorMessage } from "@/lib/errors"
import { CONTAINER_ORDER, CONTAINERS, MODE_ORDER, MODES } from "@/lib/modes"
import { keys, useClaimDevice } from "@/lib/queries"
import { cn } from "@/lib/utils"

const STEPS = ["Pair", "Name", "Mode"]
const NAME_HINTS = {
  pillbox: "Grandma's pillbox",
  supplement: "Creatine",
  backpack: "School backpack",
  drawer: "Desk drawer",
  other: "My box",
}

function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < step
        const current = i === step
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200",
                done && "bg-accent text-on-accent",
                current && "bg-text text-on-accent",
                !done && !current && "bg-raised text-subtle"
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-sm", current ? "text-text" : "text-subtle")}>{label}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-line-strong" aria-hidden /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function CodeInput({ value, onChange, invalid, autoFocus = true }) {
  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)]
  const digits = value.padEnd(4, " ").slice(0, 4).split("")

  function set(i, d) {
    const next = digits.map((c, j) => (j === i ? d : c)).join("").replace(/\s+$/, "")
    onChange(next.replace(/\s/g, ""))
  }
  function onKey(i, e) {
    if (e.key === "Backspace" && !digits[i].trim() && i > 0) {
      e.preventDefault()
      set(i - 1, " ")
      refs[i - 1].current?.focus()
    } else if (e.key === "ArrowLeft" && i > 0) refs[i - 1].current?.focus()
    else if (e.key === "ArrowRight" && i < 3) refs[i + 1].current?.focus()
  }
  function onInput(i, e) {
    const raw = e.target.value.replace(/\D/g, "")
    if (!raw) {
      set(i, " ")
      return
    }
    if (raw.length > 1) {
      const merged = (value.slice(0, i) + raw).slice(0, 4)
      onChange(merged)
      refs[Math.min(merged.length, 3)].current?.focus()
      return
    }
    set(i, raw)
    if (i < 3) refs[i + 1].current?.focus()
  }
  return (
    <div className="flex gap-3" role="group" aria-label="Pairing code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          value={d.trim()}
          onChange={(e) => onInput(i, e)}
          onKeyDown={(e) => onKey(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && i === 0}
          className="h-16 w-14 rounded-lg border border-line bg-surface text-center font-display text-3xl font-semibold text-text tabular caret-accent outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent/20 aria-invalid:border-danger sm:h-20 sm:w-16"
        />
      ))}
    </div>
  )
}

function OptionTile({ selected, onSelect, icon: Icon, title, body, accentClass, mode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-mode={mode}
      className={cn(
        "flex w-full cursor-pointer items-start gap-4 rounded-lg border p-4 text-left outline-none transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-accent",
        selected ? "border-accent/60 bg-accent/8" : "border-line bg-surface hover:border-line-strong"
      )}
    >
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors",
          selected ? "bg-accent/15 text-accent" : cn("bg-raised", accentClass ?? "text-subtle")
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-text">{title}</span>
        {body ? <span className="mt-1 block text-sm text-subtle">{body}</span> : null}
      </span>
      <span
        className={cn(
          "mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected ? "border-accent bg-accent text-on-accent" : "border-line-strong"
        )}
        aria-hidden
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
    </button>
  )
}

/** embedded: rendered inside the styleguide (no autofocus) */
export default function Claim({ embedded = false }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const claim = useClaimDevice()
  const [step, setStep] = useState(0)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [container, setContainer] = useState("pillbox")
  const [mode, setMode] = useState(null)
  const [personName, setPersonName] = useState("")
  const [personPronoun, setPersonPronoun] = useState("their")
  const qc = useQueryClient()
  const [error, setError] = useState(null)
  const [codeError, setCodeError] = useState(null)

  const codeOk = /^\d{4}$/.test(code)
  const nameOk = name.trim().length > 0 && name.trim().length <= 40

  async function finish() {
    setError(null)
    try {
      const device = await claim.mutateAsync({
        pairing_code: code,
        name: name.trim(),
        mode,
        container_type: container,
      })
      const person = personName.trim()
      if (mode === "care" && person) {
        // claim doesn't take these; set them right after (owner PATCH)
        try {
          const { data } = await api.patch(`/api/devices/${device.id}`, { person_name: person, person_pronoun: personPronoun })
          if (data?.id) qc.setQueryData(keys.device(device.id), data)
        } catch (err) {
          toast.error(errorMessage(err, `Paired, but couldn't save ${person}'s name. Add it in settings.`))
        }
      }
      navigate(`/app/devices/${device.id}`, { replace: true, state: { justClaimed: true } })
    } catch (err) {
      const c = errorCode(err)
      if (c === "not_found" || c === "conflict") {
        setCodeError(
          c === "conflict" ? errorMessage(err, "That box already has an owner.") : errorMessage(err, "That code doesn't match a box.")
        )
        setStep(0)
      } else setError(errorMessage(err))
    }
  }

  function next(e) {
    e?.preventDefault()
    if (step === 0 && codeOk) {
      setCodeError(null)
      setStep(1)
    } else if (step === 1 && nameOk) setStep(2)
    else if (step === 2 && mode) finish()
  }

  const variants = reduce
    ? { enter: {}, center: {}, exit: {} }
    : {
        enter: { opacity: 0, x: 24 },
        center: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
      }

  return (
    <div data-mode={mode ?? undefined} className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
      {/* the box reacts to each step: closed → peeking → open in the chosen mode's light */}
      <div className="flex flex-col items-center justify-center lg:order-2">
        <div className="w-40 sm:w-56 lg:w-full lg:max-w-md">
          <VirtualBox
            size="fluid"
            framing={step === 2 ? "full" : "tight"}
            open={step === 2 && Boolean(mode)}
            peek={step === 1}
            led={step === 0 ? "B,BLINK" : step === 1 ? "B" : mode ? "G" : "B"}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col lg:order-1 lg:py-8">
        <div className="flex items-center justify-between gap-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="-ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-sm text-subtle hover:text-text"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </button>
          ) : (
            <Link to="/app" className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm text-subtle hover:text-text">
              <ChevronLeft className="size-4" aria-hidden />
              Devices
            </Link>
          )}
        </div>
        <div className="mt-6">
          <Stepper step={step} />
        </div>

        <form onSubmit={next} className="mt-8 flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-6"
            >
              {step === 0 ? (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold sm:text-3xl">Enter the code on your box</h1>
                    <p className="mt-2 text-base text-subtle">It's the 4-digit number on the TSWIFT label.</p>
                  </div>
                  <CodeInput value={code} onChange={setCode} invalid={Boolean(codeError)} autoFocus={!embedded} />
                  {codeError ? <InlineError message={codeError} /> : null}
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold sm:text-3xl">What's it watching?</h1>
                    <p className="mt-2 text-base text-subtle">Give it a name people will recognize in alerts.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="claim-name" className="text-sm font-medium text-text">
                      Name
                    </Label>
                    <Input
                      id="claim-name"
                      value={name}
                      maxLength={40}
                      autoFocus={!embedded}
                      placeholder={NAME_HINTS[container]}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-text" id="container-label">
                      Container
                    </span>
                    <div role="radiogroup" aria-labelledby="container-label" className="flex flex-wrap gap-2">
                      {CONTAINER_ORDER.map((c) => {
                        const meta = CONTAINERS[c]
                        const Icon = meta.icon
                        const selected = container === c
                        return (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setContainer(c)}
                            className={cn(
                              "flex h-12 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent",
                              selected ? "border-text/60 bg-raised text-text" : "border-line text-subtle hover:border-line-strong hover:text-text"
                            )}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            <span>{meta.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold sm:text-3xl">What should an opening mean?</h1>
                    <p className="mt-2 text-base text-subtle">Same box, different job. You can switch any time.</p>
                  </div>
                  <div role="radiogroup" aria-label="Mode" className="flex flex-col gap-2">
                    {MODE_ORDER.map((m) => (
                      <OptionTile
                        key={m}
                        mode={m}
                        selected={mode === m}
                        onSelect={() => setMode(m)}
                        icon={MODES[m].icon}
                        title={MODES[m].label}
                        body={MODES[m].blurb}
                        accentClass={m === "care" ? "text-care" : m === "habit" ? "text-habit" : "text-security"}
                      />
                    ))}
                  </div>
                  <AnimatePresence initial={false}>
                    {mode === "care" ? (
                      <motion.div
                        key="care-person"
                        initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                        data-mode="care"
                      >
                        <div className="rounded-card border border-line bg-surface p-4">
                          <CarePersonFields
                            idPrefix="claim"
                            label="Who takes these meds? (optional)"
                            name={personName}
                            pronoun={personPronoun}
                            onNameChange={setPersonName}
                            onPronounChange={setPersonPronoun}
                          />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  {error ? <InlineError message={error} onRetry={finish} /> : null}
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8">
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={(step === 0 && !codeOk) || (step === 1 && !nameOk) || (step === 2 && (!mode || claim.isPending))}
            >
              {step < 2 ? "Continue" : claim.isPending ? "Pairing…" : "Pair device"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
