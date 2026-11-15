/** Includes the real keyboard/composer inset in an inverted native list. */
export function distanceFromLatest(rawOffset:number,topInset:number){
 return Math.max(0,rawOffset+Math.max(0,topInset));
}
export function composerKeyboardOffset(bottomInset:number){return bottomInset-16}
export function composerHorizontalInset(progress:number){
 'worklet';
 return 24-10*Math.max(0,Math.min(1,progress));
}
