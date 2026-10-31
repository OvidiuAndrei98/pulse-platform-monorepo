const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {hooks,modules}=require('./helpers/qaHarness.cjs');
const root=path.resolve(__dirname,'../../..'),tokens=require('../../../packages/design-system/tokens.json');
const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
test('semantic text pairs and actionable boundaries pass contrast',()=>{
 for(const [foreground,background] of [['onAction','action'],['onAction','actionHover'],['onAction','actionPressed'],['text','surface'],['muted','surface'],['danger','dangerSurface'],['success','successSurface'],['warning','warningSurface']])assert.ok(contrast(tokens.colors[foreground],tokens.colors[background])>=4.5,foreground+'/'+background);
 assert.ok(contrast(tokens.colors.inputBorder,tokens.colors.surface)>=3);
 for(const surface of ['background','surface','raised','overlay','focusHalo'])assert.ok(contrast(tokens.colors.focus,tokens.colors[surface])>=3,'Focus on '+surface);
 // Brand is valid for non-text graphics, not normal white button labels.
 assert.ok(contrast(tokens.colors.brand,tokens.colors.onAction)>=3);assert.ok(contrast(tokens.colors.brand,tokens.colors.onAction)<4.5);
});
test('accent focus has a contrasting halo on filled actions and themed dropdowns do not borrow text color',()=>{
 assert.equal(tokens.colors.focus,tokens.colors.brand);
 const css=fs.readFileSync(path.join(root,'apps/pulse-app/src/styles/interface.css'),'utf8');
 assert.ok(css.includes('[tabindex]:not([tabindex="-1"])'),'Programmatic dialog/heading targets must not inherit a control perimeter');
 assert.match(css,/\.ui-button\[class\]\[data-variant="primary"\]:focus-visible\s*\{ box-shadow:0 0 0 6px var\(--ui-focus-halo\)/);
 const select=fs.readFileSync(path.join(root,'apps/pulse-app/src/features/events/form/themedSelect.module.css'),'utf8');
 assert.match(select,/\.trigger:focus-visible\s*\{ outline:2px solid var\(--ui-focus\)/);
 assert.match(select,/\.option\[data-active="true"\]\s*\{ border-color:var\(--ui-focus\)/);
 assert.doesNotMatch(select,/outline:[^;{}]*var\(--foreground\)/);
 const discovery=fs.readFileSync(path.join(root,'apps/pulse-app/src/features/events/filters/DiscoveryToolbar.tsx'),'utf8');
 assert.match(discovery,/ui-input-shell/);assert.match(discovery,/<UIInput bare ref=/);
});
test('CSS token output is synchronized and exports all roles',()=>{
 cp.execFileSync(process.execPath,['tools/sync-design-tokens.cjs','--check'],{cwd:root});
 const css=fs.readFileSync(path.join(root,'apps/pulse-app/src/styles/design-tokens.css'),'utf8');
 for(const name of ['--ui-control-regular','--ui-space-lg','--ui-motion-feedback','--ui-weight-label'])assert.ok(css.includes(name));
 const controls=fs.readFileSync(path.join(root,'apps/pulse-app/src/styles/interface.css'),'utf8'),defined=new Set([...((css+'\n'+controls).matchAll(/(--ui-[\w-]+)\s*:/g))].map(match=>match[1]));
 for(const [,name] of controls.matchAll(/var\((--ui-[\w-]+)/g))assert.ok(defined.has(name),'Undefined design variable '+name);
});
function web(){const h=hooks();return {h,...modules({react:h.react,'next/link':{__esModule:true,default:'a'}}).load('components/ui/ActionButton.tsx')};}
test('shared submit is natively disabled while busy and cannot dispatch click',()=>{
 const {h,ActionButton}=web();let clicks=0,prevented=false;
 const node=h.render(()=>ActionButton({type:'submit',busy:true,onClick:()=>clicks++,children:'Save'}));
 assert.equal(node.props.type,'submit');assert.equal(node.props.disabled,true);assert.equal(node.props['aria-busy'],true);
 node.props.onClick({preventDefault(){prevented=true;}});assert.equal(clicks,0);assert.equal(prevented,true);
});
test('button composition leaves decorative span/div/template classes intact',()=>{
 const {h,ActionButton}=web(),decorative={type:'span',props:{className:'rounded-full bg-primary text-white group-hover:scale-110',children:{type:'div',props:{className:'group-hover:rounded-xl',children:'content'}}}};
 const node=h.render(()=>ActionButton({children:decorative}));assert.equal(node.props.children.at(-1),decorative);
 assert.equal(decorative.props.className,'rounded-full bg-primary text-white group-hover:scale-110');
});
function native(){
 const h=hooks(),colors={...tokens.colors,bg:tokens.colors.background,line:tokens.colors.border,accent:tokens.colors.brand};
 const flatten=value=>Array.isArray(value)?Object.assign({},...value.filter(Boolean).map(flatten)):value||{};
 const api=modules({react:h.react,'react-native':{Platform:{OS:'web'},StyleSheet:{create:value=>value,flatten}},'./MotionPressable':{MotionPressable:'Pressable'},'./AccentPressable':{AccentPressable:'Pressable'},'./Text':{Text:'Text'},'./theme':{colors,tokens},'./ActionTextContext':{ActionTextContext:{Provider:'provider'}}}).load('../../spottr-native/src/ui/ActionButton.tsx');
 return {h,flatten,...api};
}
test('native action geometry stays finite with percent layouts and evaluates styles once',()=>{
 const {h,flatten,ActionButton}=native();let calls=0;
 const node=h.render(()=>ActionButton({title:'Save',style:()=>{calls++;return {height:'100%',minHeight:'50%',borderRadius:8,opacity:.7};}}));
 const style=flatten(node.props.style({pressed:true}));assert.equal(calls,1);assert.equal(style.height,'100%');assert.equal(style.minHeight,44);assert.equal(style.borderRadius,999);assert.equal(style.opacity,1);
});
test('native secondary/success/danger cannot be recolored accidentally by legacy style',()=>{
 for(const [tone,color] of [['secondary','raised'],['success','successSurface'],['danger','dangerSurface']]){
  const {h,flatten,ActionButton}=native(),node=h.render(()=>ActionButton({tone,title:'Action',style:{backgroundColor:tokens.colors.brand}}));
  assert.equal(flatten(node.props.style({pressed:false})).backgroundColor,tokens.colors[color]);
 }
});
test('native action composition preserves render functions and arbitrary child identity',()=>{
 const {h,ActionButton}=native(),render=()=>({type:'Text',props:{children:'Custom'}}),child={type:function Custom(){},props:{children:render,color:'black'}};
 const node=h.render(()=>ActionButton({children:child}));
 assert.equal(node.props.children.props.children.at(-1),child);
 assert.equal(child.props.children,render);assert.equal(child.props.color,'black');
});
test('shared native actions keep the Liquid Glass owner and primary tint',()=>{
 const {h,ActionButton}=native(),node=h.render(()=>ActionButton({title:'Save',busy:true}));
 assert.equal(node.props.glassColor,tokens.colors.brand);assert.equal(node.props.fallback,'Pressable');
 assert.equal(node.props.disabled,true);assert.equal(node.props.accessibilityState.busy,true);
 const source=fs.readFileSync(path.join(root,'apps/spottr-native/src/ui/ActionButton.tsx'),'utf8');
 assert.match(source,/<AccentPressable/);assert.match(source,/fallback=\{MotionPressable\}/);
 const toolbar=fs.readFileSync(path.join(root,'apps/spottr-native/src/screens/DiscoveryToolbar.tsx'),'utf8');
 assert.ok(toolbar.includes('DiscoveryNativeGlassGroups'));assert.ok(toolbar.includes('useDiscoverySearchMotion'));assert.ok(toolbar.includes('focusOwner="container"'));
});
test('native-web action focus follows browser keyboard modality, not pointer focus',()=>{
 const {h,flatten,ActionButton}=native(),render=()=>h.render(()=>ActionButton({title:'Save'}));
 let node=render();node.props.onFocus({currentTarget:{matches:()=>false}});node=render();
 assert.notEqual(flatten(node.props.style({pressed:false})).outlineWidth,2);
 node.props.onFocus({currentTarget:{matches:selector=>selector===':focus-visible'}});node=render();
 assert.equal(flatten(node.props.style({pressed:false})).outlineWidth,2);
 assert.equal(flatten(node.props.style({pressed:false})).outlineColor,tokens.colors.focus);
});
test('focus resets and dark-mode layout do not disable browser zoom',()=>{
 const layout=fs.readFileSync(path.join(root,'apps/pulse-app/src/app/layout.tsx'),'utf8');assert.doesNotMatch(layout,/userScalable:\s*false|maximumScale:\s*1/);
 const css=fs.readFileSync(path.join(root,'apps/pulse-app/src/styles/interface.css'),'utf8');assert.match(css,/@layer components/);assert.match(css,/prefers-reduced-motion:reduce/);
});
test('no invalid alpha suffix follows a CSS variable',()=>{
 const css=fs.readFileSync(path.join(root,'apps/pulse-app/src/features/checkout/checkoutResult.module.css'),'utf8');assert.doesNotMatch(css,/var\([^;{}]*\)[0-9a-f]{2}\s*[;}]/);
});
test('compound bare fields opt into shell focus without removing standalone focus',()=>{
 const css=fs.readFileSync(path.join(root,'apps/pulse-app/src/styles/interface.css'),'utf8');
 assert.match(css,/\.ui-input-shell:has\(> \.ui-input-bare:focus-visible\)\s*\{ outline:2px solid var\(--ui-focus\)/);
 assert.match(css,/\.ui-input-shell:has\(> \.ui-input-bare:focus-visible\) > \.ui-input-bare\[class\]:focus-visible\s*\{ outline:none/);
 assert.doesNotMatch(css,/(?:^|\n)\.ui-input-bare[^{}]*\{[^{}]*outline:\s*none/);
 for(const file of ['app/register/page.tsx','app/login/page.tsx','app/forgot-password/page.tsx','app/users/me/friends/page.tsx','components/SearchPopover.tsx','components/social/FriendsSheet.tsx']){
  const source=fs.readFileSync(path.join(root,'apps/pulse-app/src',file),'utf8');assert.ok(source.includes('ui-input-shell'),file);
  assert.doesNotMatch(source,/focus-within:ring-/,file+' must not draw a second focus ring');
 }
});
