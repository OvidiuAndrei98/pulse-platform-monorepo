"use client";
import {Minus,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {IconButton} from './ActionButton';

export function TicketQuantityStepper({name,value,maximum,disabled,onStep,testIDPrefix}:{name:string;value:number;maximum:number;disabled?:boolean;onStep:(delta:number)=>void;testIDPrefix:string}) {
  const {t}=useTranslation();
  return <div className="inline-flex items-center gap-1 rounded-full border border-[var(--ui-input-border)] bg-[var(--ui-raised)] p-0.5">
    <IconButton label={t('checkout.decreaseQuantity',{name})} tone="ghost" data-testid={testIDPrefix+'-minus'} disabled={disabled||value<=0} onClick={()=>onStep(-1)} className="!h-11 !w-11 !min-h-11 !p-0"><Minus size={18} aria-hidden/></IconButton>
    <output aria-label={t('checkout.quantity')+' · '+name} aria-live="polite" data-testid={testIDPrefix+'-quantity'} className="min-w-7 text-center text-base font-semibold tabular-nums text-foreground">{value}</output>
    <IconButton label={t('checkout.increaseQuantity',{name})} tone="ghost" data-testid={testIDPrefix+'-plus'} disabled={disabled||value>=maximum} onClick={()=>onStep(1)} className="!h-11 !w-11 !min-h-11 !p-0"><Plus size={18} aria-hidden/></IconButton>
  </div>;
}
