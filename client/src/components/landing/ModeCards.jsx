import { MODES } from "./modes"

export default function ModeCards() {
  return (
    <section aria-labelledby="modes-title" className="page pt-8 pb-16 sm:pt-12 sm:pb-24">
      <div className="max-w-[640px]">
        <h2 id="modes-title" className="text-3xl font-semibold sm:text-display sm:leading-[1.05]">
          Same box. Three jobs.
        </h2>
        <p className="mt-4 text-md text-subtle">
          The sensor only knows the lid opened. Pick a mode in the app and it decides what that means. Switch any time.
        </p>
      </div>

      {/* Side by side, each card spans three shared rows (header, headline, rule) via subgrid,
          so headlines get the same height and the dividers/descriptions line up across cards. */}
      <ul className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-3 md:gap-x-6 md:gap-y-0">
        {MODES.map((m) => {
          const Icon = m.icon
          return (
            <li
              key={m.id}
              data-mode={m.id}
              className="group relative flex flex-col overflow-hidden rounded-card bg-surface p-6 ring-1 ring-line sm:p-8 md:row-span-3 md:grid md:grid-rows-subgrid md:gap-y-0"
            >
              {/* a thin accent edge where the lid would be */}
              <span className="absolute inset-x-6 top-0 h-px bg-accent/60 sm:inset-x-8" aria-hidden />
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-control bg-accent/12 text-accent ring-1 ring-accent/25">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-accent">{m.name}</h3>
                  <p className="text-sm text-subtle">{m.audience}</p>
                </div>
              </div>
              <p className="mt-6 font-display text-xl font-medium text-balance text-text sm:mt-8">{m.example}</p>
              <p className="mt-6 border-t border-line pt-4 text-sm text-subtle sm:pt-5">{m.rule}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
