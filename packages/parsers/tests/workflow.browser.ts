import {runStagedTests} from './stagedMyauto.browser'
import { runFormLifecycleTests } from './formLifecycle.browser'
import { runPrefetchTests } from './prefetch.browser'
import { runPersistenceTests } from './persistence.browser'
import { runModelDesignationTests } from './modelDesignation.browser'
import { runOptimizationTests } from './optimization.browser'
import { runDropdownTests } from './dropdowns.browser'
import { runReceiverTests } from './receiver.browser'
import { runModelPrivacyTests } from './modelPrivacy.browser'
import { runIdentityTests } from './identity.browser'
import { runTransferTests } from './transfers.browser'
import { parseManheim24, milesToKm, engineToCc, deduplicatePhotos } from '../src/manheim24'
import { fillMyautoForm, myautoFields } from '../src/myauto'

const outcomes: string[] = []
function check(value: unknown, label: string) { if (!value) throw new Error(label); outcomes.push(label); document.querySelector('pre')!.textContent = outcomes.join('\n') }
const manheim = await (await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text()
const myauto = await (await fetch('/packages/parsers/tests/fixtures/myauto.html')).text()
const doc = () => new DOMParser().parseFromString(manheim, 'text/html')
const jsonElement = (d: Document) => d.querySelector('.StockWaveInfo')!
function changeData(d: Document, changes: Record<string, unknown>) {
  const el = jsonElement(d)
  el.textContent = JSON.stringify({ ...JSON.parse(el.textContent!), ...changes })
}
const expectError = (fn: () => unknown, label: string) => { let threw = false; try { fn() } catch { threw = true } check(threw, label) }
try {
  const selected = doc()
  const v = parseManheim24(selected)
  check(v.vin === '1HGCM82633A004352' && v.title === '2026 BMW M5 Touring Wagon', 'selected vehicle identity; not search results')
  check(v.make === 'BMW' && v.model === 'M5 Touring Wagon' && v.year === 2026 && v.trim === 'Base', 'make/model/year/trim')
  check(v.mileageKm === 1048 * 1.609344 && v.raw.odometer === 1048 && v.raw.odometerUnits === '', 'visible miles fallback; original values preserved')
  check(v.engineCc === 4400 && v.cylinders === 8, 'engine and cylinders')
  check(v.fuel === 'Gasoline Plug-In Hybrid' && v.transmission === 'Automatic' && v.drivetrain === 'AWD', 'fuel/transmission/drivetrain')
  check(v.exteriorColor === 'Purple' && v.interiorColor === 'Black' && v.body === 'Wagon', 'colors/body')
  check(v.conditionGrade === 5 && v.price?.amount === 118000 && v.price.currency === 'USD', 'condition grade and explicitly labeled buy-now price')
  check((v.equipment?.length ?? 0) > 10 && v.announcements?.includes('Previous Canadian') && v.auction?.name === 'Manheim Pennsylvania' && v.damage?.frameDamageReported === false, 'confirmed equipment/announcements/auction/explicit damage flags extracted without damage-free inference')
  check(v.images.length === 15 && v.images.every(u => !u.startsWith('data:')), '15 real photo URL limit; no inline icons')
  check(milesToKm(1) === 1.609344 && engineToCc('2.0 L') === 2000 && engineToCc('1998 cc') === 1998 && engineToCc('V6') === undefined, 'unit conversion edge cases')
  const photos = deduplicatePhotos(['https://i.fyuse.com/group/fixture/a/b/frames_1.jpg','https://i.fyuse.com/group/fixture/a/b/1080p/frames_1.jpg','https://i.fyuse.com/group/fixture/a/b/frames_2.jpg','https://i.fyuse.com/group/fixture/a/b/frames_2.jpg','https://i.fyuse.com/group/x/a/b/tags/video.jpg','https://i.fyuse.com/group/x/a/b/photo.jpg?token=DO-NOT-COPY'])
  check(photos.length === 2 && photos[0].includes('/1080p/') && photos[1].includes('frames_2'), 'duplicate filtering; existing high resolution; order; reject auth query/video')
  changeData(selected, { accessToken: 'DO-NOT-COPY', sellerName: 'DO-NOT-COPY', buyerAccountAutotecNumber: 'DO-NOT-COPY' })
  check(!JSON.stringify(parseManheim24(selected)).includes('DO-NOT-COPY'), 'strict privacy allowlist')
  const missing = doc(); jsonElement(missing).remove()
  expectError(() => parseManheim24(missing),'missing structured identity stops extraction instead of falling back to title guesses')
  const optionalMissing = doc(); const savedIdentity = JSON.parse(jsonElement(optionalMissing).textContent!)
  jsonElement(optionalMissing).textContent = JSON.stringify({vin:savedIdentity.vin,make:savedIdentity.make,models:savedIdentity.models,trims:savedIdentity.trims,year:savedIdentity.year,designatedDescriptionEnrichment:savedIdentity.designatedDescriptionEnrichment})
  const minimal = parseManheim24(optionalMissing)
  check(minimal.exteriorColor === undefined && minimal.price === undefined,'missing optional values remain unavailable')
  const noUnit = doc(); changeData(noUnit, { odometerUnits: '' }); noUnit.querySelector('[data-testid="vdp-decription-info"]')!.textContent = '1,048'
  check(parseManheim24(noUnit).mileageKm === undefined, 'unknown mileage units not assumed')
  const mismatch = doc(); changeData(mismatch, { vin: '2HGCM82633A004352' })
  expectError(() => parseManheim24(mismatch), 'stale SPA JSON/VIN mismatch rejected')
  const ambiguous = doc(); ambiguous.body.append(ambiguous.querySelector('.VehicleDetails__container')!.cloneNode(true))
  expectError(() => parseManheim24(ambiguous), 'ambiguous selected panels rejected')
  const other = doc(); changeData(other, { vin: '2HGCM82633A004352', make: 'Example', models: ['Other'], year: '2024', designatedDescriptionEnrichment: {vin:'2HGCM82633A004352',make:'Example',model:'Other',trim:'Base',year:2024} }); other.querySelector('[data-testid="vdp-vin"]')!.textContent = '2HGCM82633A004352'; other.querySelector('[data-testid="vdp-title-text"]')!.textContent = '2024 Example Other'
  const spa = doc()
  spa.querySelector('.VehicleDetails__container')!.replaceWith(other.querySelector('.VehicleDetails__container')!.cloneNode(true))
  history.pushState({}, '', '#/results/fixture-next')
  check(parseManheim24(spa).make === 'Example', 'hash navigation rereads new detail vehicle without cache')
  const map = myautoFields(v)
  check(map.find(f => f.field === 'make')?.mode === 'dropdown' && map.find(f => f.field === 'model')?.mode === 'dropdown', 'dependent dropdowns deferred without invented options')
  check(map.find(f => f.field === 'transmission')?.selector?.includes('gearTypeId-2') && map.find(f => f.field === 'drivetrain')?.selector?.includes('driveTypeId-3'), 'confirmed MyAuto choice IDs')
  check(map.find(f => f.field === 'price')?.mode === 'manual' && !map.find(f => f.field === 'images'), 'auction price not assumed; photos handled by dedicated adapter')
  const frame = document.createElement('iframe'); document.body.append(frame)
  const formDoc = frame.contentDocument!; formDoc.open(); formDoc.write(myauto); formDoc.close()
  const mileage = formDoc.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!
  // Simulate React's own-property tracker: native setter must bypass it and dispatch input.
  const native = Object.getOwnPropertyDescriptor(formDoc.defaultView!.HTMLInputElement.prototype, 'value')!
  let tracker = '', controlledState = ''
  Object.defineProperty(mileage, 'value', { configurable: true, get() { return native.get!.call(this) }, set(value) { tracker = value; native.set!.call(this, value) } })
  mileage.addEventListener('input', () => { controlledState = mileage.value })
  for (const el of formDoc.querySelectorAll<HTMLElement>('[data-testid^="single-checkbox-primaryFeatures."]')) {
    el.addEventListener('click', () => { el.querySelector<HTMLInputElement>('input')!.value = el.dataset.testid!.split('-').at(-1)! })
  }
  const result = await fillMyautoForm(formDoc, v, { dropdownTimeoutMs: 30 })
  check(formDoc.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!.value === v.vin, 'VIN text field filled')
  check(controlledState === String(Math.round(v.mileageKm!)) && tracker === '', 'native setter bypasses tracker; bubbling input updates controlled state')
  check(result.filter(r => r.status === 'filled').length === 9 && result.some(r => r.field === 'მწარმოებელი' && r.status === 'unfilled'), 'honest filled/unfilled summary')
  mileage.value = '999'
  const noOverwrite = await fillMyautoForm(formDoc, v, { dropdownTimeoutMs: 30 })
  check(mileage.value === '999' && noOverwrite.some(r => r.field === 'გარბენი' && r.status === 'unfilled'), 'existing user values preserved')
  mileage.value = ''; formDoc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')!.textContent = 'მილი'
  await fillMyautoForm(formDoc, v, { dropdownTimeoutMs: 30 })
  check(mileage.value === '', 'kilometers never filled into miles form')
  frame.remove()
  const unverifiedFrame = document.createElement('iframe'); document.body.append(unverifiedFrame)
  const unverifiedDoc = unverifiedFrame.contentDocument!; unverifiedDoc.open(); unverifiedDoc.write(myauto); unverifiedDoc.close()
  const unverifiedResults = await fillMyautoForm(unverifiedDoc, v, { dropdownTimeoutMs: 30 })
  check(unverifiedResults.filter(r => r.status === 'filled').length === 4, 'unverified custom choices are not reported as filled')
  unverifiedFrame.remove()

  await runStagedTests(manheim,myauto,check)
  await runFormLifecycleTests(manheim,myauto,check)
  await runPrefetchTests(manheim,check)
  await runPersistenceTests(check)
  await runModelPrivacyTests(manheim,myauto,check)
  await runIdentityTests(manheim,myauto,check)
  await runTransferTests(manheim, myauto, check)
  await runDropdownTests(manheim,myauto,check)
  await runOptimizationTests(manheim,myauto,check)
  await runModelDesignationTests(manheim,myauto,check)
  await runReceiverTests(manheim,myauto,check)
  document.body.dataset.result = 'PASS'
  document.querySelector('pre')!.textContent = outcomes.join('\n')
} catch (error) {
  document.body.dataset.result = 'FAIL'
  document.querySelector('pre')!.textContent = outcomes.join('\n') + '\nFAILED: ' + (error instanceof Error ? error.message : String(error))
}
