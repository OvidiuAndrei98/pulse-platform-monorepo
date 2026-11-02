"use client";
export function PlanChoice({title,hint,checked,disabled,onChange}:{
  title:string;hint?:string;checked:boolean;disabled?:boolean;onChange:()=>void;
}) {
  return <label className={'flex min-h-14 items-center gap-3 rounded-2xl border p-4 '+(checked?'border-primary bg-primary/5':'border-white/10')+(disabled?' opacity-50':' cursor-pointer')}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-5 w-5 shrink-0 accent-primary"/>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>
      {hint&&<span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}</span>
  </label>;
}
