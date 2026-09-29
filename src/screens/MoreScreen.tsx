import { go } from '../ui/route';

const ITEMS = [
  { key: 'history', title: 'History', text: 'Past sessions, ratings and what the app learned.' },
  { key: 'science', title: 'Science', text: 'Why terpene “boiling points” mislead, and how the model works.' },
  { key: 'settings', title: 'Settings', text: 'Units, session defaults, Volcano settings, backup.' },
  { key: 'help', title: 'Help', text: 'Getting started, connection troubleshooting, phone setup.' },
  { key: 'privacy', title: 'Privacy', text: 'What is stored where — your data stays on your device.' },
];

export function MoreScreen() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">More</h1>
      {ITEMS.map((i) => (
        <button key={i.key} onClick={() => go(i.key)} className="block w-full rounded-2xl border border-white/10 bg-card p-4 text-left hover:border-white/25">
          <div className="font-semibold">{i.title}</div>
          <div className="text-sm text-ink-3">{i.text}</div>
        </button>
      ))}
    </div>
  );
}
