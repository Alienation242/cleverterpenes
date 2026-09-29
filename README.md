# cleverTerpenes — terpene-aware balloon planner for the Volcano Hybrid

cleverTerpenes controls a **Storz & Bickel Volcano Hybrid** over Bluetooth, straight from the browser. It plans every
balloon of a session from your strain’s terpenes and cannabinoids and from the size of *your* balloons.

- **Control:** heat, air and target temperature, plus device settings (brightness, auto-off, vibration, °C/°F, display).
  Automatic reconnect, and every Bluetooth operation has a timeout.
- **Strain profiles for any strain or product.** Search a name like `Huala 22/1 CA ALM Alien Mints`. cleverTerpenes reads
  brand, THC/CBD and cultivar from the name, then uses the best available source, always with a
  *“How this profile was made”* explanation:
  1. **Lab test of your batch:** paste the label or certificate of analysis (German or English, % or mg/g, THCA → total THC).
  2. **Lab test of the same product:** Connecticut’s live product registry.
  3. **Lab median of the strain:** offline US lab data (Smith et al. 2022 plus Cannlytics Florida & California).
  4. **Estimate from terpene names:** what German pharmacy pages list. It takes the median of lab tests whose top
     terpenes are exactly those.
  5. **Estimate from parent strains:** a curated table of reported crosses, “A x B” names, or parents you enter.
     Parents without lab data are traced to their own parents. It can be combined with 4.
  6. **Typical flower:** the last resort.
- **Balloon profiles:** official or self-made (oven bag / *Bratschlauch*). Volume comes from lay-flat width × length.
  **Calibrate the time-to-taut once per balloon**, and the pump stops exactly at your chosen fill level.
- **Session planner:** gives a temperature and pump time per balloon and explains the choice.
  - The first balloon balances flavour against strength using the strain’s terpene amount and volatility.
  - Later balloons step up so each one carries a similar dose as the herb depletes.
  - The chart and table show the predicted terpenes and cannabinoids per balloon.
- **Session runner — one tap per balloon:**
  - The Volcano heats up and beeps when it’s ready. Put the filling chamber with the balloon on and tap **Start**.
  - The pump fills for exactly the planned time and stops by itself (Web Worker timer, verified pump-off).
  - While you inhale (10-minute countdown) the Volcano already heats for the next balloon. Put the balloon back on and
    tap **Fill balloon 2**: it fills as soon as the temperature is reached.
  - Optional pre-heat: the pump runs first and a beep tells you when to put the balloon on; filling continues by itself.
- **Learning:** rate a session (taste, smoothness, strength) and the next plan for that strain shifts by a few degrees.
- **First-run tour:** six short stops through the app, skippable at any time (button or Escape), restartable from
  *Help* or *Settings*.
- **Science screen:** shows why boiling-point charts mislead, a volatility chart, a safety corridor and all model
  assumptions.
- **Other:** works offline as a PWA, runs in demo mode without a device, and has JSON backup/restore.

## Privacy

Everything you save (strains, balloons, sessions, settings) stays in the browser’s IndexedDB on your device. There is no
account, no analytics and no cookies. The strain database is a static file searched on the device. The only request with
user input is the optional Connecticut registry search, which sends the typed name to `data.ct.gov`. The app’s privacy
policy (English and German) is its *Privacy* screen, `src/screens/PrivacyScreen.tsx`; the imprint is on clevereffects.

## Quick start (PC)

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in **Chrome or Edge** and press **Connect Volcano**. You can also try **demo mode**.
`localhost` counts as a secure context, so Web Bluetooth works without HTTPS.

On Windows, don’t pair the Volcano in *Settings → Bluetooth*. Web Bluetooth connects without pairing.

## Publish it

Web Bluetooth needs **HTTPS** when the app isn’t on `localhost`. `npm run build` creates a static site in `dist/`
with relative paths and hash routing, so it runs from any folder or subdomain of any HTTPS web host. No server-side
code or rewrite rules are needed.

- **GitHub Pages (how cleverTerpenes is published):** every push to `main` runs `.github/workflows/deploy.yml`, which
  tests, builds and publishes the app. One-time setup: *Settings → Pages → Build and deployment → Source: GitHub
  Actions*. The Privacy screen names GitHub as the host, so update it if you move the app elsewhere.
- **Your own web space:** upload the *contents* of `dist/` (for example to `/terpenes/` or a subdomain).
- **Netlify / Cloudflare Pages:** build command `npm run build`, output folder `dist`.

On phones:

- **Android:** Chrome works.
- **iPhone:** use the **Bluefy** browser. Safari has no Web Bluetooth.
- *Add to home screen* installs it as an app.

Strains, balloons and history stay on each device. Use *Settings → Backup* to move them between devices.

## How a plan is made (short version)

1. **Nothing boils in a Volcano.** Compounds evaporate below their boiling points at a rate set by vapor pressure.
   THC’s famous “157 °C” is a vacuum distillation value.
2. **Terpenes always come first.** They are 100–5,000× more volatile than THC at 180 °C.
   - Monoterpenes leave within about 20 s of balloon 1.
   - Heavier sesquiterpene alcohols linger into balloon 2.
3. **Temperature mainly sets cannabinoid dose and harshness.** THC release is calibrated to published Volcano
   measurements (≈ 0.0055 s⁻¹ at 180 °C, ≈ 0.019 s⁻¹ at 220 °C).
4. **First balloon:** the hottest temperature in the goal’s range that still keeps the terpene share of the vapour at the
   goal’s target:
   - Flavor first ≥ 50 %
   - Balanced ≥ 41 %
   - Intense ≥ 31.5 %

   Terpene-rich profiles can go hotter. Terpene-poor or aged ones go cooler, and the app warns you.
5. **Later balloons:** make the weakest balloon as strong as possible (a max–min dose). The temperature rises only as
   much as needed to keep the dose even, ending at the goal’s maximum (200 / 210 / 222 °C).
6. **Pump time:** `fill % × time-to-taut` once a balloon is calibrated. Before that, `V / 12 L/min` from the
   geometry (lay-flat width × effective length; a cut length has ~8 cm subtracted for knot and valve fold), capped at 75 %.
   A real calibration (official S&B tube, 28 cm flat, 55 cm effective, 51 s to the brim) matched the geometry within 4 %.
7. **Learning from calibrations:** every calibrated self-made balloon with width × length tells cleverTerpenes how far
   the geometry model is off for your material and pump (median ratio). Uncalibrated balloons use that correction.
   A balloon with a measured volume reveals your pump’s real flow.

The absolute numbers are ±50 %. They are useful for comparing plans and settings, not as a dose. This is not medical
advice.

## Data sources and licences

| Source | What | Access | Licence |
|---|---|---|---|
| Smith, Vergara, Keegan & Jikomes 2022 ([PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC9119530/)) | 89,923 US flower lab tests 2013–2021; per-strain medians and IQR precomputed into `public/data/strains.json` | offline, bundled | CC0-1.0 |
| [Cannlytics cannabis_results](https://huggingface.co/datasets/cannlytics/cannabis_results) (Florida, California) | lab results 2019–2024 (Kaycha, TerpLife, SC Labs, BelCosta, Cannalysis), merged into the same file | offline, bundled | CC BY 4.0: contains data from Cannlytics |
| Lineage table (`src/data/lineage.ts`) | commonly reported crosses of popular strains (breeder claims, alternatives noted) | offline | shown as “reported” |
| Connecticut DCP Brand Registry (`data.ct.gov/resource/egd5-wb6r`) | per-product terpenes and cannabinoids, current | live, CORS, no key | CT open data |
| Your label / COA | your batch | typed or pasted | yours |

Leafly, flowzz, OCS and Weedmaps are **not** used. Their terms forbid scraping, and they only give qualitative
“top terpene” lists.

To rebuild the strain database, run `npm run build:strains`. It downloads the source files once into `scripts/.cache/`.

## Reliability

- Every GATT operation has a timeout, and repeated timeouts force a clean reconnect.
- Optional characteristics are tolerated, so a missing one never blocks the connection.
- It subscribes before it reads and re-reads every few seconds, because the Volcano’s notifications can be lost.
- The pump is switched only through explicit on/off characteristics; pump-off is retried and verified.
- A hard limit stops any continuous pumping that runs longer than planned.

## Troubleshooting

- **Volcano not listed:**
  - it accepts only **one** connection, so close the S&B web app on your phone and any Home Assistant integration;
  - wait about 10 s;
  - hold **“−” + AIR** for about 3 s to toggle the Volcano’s Bluetooth.
- **Check that it is advertising:** open `chrome://bluetooth-internals` → *Devices* → *Start scan*.
- **Connection lost while pumping:** press **AIR** on the Volcano. The pump always stops on its own at the planned time
  while connected.

## Development

```bash
npm test            # protocol codec, vapor pressures, release model, planner, parsers, session runner vs. simulated Volcano
npm run typecheck
npm run build       # production build + service worker in dist/
npm run build:icons # re-render the PNG icons from the shapes in scripts/make-icons.mjs
```

```
src/
  ble/       Volcano GATT protocol, Web Bluetooth driver (timeouts, reconnect), demo simulator
  science/   compound data, vapor-pressure models, release model, balloon maths, planner
  data/      offline strain DB search, CT registry client, label/COA parser, lineage estimates
  store/     library (IndexedDB), device, session runner
  screens/   Control, Session, Strains, Balloons, History, Science, Settings, Help
  ui/        primitives, charts, first-run tour
```

The Bluetooth protocol was implemented from the publicly documented GATT interface (for example the SavageNL Home
Assistant integration’s protocol notes) and the official S&B web app’s behaviour. No third-party code was copied.
