import { useState, type ReactNode } from 'react';
import { german, SITE } from '../site';
import { Card, Segmented } from '../ui/primitives';

const GITHUB_PRIVACY = 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';

const ext = (href: string, text: ReactNode) => (
  <a href={href} target="_blank" rel="noopener" className="underline hover:text-ink">
    {text}
  </a>
);

const imprintEn = ext('https://clevereffects.com/imprint', 'imprint');
const imprintDe = ext('https://clevereffects.de/impressum', 'Impressum');

const EN: [string, ReactNode][] = [
  [
    '1. Controller',
    <>
      The controller responsible for data processing in this app within the meaning of the General Data Protection Regulation
      (GDPR) is Kevin Clever. Address and contact: see the {imprintEn}.
    </>,
  ],
  [
    '2. In brief',
    <>
      cleverTerpenes sets no cookies and uses no analytics or tracking tools. No third-party content is embedded: no external
      fonts, no ads, no social media plugins. Everything you save stays in your browser, on your device. Personal data is only
      processed as far as technically necessary to deliver the app, or if you use the optional Connecticut registry search
      (section 5).
    </>,
  ],
  [
    '3. Hosting',
    <>
      This app is hosted on GitHub Pages, a service of GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA.
      When you open the app, GitHub processes the data your browser transmits in order to deliver it; according to GitHub,
      visitors’ IP addresses are logged and stored for security purposes. Data may be processed in the USA; GitHub is certified
      under the EU-U.S. Data Privacy Framework. The legal basis is Art. 6(1)(f) GDPR; the legitimate interest lies in providing
      the app securely and reliably. More in the {ext(GITHUB_PRIVACY, 'GitHub Privacy Statement')}.
    </>,
  ],
  [
    '4. Data on your device',
    <>
      The strains, balloons, session history and settings you save are stored only in your browser’s local storage (IndexedDB)
      on your device and are not transmitted to me or to third parties. So that the app also works without an internet
      connection, your browser additionally keeps a copy of the app’s program files (service worker cache). This storage is
      necessary for the functions you use (§ 25(2) no. 2 TDDDG). You can delete everything at any time by deleting this
      website’s data in your browser settings; Settings → Backup keeps a copy. The Bluetooth connection to your vaporizer is
      established directly by your browser; device data does not leave your device.
    </>,
  ],
  [
    '5. Optional search in the Connecticut lab registry',
    <>
      Only when you tap “Search” under “Lab-tested products” is the strain or product name you entered sent to the open-data
      portal of the U.S. state of Connecticut (data.ct.gov) to retrieve lab results. As with any web request, your IP address
      is transmitted to that server. No other data is sent. The search runs only on your request, and the app states beforehand
      what is sent where; the legal basis is your consent (Art. 6(1)(a) GDPR). The server is in the USA. Unless the recipient is
      certified under the EU-U.S. Data Privacy Framework, there is no adequacy decision for this transfer, and US authorities may
      be able to access the data (Art. 49(1)(a) GDPR). If you don’t want this, simply don’t use the search — every other
      function works without it.
    </>,
  ],
  [
    '6. Your rights',
    <>
      You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing
      (Art. 18), data portability (Art. 20) and to object to processing based on Art. 6(1)(f) GDPR (Art. 21). You can withdraw
      consent at any time with effect for the future (Art. 7(3)). An informal message to the contact address in the {imprintEn}{' '}
      is sufficient. You also have the right to lodge a complaint with a data protection supervisory authority (Art. 77 GDPR),
      for example the State Commissioner for Data Protection and Freedom of Information of North Rhine-Westphalia (LDI NRW),
      Kavalleriestraße 2-4, 40213 Düsseldorf, Germany.
    </>,
  ],
  ['7. Encryption', <>This app is delivered exclusively over an encrypted HTTPS connection.</>],
];

const DE: [string, ReactNode][] = [
  [
    '1. Verantwortlicher',
    <>
      Verantwortlich für die Datenverarbeitung in dieser App im Sinne der Datenschutz-Grundverordnung (DSGVO) ist Kevin Clever.
      Anschrift und Kontakt: siehe {imprintDe}.
    </>,
  ],
  [
    '2. Das Wichtigste in Kürze',
    <>
      cleverTerpenes setzt keine Cookies und verwendet keine Analyse- oder Tracking-Werkzeuge. Es werden keine Inhalte von
      Drittanbietern eingebunden: keine externen Schriftarten, keine Werbung, keine Social-Media-Plugins. Alles, was Sie
      speichern, bleibt in Ihrem Browser auf Ihrem Gerät. Personenbezogene Daten werden nur verarbeitet, soweit das für die
      Auslieferung der App technisch nötig ist oder wenn Sie die optionale Suche im Register von Connecticut nutzen
      (Abschnitt 5).
    </>,
  ],
  [
    '3. Hosting',
    <>
      Diese App wird über GitHub Pages bereitgestellt, einen Dienst der GitHub, Inc., 88 Colin P. Kelly Jr. Street,
      San Francisco, CA 94107, USA. Beim Aufruf der App verarbeitet GitHub die von Ihrem Browser übermittelten Daten, um die App
      auszuliefern; nach Angaben von GitHub werden die IP-Adressen der Besucher aus Sicherheitsgründen protokolliert und
      gespeichert. Dabei können Daten in den USA verarbeitet werden; GitHub ist nach dem EU-U.S. Data Privacy Framework
      zertifiziert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der sicheren und
      zuverlässigen Bereitstellung der App. Mehr in der {ext(GITHUB_PRIVACY, 'Datenschutzerklärung von GitHub')}.
    </>,
  ],
  [
    '4. Daten auf Ihrem Gerät',
    <>
      Die Sorten, Ballons, Sitzungsverläufe und Einstellungen, die Sie speichern, werden ausschließlich im lokalen Speicher
      Ihres Browsers (IndexedDB) auf Ihrem Gerät abgelegt und weder an mich noch an Dritte übertragen. Damit die App auch ohne
      Internetverbindung funktioniert, speichert Ihr Browser zusätzlich eine Kopie der Programmdateien der App
      (Service-Worker-Cache). Diese Speicherung ist für die von Ihnen genutzten Funktionen erforderlich (§ 25 Abs. 2 Nr. 2
      TDDDG). Sie können alles jederzeit löschen, indem Sie die Website-Daten dieser Seite in den Einstellungen Ihres Browsers
      löschen; mit Settings → Backup behalten Sie eine Kopie. Die Bluetooth-Verbindung zu Ihrem Verdampfer baut Ihr Browser
      direkt auf; Gerätedaten verlassen Ihr Gerät nicht.
    </>,
  ],
  [
    '5. Optionale Suche im Laborregister von Connecticut',
    <>
      Nur wenn Sie unter „Lab-tested products“ auf „Search“ tippen, wird der eingegebene Sorten- oder Produktname an das
      Open-Data-Portal des US-Bundesstaats Connecticut (data.ct.gov) gesendet, um Laborergebnisse abzurufen. Wie bei jeder
      Web-Anfrage wird dabei Ihre IP-Adresse an diesen Server übermittelt. Weitere Daten werden nicht übertragen. Die Suche
      läuft nur auf Ihre Anforderung, und die App zeigt vorher an, was wohin gesendet wird; Rechtsgrundlage ist Ihre
      Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Der Server steht in den USA. Sofern der Empfänger nicht nach dem EU-U.S. Data
      Privacy Framework zertifiziert ist, besteht für diese Übermittlung kein Angemessenheitsbeschluss, und US-Behörden könnten
      auf die Daten zugreifen (Art. 49 Abs. 1 lit. a DSGVO). Wenn Sie das nicht möchten, nutzen Sie die Suche einfach nicht –
      alle anderen Funktionen arbeiten ohne sie.
    </>,
  ],
  [
    '6. Ihre Rechte',
    <>
      Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
      Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6
      Abs. 1 lit. f DSGVO (Art. 21). Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7
      Abs. 3). Eine formlose Nachricht an die Kontaktadresse im {imprintDe} genügt. Außerdem können Sie sich bei einer
      Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der Landesbeauftragten für Datenschutz und
      Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2-4, 40213 Düsseldorf.
    </>,
  ],
  ['7. Verschlüsselung', <>Diese App wird ausschließlich über eine verschlüsselte HTTPS-Verbindung ausgeliefert.</>],
];

export function PrivacyScreen() {
  const [lang, setLang] = useState<'en' | 'de'>(german ? 'de' : 'en');
  const sections = lang === 'de' ? DE : EN;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{lang === 'de' ? 'Datenschutzerklärung' : 'Privacy policy'}</h1>
        <div className="flex-1" />
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' },
          ]}
        />
      </div>
      <Card>
        <div className="max-w-3xl space-y-5 text-sm leading-relaxed text-ink-2">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="mb-1 text-base font-semibold text-ink">{title}</h2>
              <p>{body}</p>
            </section>
          ))}
          <p className="text-xs text-ink-3">
            {lang === 'de' ? 'Stand: September 2026' : 'Last updated: September 2026'} · {ext(SITE.imprint.url, SITE.imprint.label)}
          </p>
        </div>
      </Card>
    </div>
  );
}
