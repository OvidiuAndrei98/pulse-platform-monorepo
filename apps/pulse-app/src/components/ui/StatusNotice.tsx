"use client";
import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ActionButton } from './ActionButton';
export function StatusNotice({kind='empty',title,detail,action,actionLabel,children,busy=false,className='',compact=false}:{kind?:'empty'|'error'|'loading'|'success';title:string;detail?:string;action?:()=>void;actionLabel?:string;children?:ReactNode;busy?:boolean;className?:string;compact?:boolean}){
  return <div className={`ui-status ui-status--${kind} ${compact?'ui-status--compact':''} ${className}`} role={kind==='error'?'alert':'status'} aria-busy={kind==='loading'||busy||undefined}>
    {kind==='loading'?<Loader2 aria-hidden className="ui-spinner"/>:kind==='error'?<AlertCircle aria-hidden/>:null}
    <p className="ui-status-title">{title}</p>{detail&&<p className="ui-status-detail">{detail}</p>}
    {action&&actionLabel&&<ActionButton tone="secondary" onClick={action} busy={busy}>{actionLabel}</ActionButton>}{children}
  </div>;
}
