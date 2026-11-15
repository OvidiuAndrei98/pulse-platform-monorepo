import React,{forwardRef} from 'react';
import {StyleSheet,View,type ViewInstance,type StyleProp,type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';
import {GlassSurface,supportsLiquidGlass} from './GlassSurface';
import type {GlassSurfaceProps} from './glassSurfaceTypes';
import {useReducedTransparencyPreference} from './useReducedTransparencyPreference';

/** Shared input material: put the actual input INSIDE this surface, so UIKit
 * receives its touches. No custom press spring, focused-state swap or second blur.
 * Bare FormInput supplies the responder; the caller retains the field geometry.
 */
export const GlassInputSurface=forwardRef<ViewInstance,GlassSurfaceProps&{fallbackMaterialStyle?:StyleProp<ViewStyle>}>(function GlassInputSurface({interactive=true,tintColor,glassEffectStyle,fallbackMaterialStyle,children,style,...props},ref){
 const reduced=useReducedTransparencyPreference();
 if(supportsLiquidGlass&&!reduced)return <GlassSurface {...props} ref={ref} style={style} tintColor={tintColor} glassEffectStyle={glassEffectStyle} interactive={interactive}>{children}</GlassSurface>;
 if(!fallbackMaterialStyle)return <View {...props} ref={ref} style={style}>{children}</View>;
 const shape=StyleSheet.flatten(style);
 return <View {...props} ref={ref} style={[style,{backgroundColor:'transparent'}]}><Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:shape?.backgroundColor,borderRadius:shape?.borderRadius},fallbackMaterialStyle]}/>{children}</View>;
});
