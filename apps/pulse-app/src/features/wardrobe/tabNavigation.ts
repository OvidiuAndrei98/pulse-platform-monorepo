// Manual activation: arrow keys move focus; Enter/Space change the workspace.
export function tabFocusIndex(key:string,current:number,disabled:readonly boolean[],rtl=false):number {
  const available=disabled.flatMap((value,index)=>value?[]:[index]);
  if(!available.length)return -1;
  if(key==='Home')return available[0]!;
  if(key==='End')return available[available.length-1]!;
  if(key!=='ArrowLeft'&&key!=='ArrowRight')return -1;
  const direction=(key==='ArrowRight'?1:-1)*(rtl?-1:1);
  const position=available.indexOf(current);
  if(position<0)return direction>0?available[0]!:available[available.length-1]!;
  return available[(position+direction+available.length)%available.length]!;
}
export type WardrobeTabOption<T extends string>={value:T;label:string};
