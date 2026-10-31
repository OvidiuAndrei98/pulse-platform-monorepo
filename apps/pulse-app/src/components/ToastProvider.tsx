"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";
import {createPortal} from "react-dom";

export function ToastProvider() {
  const [container,setContainer]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    const host=document.createElement('div');host.dataset.interfaceFeedback='';
    let stack:HTMLDialogElement[]=[];
    const sync=(records:MutationRecord[]=[])=>{
      stack=stack.filter(node=>node.isConnected&&node.open&&node.matches(':modal'));
      for(const record of records)if(record.type==='attributes'&&record.target instanceof HTMLDialogElement&&record.target.open&&record.target.matches(':modal')){stack=stack.filter(node=>node!==record.target);stack.push(record.target);}
      for(const node of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))if(node.matches(':modal')&&!stack.includes(node))stack.push(node);
      const parent=stack.at(-1)??document.body;if(host.parentElement!==parent)parent.append(host);
    };
    sync();setContainer(host);
    const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
    return()=>{observer.disconnect();host.remove();};
  },[]);
  if(!container)return null;

  return createPortal(
    <Toaster
      className="spottr-toaster"
      position="top-right"
      theme="dark"
      visibleToasts={3}
      gap={10}
      swipeDirections={["top", "right"]}
      offset={{ top: 84, right: 24 }}
      mobileOffset={{
        top: "calc(max(env(safe-area-inset-top, 0px), var(--native-safe-top, 0px)) + 12px)",
        left: 16,
        right: 16,
      }}
      icons={{
        success: <CircleCheck aria-hidden="true" />,
        error: <CircleAlert aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <TriangleAlert aria-hidden="true" />,
        loading: <LoaderCircle aria-hidden="true" className="animate-spin" />,
      }}
      toastOptions={{
        className: "spottr-toast",
      }}
    />,container
  );
}
