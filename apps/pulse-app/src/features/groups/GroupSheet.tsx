"use client";
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
import {ActionButton} from '@/components/ui/ActionButton';
import s from './groups.module.css';

/** The existing Spottr modal, with one shared content-sized header/body/footer. */
export function GroupSheet({open=true,title,onClose,onBack,children,footer,dirty=false,busy=false,testId,initialFocusRef,bodyRef}:{open?:boolean;title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode;footer?:ReactNode;dirty?:boolean;busy?:boolean;testId?:string;initialFocusRef?:{current:HTMLElement|null};bodyRef?:{current:HTMLDivElement|null}}){
 const {t}=useTranslation(),[discard,setDiscard]=useState(false);
 const requestClose=()=>{if(busy)return;if(discard){setDiscard(false);return}if(dirty)setDiscard(true);else onClose()};
 return <ModalFrame open={open} onClose={requestClose} dismissible={!busy} label={discard?t('groups.discardTitle'):title} className={s.groupSheet} testId={testId} initialFocusRef={initialFocusRef}>
  <ModalHeader title={discard?t('groups.discardTitle'):title} onClose={requestClose} onBack={discard?undefined:onBack} disabled={busy}/>
  <div ref={bodyRef} className={s.dialogScroll}>{discard?<p className={s.muted}>{t('groups.discardHint')}</p>:children}</div>
  {(discard||footer)&&<footer className={s.dialogFooter}>{discard?<><ActionButton data-testid="group-keep-editing" tone="secondary" onClick={()=>setDiscard(false)}>{t('groups.keepEditing')}</ActionButton><ActionButton data-testid="group-discard" tone="danger" onClick={onClose}>{t('groups.discard')}</ActionButton></>:footer}</footer>}
 </ModalFrame>;
}

/** Fixed action area reserves its measured height in the page's normal flow. */
export function GroupPageFooter({children}:{children:ReactNode}){
 const ref=useRef<HTMLElement>(null),[height,setHeight]=useState(0);
 useLayoutEffect(()=>{const node=ref.current;if(!node)return;const measure=()=>setHeight(node.getBoundingClientRect().height);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect()},[]);
 return <><div aria-hidden data-testid="group-footer-space" style={{height}}/><footer ref={ref} data-testid="group-page-footer" className={s.pageFooter}>{children}</footer></>;
}
