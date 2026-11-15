"use client";
import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {IconButton} from '@/components/ui/ActionButton';
import {useBackLayer} from '@/lib/navigation/useBackLayer';
import selectStyles from '@/features/events/form/themedSelect.module.css';
import s from './groups.module.css';

type Item={key:string;label:string;icon?:ReactNode;onSelect:()=>void;testId?:string;disabled?:boolean};
/** The same browser top-layer surface and positioning used by ThemedSelect. */
export function ActionMenu({label,icon,items,testId,className}:{label:string;icon:ReactNode;items:Item[];testId?:string;className?:string}){
 const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[position,setPosition]=useState<React.CSSProperties>({});
 const close=(restore=true)=>{setOpen(false);if(restore)trigger.current?.focus()};
 useBackLayer(open,()=>close());
 useLayoutEffect(()=>{
  if(!open)return;const node=menu.current,button=root.current?.querySelector<HTMLButtonElement>('button');if(!node||!button)return;trigger.current=button;
  const floating=typeof node.showPopover==='function';if(!floating)node.removeAttribute('popover');
  const place=()=>{const r=button.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft??0,top=v?.offsetTop??0,width=v?.width??innerWidth,height=v?.height??innerHeight,menuWidth=Math.min(270,width-24),menuHeight=Math.min(node.scrollHeight||items.length*44+12,height-24),down=r.bottom+menuHeight+8<top+height;setPosition({position:'fixed',width:menuWidth,maxHeight:height-24,left:Math.max(left+12,Math.min(r.right-menuWidth,left+width-menuWidth-12)),top:down?r.bottom+6:Math.max(top+12,r.top-menuHeight-6),transformOrigin:down?'top right':'bottom right'})};
  place();const observer=new ResizeObserver(place);observer.observe(node);if(floating)node.showPopover();node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close(false)},dismiss=()=>close(false);
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
  return()=>{observer.disconnect();document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);if(floating&&node.matches(':popover-open'))node.hidePopover()};
 },[open,items.length]);
 return <div className={s.actionMenuRoot} ref={root}><IconButton className={className} data-testid={testId} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?close():setOpen(true)}>{icon}</IconButton>
 {open&&<div ref={menu} popover="manual" id={id} role="menu" aria-label={label} className={selectStyles.menu+' '+s.actionMenu} style={position} onKeyDown={event=>{const controls=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=controls.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}else if(event.key==='Tab')close(false);else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();controls[event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowUp'?-1:1)+controls.length)%controls.length]?.focus()}}}>{items.map(item=><button key={item.key} type="button" role="menuitem" data-testid={item.testId} disabled={item.disabled} className={selectStyles.option+' '+s.menuItem} onClick={()=>{close();item.onSelect()}}>{item.icon}<span>{item.label}</span></button>)}</div>}
 </div>;
}
