import { Button, Card } from '../ui/primitives';
import { startTour } from '../ui/Tour';
import { SITE } from '../site';

export function HelpScreen() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Help</h1>

      <Card
        title="Getting started"
        action={
          <Button size="sm" variant="ghost" onClick={startTour}>
            Take the tour
          </Button>
        }
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
          <li>
            <b className="text-ink">Connect</b> the Volcano (Control tab). Or press “Try demo mode” to explore without the device.
          </li>
          <li>
            <b className="text-ink">Add your balloons</b> and calibrate each once: the pump runs, you tap “Full!” when the balloon is just
            taut. Self-made balloons can differ by 2× — this is what makes the fill exact.
          </li>
          <li>
            <b className="text-ink">Add your strain</b>: search the name from the jar. You get lab data when it exists, otherwise an estimate
            from the terpenes on the label or from the parent strains — always with how it was made. Values from your batch’s label or
            certificate (COA) are best.
          </li>
          <li>
            <b className="text-ink">Plan a session</b>: choose herb weight, goal and balloons. cleverTerpenes shows temperature and pump time for
            every balloon, and why.
          </li>
          <li>
            <b className="text-ink">Start</b>. The Volcano heats up and beeps when it’s ready. Put the filling chamber with the balloon on the
            Volcano and tap Start — the pump fills and stops by itself, and the Volcano heats for the next balloon while you enjoy. Put the
            balloon back on and tap “Fill balloon 2”: it fills as soon as the temperature is reached. One tap per balloon. (With pre-heat
            switched on, it beeps when to put the balloon on.)
          </li>
          <li>
            <b className="text-ink">Rate</b> the session — the next plan for that strain adapts by a few degrees.
          </li>
        </ol>
      </Card>

      <Card title="Connection troubleshooting">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>The Volcano allows only one Bluetooth connection. Disconnect every other app or phone (S&amp;B web app, Home Assistant…).</li>
          <li>Windows: if you once paired the Volcano in Windows Settings → Bluetooth, remove it there. Web Bluetooth connects without pairing.</li>
          <li>Hold “−” and AIR on the Volcano for ~3 s to switch its Bluetooth on/off (check the Bluetooth symbol on the display).</li>
          <li>Wait ~10 s after another device disconnected — the Volcano advertises again only every few seconds.</li>
          <li>
            Chrome: open <code className="rounded bg-raised px-1">chrome://bluetooth-internals</code> → Devices → Start scan to see whether
            the Volcano is advertising.
          </li>
          <li>Still stuck: switch the Volcano off for a minute, restart Bluetooth on the computer/phone, reload this page.</li>
        </ul>
      </Card>

      <Card title="Using it on your phone">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>Android: use Chrome (or Edge).</li>
          <li>iPhone/iPad: Safari has no Web Bluetooth. Use the free Bluefy browser.</li>
          <li>Install it like an app: browser menu → “Add to home screen”. Your strains and balloons stay on that device (use Export/Import to copy them).</li>
          <li>Keep the screen on and the app in front during a session; cleverTerpenes requests a wake lock, and the pump timer runs in a background worker.</li>
        </ul>
      </Card>

      <Card title="Built to be reliable">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>Every Bluetooth operation has a timeout; if the link hangs or drops, cleverTerpenes reconnects by itself.</li>
          <li>The pump is switched with explicit on/off commands and the stop is retried and verified — it never depends on the screen being on.</li>
          <li>Temperatures and status are re-read every few seconds, because the Volcano’s change notifications can get lost.</li>
          <li>Works with the Volcano Hybrid’s current firmware; no pairing, account or cloud needed.</li>
        </ul>
      </Card>

      <Card title="Privacy">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>Your strains, balloons, sessions and settings are stored only in this browser, on this device. No account, no tracking, no cookies.</li>
          <li>
            The strain database is downloaded once and searched on your device. Only the optional Connecticut registry search sends the
            name you typed to the State of Connecticut’s open-data service (data.ct.gov).
          </li>
          <li>Bluetooth runs directly between this browser and your Volcano.</li>
          <li>Clearing the browser’s site data deletes everything — use Export in Settings to keep a backup.</li>
        </ul>
        <p className="mt-3 text-sm text-ink-3">
          Full details:{' '}
          <a href="#/privacy" className="underline hover:text-ink">
            {SITE.privacyLabel}
          </a>{' '}
          ·{' '}
          <a href={SITE.imprint.url} target="_blank" rel="noopener" className="underline hover:text-ink">
            {SITE.imprint.label}
          </a>
        </p>
      </Card>

      <Card title="Safety">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>The pump always stops automatically; if the connection drops while pumping, press AIR on the Volcano.</li>
          <li>Never fill a balloon completely — over-pressure loses vapour through the seals.</li>
          <li>Use only food-safe, heat-resistant oven bags or S&amp;B balloon tube for self-made balloons.</li>
          <li>Doses are model estimates (±50 %). Start low, wait 5–15 minutes between balloons. Not medical advice — talk to your doctor about your medication.</li>
        </ul>
      </Card>
    </div>
  );
}
