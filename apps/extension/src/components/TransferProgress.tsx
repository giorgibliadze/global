import { transferStageLabels } from '@auto-importer/shared'
import type { TransferRecord } from '@auto-importer/shared'
export function TransferProgress({ record }: { record: TransferRecord }) {
  return <section className="transfer-progress" aria-label="გადატანის მიმდინარეობა">
    <p role="status"><strong>{transferStageLabels[record.stage]}</strong></p>
    <p>{record.vehicle.title}</p>
    <p>ჩამოტვირთული ფოტოები: {record.photos.prepared} / {record.photos.total}</p>
    <p>დადასტურებული ატვირთვა: {record.photos.uploaded} / {record.photos.total}</p>
    {record.status === 'error' && <p className="missing">გადატანა სრულად ვერ დადასტურდა. გადაამოწმეთ დარჩენილი ველები და შეცდომები MyAuto-ს ჩანართში.</p>}
    {record.errors.map((error, index) => <p className="missing" key={index}>{error}</p>)}
    <p>განცხადება ავტომატურად არ გამოქვეყნდება.</p>
  </section>
}
