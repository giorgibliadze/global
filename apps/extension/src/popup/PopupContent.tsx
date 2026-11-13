import { ImportAction } from '../components/ImportAction'
import { AutoLogo } from '../components/AutoLogo'
import { getExtensionVersion } from '../services/browser'
import { auctionSites } from '../services/website'
import type { Website } from '../services/website'

export type Detection = { status: 'loading' | 'error' } | { status: 'ready'; website: Website }

export function PopupContent({ detection }: { detection: Detection }) {
  const website = detection.status === 'ready' ? detection.website : undefined
  const canImport = website?.kind === 'auction'
  const manheim24 = website?.hostname === 'manheim24.com' || website?.hostname.endsWith('.manheim24.com') === true
  const status = detection.status === 'loading' ? 'მოწმდება ვებსაიტი…'
    : detection.status === 'error' ? 'ვებსაიტის ამოცნობა ვერ მოხერხდა'
    : canImport ? 'მხარდაჭერილი ვებსაიტი'
    : website?.kind === 'destination' ? 'თქვენ MyAuto-ზე ხართ' : 'ვებსაიტი არ არის მხარდაჭერილი'
  const guidance = detection.status === 'loading' ? 'მიმდინარეობს აქტიური ჩანართის ამოცნობა.'
    : detection.status === 'error' ? 'ხელახლა გახსენით გაფართოება ვებსაიტის ამოსაცნობად.'
    : manheim24 ? 'ერთი დაჭერით გადაიტანეთ მონაცემები MyAuto-ზე. განცხადებას გადამოწმების შემდეგ თავად გამოაქვეყნებთ.'
    : canImport ? 'ეს აუქციონის ვებსაიტი მხარდაჭერილია. ავტომობილის მონაცემების გადატანის ფუნქცია მალე დაემატება.'
    : website?.kind === 'destination' ? 'MyAuto-ზე ავტომობილის მონაცემების გადასატანად გახსენით მხარდაჭერილი აუქციონის ვებსაიტი.'
    : 'დასაწყებად გახსენით ქვემოთ ჩამოთვლილი აუქციონის ერთ-ერთი ვებსაიტი.'
  return (
    <main className="popup" lang="ka">
      <header className="header">
        <AutoLogo />
        <div className="header-title">
          <h1 id="auto-importer-title">Auto Importer</h1>
          <p className="brand-caption">აუქციონიდან MyAuto-ზე — მარტივად.</p>
        </div>
      </header>
      <section className="website-card" aria-labelledby="website-title">
        <h2 className="section-label" id="website-title">მიმდინარე ვებსაიტი</h2>
        <p className="website-name">{website?.name ?? (detection.status === 'loading' ? 'მიმდინარეობს ვებსაიტის ამოცნობა…' : 'ჩანართის წაკითხვა ვერ მოხერხდა')}</p>
        {website?.hostname && website.hostname !== website.name && <p className="hostname">{website.hostname}</p>}
        <div className={`detection ${detection.status === 'loading' ? 'loading' : ''} ${canImport ? 'supported' : ''}`} role="status">
          <span className="status-dot" />{status}
        </div>
      </section>
      <ImportAction enabled={canImport} guidance={guidance} manheim24={manheim24} />
      <section className="supported-sites" aria-labelledby="supported-title">
        <h2 className="section-label" id="supported-title">მხარდაჭერილი პლატფორმები</h2>
        <ul>{auctionSites.map((site) => <li className={website?.name === site.name ? 'active-platform' : undefined} key={site.domain}>{site.name}</li>)}</ul>
      </section>
      <footer><span>GLOBAL AUTO TRANSPORTER</span><span>ვერსია {getExtensionVersion()}</span></footer>
    </main>
  )
}
