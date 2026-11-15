import i18n from '@/i18n';
import {groupEventDate} from '@packages/app-core/social/groupPresentation';
/** Group nights are organized in Bucharest time even when a member travels. */
export function formatGroupEventDateTime(value:string){
 const at=new Date(value);if(!Number.isFinite(at.getTime()))return i18n.t('date.unknown');
 return groupEventDate(value,i18n.language);
}
