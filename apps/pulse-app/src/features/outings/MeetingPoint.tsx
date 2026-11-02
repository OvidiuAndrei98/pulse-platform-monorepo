"use client";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
export function MeetingPoint({value,editable,busy,onSave}:{value:string;editable:boolean;busy:boolean;onSave:(value:string)=>Promise<boolean>}) {
  const {t}=useTranslation(),[draft,setDraft]=useState<string|null>(null);
  return <div className="space-y-3"><h3 className="font-semibold">{t('eventNight.meeting')}</h3>
    {editable?<><Input data-testid="night-meeting" aria-label={t('eventNight.meeting')} maxLength={160} value={draft??value} disabled={busy} onChange={e=>setDraft(e.target.value)}/><ActionButton tone="secondary" disabled={busy||!draft?.trim()} onClick={()=>void onSave(draft!.trim()).then(ok=>{if(ok)setDraft(null);})}>{t('common.save')}</ActionButton></>:value&&<p>{value}</p>}
    <p className="text-sm text-muted-foreground">{t('eventNight.meetingHint')}</p>
  </div>;
}
