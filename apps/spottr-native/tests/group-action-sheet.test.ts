import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function adapter(bottom=34){return modules({react:{},'react-native':{View:'View'},'lucide-react-native':{X:'CloseIcon'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:60,bottom})},'../ui/AppSheet':{AppSheet:'RealAppSheet'},'../ui/AppSheetScrollView':{AppSheetScrollView:'RealSheetScroll'},'./GroupGlassControls':{GroupGlassButton:'ExistingGlassButton'},'../ui/Text':{Text:'Text'},'../ui/theme':{colors:{bg:'#000',raised:'#111'}},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'./GroupPage':{g:{heading:{fontSize:18}}}}).load(path.resolve(__dirname,'../src/groups/GroupActionSheet.tsx')).GroupActionSheet}

test('short action sheets request closing first and expose completion only through the real sheet dismissal',()=>{
 let requested=0,dismissed=0;const body={type:'ActualForm',props:{}},save={type:'Save',props:{}},Sheet=adapter(),props={title:'Rename',children:body,footer:save,closing:false,onRequestClose:()=>requested++,onDismiss:()=>dismissed++};
 const tree=Sheet(props);assert.equal(tree.type,'RealAppSheet');assert.equal(tree.props.open,true);assert.equal(tree.props.closing,false);assert.equal(tree.props.height,.48);const close=find(tree,(n:any)=>n.props?.testID==='group-action-sheet-close');assert.equal(close.type,'ExistingGlassButton');assert.equal(close.props.style.width,44);assert.equal(close.props.style.height,44);close.props.onPress();assert.equal(requested,1);assert.equal(dismissed,0,'Requesting closure cannot open the next destination');
 const closing=Sheet({...props,closing:true});assert.equal(closing.props.closing,true);closing.props.onClose();assert.equal(dismissed,1);
});

test('action sheets keep the header and safe-area footer outside the single shared scrolling body',()=>{
 const body={type:'ActualForm',props:{}},save={type:'Save',props:{}},tree=adapter()({title:'Edit night',children:body,footer:save,closing:false,onRequestClose:()=>{},onDismiss:()=>{}});
 const scroll=find(tree,(n:any)=>n.type==='RealSheetScroll');assert.equal(scroll.props.children,body);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');assert.equal(tree.props.footer.props.children,save);assert.equal(tree.props.footer.props.style.paddingBottom,34);assert.equal(find(scroll,(n:any)=>n.type==='Save'),undefined);assert.ok(find(tree,(n:any)=>n.type==='Text'&&n.props.accessibilityRole==='header'));
});

test('sheets without footer retain a scrollable body and minimum safe-area space',()=>{
 for(const inset of [0,34]){const body={type:'ActualForm',props:{}},tree=adapter(inset)({title:'Invite',children:body,closing:false,onRequestClose:()=>{},onDismiss:()=>{},height:.64,testID:'invite-sheet'});assert.equal(tree.props.footer,undefined);assert.equal(tree.props.height,.64);assert.equal(tree.props.testID,'invite-sheet');const scroll=find(tree,(n:any)=>n.type==='RealSheetScroll');assert.equal(scroll.props.children,body);assert.ok(scroll.props.contentContainerStyle.paddingBottom>=Math.max(24,inset+16))}
});

test('the reusable night editor bridges successful Save to navigation only after sheet dismissal',()=>{
 const h=hooks(),completed:string[]=[],closed:string[]=[];let reset=0;const model={store:{resetContextFeedback:()=>reset++}};
 const {GroupNightSheet}=modules({react:h.react,'react-native':{View:'View'},'./GroupNightForm':{GroupNightForm:'ActualEditor'},'./GroupActionSheet':{GroupActionSheet:'ActualActionSheet'},'./useGroups':{},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/ActionButton':{ActionButton:'ActionButton'}}).load(path.resolve(__dirname,'../src/groups/GroupNightSheet.tsx'));
 const draw=()=>h.render(()=>GroupNightSheet({model,groupId:'group',plan:{id:'outing'},onClose:()=>closed.push('close'),onSaved:(id:string)=>completed.push(id)}));
 let editor=draw();assert.equal(editor.type,'ActualEditor');assert.equal(editor.props.active,true);editor.props.onCreated('outing');assert.equal(reset,1,'Closing invalidates old editor feedback');assert.deepEqual(completed,[]);assert.deepEqual(closed,[]);editor=draw();assert.equal(editor.props.active,false);const sheet=editor.props.renderShell('body','save');assert.equal(sheet.props.closing,true);sheet.props.onDismiss();assert.deepEqual(closed,['close']);assert.deepEqual(completed,['outing']);sheet.props.onDismiss();assert.deepEqual(completed,['outing'],'A duplicate native completion cannot navigate twice');assert.deepEqual(closed,['close'],'A duplicate native completion cannot close twice');h.unmount();
});

test('cancelling a night sheet waits for closure and never reports a saved outing',()=>{
 const h=hooks();let closed=0,saved=0,reset=0;const model={store:{resetContextFeedback:()=>reset++}};
 const {GroupNightSheet}=modules({react:h.react,'react-native':{View:'View'},'./GroupNightForm':{GroupNightForm:'ActualEditor'},'./GroupActionSheet':{GroupActionSheet:'ActualActionSheet'},'./useGroups':{},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/ActionButton':{ActionButton:'ActionButton'}}).load(path.resolve(__dirname,'../src/groups/GroupNightSheet.tsx'));
 const draw=()=>h.render(()=>GroupNightSheet({model,groupId:'group',plan:{id:'outing'},onClose:()=>closed++,onSaved:()=>saved++}));let form=draw();form.props.renderShell('body','save').props.onRequestClose();assert.equal(reset,1);assert.equal(closed,0);form=draw();assert.equal(form.props.active,false);form.props.renderShell('body','save').props.onDismiss();assert.equal(closed,1);assert.equal(saved,0);h.unmount();
});

test('Cancel invalidates a Save acknowledgement in the same batch before active=false can commit',()=>{
 const h=hooks();let closed=0,saved=0;const model={store:{resetContextFeedback:()=>{}}};
 const {GroupNightSheet}=modules({react:h.react,'react-native':{View:'View'},'./GroupNightForm':{GroupNightForm:'ActualEditor'},'./GroupActionSheet':{GroupActionSheet:'ActualActionSheet'},'./useGroups':{},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/ActionButton':{ActionButton:'ActionButton'}}).load(path.resolve(__dirname,'../src/groups/GroupNightSheet.tsx'));
 const draw=()=>h.render(()=>GroupNightSheet({model,groupId:'group',plan:{id:'outing'},onClose:()=>closed++,onSaved:()=>saved++}));
 const previous=draw();previous.props.renderShell('body','save').props.onRequestClose();previous.props.onCreated('outing');const closing=draw();closing.props.renderShell('body','save').props.onDismiss();assert.equal(closed,1);assert.equal(saved,0,'A cancelled editor must ignore the pre-commit acknowledgement');h.unmount();
});

test('a native dismissal callback queued before route unmount cannot close or navigate afterward',()=>{
 const h=hooks();let closed=0,saved=0;const model={store:{resetContextFeedback:()=>{}}};
 const {GroupNightSheet}=modules({react:h.react,'react-native':{View:'View'},'./GroupNightForm':{GroupNightForm:'ActualEditor'},'./GroupActionSheet':{GroupActionSheet:'ActualActionSheet'},'./useGroups':{},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../ui/ActionButton':{ActionButton:'ActionButton'}}).load(path.resolve(__dirname,'../src/groups/GroupNightSheet.tsx'));
 const draw=()=>h.render(()=>GroupNightSheet({model,groupId:'group',plan:{id:'outing'},onClose:()=>closed++,onSaved:()=>saved++}));const form=draw();form.props.onCreated('outing');const sheet=draw().props.renderShell('body','save');h.unmount();sheet.props.onDismiss();assert.equal(closed,0);assert.equal(saved,0);
});
