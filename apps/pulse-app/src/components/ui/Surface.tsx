import type { HTMLAttributes, ReactNode } from 'react';
export function Surface({className='',raised=false,...props}:HTMLAttributes<HTMLElement>&{raised?:boolean}){
  return <div {...props} className={`ui-surface ${raised?'ui-surface--raised':''} ${className}`}/>;
}
export function PageTitle({className='',...props}:HTMLAttributes<HTMLHeadingElement>){return <h1 {...props} className={`ui-page-title ${className}`}/>;}
export function PageHeader({title,description,leading,actions}:{title:ReactNode;description?:ReactNode;leading?:ReactNode;actions?:ReactNode}){
  return <header className="ui-page-header">{leading}<div className="ui-page-heading"><PageTitle>{title}</PageTitle>{description&&<p className="ui-page-description">{description}</p>}</div>{actions&&<div className="ui-page-actions">{actions}</div>}</header>;
}
export function Badge({tone='neutral',className='',...props}:HTMLAttributes<HTMLSpanElement>&{tone?:'neutral'|'success'|'warning'|'danger'}){
  return <span {...props} className={`ui-badge ui-badge--${tone} ${className}`}/>;
}
