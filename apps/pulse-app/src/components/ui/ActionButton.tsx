"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link, { type LinkProps } from 'next/link';
import { Loader2 } from 'lucide-react';

export type ActionTone='primary'|'secondary'|'ghost'|'danger';
export type ActionSize='regular'|'large'|'compact';
export const actionClass=(tone:ActionTone='primary',size:ActionSize='regular')=>`ui-button ui-button--${tone} ui-button--${size}`;

export type ActionButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{tone?:ActionTone;size?:ActionSize;busy?:boolean};
export const ActionButton=forwardRef<HTMLButtonElement,ActionButtonProps>(function ActionButton({tone='primary',size='regular',busy=false,className='',children,onClick,type='button',disabled,...props},ref){
  return <button {...props} ref={ref} type={type} disabled={disabled||busy} aria-busy={busy||props["aria-busy"]||undefined} aria-disabled={busy||disabled||undefined}
    data-variant={tone} className={`${actionClass(tone,size)} ${className}`} onClick={event=>{if(busy){event.preventDefault();return;}onClick?.(event);}}>
    {busy&&<Loader2 aria-hidden className="ui-spinner"/>}{children}
  </button>;
});
export function IconButton({label,children,...props}:Omit<ActionButtonProps,'children'>&{label:string;children:ReactNode}){
  return <ActionButton {...props} tone={props.tone??'secondary'} aria-label={label} className={`ui-icon-button ${props.className??''}`}>{children}</ActionButton>;
}
export function ActionLink({tone='primary',size='regular',className='',children,...props}:LinkProps&Omit<import('react').AnchorHTMLAttributes<HTMLAnchorElement>,'href'>&{children:ReactNode;className?:string;tone?:ActionTone;size?:ActionSize;target?:string;rel?:string}){
  return <Link {...props} data-variant={tone} className={`${actionClass(tone,size)} ${className}`}>{children}</Link>;
}
