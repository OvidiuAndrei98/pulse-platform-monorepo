import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {defaultEventFilters} from '@packages/app-core/events/constants';
import {shiftCalendarDay} from '@packages/app-core/events/discoveryFilters';
import {planningToday} from '@packages/app-core/outings/model';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

// Exercise the real component's scroll/effect/controller callbacks. Native views,
// haptics and animation primitives are ports; this does not measure UIKit inertia.
function ribbon(group:boolean,reduced=false){
 const h=hooks(),scrolls:{offset:number;animated:boolean}[]=[],changes:string[]=[],previews:string[]=[];
 const today=planningToday(new Date('2026-11-15T18:00:00Z'));
 let filters={...defaultEventFilters,date:'Custom',dateFrom:today,dateTo:today},tree:any;
 const controller={current:null as null|{finish:()=>string}};
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const react={...h.react,memo:(component:any)=>component,useLayoutEffect:h.react.useEffect,
  useImperativeHandle:(ref:any,create:()=>unknown,deps:unknown[])=>h.react.useEffect(()=>{
   if(ref)ref.current=create();return()=>{if(ref)ref.current=null};
  },[ref,...deps]),
 };
 const animated={View:'AnimatedView',createAnimatedComponent:()=> 'AnimatedGlassSurface'};
 let timerId=0;const timers=new Map<number,()=>void>();
 const {DiscoveryDateRibbon}=modules({
  react:{...react,default:react},'react-native':{...symbols('View','Pressable','VirtualizedList'),Platform:{OS:'ios'},StyleSheet:{create:(value:any)=>value,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844})},
  'react-native-reanimated':{...animated,default:animated,ReduceMotion:{System:'system'},useReducedMotion:()=>reduced,
   useSharedValue:(value:any)=>h.react.useRef({value}).current,useDerivedValue:(derive:()=>unknown)=>({value:derive()}),useAnimatedStyle:(derive:()=>unknown)=>derive(),withSpring:(value:unknown)=>value},
  'lucide-react-native':symbols('CalendarDays','ChevronLeft','RotateCcw'),
  '../data/queries':{useHomeEvents:()=>({data:undefined,isError:false})},
  '../usePreferences':{usePreferences:()=>({copy:(key:string)=>key,language:'en'})},
  '../ui/GlassSurface':{GlassSurface:'GlassSurface',supportsLiquidGlass:false},'../ui/Text':symbols('Text'),'../ui/theme':{colors:{}},
  './DateRibbonMask':symbols('DateRibbonMask'),'./MorphVisibility':symbols('MorphVisibility'),
  './searchMorph':{iosSearchOpenSpring:{},iosSearchCloseSpring:{},smoothMorphPhase:()=>1,
   searchMorphGeometry:()=>({searchWidth:350,searchHeight:54,radius:27,searchX:0,searchY:0,sourceScale:1,fieldScaleY:1})},
  './useDateRibbonSound':{useDateRibbonSound:()=>()=>{}},'./useDateRibbonHaptics':{useDateRibbonHaptics:()=>()=>{}},
  './DateRibbonHaptics':{DateRibbonHaptics:'DateRibbonHaptics',hasNativeDateRibbonHaptics:false},
 },{setTimeout:(callback:()=>void)=>{timers.set(++timerId,callback);return timerId},clearTimeout:(id:number)=>timers.delete(id)})
  .load(path.resolve(__dirname,'../src/screens/DiscoveryDateRibbon.tsx'));
 const onChange=(next:typeof filters)=>{filters=next;changes.push(next.dateFrom)};
 const onPreviewDay=(day:string)=>{previews.push(day);filters={...filters,dateFrom:day,dateTo:day}};
 const progress={value:1},calendarMotion={value:{opacity:1,scale:1,x:0,y:0}},source={x:0,y:0},onOpenChange=()=>{};
 const node=(id:string)=>find(tree,(value:any)=>value.props?.testID===id);
 const list=()=>node('discovery-date-scroll');
 const draw=()=>{
  tree=h.render(()=>DiscoveryDateRibbon({filters,onChange,onOpenChange,progress,source,expanded:true,calendarMotion,
   minimumDay:today,maximumDay:group?shiftCalendarDay(today,365):undefined,
   ...(group?{selectionController:controller,onPreviewDay}:{}),
  }));
  list().props.ref.current={scrollToOffset:(value:{offset:number;animated:boolean})=>scrolls.push(value)};
  return tree;
 };
 const event=(index:number)=>({nativeEvent:{contentOffset:{x:index*44}}});
 const pick=(index:number)=>{
  const day=shiftCalendarDay(today,index),cell=list().props.renderItem({item:day,index});
  cell.props.onPick(day);
  return day;
 };
 draw();scrolls.length=0;
 return{draw,list,event,pick,controller,scrolls,changes,previews,today,
  selection:()=>filters.dateFrom,dispose:()=>h.unmount()};
}

test('a group date tap centers with the same native animation as Discover',()=>{
 for(const group of [false,true]){
  const f=ribbon(group);try{
   const chosen=f.pick(12);f.draw();
   assert.equal(f.selection(),chosen);
   assert.equal(f.scrolls.length,1);
   assert.equal(f.scrolls[0]!.offset,12*44);
   assert.equal(f.scrolls[0]!.animated,true,'A selection controller must not disable native centering');
   if(group){f.list().props.onScroll(f.event(4));f.draw();assert.equal(f.selection(),chosen,'An intermediate travel frame cannot replace the tapped day');assert.deepEqual(f.previews,[])}
  }finally{f.dispose()}
 }
});

test('group draft updates during drag and momentum never recenter the scrolling list',()=>{
 const f=ribbon(true);try{
  const calendar=f.list().props.data;
  f.list().props.onScrollBeginDrag();f.list().props.onScroll(f.event(1));f.draw();
  f.list().props.onScrollEndDrag(f.event(2));f.list().props.onMomentumScrollBegin();f.draw();
  for(const index of [8,30,31,45,90,150]){
   f.list().props.onScroll(f.event(index));f.draw();
   assert.equal(f.selection(),shiftCalendarDay(f.today,index));
   assert.equal(f.list().props.data,calendar,'Changing the visible draft keeps absolute calendar coordinates');
   assert.equal(f.scrolls.length,0,'A parent draft render must not cancel native momentum');
  }
  f.list().props.onMomentumScrollEnd(f.event(150));f.draw();
  assert.equal(f.scrolls.length,0);
  assert.equal(f.selection(),shiftCalendarDay(f.today,150));
 }finally{f.dispose()}
});

test('finishing an in-flight group gesture commits its latest visible day exactly once',()=>{
 const f=ribbon(true);try{
  f.list().props.onScrollBeginDrag();f.list().props.onScroll(f.event(20));f.draw();
  f.list().props.onScrollEndDrag(f.event(24));f.list().props.onMomentumScrollBegin();f.draw();
  f.list().props.onScroll(f.event(33));
  const chosen=shiftCalendarDay(f.today,33);
  assert.equal(f.controller.current!.finish(),chosen,'Save/picker navigation reads the live day before parent rerender');
  f.draw();assert.equal(f.selection(),chosen);
  assert.equal(f.scrolls.length,1);assert.equal(f.scrolls[0]!.offset,33*44);assert.equal(f.scrolls[0]!.animated,false,'Only an explicit finish freezes the gesture');
  f.list().props.onScroll(f.event(34));f.list().props.onMomentumScrollEnd(f.event(34));f.draw();
  assert.equal(f.selection(),chosen,'A late momentum callback cannot overwrite an explicitly committed context');
  assert.equal(f.scrolls.length,1);
 }finally{f.dispose()}
});

test('immediate finish after a tapped day preserves the intended destination and reduced motion',()=>{
 for(const reduced of [false,true]){
  const f=ribbon(true,reduced);try{
   const chosen=f.pick(40);f.list().props.onScroll(f.event(3));
   assert.equal(f.controller.current!.finish(),chosen);
   assert.equal(f.selection(),chosen);
   assert.equal(f.scrolls[0]!.animated,!reduced);
   assert.equal(f.scrolls.at(-1)!.offset,40*44);
  }finally{f.dispose()}
 }
});
