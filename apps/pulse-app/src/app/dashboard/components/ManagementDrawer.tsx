"use client";
import {type ReactNode} from 'react';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
export function ManagementDrawer({open,onClose,title,subtitle,children}:{open:boolean;onClose:()=>void;title:string;subtitle?:string;children:ReactNode}){
 return <ModalFrame open={open} onClose={onClose} label={title} placement="side">
  <ModalHeader title={title} description={subtitle} onClose={onClose}/>
  <div data-drawer-keyboard-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(2rem,var(--native-safe-bottom))] sm:px-6">{children}</div>
 </ModalFrame>;
}
