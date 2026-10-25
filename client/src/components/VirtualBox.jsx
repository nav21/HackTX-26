/**
 * VirtualBox — the TSWIFT box illustration. The product's identity.
 *
 * A small 3D model (oblique projection) drawn as SVG with a slightly
 * hand-drawn wobble. The lid is hinged on its back edge and swings open on a
 * spring; light spills out of the box while it's open; the front LED mirrors
 * the device's LED code.
 *
 * Props
 *  open        boolean            lid open (true) / closed (false)
 *  led         string             "G" | "Y" | "R" | "B" | "OFF" (+ ",BLINK"); omit to hide the LED
 *  size        "xs"|"sm"|"md"|"lg"|"xl"|number   width in px (number) or preset. "fluid" = 100% of parent
 *  framing     "full" | "tight"   "tight" crops the empty sky above a closed box (small uses);
 *                                 the lid can still peek ~45° inside the frame. Default: "full" for lg/xl/fluid, else "tight".
 *  onToggle    () => void         makes the box a button (click / Enter / Space)
 *  peek        boolean            lift the lid a little (controlled — e.g. while a parent card is hovered)
 *  peekOnHover boolean            lid lifts a little while the box itself is hovered
 *  rays        boolean            light rays when open (default true)
 *  label       string             text on the front face (default "TSWIFT"; "" hides it)
 *  title       string             accessible name (defaults to a description of the state)
 *  className   string
 *
 * Colors come from tokens: --box-*, --bws-led-*, and the page --accent (light color).
 *
 * Usage
 *  <VirtualBox open={device.lid_state === "open"} led={device.led} size="md" />
 *  <VirtualBox size="fluid" open={open} led={led} onToggle={toggle} />
 */
import { useEffect, useId, useState } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"
import { parseLed } from "@/lib/led"

// ── Model (world units) ─────────────────────────────────────────────
const W = 132 // width  (x →)
const H = 84 // height (y ↑)
const D = 72 // depth  (z → back)
const T = 14 // lid thickness
const O = 4 // lid overhang
const KX = 0.36 // oblique projection: x shift per unit depth
const KY = 0.42 // oblique projection: y shift per unit depth
const X0 = 30 // screen origin of the front-bottom-left corner
const Y0 = 228
const OPEN_DEG = 104 // fully open (just past vertical, leaning back)
const HINGE_Y = H
const HINGE_Z = D + O

const VIEW_FULL = "0 0 240 264"
const VIEW_TIGHT = "0 64 240 196"

const SIZES = { xs: 56, sm: 96, md: 168, lg: 280, xl: 440 }

// view vector (towards the viewer) for back-face culling
const VIEW = [KX, KY, -1]

const P = ([x, y, z]) => [X0 + x + z * KX, Y0 - y - z * KY]
const pathOf = (pts) => "M" + pts.map((p) => P(p).map((n) => n.toFixed(2)).join(" ")).join("L") + "Z"
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function rotateLid([x, y, z], rad) {
  const dy = y - HINGE_Y
  const dz = z - HINGE_Z
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [x, HINGE_Y + dy * c - dz * s, HINGE_Z + dy * s + dz * c]
}
function rotateNormal([x, y, z], rad) {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [x, y * c - z * s, y * s + z * c]
}

// Lid faces in closed (local) coordinates, with outward normals.
const LX0 = -O
const LX1 = W + O
const LY0 = H
const LY1 = H + T
const LZ0 = -O
const LZ1 = D + O
const LID_FACES = {
  top: { n: [0, 1, 0], pts: [[LX0, LY1, LZ0], [LX1, LY1, LZ0], [LX1, LY1, LZ1], [LX0, LY1, LZ1]] },
  under: { n: [0, -1, 0], pts: [[LX0, LY0, LZ0], [LX1, LY0, LZ0], [LX1, LY0, LZ1], [LX0, LY0, LZ1]] },
  front: { n: [0, 0, -1], pts: [[LX0, LY0, LZ0], [LX1, LY0, LZ0], [LX1, LY1, LZ0], [LX0, LY1, LZ0]] },
  back: { n: [0, 0, 1], pts: [[LX0, LY0, LZ1], [LX1, LY0, LZ1], [LX1, LY1, LZ1], [LX0, LY1, LZ1]] },
  right: { n: [1, 0, 0], pts: [[LX1, LY0, LZ0], [LX1, LY0, LZ1], [LX1, LY1, LZ1], [LX1, LY1, LZ0]] },
}
// finger tab on the lid front
const TAB = [[W / 2 - 13, LY0 - 5, LZ0 - 1.5], [W / 2 + 13, LY0 - 5, LZ0 - 1.5], [W / 2 + 13, LY0 + 4, LZ0 - 1.5], [W / 2 - 13, LY0 + 4, LZ0 - 1.5]]
// highlight along the lid's front-top edge
const LID_EDGE = [[LX0 + 3, LY1, LZ0], [LX1 - 3, LY1, LZ0]]

function lidFace(name, deg) {
  const rad = (Math.max(0, deg) * Math.PI) / 180
  const face = LID_FACES[name]
  if (dot(rotateNormal(face.n, rad), VIEW) <= 0.001) return ""
  return pathOf(face.pts.map((p) => rotateLid(p, rad)))
}

// ── Static body geometry ────────────────────────────────────────────
const BODY_FRONT = pathOf([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]])
const BODY_RIGHT = pathOf([[W, 0, 0], [W, 0, D], [W, H, D], [W, H, 0]])
const OPENING = pathOf([[0, H, 0], [W, H, 0], [W, H, D], [0, H, D]])
const INNER_BACK = pathOf([[0, 0, D], [W, 0, D], [W, H, D], [0, H, D]])
const INNER_LEFT = pathOf([[0, 0, 0], [0, 0, D], [0, H, D], [0, H, 0]])
const INNER_FLOOR = pathOf([[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D]])
const [SENSOR_X, SENSOR_Y] = P([W / 2, H - 22, D])
const [LED_X, LED_Y] = P([W - 18, H - 20, 0])
const [LABEL_X, LABEL_Y] = P([14, 16, 0])
const [SHADOW_CX, SHADOW_CY] = P([W / 2 + 8, 0, D / 2])
const [RAY_X, RAY_Y] = P([W / 2, H - 10, D / 2])
const HINGE_SY = P([0, HINGE_Y, HINGE_Z])[1]
// fold line where the front face meets the right side
const FRONT_RIGHT_EDGE = (() => {
  const [ax, ay] = P([W, 0, 0])
  const [bx, by] = P([W, H, 0])
  return `M${ax} ${ay}L${bx} ${by}`
})()

const RAYS = [-46, -26, -8, 10, 28, 48].map((deg, i) => {
  const len = [92, 118, 136, 130, 112, 88][i]
  const spread = [5, 7, 8, 8, 7, 5][i]
  const r = (deg * Math.PI) / 180
  const r1 = ((deg - spread / 2) * Math.PI) / 180
  const r2 = ((deg + spread / 2) * Math.PI) / 180
  const tip1 = [RAY_X + Math.sin(r1) * len, RAY_Y - Math.cos(r1) * len]
  const tip2 = [RAY_X + Math.sin(r2) * len, RAY_Y - Math.cos(r2) * len]
  const base1 = [RAY_X + Math.cos(r) * 10, RAY_Y + Math.sin(r) * 3]
  const base2 = [RAY_X - Math.cos(r) * 10, RAY_Y - Math.sin(r) * 3]
  return `M${base1.join(" ")}L${tip2.join(" ")}L${tip1.join(" ")}L${base2.join(" ")}Z`
})

const SPRING = { type: "spring", stiffness: 150, damping: 15, mass: 0.9 }

export default function VirtualBox({
  open = false,
  led,
  size = "md",
  framing,
  onToggle,
  peek = false,
  peekOnHover = false,
  rays = true,
  label = "TSWIFT",
  title,
  className,
}) {
  const uid = useId().replace(/:/g, "")
  const reduce = useReducedMotion()
  const [hover, setHover] = useState(false)
  const target = open ? 1 : peek || (hover && peekOnHover) ? 0.24 : 0

  const progress = useMotionValue(target)
  useEffect(() => {
    if (reduce) {
      progress.set(target)
      return
    }
    const controls = animate(progress, target, SPRING)
    return () => controls.stop()
  }, [target, reduce, progress])

  const deg = useTransform(progress, (p) => Math.max(0, p) * OPEN_DEG)
  const dTop = useTransform(deg, (d) => lidFace("top", d))
  const dUnder = useTransform(deg, (d) => lidFace("under", d))
  const dFront = useTransform(deg, (d) => lidFace("front", d))
  const dBack = useTransform(deg, (d) => lidFace("back", d))
  const dRight = useTransform(deg, (d) => lidFace("right", d))
  const dTab = useTransform(deg, (d) => {
    const rad = (Math.max(0, d) * Math.PI) / 180
    if (dot(rotateNormal([0, 0, -1], rad), VIEW) <= 0.05) return ""
    return pathOf(TAB.map((p) => rotateLid(p, rad)))
  })
  const dEdge = useTransform(deg, (d) => {
    const rad = (Math.max(0, d) * Math.PI) / 180
    if (dot(rotateNormal([0, 1, 0], rad), VIEW) <= 0.05) return ""
    const [a, b] = LID_EDGE.map((p) => P(rotateLid(p, rad)))
    return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`
  })
  const light = useTransform(progress, [0, 0.3, 1], [0, 0.55, 1], { clamp: true })
  const rayOpacity = useTransform(progress, [0.2, 1], [0, 0.42], { clamp: true })
  const underLight = useTransform(progress, [0.1, 1], [0, 1], { clamp: true })
  const sensorGlow = useTransform(progress, [0.05, 0.4], [0, 1], { clamp: true })

  const ledState = led !== undefined && led !== null ? parseLed(led) : null
  const fluid = size === "fluid"
  const width = fluid ? "100%" : typeof size === "number" ? size : SIZES[size] ?? SIZES.md
  const frame = framing ?? (fluid || size === "lg" || size === "xl" || (typeof size === "number" && size >= 240) ? "full" : "tight")
  const interactive = typeof onToggle === "function"
  const name =
    title ??
    `${label || "TSWIFT"} box, lid ${open ? "open" : "closed"}${ledState ? `, light ${ledState.label.toLowerCase()}` : ""}`

  function onKeyDown(e) {
    if (!interactive) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onToggle()
    }
  }

  const ids = {
    rough: `bws-rough-${uid}`,
    clip: `bws-open-${uid}`,
    ray: `bws-ray-${uid}`,
    halo: `bws-halo-${uid}`,
    inner: `bws-inner-${uid}`,
    led: `bws-led-${uid}`,
    blur: `bws-blur-${uid}`,
    under: `bws-under-${uid}`,
    shade: `bws-shade-${uid}`,
  }

  return (
    <svg
      viewBox={frame === "full" ? VIEW_FULL : VIEW_TIGHT}
      width={width}
      className={cn(
        "block h-auto select-none overflow-visible",
        interactive && "cursor-pointer rounded-card outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        className
      )}
      role={interactive ? "button" : "img"}
      aria-label={interactive ? `${open ? "Close" : "Open"} the lid` : name}
      aria-pressed={interactive ? open : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onToggle : undefined}
      onKeyDown={onKeyDown}
      onPointerEnter={peekOnHover ? () => setHover(true) : undefined}
      onPointerLeave={peekOnHover ? () => setHover(false) : undefined}
    >
      <title>{name}</title>
      <defs>
        {/* gentle wobble so edges read as drawn, not extruded */}
        <filter id={ids.rough} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={ids.blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <linearGradient id={ids.under} gradientUnits="userSpaceOnUse" x1="0" y1={HINGE_SY} x2="0" y2={HINGE_SY - 90}>
          <stop offset="0" stopColor="var(--box-light)" stopOpacity="0.32" />
          <stop offset="0.45" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--box-shadow)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--box-shadow)" stopOpacity="0.5" />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={OPENING} />
        </clipPath>
        <linearGradient id={ids.ray} gradientUnits="userSpaceOnUse" x1={RAY_X} y1={RAY_Y} x2={RAY_X} y2={RAY_Y - 170}>
          <stop offset="0" stopColor="var(--box-light)" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={ids.halo}>
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.inner} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--box-light)" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={ids.led}>
          <stop offset="0" stopColor={ledState?.cssColor} stopOpacity="0.9" />
          <stop offset="1" stopColor={ledState?.cssColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={SHADOW_CX} cy={SHADOW_CY + 6} rx={W * 0.72} ry={18} fill="var(--box-shadow)" />

      {/* halo + light rays (behind everything else) */}
      <motion.ellipse cx={RAY_X} cy={RAY_Y - 30} rx={128} ry={96} fill={`url(#${ids.halo})`} style={{ opacity: light }} />
      {rays && (
        <motion.g style={{ opacity: rayOpacity }} fill={`url(#${ids.ray})`} filter={`url(#${ids.blur})`}>
          {RAYS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </motion.g>
      )}

      <g filter={`url(#${ids.rough})`} strokeLinejoin="round" strokeLinecap="round">
        {/* body */}
        <path d={BODY_RIGHT} fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="2" />
        <path d={BODY_FRONT} fill="var(--box-front)" stroke="var(--box-stroke)" strokeWidth="2" />
        <path d={BODY_FRONT} fill={`url(#${ids.shade})`} />
        <path d={BODY_RIGHT} fill={`url(#${ids.shade})`} />
        <path d={FRONT_RIGHT_EDGE} stroke="var(--box-stroke)" strokeWidth="2.4" fill="none" />

        {/* interior, seen through the opening */}
        <path d={OPENING} fill="var(--box-inner-floor)" />
        <g clipPath={`url(#${ids.clip})`}>
          <path d={INNER_FLOOR} fill="var(--box-inner-floor)" />
          <path d={INNER_LEFT} fill="var(--box-inner-wall)" />
          <path d={INNER_BACK} fill="var(--box-inner-wall)" />
          <motion.path d={OPENING} fill={`url(#${ids.inner})`} style={{ opacity: light }} />
          {/* the light sensor on the back wall — it's what notices the light */}
          <circle cx={SENSOR_X} cy={SENSOR_Y} r="5" fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="1.5" />
          <motion.circle cx={SENSOR_X} cy={SENSOR_Y} r="2.6" fill="var(--accent)" style={{ opacity: sensorGlow }} />
        </g>
        <path d={OPENING} fill="none" stroke="var(--box-stroke)" strokeWidth="2" />

        {/* front label */}
        {label ? (
          <text
            x={LABEL_X}
            y={LABEL_Y}
            fill="var(--box-label)"
            fontFamily="var(--bws-font-display)"
            fontWeight="600"
            fontSize="13"
            letterSpacing="2.5"
          >
            {label}
          </text>
        ) : null}

        {/* lid */}
        <motion.path d={dBack} fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="2" />
        <motion.path d={dUnder} fill="var(--box-lid-under)" stroke="var(--box-stroke)" strokeWidth="2" />
        <motion.path d={dUnder} fill={`url(#${ids.under})`} style={{ opacity: underLight }} />
        <motion.path d={dRight} fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="2" />
        <motion.path d={dFront} fill="var(--box-front)" stroke="var(--box-stroke)" strokeWidth="2" />
        <motion.path d={dTop} fill="var(--box-top)" stroke="var(--box-stroke)" strokeWidth="2" />
        <motion.path d={dEdge} stroke="var(--box-label)" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
        <motion.path d={dTab} fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="1.5" />
      </g>

      {/* LED (outside the wobble filter so it stays crisp) */}
      {ledState && (
        <g className={cn(ledState.blink && "animate-led-blink")}>
          {ledState.on && <circle cx={LED_X} cy={LED_Y} r="14" fill={`url(#${ids.led})`} />}
          <circle
            cx={LED_X}
            cy={LED_Y}
            r="4.2"
            fill={ledState.cssColor}
            stroke={ledState.on ? "none" : "var(--box-stroke)"}
            strokeWidth="1.2"
          />
          {ledState.on && <circle cx={LED_X - 1.3} cy={LED_Y - 1.3} r="1.2" fill="var(--box-light)" opacity="0.8" />}
        </g>
      )}
    </svg>
  )
}

export { VirtualBox, VirtualBox as BoxIllustration }
