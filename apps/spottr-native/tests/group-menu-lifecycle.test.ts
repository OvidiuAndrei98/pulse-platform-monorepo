import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function menu(platform:string,count=2){
 const h=hooks(),actions:string[]=[],keys=new Map(),viewport={width:320,height:844};let disabled=false;
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const {FallbackGroupMenu}=modules({react:h.react,'@react-navigation/native':{useIsFocused:()=>true},'react-native':{...symbols('Modal','Pressable','ScrollView','View'),Platform:{OS:platform},StyleSheet:{create:(v:any)=>v,absoluteFill:{}},useWindowDimensions:()=>viewport},'lucide-react-native':symbols('MoreHorizontal'),'./GroupGlassControls':symbols('GroupControlSurface','GroupGlassButton'),'../ui/Text':symbols('Text'),'../ui/theme':{colors:{}},'../ui/useReducedMotionPreference':{useReducedMotionPreference:()=>false}},{document:{addEventListener:(key:string,fn:any)=>keys.set(key,fn),removeEventListener:(key:string)=>keys.delete(key)}}).load(path.resolve(__dirname,'../src/groups/GroupMenuFallback.tsx'));
 const draw=()=>h.render(()=>FallbackGroupMenu({label:'Menu',testID:'menu-trigger',disabled,items:[{id:'info',label:count===1?'Cancel invitation':'Info',testID:'menu-info',onPress:()=>actions.push('info')},{id:'mute',label:'Mute',testID:'menu-mute',onPress:()=>actions.push('mute')}].slice(0,count)}));
 const part=(tree:any,type:string)=>find(tree,(n:any)=>n.type===type);
 const open=()=>{let tree=draw();const trigger=part(tree,'GroupGlassButton');trigger.props.ref.current={measureInWindow:(fn:any)=>fn(260,70,44,44),focus:()=>{}};trigger.props.onPress();return draw()};
 return {h,actions,draw,part,open,disable:()=>{disabled=true}};
}

for(const platform of ['ios','web'])test(platform+' menu commits an action exactly once after real dismissal and holds its anchor throughout closure',()=>{
 const t=menu(platform);let tree=t.open();const anchor=t.part(tree,'GroupControlSurface').props.style.at(-1);assert.equal(t.part(tree,'Modal').props.visible,true);find(tree,(n:any)=>n.props?.testID==='menu-info').props.onPress();assert.deepEqual(t.actions,[]);tree=t.draw();assert.equal(t.part(tree,'Modal').props.visible,false);assert.deepEqual(JSON.parse(JSON.stringify(t.part(tree,'GroupControlSurface').props.style.at(-1))),JSON.parse(JSON.stringify(anchor)));assert.deepEqual(t.actions,[],'No timer or immediate dispatch is allowed');t.part(tree,'Modal').props.onDismiss();assert.deepEqual(t.actions,['info']);t.part(tree,'Modal').props.onDismiss();assert.deepEqual(t.actions,['info']);t.h.unmount();
});

test('Android fallback uses no exit animation and dispatches only after the hidden state commit',()=>{
 const t=menu('android');let tree=t.open();assert.equal(t.part(tree,'Modal').props.animationType,'none');find(tree,(n:any)=>n.props?.testID==='menu-info').props.onPress();assert.deepEqual(t.actions,[]);tree=t.draw();assert.equal(t.part(tree,'Modal').props.visible,false);assert.deepEqual(t.actions,['info']);t.part(tree,'Modal').props.onDismiss();assert.deepEqual(t.actions,['info']);t.h.unmount();
});

test('cancelled or unmounted menu never opens a queued destination',()=>{
 const cancelled=menu('ios');let tree=cancelled.open();cancelled.part(tree,'Modal').props.onRequestClose();tree=cancelled.draw();cancelled.part(tree,'Modal').props.onDismiss();assert.deepEqual(cancelled.actions,[]);cancelled.h.unmount();
 const unmounted=menu('ios');tree=unmounted.open();find(tree,(n:any)=>n.props?.testID==='menu-info').props.onPress();unmounted.h.unmount();unmounted.part(tree,'Modal').props.onDismiss();assert.deepEqual(unmounted.actions,[]);
});

test('a menu invalidated by permission/disabled state discards any queued action',()=>{
 const t=menu('web');let tree=t.open();find(tree,(n:any)=>n.props?.testID==='menu-info').props.onPress();t.disable();tree=t.draw();t.part(tree,'Modal').props.onDismiss();assert.deepEqual(t.actions,[]);t.h.unmount();
});

test('the single iOS invitation action cannot scroll or bounce its label out of the menu',()=>{
 const t=menu('ios',1);let tree=t.open();
 assert.equal(t.part(tree,'ScrollView'),undefined,'A one-action menu must not create a scroll recognizer');
 const item=find(tree,(n:any)=>n.props?.testID==='menu-info');assert.equal(item.props.children[1].props.children,'Cancel invitation');
 item.props.onPress();tree=t.draw();assert.deepEqual(t.actions,[]);
 t.part(tree,'Modal').props.onDismiss();assert.deepEqual(t.actions,['info']);
 t.h.unmount();
});

test('multi-action fallback menus retain scrolling without elastic overscroll',()=>{
 const t=menu('ios');const tree=t.open(),scroll=t.part(tree,'ScrollView');
 assert.ok(scroll);assert.equal(scroll.props.bounces,false);assert.equal(scroll.props.alwaysBounceVertical,false);assert.equal(scroll.props.overScrollMode,'never');
 t.h.unmount();
});
