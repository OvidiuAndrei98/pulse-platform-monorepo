import React from 'react';
import {ReduceMotion,ReducedMotionConfig} from 'react-native-reanimated';
import {useReducedMotionPreference} from './useReducedMotionPreference';
export function InterfaceProvider({children}:React.PropsWithChildren){
 const reduced=useReducedMotionPreference();
 return <><ReducedMotionConfig mode={reduced?ReduceMotion.Always:ReduceMotion.Never}/>{children}</>;
}
