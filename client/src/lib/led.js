// LED codes from the device protocol: "G" | "Y" | "R" | "B" | "OFF", optionally ",BLINK".

const COLOR_VARS = {
  G: "var(--bws-led-g)",
  Y: "var(--bws-led-y)",
  R: "var(--bws-led-r)",
  B: "var(--bws-led-b)",
  OFF: "var(--bws-led-off)",
}

const NAMES = { G: "Green", Y: "Yellow", R: "Red", B: "Blue", OFF: "Off" }

/** "Y,BLINK" → { color: "Y", blink: true, on: true, cssColor, label } */
export function parseLed(led) {
  const [raw = "OFF", flag] = String(led || "OFF").toUpperCase().split(",")
  const color = COLOR_VARS[raw] ? raw : "OFF"
  const on = color !== "OFF"
  const blink = on && flag === "BLINK"
  return {
    color,
    blink,
    on,
    cssColor: COLOR_VARS[color],
    label: on ? `${NAMES[color]}${blink ? ", blinking" : ""}` : "Off",
  }
}

export const LED_STATES = ["OFF", "G", "Y", "R", "B", "G,BLINK", "Y,BLINK", "R,BLINK", "B,BLINK"]
