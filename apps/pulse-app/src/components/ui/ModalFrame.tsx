"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useBackLayer} from '@/lib/navigation/useBackLayer';
import {useDrawerViewport} from './useDrawerViewport';
import {IconButton} from './ActionButton';

// The browser owns the modal top layer, focus containment and background inertness.
export function ModalFrame({open,onClose,label,children,placement='center',dismissible=true,className='',testId,initialFocusRef}:{open:boolean;onClose:()=>void;label:string;children:ReactNode;placement?:'center'|'side';dismissible?:boolean;className?:string;testId?:string;initialFocusRef?:{current:HTMLElement|null}}){
  const [mounted,setMounted]=useState(false),dialog=useRef<HTMLDialogElement|null>(null),closeRef=useRef(onClose),canClose=useRef(dismissible);
  closeRef.current=onClose;canClose.current=dismissible;
  const viewport=useDrawerViewport(open&&mounted,placement==='side'?'panel':'dialog');
  const bind=useCallback((node:HTMLDialogElement|null)=>{dialog.current=node;viewport(node);},[viewport]);
  useBackLayer(open,()=>{if(canClose.current)closeRef.current();else return false;});
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{
    const node=dialog.current;if(!open||!mounted||!node)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    node.autofocus=true;
    if(!node.open)node.showModal();
    (initialFocusRef?.current??node.querySelector<HTMLElement>('[data-dialog-initial-focus]')??node).focus({preventScroll:true});
    return()=>{if(node.open)node.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open,mounted,placement,initialFocusRef]);
  if(!mounted||!open)return null;
  return createPortal(<dialog ref={bind} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} data-testid={testId}
    onKeyDown={event=>{
      if(event.defaultPrevented)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(canClose.current)closeRef.current();return;}
      if(event.key!=='Tab')return;
      const node=event.currentTarget,items=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(item=>item.tabIndex>=0&&item.getClientRects().length>0&&!item.closest('[inert]'));
      const first=items[0],last=items.at(-1);
      if(!first){event.preventDefault();node.focus();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===node)){event.preventDefault();first.focus();}
    }}
    onCancel={event=>{event.preventDefault();event.stopPropagation();if(canClose.current)closeRef.current();}}
    onClick={event=>{if(event.target!==event.currentTarget||!canClose.current)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeRef.current();}}
    className={`ui-modal ui-modal--${placement} ${className}`}>{children}</dialog>,document.body);
}
export function ModalHeader({title,onClose,description,disabled=false}:{title:string;onClose:()=>void;description?:string;disabled?:boolean}){
  const {t}=useTranslation();
  return <header className="ui-modal-header" data-drawer-keyboard-header><div className="min-w-0 flex-1"><h2>{title}</h2>{description&&<p>{description}</p>}</div><IconButton label={t('common.close')} disabled={disabled} onClick={onClose}><X aria-hidden size={18}/></IconButton></header>;
}
