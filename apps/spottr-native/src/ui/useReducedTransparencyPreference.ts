import {useEffect,useState} from 'react';
import {AccessibilityInfo,Platform} from 'react-native';
/** Matte until iOS confirms that transparent system materials are enabled. */
export function useReducedTransparencyPreference(){
 const [reduced,setReduced]=useState(true);
 useEffect(()=>{if(Platform.OS!=='ios')return;let alive=true,changed=false;
  const sub=AccessibilityInfo.addEventListener('reduceTransparencyChanged',value=>{changed=true;if(alive)setReduced(value)});
  void AccessibilityInfo.isReduceTransparencyEnabled().then(value=>{if(alive&&!changed)setReduced(value)}).catch(()=>{});
  return()=>{alive=false;sub.remove()};
 },[]);
 return reduced;
}
