"use client";
import { useEffect,useRef,useState } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { tabFocusIndex,type WardrobeTabOption } from './tabNavigation';
import s from './wardrobe.module.css';

export function WardrobeTabs<T extends string>({id,label,value,options,onChange,disabled=false,locked=false,panelId,ro}:{id:string;label:string;value:T;options:WardrobeTabOption<T>[];onChange:(value:T)=>void;disabled?:boolean;locked?:boolean;panelId:string;ro:boolean}) {
  const rail=useRef<HTMLDivElement>(null),buttons=useRef<(HTMLButtonElement|null)[]>([]);
  const [focused,setFocused]=useState(value),[overflow,setOverflow]=useState(false),[edges,setEdges]=useState({start:true,end:false});
  const unavailable=options.map(option=>disabled||locked&&option.value!==value);
  const selected=Math.max(0,options.findIndex(option=>option.value===value));
  const focusIndex=options.findIndex((option,index)=>option.value===focused&&!unavailable[index]);
  useEffect(()=>setFocused(value),[value]);
  useEffect(()=>{
    const node=rail.current;if(!node)return;
    const measure=()=>{setOverflow(node.scrollWidth>node.clientWidth+1);setEdges({start:Math.abs(node.scrollLeft)<2,end:Math.abs(node.scrollLeft)+node.clientWidth>=node.scrollWidth-2});};
    measure();node.addEventListener('scroll',measure);const observer=new ResizeObserver(measure);observer.observe(node);
    return()=>{node.removeEventListener('scroll',measure);observer.disconnect();};
  },[options.map(option=>option.label).join('|')]);
  const reveal=(index:number)=>{const node=rail.current,button=buttons.current[index];if(!node||!button)return;const a=node.getBoundingClientRect(),b=button.getBoundingClientRect();if(b.left<a.left)node.scrollLeft-=a.left-b.left+4;else if(b.right>a.right)node.scrollLeft+=b.right-a.right+4;};
  useEffect(()=>reveal(selected),[selected]);
  const move=(direction:number)=>{const node=rail.current;if(node)node.scrollBy({left:direction*(getComputedStyle(node).direction==='rtl'?-1:1)*node.clientWidth*.75,behavior:'instant'});};
  return <div className={s.tabBar}>
    {overflow&&<button type="button" className={s.tabArrow} tabIndex={-1} disabled={edges.start} aria-label={ro?'Arată secțiunile anterioare':'Show previous sections'} onClick={()=>move(-1)}><ChevronLeft aria-hidden="true" size={18}/></button>}
    <div ref={rail} role="tablist" aria-label={label} className={s.tabRail}>
      {options.map((option,index)=><button key={option.value} ref={node=>{buttons.current[index]=node;}} type="button" role="tab" id={id+'-'+option.value} data-testid={id==='wardrobe-operations'?'wardrobe-task-'+option.value:id+'-'+option.value} aria-controls={panelId} aria-selected={option.value===value} disabled={unavailable[index]} tabIndex={index===(focusIndex<0?selected:focusIndex)?0:-1} className={s.tabButton} onFocus={()=>setFocused(option.value)} onClick={()=>{if(option.value!==value)onChange(option.value);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!unavailable[index]&&option.value!==value)onChange(option.value);return;}const next=tabFocusIndex(event.key,index,unavailable,getComputedStyle(event.currentTarget).direction==='rtl');if(next<0)return;event.preventDefault();buttons.current[next]?.focus({preventScroll:true});reveal(next);}}>{option.label}</button>)}
    </div>
    {overflow&&<button type="button" className={s.tabArrow} tabIndex={-1} disabled={edges.end} aria-label={ro?'Arată alte secțiuni':'Show more sections'} onClick={()=>move(1)}><ChevronRight aria-hidden="true" size={18}/></button>}
  </div>;
}
