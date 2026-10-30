import { fitsZone,totalItems,type Deposit,type Items,type WardrobeEvent,type Zone } from './model';
export type WardrobeTask = 'receive' | 'pickup' | 'setup' | 'history' | 'unclaimed';
export const operatorAccount = (role: unknown) => role === 'organizer' || role === 'admin';
export const wardrobeTasks = (manage: boolean): WardrobeTask[] => ['receive','pickup','unclaimed','history',...(manage ? ['setup' as const]:[])];
export function wardrobeTabLabel(task:WardrobeTask,ro:boolean):string {
  return (ro?{receive:'Primire',pickup:'Predare',unclaimed:'Neridicate',history:'Activitate',setup:'Configurare'}:{receive:'Receive',pickup:'Return',unclaimed:'Unclaimed',history:'Activity',setup:'Setup'})[task];
}
export function wardrobeEventPhase(event:WardrobeEvent,now=Date.now()):'live'|'upcoming'|'active'|'other' {
  const start=Date.parse(event.startTime??''),end=Date.parse(event.endTime??'');
  if(event.status&&!['published','scheduled','live'].includes(event.status)||Number.isFinite(end)&&end<=now)return 'other';
  if(Number.isFinite(start)&&start>now)return 'upcoming';
  return Number.isFinite(start)&&Number.isFinite(end)?'live':'active';
}
export function wardrobeEventPhaseLabel(event:WardrobeEvent,ro:boolean):string {
  return (ro?{live:'Acum',upcoming:'Urmează',active:'Activ',other:'Alte evenimente'}:{live:'Live',upcoming:'Upcoming',active:'Active',other:'Other events'})[wardrobeEventPhase(event)];
}
export const taskDeposits = (task:WardrobeTask|null,rows:Deposit[]):Deposit[] => task==='receive'?[]:task==='pickup'?rows.filter(row=>row.status==='stored'):rows;
export function changeItemCount(current:Items,key:keyof Items,delta:1|-1,max?:Items):Items {
  if(delta===1&&(totalItems(current)>=20||current[key]>=(max?.[key]??20)))return current;
  return {...current,[key]:Math.max(0,current[key]+delta)};
}
export function wardrobeFlow(ro: boolean) {
  return ro ? {
    chooseEvent:'Alege evenimentul',eventLabel:'Eveniment',operations:'Operațiuni garderobă',settings:'Configurare garderobă',reservationHint:'Confirmă primirea sau anulează rezervarea înainte să schimbi secțiunea ori evenimentul.',eventSearch:'Caută evenimentul',eventHint:'Deschide garderoba evenimentului la care lucrezi.',changeEvent:'Schimbă evenimentul',backTasks:'Înapoi la operațiuni',
    receive:'Primește obiecte',pickup:'Predă obiecte',setup:'Configurare',history:'Activitate',unclaimed:'Obiecte neridicate',
    receiveHint:'Scanează clientul, alege obiectele și confirmă locul de depozitare.',pickupHint:'Caută clientul sau numărul de garderobă și cere confirmarea de ridicare.',setupHint:'Zone de depozitare și echipa care lucrează la garderobă.',
    historyHint:'Consultă înregistrările și acțiunile echipei.',unclaimedHint:'Urmărește obiectele rămase în custodie.',
    scanClient:'1. Scanează codul clientului',scanHint:'Clientul deschide codul de profil din aplicație. Nu scana biletul de acces.',items:'2. Alege obiectele',place:'3. Alege locul de depozitare',
    next:'Continuă',back:'Înapoi',reserve:'Rezervă locul',nextClient:'Primește următorul client',scanned:'Codul clientului a fost citit.',badCode:'Scanează codul de profil al clientului, nu biletul de acces.',
    noZones:'Nu există o zonă disponibilă pentru aceste obiecte. Verifică tipul zonei și locurile libere.',advanced:'Alte operațiuni',zones:'Zone și tipuri de obiecte',team:'Echipă',
  } : {
    chooseEvent:'Choose the event',eventLabel:'Event',operations:'Cloakroom operations',settings:'Cloakroom settings',reservationHint:'Confirm the deposit or cancel the reservation before changing section or event.',eventSearch:'Search events',eventHint:'Open the wardrobe for the event you are working at.',changeEvent:'Change event',backTasks:'Back to operations',
    receive:'Receive belongings',pickup:'Hand back belongings',setup:'Setup',history:'Activity',unclaimed:'Unclaimed belongings',
    receiveHint:'Scan the customer, choose belongings and confirm the storage location.',pickupHint:'Find the customer or wardrobe number, then request pickup confirmation.',setupHint:'Storage zones and the team working at the wardrobe.',
    historyHint:'Review records and team actions.',unclaimedHint:'Track belongings still in custody.',
    scanClient:'1. Scan the customer code',scanHint:'The customer opens their profile code in the app. Do not scan the admission ticket.',items:'2. Choose belongings',place:'3. Choose the storage location',
    next:'Continue',back:'Back',reserve:'Reserve storage',nextClient:'Receive the next customer',scanned:'The customer code was read.',badCode:'Scan the customer profile code, not the admission ticket.',
    noZones:'No storage zone is available for these belongings. Check the zone type and free spaces.',advanced:'Other operations',zones:'Zones and item types',team:'Team',
  };
}
export function availableZones(items: Items,zones:Zone[]) { return zones.filter(zone=>fitsZone(items,zone)&&zone.capacity>zone.occupied); }
export function canReserveBelongings(items: Items,zoneId:string,zones:Zone[],accepting:boolean) {return accepting&&totalItems(items)>0&&availableZones(items,zones).some(zone=>zone.id===zoneId);}
export function wardrobeEventDescription(event:WardrobeEvent,ro:boolean) {const at=event.startTime ? Date.parse(event.startTime):NaN;return [Number.isFinite(at)?new Intl.DateTimeFormat(ro?'ro-RO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(at)):'',event.location].filter(Boolean).join(' · ');}
