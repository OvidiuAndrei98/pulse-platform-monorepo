import React, {useId} from 'react';
import {View,type StyleProp,type ViewStyle} from 'react-native';
import {Text} from './Text';
import {colors,tokens} from './theme';
export function Field({label,error,hint,children,hideLabel=false,style}:{label:string;hideLabel?:boolean;style?:StyleProp<ViewStyle>;error?:string;hint?:string;children:(props:{accessibilityLabel:string;accessibilityHint?:string;'aria-invalid':boolean;'aria-describedby'?:string})=>React.ReactNode}){
  const id=useId();
  return <View style={[{gap:6,minWidth:0},style]}>{!hideLabel&&<Text style={{fontSize:14,lineHeight:21,fontWeight:'600',color:colors.text}}>{label}</Text>}
    {children({accessibilityLabel:label,accessibilityHint:error||hint,'aria-invalid':!!error,'aria-describedby':error||hint?id:undefined})}
    {(error||hint)&&<Text nativeID={id} accessibilityRole={error?'alert':undefined} style={{fontSize:tokens.type.caption.size,lineHeight:18,color:error?colors.danger:colors.muted}}>{error||hint}</Text>}
  </View>;
}
