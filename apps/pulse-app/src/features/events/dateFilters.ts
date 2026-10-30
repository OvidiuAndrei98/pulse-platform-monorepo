import type { EventFilters } from './types';
import { productToday,productMidnight,shiftCalendarDay,validCalendarDay } from './discoveryFilters';
type DateRange={startsAfter?:string;startsBefore?:string};
export function getEventDateRange(dateFilter?:EventFilters['date'],custom?:Pick<EventFilters,'dateFrom'|'dateTo'>):DateRange {
  const now=new Date(),today=productToday(now);
  const range=(from:string,to:string)=>({startsAfter:productMidnight(from),startsBefore:productMidnight(to)});
  if(dateFilter==='Custom'&&validCalendarDay(custom?.dateFrom)&&validCalendarDay(custom?.dateTo)&&custom.dateFrom<=custom.dateTo)
    return range(custom.dateFrom,shiftCalendarDay(custom.dateTo,1));
  switch(dateFilter){
    case 'Tonight':return {startsAfter:now.toISOString(),startsBefore:productMidnight(shiftCalendarDay(today,1))};
    case 'Tomorrow':return range(shiftCalendarDay(today,1),shiftCalendarDay(today,2));
    case 'This weekend':{
      const weekday=new Date(today+'T12:00:00Z').getUTCDay(),start=shiftCalendarDay(today,weekday===0?-1:(6-weekday+7)%7);
      return range(start,shiftCalendarDay(start,2));
    }
    case 'Next week':{
      const weekday=new Date(today+'T12:00:00Z').getUTCDay(),start=shiftCalendarDay(today,((8-weekday)%7)||7);
      return range(start,shiftCalendarDay(start,7));
    }
    default:return {};
  }
}
