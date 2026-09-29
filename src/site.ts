// Who publishes cleverTerpenes. The imprint is on clevereffects; the app has its own privacy policy
// (the Privacy screen), because it is hosted separately on GitHub Pages.

export const german = typeof navigator !== 'undefined' && /^de\b/i.test(navigator.language ?? '');

export const SITE = {
  name: 'clevereffects',
  home: german ? 'https://clevereffects.de' : 'https://clevereffects.com',
  imprint: german
    ? { label: 'Impressum', url: 'https://clevereffects.de/impressum' }
    : { label: 'Imprint', url: 'https://clevereffects.com/imprint' },
  privacyLabel: german ? 'Datenschutz' : 'Privacy',
};
