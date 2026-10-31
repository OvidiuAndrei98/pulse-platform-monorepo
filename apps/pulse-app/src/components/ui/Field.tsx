"use client";
import { Children, cloneElement, createContext, forwardRef, isValidElement, useContext, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';

type FieldState={id:string;labelId:string;errorId?:string;label:string;invalid:boolean};
const FieldContext=createContext<FieldState|null>(null);
export function useFieldState(){return useContext(FieldContext);}
export const fieldClass='ui-input';
export function Field({label,error,hint,children,id:providedId,className=''}:{label:string;error?:string;hint?:string;children:ReactNode;id?:string;className?:string}){
  const explicit=(nodes:ReactNode):string|undefined=>{for(const child of Children.toArray(nodes)){if(!isValidElement(child))continue;const props=child.props as Record<string,unknown>;if(typeof props.id==='string'&&(typeof child.type!=='string'||['input','textarea','select','button'].includes(child.type)))return props.id;const nested=props.children?explicit(props.children as ReactNode):undefined;if(nested)return nested;}};
  const unique=useId(),id=providedId??explicit(children)??'field-'+unique,labelId=id+'-label',errorId=error?id+'-error':hint?id+'-hint':undefined;
  const field={id,labelId,errorId,label,invalid:!!error};
  // Legacy intrinsic fields are wired while migrating; shared/custom controls
  // consume context directly, independent of function names or minification.
  let intrinsic=0;
  const wire=(nodes:ReactNode):ReactNode=>Children.map(nodes,child=>{
    if(!isValidElement(child)||typeof child.type!=='string')return child;
    const current=child.props as Record<string,unknown>;
    if(['input','textarea','select'].includes(child.type)&&!['hidden','file','checkbox','radio'].includes(String(current.type))){
      const controlId=intrinsic++===0?id:id+'-'+intrinsic;
      return cloneElement(child as ReactElement<Record<string,unknown>>,{id:current.id??controlId,'aria-labelledby':current['aria-label']?current['aria-labelledby']:current['aria-labelledby']??labelId,'aria-invalid':current['aria-invalid']??(!!error||undefined),'aria-describedby':current['aria-describedby']??errorId});
    }
    return current.children?cloneElement(child as ReactElement<Record<string,unknown>>,{},wire(current.children as ReactNode)):child;
  });
  const controls=wire(children);
  return <FieldContext.Provider value={field}><div className={`ui-field ${className}`} role="group" aria-labelledby={labelId}>
    <label id={labelId} htmlFor={id} className="ui-field-label">{label}</label>
    {controls}
    {error?<p id={errorId} role="alert" className="ui-field-error">{error}</p>:hint?<p id={errorId} className="ui-field-hint">{hint}</p>:null}
  </div></FieldContext.Provider>;
}
export const Input=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>&{bare?:boolean}>(function Input({className='',bare=false,id,'aria-labelledby':labelledBy,'aria-describedby':describedBy,'aria-invalid':invalid,...props},ref){
  const field=useFieldState(),own=useId(),fieldId=props['aria-label']&&props['aria-label']!==field?.label?undefined:field?.id;
  return <input {...props} ref={ref} id={id??fieldId??own} aria-labelledby={labelledBy??(props['aria-label']?undefined:field?.labelId)} aria-describedby={describedBy??field?.errorId} aria-invalid={invalid??(field?.invalid||undefined)} className={`${bare?'ui-input-bare':fieldClass} ${className}`}/>;
});
export const TextArea=forwardRef<HTMLTextAreaElement,TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({className='',id,'aria-labelledby':labelledBy,'aria-describedby':describedBy,'aria-invalid':invalid,...props},ref){
  const field=useFieldState();
  return <textarea {...props} ref={ref} id={id??field?.id} aria-labelledby={labelledBy??(props['aria-label']?undefined:field?.labelId)} aria-describedby={describedBy??field?.errorId} aria-invalid={invalid??(field?.invalid||undefined)} className={`ui-input ui-textarea ${className}`}/>;
});
