"use client";
import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock,Minus,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {Input,useFieldState} from '@/components/ui/Field';
import {ActionButton,IconButton} from '@/components/ui/ActionButton';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
const toLocal=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const dayKey=(date:Date)=>toLocal(date).split('T')[0];
const parse=(value:string)=>{const date=value?new Date(value):new Date();return Number.isNaN(date.getTime())?new Date():date;};
type PickerProps={value:string;onChange:(value:string)=>void;placeholder?:string;id?:string;label?:string;invalid?:boolean;describedBy?:string};
export function DateTimePicker({value,onChange,placeholder,id,label,invalid,describedBy}:PickerProps){
 const field=useFieldState(),{t,i18n}=useTranslation(),[open,setOpen]=useState(false);
 const selected=useMemo(()=>parse(value),[value]),[month,setMonth]=useState(()=>new Date(selected.getFullYear(),selected.getMonth(),1)),[focused,setFocused]=useState(()=>dayKey(selected)),calendar=useRef<HTMLDivElement>(null),moveFocus=useRef(false);
 const locale=i18n.language==='ro'?'ro-RO':'en-GB',title=label??field?.label??placeholder??t('datePicker.placeholder');
 const days=useMemo(()=>{const first=new Date(month),offset=(first.getDay()+6)%7;first.setDate(1-offset);const count=Math.ceil((offset+new Date(month.getFullYear(),month.getMonth()+1,0).getDate())/7)*7;return Array.from({length:count},(_,index)=>{const date=new Date(first);date.setDate(first.getDate()+index);return date;});},[month]);
 useEffect(()=>{if(moveFocus.current){calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();moveFocus.current=false;}},[focused,month]);
 const moveMonth=(delta:number)=>{const next=new Date(month.getFullYear(),month.getMonth()+delta,1);setMonth(next);setFocused(dayKey(next));};
 const emitDate=(date:Date)=>{const next=new Date(date);next.setHours(selected.getHours(),selected.getMinutes(),0,0);onChange(toLocal(next));setFocused(dayKey(next));setMonth(new Date(next.getFullYear(),next.getMonth(),1));};
 const emitTime=(hours:number,minutes:number)=>{const next=new Date(selected);next.setHours(hours,minutes,0,0);onChange(toLocal(next));};
 const keyboard=(event:KeyboardEvent<HTMLButtonElement>,day:Date)=>{
  const next=new Date(day);let handled=true;
  if(event.key==='ArrowLeft')next.setDate(next.getDate()-1);else if(event.key==='ArrowRight')next.setDate(next.getDate()+1);else if(event.key==='ArrowUp')next.setDate(next.getDate()-7);else if(event.key==='ArrowDown')next.setDate(next.getDate()+7);
  else if(event.key==='Home')next.setDate(next.getDate()-(next.getDay()+6)%7);else if(event.key==='End')next.setDate(next.getDate()+6-(next.getDay()+6)%7);
  else if(event.key==='PageUp'||event.key==='PageDown'){const oldDay=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+(event.key==='PageUp'?-1:1));next.setDate(Math.min(oldDay,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));}else handled=false;
  if(handled){event.preventDefault();moveFocus.current=true;setFocused(dayKey(next));setMonth(new Date(next.getFullYear(),next.getMonth(),1));}
 };
 return <div className="relative">
  <button id={id??field?.id} aria-label={title} aria-describedby={describedBy??field?.errorId} aria-invalid={invalid??field?.invalid} aria-haspopup="dialog" aria-expanded={open} type="button" className="ui-input flex items-center gap-2 text-left" onClick={()=>{setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));setFocused(dayKey(selected));setOpen(true);}}><CalendarDays aria-hidden size={16} className="shrink-0 text-primary"/><span className="min-w-0 flex-1">{value?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(selected):placeholder??t('datePicker.placeholder')}</span><Clock aria-hidden size={16} className="shrink-0 text-muted-foreground"/></button>
  <ModalFrame open={open} onClose={()=>setOpen(false)} label={title} className="max-w-sm">
   <ModalHeader title={title} onClose={()=>setOpen(false)}/>
   <div className="p-3 sm:p-5" data-drawer-keyboard-scroll>
    <div className="mb-2 flex items-center justify-between gap-2"><IconButton label={t('datePicker.previousMonth')} onClick={()=>moveMonth(-1)}><ChevronLeft aria-hidden size={16}/></IconButton><p aria-live="polite" className="text-sm font-semibold">{new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(month)}</p><IconButton label={t('datePicker.nextMonth')} onClick={()=>moveMonth(1)}><ChevronRight aria-hidden size={16}/></IconButton></div>
    <div ref={calendar} className="grid grid-cols-7 gap-1 text-center">
     {Array.from({length:7},(_,i)=><span aria-hidden key={i} className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2024,0,i+1))}</span>)}
     {days.map(day=><button key={dayKey(day)} data-day={dayKey(day)} type="button" tabIndex={dayKey(day)===focused?0:-1} aria-label={new Intl.DateTimeFormat(locale,{dateStyle:'full'}).format(day)} aria-pressed={dayKey(day)===dayKey(selected)} aria-current={dayKey(day)===dayKey(new Date())?'date':undefined} onKeyDown={event=>keyboard(event,day)} onFocus={()=>setFocused(dayKey(day))} onClick={()=>emitDate(day)} className={`min-h-10 min-w-0 rounded-xl text-sm ${dayKey(day)===dayKey(selected)?'bg-[var(--ui-action)] font-semibold text-white':day.getMonth()===month.getMonth()?'text-foreground hover:bg-white/10':'text-muted-foreground hover:bg-white/10'}`}>{day.getDate()}</button>)}
    </div>
    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-t border-border pt-4"><TimeStepper label={t('datePicker.hoursLabel')} value={selected.getHours()} max={23} onChange={hours=>emitTime(hours,selected.getMinutes())}/><span aria-hidden>:</span><TimeStepper label={t('datePicker.minutesLabel')} value={selected.getMinutes()} max={59} onChange={minutes=>emitTime(selected.getHours(),minutes)}/></div>
    <div className="mt-4 flex justify-end gap-2"><ActionButton tone="secondary" onClick={()=>{const now=new Date();onChange(toLocal(now));setMonth(new Date(now.getFullYear(),now.getMonth(),1));setFocused(dayKey(now));}}>{t('datePicker.now')}</ActionButton><ActionButton onClick={()=>setOpen(false)}>{t('datePicker.done')}</ActionButton></div>
   </div>
  </ModalFrame>
 </div>;
}
export function TimePicker({value,onChange,className,label}:{value:string;onChange:(value:string)=>void;compact?:boolean;className?:string;label?:string}){
 const {t}=useTranslation(),field=useFieldState(),[open,setOpen]=useState(false),[hours,minutes]=/^\d{2}:\d{2}$/.test(value)?value.split(':').map(Number):[20,0],title=label??field?.label??t('datePicker.time');
 const emit=(h:number,m:number)=>onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
 return <div className="relative"><button type="button" id={field?.id} aria-describedby={field?.errorId} aria-invalid={field?.invalid} aria-label={title} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} className={`ui-input flex items-center gap-2 text-left ${className??''}`}><Clock aria-hidden size={16}/>{value||'--:--'}</button><ModalFrame open={open} onClose={()=>setOpen(false)} label={title} className="max-w-sm"><ModalHeader title={title} onClose={()=>setOpen(false)}/><div className="p-4"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1"><TimeStepper label={t('datePicker.hoursLabel')} value={hours} max={23} onChange={h=>emit(h,minutes)}/><span aria-hidden>:</span><TimeStepper label={t('datePicker.minutesLabel')} value={minutes} max={59} step={5} onChange={m=>emit(hours,m)}/></div><ActionButton onClick={()=>setOpen(false)} className="mt-4 w-full">{t('datePicker.done')}</ActionButton></div></ModalFrame></div>;
}
function TimeStepper({label,value,max,step=1,onChange}:{label:string;value:number;max:number;step?:number;onChange:(value:number)=>void}){
 const {t}=useTranslation(),[draft,setDraft]=useState(String(value).padStart(2,'0'));
 useEffect(()=>setDraft(String(value).padStart(2,'0')),[value]);
 const commit=()=>{const next=draft?Math.min(max,Math.max(0,Number(draft))):value;onChange(next);setDraft(String(next).padStart(2,'0'));};
 return <div role="group" aria-label={label} className="flex min-w-0 items-center rounded-xl border border-[var(--ui-input-border)]"><IconButton label={`${t('datePicker.decrease')} ${label}`} onClick={()=>onChange((value-step+max+1)%(max+1))} ><Minus aria-hidden size={14}/></IconButton><Input bare aria-label={label} inputMode="numeric" value={draft} onFocus={event=>event.currentTarget.select()} onChange={event=>setDraft(event.target.value.replace(/\D/g,'').slice(0,2))} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}} className="min-w-0 w-full bg-transparent text-center tabular-nums"/><IconButton label={`${t('datePicker.increase')} ${label}`} onClick={()=>onChange((value+step)%(max+1))} ><Plus aria-hidden size={14}/></IconButton></div>;
}
