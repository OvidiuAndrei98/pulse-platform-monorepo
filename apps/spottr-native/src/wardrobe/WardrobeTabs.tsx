import React,{useEffect,useRef,useState} from 'react';
import { I18nManager,Platform,Pressable,ScrollView,StyleSheet,View } from 'react-native';
import { ChevronLeft,ChevronRight } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { tabFocusIndex,type WardrobeTabOption } from '../../../pulse-app/src/features/wardrobe/tabNavigation';

export function WardrobeTabs<T extends string>({id,label,value,options,onChange,disabled=false,locked=false,panelId,ro}:{id:string;label:string;value:T;options:WardrobeTabOption<T>[];onChange:(value:T)=>void;disabled?:boolean;locked?:boolean;panelId:string;ro:boolean}) {
  const rail=useRef<ScrollView>(null),buttons=useRef<(View|null)[]>([]),positions=useRef<number[]>([]);
  const [focused,setFocused]=useState(value),[ring,setRing]=useState<T|null>(null),[viewport,setViewport]=useState(0),[content,setContent]=useState(0),[offset,setOffset]=useState(0);
  const unavailable=options.map(option=>disabled||locked&&option.value!==value),selected=Math.max(0,options.findIndex(option=>option.value===value));
  const focusIndex=options.findIndex((option,index)=>option.value===focused&&!unavailable[index]),overflow=content>viewport+1;
  useEffect(()=>{setFocused(value);rail.current?.scrollTo({x:Math.max(0,(positions.current[selected]??0)-8),animated:false});},[value]);
  const move=(direction:number)=>rail.current?.scrollTo({x:Math.max(0,Math.min(content-viewport,offset+direction*viewport*.75)),animated:false});
  const arrow=(direction:number)=><Pressable accessibilityRole="button" tabIndex={-1} accessibilityLabel={ro?(direction<0?'Arată secțiunile anterioare':'Arată alte secțiuni'):(direction<0?'Show previous sections':'Show more sections')} disabled={direction<0?offset<2:offset+viewport>=content-2} onPress={()=>move(direction)} style={s.arrow}>{direction<0?<ChevronLeft color={colors.text} size={18}/>:<ChevronRight color={colors.text} size={18}/>}</Pressable>;
  return <View style={s.bar}>
    {overflow&&arrow(-1)}
    <ScrollView ref={rail} horizontal tabIndex={-1} accessibilityRole="tablist" accessibilityLabel={label} showsHorizontalScrollIndicator={false} style={s.rail} contentContainerStyle={s.items} onLayout={event=>setViewport(event.nativeEvent.layout.width)} onContentSizeChange={width=>setContent(width)} onScroll={event=>setOffset(event.nativeEvent.contentOffset.x)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled">
      {options.map((option,index)=>{
        const keyboard=Platform.OS==='web'?{onKeyDown:(event:{key:string;preventDefault:()=>void})=>{const next=tabFocusIndex(event.key,index,unavailable,I18nManager.isRTL);if(next<0)return;event.preventDefault();buttons.current[next]?.focus();rail.current?.scrollTo({x:Math.max(0,(positions.current[next]??0)-8),animated:false});}}:{};
        return <Pressable key={option.value} ref={node=>{buttons.current[index]=node;}} nativeID={id+'-'+option.value} testID={id==='wardrobe-operations'?'wardrobe-task-'+option.value:id+'-'+option.value} accessibilityRole="tab" aria-selected={option.value===value} accessibilityState={{selected:option.value===value,disabled:unavailable[index]}} aria-controls={panelId} tabIndex={index===(focusIndex<0?selected:focusIndex)?0:-1} disabled={unavailable[index]} onFocus={event=>{setFocused(option.value);if(Platform.OS!=='web'||(event.currentTarget as unknown as HTMLElement).matches?.(':focus-visible'))setRing(option.value);}} onBlur={()=>setRing(null)} onLayout={event=>{positions.current[index]=event.nativeEvent.layout.x;}} onPress={()=>{if(option.value!==value)onChange(option.value);}} {...keyboard} style={[s.tab,option.value===value&&s.selected,ring===option.value&&s.focused,{opacity:unavailable[index]?.45:1}]}><Text style={[s.label,{color:option.value===value?colors.text:colors.muted,fontWeight:option.value===value?'700':'500'}]}>{option.label}</Text></Pressable>;
      })}
    </ScrollView>
    {overflow&&arrow(1)}
  </View>;
}
const s=StyleSheet.create({focused:{outlineColor:colors.text,outlineStyle:'solid',outlineWidth:2,outlineOffset:-3},bar:{flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderColor:colors.line,minHeight:50},rail:{flex:1,minWidth:0},items:{gap:4},tab:{minHeight:48,paddingHorizontal:14,paddingVertical:13,borderBottomWidth:3,borderColor:'transparent',justifyContent:'center'},selected:{borderColor:colors.accent,backgroundColor:colors.raised},label:{fontSize:14,lineHeight:20},arrow:{width:40,minHeight:48,alignItems:'center',justifyContent:'center'}});
