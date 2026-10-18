# Musafir

Musafir plans Indian Railways journeys the way you actually need them: _"get me from here to there, arriving between these two times"_. It finds direct trains and connections with up to two changes, considers boarding at nearby stations you can drive to, and explains which filter is cutting out the most options.

It runs in the browser as one HTML file, with no server or account. When the browser can reach erail.in, every search also pulls live timetables for the stations involved, so it isn't limited to the built-in trains.

## Features

- **Arrival window search.** Set "arrive no earlier than" and "arrive by". Each train's running days decide which run fits.
- **Direct and connecting routes** with a minimum connection buffer and a longest acceptable wait. Changes across a city (Howrah ↔ Santragachi, Ranchi ↔ Hatia, …) include a cab ride.
- **Nearby boarding and alighting.** Board within _N_ km of your start, or get off within _N_ km of your destination, with road time from your chosen speed.
- **Any of India's ~8,700 stations**, with spelling-tolerant search: `luckeesarai`, `lakhisarai` and `LKR` all find Luckeesarai Jn. If no train serves a station, the trip starts or ends by road at the nearest one.
- **Live data** from erail.in on each search, merged with 32 built-in timetables. Special trains outside their running dates are dropped.
- **Suggestions.** Re-runs the search with each filter loosened (later arrival, one more change, shorter buffer, …) and shows how many routes each would add, with example trains and an Apply button.
- Search runs only when you press **Search**. Sorting and filters apply instantly. Settings are saved in the browser.

## Quick start

Requires Node.js 22+ (see `.nvmrc`). There are no runtime or install-time dependencies.

```bash
npm run build          # writes dist/musafir.html
open dist/musafir.html # or double-click it
```

| Command                  | What it does                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `npm run build`          | Bundle `src/` into the single file `dist/musafir.html`                                        |
| `npm test`               | Unit and integration tests (`node:test`)                                                      |
| `npm run test:e2e`       | Drive the built page in headless Chrome, with erail.in answered from a fixture (needs Chrome) |
| `npm run lint`           | ESLint for real mistakes (undefined names, unused code)                                       |
| `npm run format`         | Prettier                                                                                      |
| `npm run check`          | Everything CI runs: format check, lint, tests, build, browser test                            |
| `npm run serve`          | Local server: the bundle at `/`, the unbundled source at `/dev/`                              |
| `npm run build:stations` | Regenerate the all-India station list from the datameet dataset                               |

## Architecture

```
src/
  index.html, styles.css      Page markup and styles
  js/
    app.js                    Entry point: connects form → search → results, and live data
    data/                     Static data: built-in trains, hand-checked stations, all-India station list
    lib/                      Pure helpers: time formatting (IST wall clock), text matching
    core/                     The engine, no DOM
      network.js              Trains + stations index, distances, cab transfers between nearby stations
      planner.js              Route search inside an arrival window
      ranking.js              Sorting and filtering results
      station-search.js       Spelling-tolerant station lookup
    live/                     erail.in parsing and the live-data fetcher
    ui/                       DOM rendering: form, autocomplete, results, suggestions, status lines
scripts/                      build (bundler) and station-list generator
server/                       Optional local server (live-data fallback, serves the source unbundled)
test/                         node:test suites, a recorded erail fixture, and the browser test
```

**Layers.** `data` and `lib` depend on nothing. `core` depends on `data` and `lib`. `live` depends on `core`. `ui` and `app.js` sit on top. Nothing below `ui` touches the DOM, so the engine is tested directly in Node. UI modules report back through callbacks (`onChange`, `onShowMore`, `onSuggestionApply`, `onLiveChange`) instead of importing `app.js`, which keeps the dependency graph acyclic.

**How the search works** (`core/planner.js`). It searches backwards from the destination. For each train reaching it inside the window (latest suitable run, respecting running days and validity dates), each earlier stop is a candidate boarding point. If that stop is near the start, it's a route. If more changes are allowed, the search recurses for trains reaching that stop, or a station a cab ride away, at least one connection buffer earlier. Candidates are then pruned: no boarding a train later than you could have, no doubling back, and no getting off a train that continues to where you're going. The search keeps the best few variants for each final train run.

**Live data** (`live/`). erail.in allows any web page to read its trains-between-stations endpoint (`Access-Control-Allow-Origin: *`). For each search the page asks about up to 48 station pairs: start and nearby junctions → destination, and via junctions roughly on the way. Each answer is validated (train number, station codes, times) and becomes a two-stop segment the planner treats like any other train. Answers are cached for the session, and a repeat search retries pairs that failed. Everything from erail is treated as untrusted text: renderers in `ui/` escape it, and nothing below `ui/` builds HTML. Where erail can't be reached (offline, or a host such as claude.ai that blocks other sites), the page says so and uses the built-in trains.

**Build** (`scripts/build.mjs`). Browsers won't load ES modules from `file://`, so the build inlines the stylesheet and joins the modules in dependency order into one script, wrapped in an IIFE, with no bundler dependency. To make that safe, the modules stick to a small subset of module syntax (named imports, `export` on declarations), and every top-level name must be unique across modules because they share one scope. The build enforces both and fails with a clear message otherwise. Tests check the enforcement and that the bundled script parses.

## Data sources and licensing

- **Built-in timetables:** transcribed from the public train-schedule pages of ConfirmTkt and RailMitra (October 2026). Where their pages disagree on running days, the service-day field was used. These are third-party sites, used here for a personal, non-commercial planner. Check their terms before any wider use.
- **Live timetables:** erail.in's public trains-between-stations endpoint. It is unofficial, there is no agreement with erail.in, and the format may change. If it does, live search fails gracefully and the page falls back to the built-in trains.
- **Station list and coordinates:** [datameet/railways](https://github.com/datameet/railways), released under CC0 (public domain). Credited in the page footer.
- **Third-party contacts at runtime:** erail.in (live trains, only when searching) and Google Fonts (typefaces).
- **Code:** private repository, all rights reserved (`"license": "UNLICENSED"`).

Timetables change and these sources are unofficial. Always confirm trains and seats on IRCTC or NTES before booking.
