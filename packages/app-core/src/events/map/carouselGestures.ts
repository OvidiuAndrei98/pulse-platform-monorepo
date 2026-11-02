export function verticalCarouselDrag(dx:number,dy:number) {
  return dy>12&&dy>Math.abs(dx)*1.5;
}
export function dismissCarouselDrag(dx:number,dy:number) {
  return dy>=48&&verticalCarouselDrag(dx,dy);
}
export function carouselCardAction(id:string,activeId:string|null|undefined) {
  return id===activeId?'open':'select';
}
