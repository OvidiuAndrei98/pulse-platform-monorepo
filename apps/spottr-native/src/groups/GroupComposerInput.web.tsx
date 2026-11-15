import React,{forwardRef,useCallback,useLayoutEffect,useRef} from 'react';
import type {TextInputInstance} from 'react-native';
import {FormInput} from '../ui/FormInput';

/** RN Web reports scrollHeight, which includes the previously assigned height.
 * Measure the intrinsic size synchronously before paint so deletion can shrink
 * the same input without a remount, caret reset or visible intermediate layout.
 */
export const GroupComposerInput=forwardRef<TextInputInstance,React.ComponentPropsWithoutRef<typeof FormInput>>(function GroupComposerInput({value,onContentSizeChange,...props},ref){
 const input=useRef<HTMLTextAreaElement|null>(null);
 const measure=useCallback(()=>{
  const node=input.current;if(!node)return;
  const height=node.style.height,scroll=node.scrollTop;
  node.style.height='0px';
  const contentSize={height:node.scrollHeight,width:node.scrollWidth};
  node.style.height=height;node.scrollTop=scroll;
  // Match RN Web's content-size-only callback payload (no numeric native tag).
  onContentSizeChange?.({nativeEvent:{contentSize}} as Parameters<NonNullable<typeof onContentSizeChange>>[0]);
 },[onContentSizeChange]);
 const attach=useCallback((node:TextInputInstance|null)=>{input.current=node as unknown as HTMLTextAreaElement|null;if(typeof ref==='function')ref(node);else if(ref)ref.current=node},[ref]);
 useLayoutEffect(measure,[value,measure]);
 return <FormInput {...props} value={value} ref={attach} onContentSizeChange={measure}/>;
});
