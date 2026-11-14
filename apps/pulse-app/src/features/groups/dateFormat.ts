import i18n from '@/i18n';
/** Group nights are organized in Bucharest time even when a member travels. */
export function formatGroupEventDateTime(value:string){
 const at=new Date(value);if(!Number.isFinite(at.getTime()))return i18n.t('date.unknown');
 const locale=i18n.language.startsWith('ro')?'ro-RO':'en-GB';
 return new Intl.DateTimeFormat(locale,{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Bucharest'}).format(at)+' · '+new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Bucharest'}).format(at);
}
