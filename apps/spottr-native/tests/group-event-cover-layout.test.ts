import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {loadYoga} from 'yoga-layout/load';
import {tokens,colors} from '../src/ui/theme';
import {accentGlassButtonStyles} from '../src/ui/accentGlassButtonStyles';
const {hooks,modules}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const flatten=(style:any):any=>Array.isArray(style)?Object.assign({},...style.filter(Boolean).map(flatten)):style??{};
const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));

// Run the actual cover composition through Yoga, including the iOS material's
// extra layout host. This checks native layout constraints, not UIKit drawing.
function fixture(){
 const h=hooks(),decision={current:'unanswered',canVote:true},react={...h.react,useState:(initial:any)=>[initial,()=>{}]};
 const native={...symbols('View','ActivityIndicator'),Platform:{OS:'ios'},StyleSheet:{create:(value:any)=>value,flatten,absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0}}};
 const common:any={react:h.react,'react-native':native,'lucide-react-native':symbols('ChevronRight','Check','Plus','RotateCcw'),'expo-linear-gradient':symbols('LinearGradient'),'../usePreferences':{usePreferences:()=>({language:'en',copy:(key:string)=>({'groups.comingYes':"I'm coming",'groups.comingNo':'Not coming','groups.responseRetry':'Try again'}[key]??key)})},'../auth/AuthProvider':{useAuth:()=>({})},'../ui/theme':{tokens,colors},'../ui/Text':symbols('Text'),'../ui/common':symbols('EventImage'),'../outings/OutingPrimitives':symbols('OutingPressable','MemberAvatar'),'./groupStyles':{groupStyles:{}},'@packages/app-core/social/groupPresentation':{groupEventDate:()=> '20 Nov · 20:00',decisionState:()=>decision}};
 const content=modules(common).load(path.resolve(__dirname,'../src/groups/GroupContent.tsx'));
 const attendance=modules({...common,'./GroupContent':content,'./GroupActionSheet':symbols('GroupActionSheet'),'../ui/ActionButton':symbols('ActionButton')}).load(path.resolve(__dirname,'../src/groups/GroupOutingCard.tsx'));
 const action=modules({...common,react,'./AccentPressable':symbols('AccentPressable'),'./MotionPressable':symbols('MotionPressable'),'./Text':symbols('Text'),'./ActionTextContext':{ActionTextContext:{Provider:'Provider'}}}).load(path.resolve(__dirname,'../src/ui/ActionButton.tsx'));
 const button=(props:any)=>action.ActionButton(props);
 const invitation=(selected=false)=>{decision.current=selected?'yes':'unanswered';const answers=h.render(()=>attendance.AttendanceResponse({plan:{members:[]},onRespond:async()=>true,compact:true}));return content.EventPreview({title:'AFTER DARK',startTime:'2026-11-20T20:00:00Z',location:'Piața Unirii',city:'București',variant:'media',onPress:()=>{},children:answers})};
 const shared=(imageUrl?:string)=>content.EventPreview({title:'AFTER DARK',startTime:'2026-11-20T20:00:00Z',location:'Piața Unirii',city:'București',variant:'media',imageUrl,onPress:()=>{},children:{type:'OutingPressable',props:{style:{alignSelf:'flex-start',minHeight:44,paddingHorizontal:8,paddingVertical:10,justifyContent:'center'},onPress:()=>{},children:{type:'Text',props:{style:{fontSize:14,lineHeight:20,fontWeight:'600'},children:'Open outing'}}}}});
 return {button,shared,invitation};
}

async function layout(tree:any,width:number,glass:boolean,components:ReturnType<typeof fixture>){
 const y=await loadYoga(),covers:any[]=[],textNodes:any[]=[];
 const build=(element:any,inherited:any={}):any=>{
  if(element==null||element===false)return null;
  if(element.type==='Provider')return build(element.props.children,inherited);
  if(element.type==='ActionButton')return build(components.button(element.props),inherited);
  const props=element.props??{},style={...inherited,...flatten(typeof props.style==='function'?props.style({pressed:false}):props.style)};
  if(element.type==='AccentPressable'&&glass){const split=accentGlassButtonStyles(style,false,style.backgroundColor===colors.action);return build({type:'View',props:{style:split.surface,children:{type:'View',props:{style:split.control,children:props.children}}}})}
  const node=y.Node.create();
  for(const [key,method]of [['width','setWidth'],['height','setHeight'],['minWidth','setMinWidth'],['minHeight','setMinHeight'],['maxWidth','setMaxWidth'],['maxHeight','setMaxHeight']] as const)if(style[key]!==undefined)node[method](style[key]);
  node.setFlexDirection(style.flexDirection==='row'?y.FLEX_DIRECTION_ROW:y.FLEX_DIRECTION_COLUMN);
  if(style.flex!==undefined){node.setFlexGrow(style.flex);node.setFlexBasis(0)}
  if(style.flexGrow!==undefined)node.setFlexGrow(style.flexGrow);
  if(style.flexShrink!==undefined)node.setFlexShrink(style.flexShrink);
  if(style.aspectRatio!==undefined)node.setAspectRatio(style.aspectRatio);
  const align=(value:string)=>({center:y.ALIGN_CENTER,stretch:y.ALIGN_STRETCH,'flex-start':y.ALIGN_FLEX_START,'flex-end':y.ALIGN_FLEX_END}[value]??y.ALIGN_AUTO);
  if(style.alignItems)node.setAlignItems(align(style.alignItems));
  if(style.alignSelf)node.setAlignSelf(align(style.alignSelf));
  if(style.justifyContent==='center')node.setJustifyContent(y.JUSTIFY_CENTER);
  if(style.justifyContent==='flex-end')node.setJustifyContent(y.JUSTIFY_FLEX_END);
  if(style.gap!==undefined)node.setGap(y.GUTTER_ALL,style.gap);
  if(style.borderWidth!==undefined)node.setBorder(y.EDGE_ALL,style.borderWidth);
  for(const [key,edge]of [['padding',y.EDGE_ALL],['paddingHorizontal',y.EDGE_HORIZONTAL],['paddingVertical',y.EDGE_VERTICAL],['paddingTop',y.EDGE_TOP],['paddingBottom',y.EDGE_BOTTOM],['paddingLeft',y.EDGE_LEFT],['paddingRight',y.EDGE_RIGHT]] as const)if(style[key]!==undefined)node.setPadding(edge,style[key]);
  if(style.position==='absolute'){node.setPositionType(y.POSITION_TYPE_ABSOLUTE);for(const [key,edge]of [['top',y.EDGE_TOP],['bottom',y.EDGE_BOTTOM],['left',y.EDGE_LEFT],['right',y.EDGE_RIGHT]] as const)if(style[key]!==undefined)node.setPosition(edge,style[key])}
  if(props.testID?.endsWith('-cover'))covers.push(node);
  if(element.type==='Text'){
   const text=String(props.children??''),font=style.fontSize??14,line=style.lineHeight??20;
   node.setMeasureFunc((available:number)=>{const natural=text.length*font*.53,lines=Number.isFinite(available)&&available>0?Math.max(1,Math.ceil(natural/available)):1;return{width:Math.min(natural,available>0?available:natural),height:Math.min(props.numberOfLines??Infinity,lines)*line}});textNodes.push(node);
  }else if(element.type==='EventImage'){
   // Delayed or very tall source dimensions must not contribute to the card.
   node.setMeasureFunc(()=>({width:3000,height:12000}));
  }else if(['Check','RotateCcw','Plus','ActivityIndicator'].includes(element.type)){node.setWidth(props.size==='small'?20:props.size??16);node.setHeight(props.size==='small'?20:props.size??16)}
  else for(const child of [props.children].flat(Infinity)){if(child&&typeof child==='object'){const next=build(child);if(next)node.insertChild(next,node.getChildCount())}}
  return node;
 };
 const root=y.Node.create();root.setWidth(width);const card=build(tree);root.insertChild(card,0);
 const samples=[];for(let cycle=0;cycle<12;cycle++){textNodes.forEach((node:any)=>node.markDirty());root.calculateLayout(undefined,undefined,y.DIRECTION_LTR);samples.push({height:card.getComputedHeight(),width:card.getComputedWidth(),covers:covers.map(n=>({height:n.getComputedHeight(),width:n.getComputedWidth()}))})}
 root.freeRecursive();return samples;
}

test('sent event cover has bounded native geometry before and after repeated image/layout measurements',async()=>{
 for(const width of [280,320,332])for(const glass of [false,true]){
  const f=fixture(),missing=await layout(f.shared(),width,glass,f),withImage=await layout(f.shared('https://example.invalid/tall-poster.jpg'),width,glass,f);
  assert.deepEqual(withImage,missing,'An image source cannot change card geometry');
  for(const sample of withImage){assert.equal(sample.width,width);assert.ok(sample.height<300,'One shared event never fills an unbounded conversation');assert.ok(sample.covers[0]!.height>=150&&sample.covers[0]!.height<=160,'Ordinary card text fits the reserved compact photograph, independent of the image intrinsic size');assert.deepEqual(sample,withImage[0],'Repeated native relayout cannot grow the message')}
 }
});

test('compact invitation selection preserves its intrinsic height on narrow iOS glass and fallback layouts',async()=>{
 for(const width of [280,320,332])for(const glass of [false,true]){
  const f=fixture(),before=await layout(f.invitation(),width,glass,f),selected=await layout(f.invitation(true),width,glass,f);
  assert.equal(selected[0]!.height,before[0]!.height,'Adding a selected check does not insert another text line');
  assert.ok(selected[0]!.height<300,'The invitation stays content-sized rather than taking the list viewport');
 }
});
