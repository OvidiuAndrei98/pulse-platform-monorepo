import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function editor(creating=false,outingDate='2026-11-18'){
 const h=hooks(),response=deferred(),writes:any[]=[],completed:string[]=[],picks:any[]=[];
 const plan:any={id:'outing',groupId:'group',ownerId:'owner',title:'Night',status:'accepted',outingDate,city:'Bucuresti',revision:7,decisionRound:1,lifecycle:'choosing_event',members:[],options:[],candidateDates:[{date:outingDate,responses:[]}]};
 const model:any={groups:[{id:'group',name:'Friends',status:'accepted',outings:[plan]}],events:[],busy:false,contextImpact:null,contextConflict:null,contextError:null,store:{
  resetContextFeedback:()=>{model.contextImpact=null;model.contextConflict=null;model.contextError=null},
  getSnapshot:()=>model,
  editContext:async(gid:string,pid:string,body:any)=>{if(model.busy)return;model.busy=true;writes.push({gid,pid,body});try{return await response.promise}finally{model.busy=false}},
  loadPlan:async()=>{},
 }};
 const react={...h.react,useLayoutEffect:h.react.useEffect};
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const {GroupNightForm}=modules({react,'react-native':{...symbols('View','Pressable','ScrollView'),Platform:{OS:'web'},StyleSheet:{create:(v:any)=>v},useWindowDimensions:()=>({width:390,height:844,fontScale:1})},'react-native-reanimated':{useSharedValue:(value:any)=>({value})},'lucide-react-native':symbols('Plus','CalendarDays'),
  '@packages/app-core/events/constants':{eventCities:['Bucuresti','Cluj-Napoca']},'@packages/app-core/outings/model':{canonicalPlanningCity:(v:string)=>v,planningToday:()=> '2026-11-14',validPlanningDate:(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v),matchesPlanningContext:()=>true},'@packages/app-core/events/discoveryFilters':{shiftCalendarDay:(day:string,offset:number)=>new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10)},
   './GroupContent':{GroupAvatar:'GroupAvatar',EventPreview:'EventPreview',OutingSummary:'OutingSummary',ConversationRow:'ConversationRow',MessageMeta:'MessageMeta'},'./groupStyles':{groupStyles:{}},'@packages/app-core/social/groupPresentation':{conversationTitle:(group:any)=>group.name,relatedEventOuting:()=>undefined},'./useGroups':{useGroups:()=>model},'./GroupEventChooser':symbols('EventChooser'),'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key,language:'en'})},'../dashboard/DashboardDropdown':symbols('DashboardDropdown'),'../screens/DiscoveryDateRibbon':symbols('DiscoveryDateRibbon'),'../ui/Text':symbols('Text'),'../ui/ActionButton':symbols('ActionButton'),'../ui/common':symbols('EventImage'),'../ui/theme':{colors:{}},
 }).load(path.resolve(__dirname,'../src/groups/GroupNightForm.tsx'));
 let active=true,tree:any;
 const render=()=>tree=h.render(()=>GroupNightForm({model,groupId:'group',plan:creating?undefined:plan,active,onPickEvent:(context:any)=>picks.push(context),onCreated:(id:string)=>completed.push(id),renderShell:(body:any,footer:any)=>({type:'EditorShell',props:{children:[body,footer]}})}));
 const node=(id:string)=>find(tree,(n:any)=>n.props?.testID===id),ribbon=()=>find(tree,(n:any)=>n.type==='DiscoveryDateRibbon');
 render();return{model,plan,writes,completed,picks,response,render,node,ribbon,change:(date:string)=>{ribbon().props.onChange({dateFrom:date});render()},save:()=>node('group-save-context').props.onPress(),close:()=>{active=false;render()},dispose:()=>h.unmount(),tree:()=>tree};
}

test('night editor starts from the persisted context and no-op Save cannot issue a request',()=>{
 const f=editor();assert.equal(f.ribbon().props.filters.dateFrom,'2026-11-18');assert.equal(f.node('group-save-context').props.disabled,true);assert.equal(f.writes.length,0);f.dispose();
});

test('a past persisted night cannot show a contradictory selected day or silently become a new draft',()=>{
 const f=editor(false,'2026-11-08');
 assert.equal(f.ribbon(),undefined,'An old context must not display a silently clamped current-day marker');
 assert.ok(find(f.tree(),(node:any)=>node.type==='Text'&&String(node.props.children).includes('8 November')));
 assert.equal(f.node('group-save-context').props.disabled,true);assert.equal(f.writes.length,0);
 f.node('group-choose-new-night').props.onPress();f.render();
 assert.equal(f.ribbon().props.filters.dateFrom,'2026-11-14');assert.equal(f.plan.outingDate,'2026-11-08');assert.equal(f.writes.length,0,'Explicitly starting a new draft still does not persist it');f.dispose();
});

test('night editing remains a local draft until a successful server response',async()=>{
 const f=editor();f.change('2026-11-25');assert.equal(f.plan.outingDate,'2026-11-18');assert.equal(f.node('group-save-context').props.disabled,false);f.save();f.render();assert.equal(f.writes.length,1);assert.equal(f.writes[0].pid,'outing');assert.equal(f.writes[0].gid,'group');assert.equal(f.writes[0].body.date,'2026-11-25');assert.equal(f.writes[0].body.revision,7);assert.equal(f.node('group-save-context').props.busy,true);assert.equal(f.completed.length,0);
 f.response.resolve({...f.plan,outingDate:'2026-11-25',revision:8});await settle();assert.deepEqual(f.completed,['outing']);f.dispose();
});

test('failed Save keeps the draft and the persisted outing untouched',async()=>{
 const f=editor();f.change('2026-11-25');f.save();f.model.contextError='groups.failed';f.response.resolve(undefined);await settle();f.render();assert.equal(f.ribbon().props.filters.dateFrom,'2026-11-25');assert.equal(f.plan.outingDate,'2026-11-18');assert.equal(f.completed.length,0);assert.ok(find(f.tree(),(n:any)=>n.props?.accessibilityRole==='alert'));f.dispose();
});

test('late Save acknowledgement cannot navigate or reopen a closing editor',async()=>{
 const f=editor();f.change('2026-11-25');f.save();f.close();f.response.resolve({...f.plan,outingDate:'2026-11-25',revision:8});await settle();assert.deepEqual(f.completed,[]);f.dispose();
});

test('late Save acknowledgement cannot navigate after the editor unmounts',async()=>{
 const f=editor();f.change('2026-11-25');f.save();f.dispose();f.response.resolve({...f.plan,outingDate:'2026-11-25',revision:8});await settle();assert.deepEqual(f.completed,[]);
});

test('live ribbon preview and the form title use the same local draft without persisting it',()=>{
 const f=editor();f.ribbon().props.onPreviewDay('2026-12-31');f.render();assert.equal(f.ribbon().props.filters.dateFrom,'2026-12-31');assert.ok(find(f.tree(),(node:any)=>node.type==='Text'&&String(node.props.children).includes('31 December')));assert.equal(f.plan.outingDate,'2026-11-18');assert.equal(f.writes.length,0);f.dispose();
});

test('Save finishes an in-flight date selection before preparing the server context',()=>{
 const f=editor();let finishes=0;f.ribbon().props.selectionController.current={finish:()=>{finishes++;return '2027-01-01'}};
 f.save();assert.equal(finishes,1);assert.equal(f.writes[0].body.date,'2027-01-01');assert.equal(f.writes[0].body.city,'Bucuresti');assert.equal(f.plan.outingDate,'2026-11-18');f.dispose();
});

test('opening the event selector immediately after a preview uses the latest day even before rerender',()=>{
 const f=editor(true),button=f.node('group-night-pick-event');f.ribbon().props.onPreviewDay('2026-12-31');button.props.onPress();assert.equal(f.picks[0].date,'2026-12-31');assert.equal(f.picks[0].city,'Bucuresti');assert.equal(f.writes.length,0);f.dispose();
});
