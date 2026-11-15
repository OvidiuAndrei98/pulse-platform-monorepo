import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import React from 'react';
import {initialSearchBounds,nativeSearchInputCompensation,searchMorphGeometry} from '../src/screens/searchMorph';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

const file=(name:string)=>path.resolve(__dirname,'../src/'+name);
const flatten=(value:any):any=>Array.isArray(value)?Object.assign({},...value.filter(Boolean).map(flatten)):value;
const render=(component:any,props:any,ref:any=null)=>component.render(props,ref);

function inputFixture({present=true,compiled=true,runtime=true,platform='ios'}={}){
 const h=hooks(),react={...h.react,forwardRef:React.forwardRef};
 let notify!:(enabled:boolean)=>void,resolve!:(enabled:boolean)=>void,reject!:(error:Error)=>void,removed=0,nativeImports=0;
 const snapshot=new Promise<boolean>((yes,no)=>{resolve=yes;reject=no});
 const native={View:'MatteView',Platform:{OS:platform},StyleSheet:{create:(v:any)=>v,flatten},AccessibilityInfo:{isReduceTransparencyEnabled:()=>snapshot,addEventListener:(_:string,listener:typeof notify)=>{notify=listener;return{remove:()=>removed++}}}};
 const material=modules({react,'react-native':native,expo:{requireOptionalNativeModule:()=>present?{}:null},'expo-glass-effect':{get GlassView(){nativeImports++;return'NativeGlass'},isLiquidGlassAvailable:()=>compiled,isGlassEffectAPIAvailable:()=>runtime}}).load(file('ui/GlassSurface.ios.tsx'));
 const preference=modules({react,'react-native':native}).load(file('ui/useReducedTransparencyPreference.ts'));
 const shared=modules({react,'react-native':native,'react-native-reanimated':{default:{View:'AnimatedMatteMaterial'}},'./GlassSurface':material,'./useReducedTransparencyPreference':preference}).load(file('ui/GlassInputSurface.tsx'));
 const ref=React.createRef(),change=()=>{},input=React.createElement('ActualInput',{value:'chosen night',onChangeText:change}),style={height:44,minWidth:0,width:'100%',borderRadius:22};
 const draw=(props:any={})=>h.render(()=>render(shared.GlassInputSurface,{testID:'field-material',style,children:input,...props},ref));
 return{draw,material,ref,input,style,resolve,reject,change:(value:boolean)=>notify(value),dispose:()=>h.unmount(),removed:()=>removed,imports:()=>nativeImports};
}

test('shared input stays matte until accessibility resolves, then nests the actual input in one interactive native material',async()=>{
 const f=inputFixture();const initial=f.draw({tintColor:'#ffffff12'});
 assert.equal(initial.type,'MatteView');assert.equal(initial.props.children,f.input);assert.equal(initial.props.ref,f.ref);assert.equal(initial.props.interactive,undefined);assert.equal(initial.props.tintColor,undefined);
 f.resolve(false);await Promise.resolve();const surface=f.draw({tintColor:'#ffffff12'});
 assert.equal(surface.type,f.material.GlassSurface);assert.equal(surface.props.interactive,true);assert.equal(surface.props.ref,f.ref);assert.equal(surface.props.style,f.style);assert.equal(surface.props.children,f.input);
 const native=render(surface.type,surface.props,surface.props.ref);
 assert.equal(native.type,'NativeGlass');assert.equal(native.props.isInteractive,true);assert.equal(native.props.tintColor,'#ffffff12');assert.equal(native.props.children,f.input);assert.equal(native.props.ref,f.ref);assert.equal(native.props.style[0],f.style);
 const disabledOptics=f.draw({interactive:false});assert.equal(disabledOptics.props.interactive,false);
 f.change(true);assert.equal(f.draw().type,'MatteView');f.change(false);assert.equal(f.draw().type,f.material.GlassSurface);f.dispose();assert.equal(f.removed(),1);
});

test('live Reduce Transparency wins over a late initial snapshot and cleanup excludes late native results',async()=>{
 const f=inputFixture();f.draw();f.change(true);f.resolve(false);await Promise.resolve();assert.equal(f.draw().type,'MatteView');f.dispose();assert.equal(f.removed(),1);
 const inverse=inputFixture();inverse.draw();inverse.change(false);inverse.resolve(true);await Promise.resolve();assert.equal(inverse.draw().type,inverse.material.GlassSurface);inverse.dispose();
 const late=inputFixture();late.draw();late.dispose();late.resolve(false);await Promise.resolve();assert.equal(late.draw().type,'MatteView');assert.equal(late.removed(),1);
 const failed=inputFixture();failed.draw();failed.reject(Error('Unavailable'));await Promise.resolve();await Promise.resolve();assert.equal(failed.draw().type,'MatteView');failed.dispose();
});

test('missing/older glass APIs and non-iOS keep input handlers, geometry and refs in the original matte host',async()=>{
 for(const options of [{present:false},{compiled:false},{runtime:false},{platform:'android'},{platform:'web'}]){
  const f=inputFixture(options);const first=f.draw({tintColor:'#ff0044',interactive:true,accessibilityLabel:'Find events'});f.resolve(false);await Promise.resolve();const next=f.draw({tintColor:'#ff0044',interactive:true,accessibilityLabel:'Find events'});
  assert.equal(first.type,'MatteView');assert.equal(next.type,'MatteView');assert.equal(next.props.style,f.style);assert.equal(next.props.children,f.input);assert.equal(next.props.ref,f.ref);assert.equal(next.props.accessibilityLabel,'Find events');assert.equal(next.props.tintColor,undefined);assert.equal(next.props.interactive,undefined);f.dispose();
 }
});

test('a fallback material handoff affects only the background layer, never the real input or native host geometry',async()=>{
 const f=inputFixture({present:false}),opacity={opacity:.4},tree=f.draw({fallbackMaterialStyle:opacity,glassEffectStyle:'none'});
 assert.equal(tree.type,'MatteView');assert.equal(tree.props.style[0],f.style);assert.equal(tree.props.style[1].backgroundColor,'transparent');assert.equal(tree.props.glassEffectStyle,undefined);assert.equal(tree.props.fallbackMaterialStyle,undefined);
 const [background,input]=tree.props.children;assert.equal(background.type,'AnimatedMatteMaterial');assert.equal(background.props.pointerEvents,'none');assert.equal(background.props.style[2],opacity);assert.equal(input,f.input);assert.equal(tree.props.ref,f.ref);f.dispose();
 const native=inputFixture();native.draw();native.resolve(false);await Promise.resolve();const material=native.draw({fallbackMaterialStyle:opacity,glassEffectStyle:'none'});assert.equal(material.type,native.material.GlassSurface);assert.equal(material.props.children,native.input);assert.equal(material.props.fallbackMaterialStyle,undefined);assert.equal(render(material.type,material.props,material.props.ref).props.glassEffectStyle,'none');native.dispose();
});

test('group search keeps its real input inside the shared material and its 44px icon focuses the same stable ref',()=>{
 const h=hooks(),changed=()=>{},react={...h.react,forwardRef:React.forwardRef},platform={OS:'ios'};
 const {GroupSearchField}=modules({react,'react-native':{Platform:platform,Pressable:'FocusIcon',StyleSheet:{create:(value:any)=>value}},'lucide-react-native':{Search:'SearchIcon'},'../ui/GlassInputSurface':{GlassInputSurface:'SharedInputMaterial'},'../ui/GlassSurface':{GlassSurface:'Surface',supportsLiquidGlass:true},'../ui/GlassPressable':{GlassPressable:'GlassButton'},'../ui/MotionPressable':{MotionPressable:'MotionButton'},'../ui/useReducedTransparencyPreference':{useReducedTransparencyPreference:()=>false},'../ui/FormInput':{FormInput:'RealInput',formStyles:{event:{borderRadius:16}}},'../ui/theme':{colors:{muted:'#888',surface:'#111',inputBorder:'#333',focus:'#ff0044'}}}).load(file('groups/GroupGlassControls.tsx'));
 const draw=()=>h.render(()=>GroupSearchField({value:'roof',onChangeText:changed,label:'Find events',inSheet:true}));
 const tree=draw();assert.equal(tree.type,'SharedInputMaterial');const input=find(tree,(n:any)=>n.type==='RealInput'),icon=find(tree,(n:any)=>n.type==='FocusIcon');
 assert.equal(input.props.value,'roof');assert.equal(input.props.onChangeText,changed);assert.equal(input.props.variant,'bare');assert.equal(input.props.focusOwner,'container');assert.equal(input.props.inSheet,true);assert.equal(input.props.onFocus,undefined);assert.equal(input.props.onBlur,undefined);assert.equal(icon.props.style.width,44);assert.equal(icon.props.style.height,44);
 let focused=0;input.props.ref.current={focus:()=>focused++};icon.props.onPress();assert.equal(focused,1);assert.equal(find(draw(),(n:any)=>n.type==='RealInput').props.ref,input.props.ref);
 platform.OS='web';const web=draw(),webInput=find(web,(n:any)=>n.type==='RealInput');webInput.props.onFocus();assert.equal(flatten(draw().props.style).borderColor,'#ff0044','Web keeps its visible container focus border');webInput.props.onBlur();assert.equal(flatten(draw().props.style).borderColor,'#333');h.unmount();
});

function accentFixture(present=true){
 const react={forwardRef:React.forwardRef},m=modules({react,'react-native':{StyleSheet:{flatten}},expo:{requireOptionalNativeModule:()=>present?{}:null},'expo-glass-effect':{GlassView:'NativeGlass',isLiquidGlassAvailable:()=>true,isGlassEffectAPIAvailable:()=>true},'./AccentPressableFallback':{AccentPressableFallback:'LegacyControl'},'./MotionPressable':{MotionPressable:'MotionControl'}});
 return m.load(file('ui/AccentPressable.ios.tsx')).AccentPressable;
}

test('the actual native accent accessory can suppress its press halo without changing tint, pointer input, ref or pressed opacity',()=>{
 const accessory=accentFixture(),ref=React.createRef(),press=()=>{},icon=React.createElement('Arrow'),style=({pressed}:{pressed:boolean})=>({width:32,height:32,borderRadius:16,backgroundColor:'#ff0044',opacity:pressed?.7:1});
 const tree=render(accessory,{nativePressEffect:false,fallback:'StaticPressable',style,onPress:press,children:icon,testID:'send'},ref);
 assert.equal(tree.type,'NativeGlass');assert.equal(tree.props.isInteractive,false);assert.equal(tree.props.tintColor,'#ff0044');assert.equal(tree.props.style.opacity,1);assert.equal(tree.props.pointerEvents,'auto');const control=tree.props.children;
 assert.equal(control.type,'StaticPressable');assert.equal(control.props.ref,ref);assert.equal(control.props.onPress,press);assert.equal(control.props.children,icon);assert.equal(control.props.testID,'send');assert.equal(control.props.nativePressEffect,undefined);assert.equal(control.props.style({pressed:true}).opacity,.7);
 const ordinary=render(accessory,{style:style({pressed:false})});assert.equal(ordinary.props.isInteractive,true,'Other accent buttons keep their native behavior');assert.equal(ordinary.props.children.type,'MotionControl');assert.equal(ordinary.props.children.props.static,true);
 const unavailable=render(accentFixture(false),{nativePressEffect:false,fallback:'StaticPressable',style,onPress:press},ref);assert.equal(unavailable.type,'LegacyControl');assert.equal(unavailable.props.fallback,'StaticPressable');assert.equal(unavailable.props.nativePressEffect,undefined);assert.equal(unavailable.props.onPress,press);
});

test('the actual fallback strips optical-only configuration before reaching Pressable',()=>{
 const {AccentPressableFallback}=modules({react:{forwardRef:React.forwardRef},'./MotionPressable':{MotionPressable:'MotionControl'}}).load(file('ui/AccentPressableFallback.tsx'));
 const ref=React.createRef(),press=()=>{},style={width:32,height:32},tree=render(AccentPressableFallback,{fallback:'StaticPressable',nativePressEffect:false,glassColor:'#ff0044',onPress:press,style,children:'icon'},ref);
 assert.equal(tree.type,'StaticPressable');assert.equal(tree.props.nativePressEffect,undefined);assert.equal(tree.props.glassColor,undefined);assert.equal(tree.props.style,style);assert.equal(tree.props.onPress,press);assert.equal(tree.props.ref,ref);
});

test('Discover keeps one real input inside its native material throughout the morph and varies only the material handoff',()=>{
 const pose={opacity:1,scale:1,x:0,y:0},animated={View:'AnimatedView',createAnimatedComponent:(type:any)=>'Animated'+type};
 const {DiscoveryNativeGlassGroups}=modules({react:React,'react-native':{Pressable:'Pressable',View:'View',StyleSheet:{create:(v:any)=>v,absoluteFill:{position:'absolute'}}},'@react-native-masked-view/masked-view':{default:'MaskedView'},'react-native-svg':{default:'Svg',Defs:'Defs',Mask:'Mask',Rect:'Rect'},'react-native-reanimated':{default:animated,useSharedValue:(value:any)=>({value}),useDerivedValue:(fn:()=>any)=>({value:fn()}),useAnimatedStyle:(fn:()=>any)=>fn(),useAnimatedProps:(fn:()=>any)=>fn(),useAnimatedReaction:()=>{}},'lucide-react-native':{ChevronLeft:'ChevronLeft',Search:'Search'},'../ui/GlassButtonGroup':{GlassButtonGroup:'GlassGroup'},'../ui/GlassPressable':{GlassPressable:'GlassPressable'},'../ui/GlassSurface':{supportsLiquidGlass:true},'../ui/GlassInputSurface':{GlassInputSurface:'SharedInputMaterial'},'../ui/useReducedTransparencyPreference':{useReducedTransparencyPreference:()=>false},'./searchMorph':{nativeSearchInputCompensation:()=>({left:0,top:0,width:280,scaleX:1,scaleY:1}),smoothMorphPhase:(value:number)=>value,iosSearchSourceHandoff:.08},'./discoveryControlsMotion':{initialDiscoveryControlsState:()=>({switch:pose,filter:pose}),advanceDiscoveryControls:(_:any)=>({switch:pose,filter:pose})}}).load(file('screens/DiscoveryNativeGlassGroups.ios.tsx'));
 const input=React.createElement('ActualNativeInput',{testID:'discovery-search'}),ref=React.createRef();let opened=0;
 for(const phase of [0,.5,1]){
  const tree=DiscoveryNativeGlassGroups({bounds:{value:{source:{x:244},destination:{x:52,width:280}}},progress:{value:phase},geometry:{value:{controls:1,controlsScale:1,controlsTranslateY:0,controlsCutout:{},back:phase,sourceScale:1,sourcePressScale:1,destinationOffsetX:0,destinationScaleX:1,fieldScaleY:1,searchX:52,iconX:0}},backScale:{value:1},intent:{value:{open:phase>0,interactive:false}},reduceMotion:{value:false},sourceSwitch:'switch',filter:'filter',field:input,compact:phase>0,active:phase>0,focused:{value:false},searchLabel:'Search',backLabel:'Back',triggerRef:ref,onOpen:()=>opened++,onClose:()=>{},onSearchPressIn:()=>{},onSearchPressOut:()=>{}});
  const surface=find(tree,(n:any)=>n.type==='AnimatedSharedInputMaterial'),content=find(surface,(n:any)=>n.props?.testID==='discovery-search-content');assert.ok(surface);assert.equal(content.props.children,input);assert.equal(surface.props.animatedProps.glassEffectStyle.style,phase>=.88?'regular':'none');assert.equal(surface.props.glassEffectStyle,'none');assert.equal(surface.props.animatedProps.glassEffectStyle.animate,true);assert.equal(surface.props.style.some((s:any)=>s?.opacity!==undefined),false,'No ancestor opacity fade around the responder');surface.props.onTouchEnd();
 }
 assert.equal(opened,2,'Closed material cannot open or focus itself');
});

test('native input compensation preserves the former screen-space text viewport during every morph and spring lobe',()=>{
 const near=(a:number,b:number,label:string)=>assert.ok(Math.abs(a-b)<1e-8,label+': '+a+' vs '+b);
 const measured=[... [240,320,350,390,728].map(initialSearchBounds),{source:{x:201.5,y:1.25,width:44,height:44},destination:{x:54.5,y:2.5,width:301.25,height:44}}];
 for(const bounds of measured)for(const opening of [false,true])for(const interactive of [false,true])for(const reduced of [false,true])for(const pressExpansion of [0,3])for(let step=-5;step<=105;step++){
  const g=searchMorphGeometry(bounds,step/100,144,{ios:true,opening,interactive,reduced,pressExpansion}),pose=nativeSearchInputCompensation(bounds,g),sx=g.destinationScaleX,sy=g.fieldScaleY,w=bounds.destination.width,h=bounds.destination.height;
  // Parent translation compensates its centered scaling. Child uses top-left
  // inverse scaling; recomposition must recover the previous global overlay.
  const parentLeft=bounds.destination.x+g.destinationOffsetX+w*(sx-1)/2+w*(1-sx)/2,parentTop=bounds.destination.y+h*(1-sy)/2;
  near(parentLeft+sx*pose.left,g.searchX,'Text left follows the existing morph');near(parentTop+sy*pose.top,bounds.destination.y,'Text baseline stays at its prior global origin');near(sx*pose.scaleX,1,'No new horizontal text scaling');near(sy*pose.scaleY,1,'No new vertical text scaling');near(pose.width*sx*pose.scaleX,g.searchWidth,'Clipping viewport keeps its existing width');
 }
});
