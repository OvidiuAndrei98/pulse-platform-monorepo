import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function field(glass=true,reduced=false,available=true){
 const h=hooks(),changed:string[]=[],props={label:'City',placeholder:'Choose city',value:'Bucuresti',options:[{value:'Bucuresti',label:'București'},{value:'Cluj-Napoca',label:'Cluj-Napoca'}],onChange:(value:string)=>changed.push(value),testID:'city'};
 const {GroupCityField}=modules({react:h.react,'react-native':{View:'View'},expo:{requireOptionalNativeModule:()=>available?{}:null},'lucide-react-native':{ChevronDown:'Chevron',MapPin:'Place'},'@expo/ui/community/menu':{MenuView:'AppleMenu'},'../dashboard/DashboardDropdown':{DashboardDropdown:'ExistingDropdown'},'../ui/GlassSurface':{GlassSurface:'ExistingGlass',supportsLiquidGlass:glass},'../ui/useReducedTransparencyPreference':{useReducedTransparencyPreference:()=>reduced},'../ui/Text':{Text:'Text'},'../ui/theme':{colors:{},tokens:{radius:{pill:999}}}}).load(path.resolve(__dirname,'../src/groups/GroupCityField.ios.tsx'));
 return {h,changed,props,draw:(extra:any={})=>h.render(()=>GroupCityField({...props,...extra}))};
}

test('iOS glass city menu preserves the current choice and accepts only a real option',()=>{
 const t=field(),tree=t.draw(),menu=find(tree,(n:any)=>n.type==='AppleMenu');assert.ok(menu);assert.equal(menu.props.actions[0].state,'on');assert.equal(menu.props.actions[1].state,'off');
 menu.props.onPressAction({nativeEvent:{event:'not-a-city'}});menu.props.onPressAction({nativeEvent:{event:'Bucuresti'}});assert.deepEqual(t.changed,[]);
 menu.props.onPressAction({nativeEvent:{event:'Cluj-Napoca'}});assert.deepEqual(t.changed,['Cluj-Napoca']);assert.ok(find(tree,(n:any)=>n.type==='ExistingGlass'));t.h.unmount();
});

test('saving or leaving the editor disables both native city actions and their callback',()=>{
 const t=field(),tree=t.draw({disabled:true}),menu=find(tree,(n:any)=>n.type==='AppleMenu');assert.ok(menu.props.actions.every((action:any)=>action.attributes.disabled));menu.props.onPressAction({nativeEvent:{event:'Cluj-Napoca'}});assert.deepEqual(t.changed,[]);t.h.unmount();
});

test('older iOS, reduced transparency and missing ExpoUI retain the existing dropdown',()=>{
 for(const state of [[false,false,true],[true,true,true],[true,false,false]]){const t=field(...state as [boolean,boolean,boolean]),tree=t.draw();assert.equal(tree.type,'ExistingDropdown');assert.equal(tree.props.onChange,t.props.onChange);assert.equal(tree.props.value,'Bucuresti');t.h.unmount()}
 const fallback=modules({'../dashboard/DashboardDropdown':{DashboardDropdown:'ExistingDropdown'}}).load(path.resolve(__dirname,'../src/groups/GroupCityField.tsx'));assert.equal(fallback.GroupCityField,'ExistingDropdown','Android and web keep the exact original implementation');
});
