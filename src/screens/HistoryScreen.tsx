import { useState } from 'react';
import type { SessionLog } from '../data/types';
import { adjustmentFromRating, applyAdjustment } from '../session/feedback';
import { useLibrary } from '../store/library';
import { Badge, Button, Card, Empty, Segmented, Sheet, cx } from '../ui/primitives';
import { fmtDateTime, fmtMg, fmtSeconds, fmtTemp } from '../ui/format';
import { go } from '../ui/route';

function RateSheet({ log, onClose }: { log: SessionLog; onClose: () => void }) {
  const lib = useLibrary();
  const [taste, setTaste] = useState(log.rating?.taste ?? 3);
  const [smooth, setSmooth] = useState(log.rating?.smoothness ?? 3);
  const [strength, setStrength] = useState<'-1' | '0' | '1'>(String(log.rating?.strength ?? 0) as '-1' | '0' | '1');
  const [notes, setNotes] = useState(log.rating?.notes ?? '');
  const row = (label: string, value: number, set: (n: number) => void) => (
    <div>
      <div className="mb-1 text-xs text-ink-3">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => set(n)} className={cx('h-10 flex-1 rounded-lg text-sm', n <= value ? 'bg-ink text-black' : 'bg-field text-ink-3')}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      {row('Taste / flavour', taste, setTaste)}
      {row('Smoothness (1 = harsh)', smooth, setSmooth)}
      <Segmented
        value={strength}
        onChange={setStrength}
        options={[
          { value: '-1', label: 'Too weak' },
          { value: '0', label: 'Just right' },
          { value: '1', label: 'Too strong' },
        ]}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="min-h-20 w-full rounded-xl border border-line bg-field p-3 text-sm"
      />
      <Button
        variant="primary"
        onClick={() => {
          const rating = { taste, smoothness: smooth, strength: Number(strength) as -1 | 0 | 1, notes };
          const adj = adjustmentFromRating(rating);
          const firstTime = !log.rating;
          lib.updateSession(log.id, { rating: { ...rating, adjustment: adj.text } });
          const strain = lib.strains.find((s) => s.id === log.strainId);
          if (strain && firstTime && (adj.firstC || adj.laterC)) lib.updateStrainPrefs(strain.id, applyAdjustment(strain.prefs, adj));
          onClose();
        }}
      >
        Save rating
      </Button>
      {log.rating && <p className="text-xs text-ink-3">Editing a rating does not adjust the strain again.</p>}
    </div>
  );
}

export function HistoryScreen() {
  const lib = useLibrary();
  const unit = lib.settings.unit;
  const [rating, setRating] = useState<SessionLog | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      {lib.sessions.length === 0 ? (
        <Empty title="No sessions yet" action={<Button onClick={() => go('plan')}>Plan a session</Button>}>
          Every session is logged with its temperatures and pump times. Rate it afterwards and cleverTerpenes adjusts the next plan for that
          strain.
        </Empty>
      ) : (
        <div className="space-y-3">
          {lib.sessions.map((s) => {
            const done = s.runs.filter((r) => r.completedAt).length;
            return (
              <Card key={s.id}>
                <button className="w-full text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.strainName}</span>
                    {s.demo && <Badge>demo</Badge>}
                    <Badge tone="neutral">{s.goal}</Badge>
                    <span className="ml-auto text-xs text-ink-3">{fmtDateTime(s.startedAt)}</span>
                  </div>
                  <div className="mt-1 text-sm text-ink-2 tabular">
                    {done}/{s.runs.length} balloons · {s.runs.map((r) => fmtTemp(r.tempC, unit)).join(' → ')} · {s.loadMg} mg · {s.balloonName}
                  </div>
                  {s.rating ? (
                    <div className="mt-1 text-xs text-ink-3">
                      Taste {s.rating.taste}/5 · smooth {s.rating.smoothness}/5 · {s.rating.strength === 0 ? 'strength right' : s.rating.strength > 0 ? 'too strong' : 'too weak'}
                      {s.rating.adjustment ? ` · ${s.rating.adjustment}` : ''}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-warn">Not rated yet</div>
                  )}
                </button>
                {open === s.id && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <table className="w-full text-sm tabular">
                      <thead className="text-xs text-ink-3">
                        <tr>
                          <th className="py-1 text-left font-medium">#</th>
                          <th className="py-1 text-left font-medium">Temperature</th>
                          <th className="py-1 text-left font-medium">Pump</th>
                          <th className="py-1 text-left font-medium">Done</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.runs.map((r) => (
                          <tr key={r.index} className="text-ink-2">
                            <td className="py-1">{r.index + 1}</td>
                            <td className="py-1">{r.segments.map((x) => fmtTemp(x.tempC, unit)).join(' → ')}</td>
                            <td className="py-1">{fmtSeconds(r.pumpSeconds)}</td>
                            <td className="py-1">{r.completedAt ? '✓' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.predictedThcMg !== undefined && <p className="mt-2 text-xs text-ink-3">Model estimate: ≈ {fmtMg(s.predictedThcMg)} mg THC into balloons.</p>}
                    {s.rating?.notes && <p className="mt-2 text-sm text-ink-2">“{s.rating.notes}”</p>}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => setRating(s)}>
                        {s.rating ? 'Edit rating' : 'Rate'}
                      </Button>
                      {s.strainId && (
                        <Button size="sm" variant="ghost" onClick={() => go(`plan?strain=${s.strainId}`)}>
                          Plan again
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => confirm('Delete this session from the log?') && lib.deleteSession(s.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Sheet open={rating !== null} onClose={() => setRating(null)} title={`Rate: ${rating?.strainName ?? ''}`}>
        {rating && <RateSheet log={rating} onClose={() => setRating(null)} />}
      </Sheet>
    </div>
  );
}
