import React,{createContext,forwardRef,useContext} from 'react';
import {KeyboardChatScrollView,KeyboardStickyView,useReanimatedKeyboardAnimation,type KeyboardChatScrollViewRef} from 'react-native-keyboard-controller';
import Animated,{useAnimatedStyle,useSharedValue,type SharedValue} from 'react-native-reanimated';
import type {GroupChatScrollProps} from './GroupChatKeyboard';
import {composerKeyboardOffset,composerHorizontalInset} from './groupChatGeometry';

// Its measured height reserves the overlay's space in the inverted message list.
// Only the home-indicator gap disappears when open; both drivers use that offset.
const ComposerHeight=createContext<SharedValue<number>|undefined>(undefined);
export function GroupChatKeyboardProvider({children,bottomInset}:{children:React.ReactNode;bottomInset:number}){
 const height=useSharedValue(54+bottomInset);
 return <ComposerHeight.Provider value={height}>{children}</ComposerHeight.Provider>;
}
export const GroupChatScrollView=forwardRef<KeyboardChatScrollViewRef,GroupChatScrollProps>(function GroupChatScrollView({bottomInset,onViewportInset,...props},ref){
 const height=useContext(ComposerHeight);
 return <KeyboardChatScrollView {...props} ref={ref} inverted keyboardLiftBehavior="whenAtEnd" extraContentPadding={height} offset={composerKeyboardOffset(bottomInset)} onContentInsetChange={insets=>onViewportInset?.(insets.top)} automaticallyAdjustContentInsets={false} automaticallyAdjustKeyboardInsets={false} contentInsetAdjustmentBehavior="never"/>;
});
/** The complete row follows the same native keyboard progress, including drag. */
export function GroupComposerDock({children,bottomInset}:{children:React.ReactNode;bottomInset:number}){
 const height=useContext(ComposerHeight);
 const {progress}=useReanimatedKeyboardAnimation();
 // Width changes with the native keyboard progress; text and icons never scale.
 const inset=useAnimatedStyle(()=>({paddingHorizontal:composerHorizontalInset(progress.value)}));
 return <KeyboardStickyView style={{position:'absolute',bottom:0,left:0,right:0}} onLayout={event=>{if(height)height.value=event.nativeEvent.layout.height}} offset={{closed:0,opened:composerKeyboardOffset(bottomInset)}}><Animated.View style={inset}>{children}</Animated.View></KeyboardStickyView>;
}
