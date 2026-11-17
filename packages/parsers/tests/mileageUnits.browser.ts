import {sourceMileage,mileageValue,selectedMileageUnit,mileageDescription} from '../src/mileage'
import {parseManheim24} from '../src/manheim24'
import {fillMyautoForm,myautoFields,verifyMyautoFields} from '../src/myauto'
export async function runMileageUnitTests(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),vehicle=parseManheim24(new DOMParser().parseFromString(html,'text/html'))
  for(const [display,value,unit] of [['45,200 mi',45200,'mi'],['78,500 miles',78500,'mi'],['12000 mi',12000,'mi'],['12000 km',12000,'km']] as const){
    const mileage=sourceMileage(undefined,undefined,display)!
    const current={...vehicle,mileage,mileageKm:undefined}
    check(mileage.value===value&&mileage.unit===unit&&mileageValue(current)===String(value),'mileage: '+display+' preserves exact numeric source value and unit')
    const frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!;doc.body.innerHTML='<input name="primaryFeatures.mileage"><select name="primaryFeatures.mileageType"><option value="real-km-fixture">კმ</option><option value="real-mi-fixture">მილი</option></select>'
    try{
      const plan=myautoFields(current).filter(field=>field.field==='mileageKm'),result=await fillMyautoForm(doc,current,{planned:plan,dropdownTimeoutMs:250})
      check(doc.querySelector<HTMLInputElement>('input')!.value===String(value)&&selectedMileageUnit(doc,current)&&result.some(field=>field.status==='filled'),'MyAuto mileage: exact available unit option selected and original value filled for '+display)
      doc.querySelector('input')!.dispatchEvent(new Event('blur'));check(verifyMyautoFields(doc,current,result,plan).filter(field=>field.key==='mileageKm').every(field=>field.status==='filled'),'MyAuto mileage: value and unit remain verified after focus change')
      if(unit==='mi')check(mileageDescription(current)==='გარბენი: '+value.toLocaleString('en-US')+' მილი','mileage description: original miles with Georgian label, no kilometer conversion')
    }finally{frame.remove()}
  }
  check(!sourceMileage(45200,undefined)&&!sourceMileage(undefined,'mi')&&!sourceMileage(45200,'km','45,200 mi'),'mileage: missing/contradictory values or units are not guessed')
  const current={...vehicle,mileage:{value:45200,unit:'mi' as const},mileageKm:undefined},frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.body.innerHTML='<input name="primaryFeatures.mileage"><select name="primaryFeatures.mileageType"><option value="only-km">კმ</option></select>'
  try{const plan=myautoFields(current).filter(field=>field.field==='mileageKm'),result=await fillMyautoForm(doc,current,{planned:plan,dropdownTimeoutMs:20});check(doc.querySelector<HTMLInputElement>('input')!.value===''&&result.every(field=>field.status!=='filled'),'MyAuto only-km form: miles stay unfilled rather than converted or mislabeled')}
  finally{frame.remove()}
}
