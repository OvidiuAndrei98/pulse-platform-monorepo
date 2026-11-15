"use client";
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Image as ImageIcon} from 'lucide-react';
import {formatGroupEventDateTime} from './dateFormat';
import s from './groups.module.css';

/** Shared event identity in Friends, conversations, collections and selectors. */
export function EventPreview({title,startTime,imageUrl,location,city,href,variant='compact',children,action}:{title:string;startTime:string;imageUrl?:string;location?:string;city?:string;href?:string;variant?:'compact'|'media';children?:ReactNode;action?:ReactNode}){
 const [failed,setFailed]=useState<string>(),place=[location,city&&city!==location?city:undefined].filter(Boolean).join(' · ');
 const content=<><span className={s.previewPhoto}>{imageUrl&&failed!==imageUrl?<img src={imageUrl} alt="" loading="lazy" onError={()=>setFailed(imageUrl)}/>:<ImageIcon size={24} aria-hidden/>}</span><span className={s.previewText}><strong>{title}</strong><span className={s.previewDate}>{formatGroupEventDateTime(startTime)}</span>{place&&<span className={s.previewLocation}>{place}</span>}{children}</span></>;
 return <div className={s.eventPreview} data-variant={variant}>{href?<Link className={s.previewMain} href={href}>{content}</Link>:<div className={s.previewMain}>{content}</div>}{action&&<div className={s.previewAction}>{action}</div>}</div>;
}
