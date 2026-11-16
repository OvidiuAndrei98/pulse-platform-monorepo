import React,{forwardRef} from 'react';
import {ScrollView,View,type ScrollViewInstance,type ScrollViewProps} from 'react-native';
export type GroupChatScrollProps=ScrollViewProps&{bottomInset:number;active?:boolean;onViewportInset?:(top:number)=>void};
export function GroupChatKeyboardProvider({children}:{children:React.ReactNode;bottomInset:number}){return <>{children}</>}
/** Browser viewport owns its keyboard layout; native-only controllers stay native. */
export const GroupChatScrollView=forwardRef<ScrollViewInstance,GroupChatScrollProps>(function GroupChatScrollView({bottomInset:_inset,onViewportInset:_viewport,active:_active,...props},ref){return <ScrollView {...props} ref={ref}/>});
export function GroupComposerDock({children}:{children:React.ReactNode;bottomInset:number;active?:boolean}){return <View style={{paddingHorizontal:16}}>{children}</View>}
