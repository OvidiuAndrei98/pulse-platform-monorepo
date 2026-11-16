"use client";
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Image as ImageIcon} from 'lucide-react';
import {formatGroupEventDateTime} from './dateFormat';
import s from './groups.module.css';

/** Shared event identity in Friends, conversations, collections and selectors. */
export function EventPreview({title,startTime,imageUrl,location,city,href,variant='compact',children,action}:{title:string;startTime:string;imageUrl?:string;location?:string;city?:string;href?:string;variant?:'compact'|'media'|'cover'|'chat';children?:ReactNode;action?:ReactNode}){
 const [failed,setFailed]=useState<string>(),place=[location,city&&city!==location?city:undefined].filter(Boolean).join(' · '),wide=variant!=='compact',dateLabel=formatGroupEventDateTime(startTime);
 const picture=imageUrl&&failed!==imageUrl?<img src={imageUrl} alt="" loading="lazy" onError={()=>setFailed(imageUrl)}/>:<ImageIcon size={24} aria-hidden/>;
 const content=variant==='chat'?<span className={s.chatPhoto} data-image={!!imageUrl&&failed!==imageUrl}>{picture}<span className={s.chatPhotoCopy}><span className={s.chatPhotoDate}>{dateLabel}</span><strong>{title}</strong>{place&&<span className={s.chatPhotoPlace}>{place}</span>}{children}</span></span>:<><span className={s.previewPhoto} data-image={!!imageUrl&&failed!==imageUrl}>{picture}{wide&&<span className={s.photoDate}>{dateLabel}</span>}</span><span className={s.previewText}><strong>{title}</strong>{!wide&&<span className={s.previewDate}>{dateLabel}</span>}{place&&<span className={s.previewLocation} title={place}>{place}</span>}{children}</span></>;
 return <div className={s.eventPreview} data-variant={variant}>{href?<Link className={s.previewMain} href={href}>{content}</Link>:<div className={s.previewMain}>{content}</div>}{action&&<div className={s.previewAction}>{action}</div>}</div>;
}
