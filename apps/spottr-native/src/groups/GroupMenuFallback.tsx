import React,{useEffect,useRef,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,StyleSheet,View,useWindowDimensions,type ViewInstance} from 'react-native';
import {MoreHorizontal} from 'lucide-react-native';
import type {GroupMenuProps} from './groupMenuTypes';
import {GroupControlSurface,GroupGlassButton} from './GroupGlassControls';
import {Text} from '../ui/Text';
import {colors} from '../ui/theme';
import {useReducedMotionPreference} from '../ui/useReducedMotionPreference';
import {useIsFocused} from '@react-navigation/native';
/** Same compact dark menu for browser/older builds, anchored rather than centered. */
export function FallbackGroupMenu({label,items,testID,icon:Icon=MoreHorizontal,disabled}:GroupMenuProps){
 const trigger=useRef<ViewInstance>(null),first=useRef<ViewInstance>(null),menu=useRef<ViewInstance>(null),viewport=useWindowDimensions(),reduced=useReducedMotionPreference(),focused=useIsFocused();
 const [anchor,setAnchor]=useState<{x:number;y:number;width:number;height:number}|null>(null);
 const [visible,setVisible]=useState(false);
 const [measured,setMeasured]=useState<{key:string;height:number}|null>(null);
 const pending=useRef<(()=>void)|null>(null);
 const dismissed=()=>{setAnchor(null);const action=pending.current;pending.current=null;action?.()};
 useEffect(()=>()=>{pending.current=null},[]);
 // Android's legacy Modal has no dismissal event. Its fallback has no exit
 // animation, so dispatch only after the hidden state has committed.
 useEffect(()=>{if(!visible&&Platform.OS==='android')dismissed()},[visible]);
 const close=()=>{setVisible(false);if(Platform.OS==='web')trigger.current?.focus()};
 useEffect(()=>{pending.current=null;setVisible(false)},[viewport.width,viewport.height,disabled]);
 useEffect(()=>{if(!focused){pending.current=null;setVisible(false)}},[focused]);
 useEffect(()=>{if(!visible||Platform.OS!=='web')return;const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const choices=Array.from((menu.current as unknown as HTMLElement|null)?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')??[]);if(!choices.length)return;
  e.preventDefault();const index=choices.indexOf(document.activeElement as HTMLElement),next=e.key==='Home'?0:e.key==='End'?choices.length-1:(index+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus();
 };document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true)},[visible]);
 const width=Math.min(288,viewport.width-32,Math.max(156,...items.map(item=>item.label.length*7.5+64))),layoutKey=width+':'+(viewport.fontScale??1)+':'+items.map(item=>item.label).join('|');
 // The estimate only places the first frame. Wrapped/localized labels own
 // their actual height; one menu item must never scroll inside a 48pt guess.
 const height=Math.min(measured?.key===layoutKey?measured.height:items.length*48+12,viewport.height-32);
 const top=anchor?Math.max(16,Math.min(anchor.y+anchor.height+8,viewport.height-height-16)):16;
 const left=anchor?Math.max(16,Math.min(anchor.x+anchor.width-width,viewport.width-width-16)):16;
 const MenuBody=items.length===1?View:ScrollView;
 const bodyProps=items.length===1?{style:{padding:6}}:{keyboardShouldPersistTaps:'handled' as const,bounces:false,alwaysBounceVertical:false,overScrollMode:'never' as const,contentContainerStyle:{padding:6}};
 return <><GroupGlassButton ref={trigger} testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:visible,disabled}} aria-haspopup="menu" aria-expanded={visible} disabled={disabled} onPress={()=>trigger.current?.measureInWindow((x,y,width,height)=>{setAnchor({x,y,width,height});setVisible(true)})} style={s.trigger}><Icon size={22} color={colors.text}/></GroupGlassButton>
  <Modal visible={visible} transparent animationType={reduced||Platform.OS==='android'?'none':'fade'} onDismiss={dismissed} onRequestClose={close} onShow={()=>{if(Platform.OS==='web')first.current?.focus()}}>
   <View style={StyleSheet.absoluteFill}><Pressable testID={testID+'-dismiss'} accessible={false} onPress={close} style={StyleSheet.absoluteFill}/><GroupControlSurface ref={menu} tintColor="#101012f2" glassEffectStyle="regular" accessibilityRole="menu" accessibilityLabel={label} accessibilityViewIsModal onLayout={event=>{const actual=event.nativeEvent.layout.height;if(actual>0)setMeasured(old=>old?.key===layoutKey&&Math.abs(old.height-actual)<.5?old:{key:layoutKey,height:actual})}} style={[s.menu,{position:'absolute',left,top,width,maxHeight:viewport.height-32}]}><MenuBody {...bodyProps}>{items.map((item,index)=>{const ItemIcon=item.icon;return <Pressable ref={index===0?first:undefined} key={item.id} testID={item.testID} accessibilityRole="menuitem" disabled={item.disabled} accessibilityState={{disabled:item.disabled}} onPress={()=>{pending.current=item.onPress;close()}} style={({pressed})=>[s.item,pressed&&{backgroundColor:'#ffffff0d'},item.disabled&&{opacity:.45}]}>{ItemIcon&&<ItemIcon size={18} color={item.destructive?colors.danger:colors.muted}/>}<Text style={[s.label,item.destructive&&{color:colors.danger}]}>{item.label}</Text></Pressable>})}</MenuBody></GroupControlSurface></View>
  </Modal>
 </>;
}
const s=StyleSheet.create({trigger:{width:44,height:44,borderRadius:22,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'},menu:{backgroundColor:colors.overlay,borderRadius:22,borderWidth:1,borderColor:colors.line,overflow:'hidden',boxShadow:'0 8px 28px #00000066'},item:{minHeight:44,paddingVertical:12,paddingHorizontal:12,flexDirection:'row',gap:12,alignItems:'center',borderRadius:16},label:{fontSize:15,lineHeight:21,color:colors.text,flexShrink:1}});
