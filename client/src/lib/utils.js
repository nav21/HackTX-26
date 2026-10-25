import { createCn } from "cn/config"

// Teach the class merger about TSWIFT tokens so e.g. `text-display` (a size) and
// `text-accent` (a color) don't cancel each other out.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["md", "display", "hero"] }],
      rounded: [{ rounded: ["card", "control", "inner", "pill"] }],
      shadow: [{ shadow: ["raised", "pop", "glow"] }],
    },
  },
})
