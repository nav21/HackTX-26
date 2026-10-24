import { cn } from "@/lib/utils"

/** Simplified box glyph for the logo and tiny places (the full drawing is VirtualBox). */
export default function BoxMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 13.5h17v13H5z" fill="var(--box-front)" stroke="var(--box-stroke)" strokeWidth="1.6" />
      <path d="M22 13.5l5-3.5v12.5l-5 4z" fill="var(--box-side)" stroke="var(--box-stroke)" strokeWidth="1.6" />
      <path d="M4 13.5l3.6-8.5h17.5L22.5 13.5z" fill="var(--box-top)" stroke="var(--box-stroke)" strokeWidth="1.6" transform="rotate(-14 4 13.5)" />
      <circle cx="18.5" cy="17.5" r="1.6" fill="var(--accent)" />
    </svg>
  )
}
