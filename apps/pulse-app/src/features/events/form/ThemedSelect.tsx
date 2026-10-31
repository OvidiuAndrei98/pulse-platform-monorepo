"use client";

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useBackLayer } from '@/lib/navigation/useBackLayer';
import s from './themedSelect.module.css';
import {useFieldState} from '@/components/ui/Field';

export type ThemedSelectOption = { value:string; label:string };

// Shared select surface. Popover escapes scrolling dialogs without moving the
// menu outside their focus scope. Older browsers use the same menu in flow.
export function ThemedSelect({value,onChange,options,placeholder,icon:Icon,id,invalid,describedBy,disabled=false,label,name,testId,variant='field'}:{
  value:string;onChange:(value:string)=>void;options:ThemedSelectOption[];placeholder:string;icon?:LucideIcon;
  id?:string;invalid?:boolean;describedBy?:string;disabled?:boolean;label?:string;name?:string;testId?:string;variant?:'field'|'toolbar';
}) {
  const field=useFieldState();id??=field?.id;label??=field?.label;invalid??=field?.invalid;describedBy??=field?.errorId;
  const uid=useId(),listId=uid+'-options',button=useRef<HTMLButtonElement>(null),root=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState<React.CSSProperties>({});
  const typeahead=useRef({text:'',at:0}),selected=options.find(option=>option.value===value);
  const close=(restore=true)=>{setOpen(false);if(restore)button.current?.focus();};
  useBackLayer(open,()=>close());
  const show=()=>{if(disabled||!options.length)return;setActive(Math.max(0,options.findIndex(option=>option.value===value)));setOpen(true);};
  const select=(index:number)=>{const option=options[index];if(option&&!disabled)onChange(option.value);close();};
  useLayoutEffect(()=>{
    if(!open)return;
    const node=menu.current,trigger=button.current;if(!node||!trigger)return;
    const floating=typeof node.showPopover==='function';
    const place=()=>{
      if(!floating){setPosition({position:'relative',width:'100%',marginTop:8});return;}
      const r=trigger.getBoundingClientRect(),v=window.visualViewport;
      const left=v?.offsetLeft??0,top=v?.offsetTop??0,width=v?.width??innerWidth,height=v?.height??innerHeight;
      const below=top+height-r.bottom-20,above=r.top-top-20,down=below>=Math.min(240,options.length*40+14)||below>=above;
      const maxHeight=Math.max(24,Math.min(240,down?below:above)),menuWidth=Math.min(width-24,Math.max(r.width,180));
      const actualHeight=Math.min(maxHeight,node.scrollHeight||options.length*40+14);
      setPosition({position:'fixed',width:menuWidth,maxHeight,left:Math.max(left+12,Math.min(r.left,left+width-menuWidth-12)),top:down?r.bottom+8:Math.max(top+12,r.top-8-actualHeight)});
    };
    if(!floating)node.removeAttribute('popover');
    place();if(floating)node.showPopover();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close(false);};
    const dismiss=()=>close(false);
    document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',dismiss);window.addEventListener('scroll',place,true);
    window.visualViewport?.addEventListener('resize',dismiss);
    const observer=new ResizeObserver(place);observer.observe(node);
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',dismiss);observer.disconnect();if(floating&&node.matches(':popover-open'))node.hidePopover();};
  },[open,options.length]);
  useLayoutEffect(()=>{if(disabled||!options.length)setOpen(false);else setActive(index=>Math.min(index,options.length-1));},[disabled,options.length]);
  useLayoutEffect(()=>{if(open)menu.current?.querySelector('[data-index="'+active+'"]')?.scrollIntoView({block:'nearest'});},[active,open]);
  const keyboard=(event:React.KeyboardEvent<HTMLButtonElement>)=>{
    if(disabled)return;
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key==='Tab'){close(false);return;}
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();if(!open){show();return;}
      if(event.key==='Enter'||event.key===' '){select(active);return;}
      setActive(index=>event.key==='Home'?0:event.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1))));return;
    }
    if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const now=Date.now(),text=(now-typeahead.current.at<650?typeahead.current.text:'')+event.key.toLocaleLowerCase();typeahead.current={text,at:now};
      const index=options.findIndex(option=>option.label.toLocaleLowerCase().startsWith(text));
      if(index>=0){event.preventDefault();if(!open)show();setActive(index);}
    }
  };
  return <div ref={root} className={s.root} data-variant={variant}>
    {name&&<input type="hidden" name={name} value={value} disabled={disabled||!options.length}/>}
    <button ref={button} id={id} type="button" role="combobox" data-testid={testId} className={s.trigger}
      aria-label={label??placeholder} aria-invalid={invalid} aria-describedby={describedBy} disabled={disabled||!options.length}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open?uid+'-'+active:undefined}
      onKeyDown={keyboard} onClick={()=>open?close():show()}>
      {Icon&&<Icon aria-hidden className={s.icon}/>}<span className={s.value}>{selected?.label||placeholder}</span><ChevronDown aria-hidden className={s.chevron} data-open={open}/>
    </button>
    {open&&<div ref={menu} id={listId} popover="manual" role="listbox" aria-label={label??placeholder} className={s.menu} style={position} data-testid={testId?testId+'-options':undefined}>
      {options.map((option,index)=><div id={uid+'-'+index} key={option.value} role="option" aria-selected={value===option.value} data-index={index} data-active={active===index}
        className={s.option} onPointerMove={()=>setActive(index)} onClick={event=>{event.preventDefault();select(index);}}>
        <span>{option.label}</span>{value===option.value&&<Check aria-hidden size={16}/>}</div>)}
    </div>}
  </div>;
}
