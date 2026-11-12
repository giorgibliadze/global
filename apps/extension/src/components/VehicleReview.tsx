import type { NormalizedVehicle } from '@auto-importer/shared'
import { reviewDetails, translateDetail } from '@auto-importer/parsers/normalization'
export function VehicleReview({ vehicle, busy, confirm, cancel }: { vehicle: NormalizedVehicle; busy: boolean; confirm: () => void; cancel: () => void }) {
  const details = reviewDetails(vehicle)
  const list = (category: 'equipment' | 'note', originals: string[]) => originals.map((original,index) => {
    const translated = translateDetail(category,original)
    return <li key={index}><span>{original}</span><br /><span className={translated.verified ? '' : 'missing'}>{translated.verified ? translated.georgian : 'დაუდასტურებელი თარგმანი — ორიგინალი უცვლელად ინახება'}</span></li>
  })
  return <section className="transfer-progress vehicle-review" aria-label="ავტომობილის მონაცემების შემოწმება">
    <h2>მონაცემების გადამოწმება</h2>
    <p>მწარმოებელი: <strong>{vehicle.make}</strong><br />მოდელი: <strong>{vehicle.model}</strong><br />კომპლექტაცია: {vehicle.trim ?? 'არ არის მითითებული'}</p>
    <p>კატალოგის მოკლე ჩანაწერი: {vehicle.original.catalogModel}. სრული მოდელის სახელი არ შემოკლდება და მსგავსი მოდელით არ შეიცვლება.</p>
    <dl>{details.map(row => <div key={row.key}>
      <dt><strong>{row.label}</strong></dt>
      <dd>ორიგინალი: {row.original ?? 'არ არის მითითებული'}<br />ქართული: <span className={row.resolved ? '' : 'missing'}>{row.georgian ?? 'არ არის მითითებული'}</span>{!row.resolved && ' — საჭიროა გადამოწმება'}</dd>
    </div>)}</dl>
    {vehicle.equipment?.length ? <details><summary>აღჭურვილობა: ორიგინალი და თარგმანი</summary><ul>{list('equipment',vehicle.equipment)}</ul></details> : <p className="missing">აღჭურვილობის ჩანაწერები არ არის მითითებული.</p>}
    {vehicle.announcements?.length ? <details><summary>აუქციონის შენიშვნები</summary><ul>{list('note',vehicle.announcements)}</ul></details> : null}
    <p>MyAuto-ს ვარიანტების ID-ები დადგინდება რეალური ფორმიდან. მოდელის ზუსტი შესაბამისობის გარეშე ის ველი დარჩება შეუვსებელი. „კომპლექტაცია“ მოდელის ველის შემცვლელად არ გამოიყენება.</p>
    {vehicle.warnings.map((warning,index) => <p className="missing" key={index}>{warning}</p>)}
    <button className="import-button" disabled={busy} type="button" onClick={confirm}>დადასტურება და გადატანა</button>
    <button className="import-button" disabled={busy} type="button" onClick={cancel}>გაუქმება</button>
  </section>
}
