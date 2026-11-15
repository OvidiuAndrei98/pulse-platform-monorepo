import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,find,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function info(){
 const h=hooks(),reply=deferred(),writes:any[]=[],navigation:any[]=[],group={id:'group',name:'Friends',ownerId:'owner',status:'accepted',members:[{userId:'owner',status:'accepted'},{userId:'me',status:'accepted'}],outings:[]};
 let focused=true;
 const model:any={ready:true,user:{id:'me'},groups:[group],friends:[],revoked:[],collectionStatus:{},collection:{},collectionMore:{},store:{action:async(id:string,body:any)=>{writes.push({id,body});const ok=await reply.promise;if(ok&&body.action==='leave'){model.groups=[];model.revoked=['group']}return ok},getSnapshot:()=>model,loadFriends:async()=>{}}};
 const symbols=(...names:string[])=>Object.fromEntries(names.map(name=>[name,name]));
 const {GroupInfoScreen}=modules({react:h.react,'react-native':symbols('ScrollView','Switch','View'),'@react-navigation/native':{useIsFocused:()=>focused,useNavigation:()=>({navigate:(...args:any[])=>navigation.push(args)})},'lucide-react-native':symbols('Bell','CalendarDays','Check','Images','LogOut','Pencil','UserPlus'),'@packages/app-core/social/groups':{GROUP_MEMBER_LIMIT:20,groupMembershipCounts:()=>({accepted:2,pending:0})},'./GroupPage':{...symbols('GroupAccess','GroupPage','GroupSettingRow'),g:{}},'./GroupActionSheet':symbols('GroupActionSheet'),'./GroupGlassControls':symbols('GroupSearchField'), './GroupContent':{GroupAvatar:'GroupAvatar',EventPreview:'EventPreview',OutingSummary:'OutingSummary',ConversationRow:'ConversationRow',MessageMeta:'MessageMeta'},'./groupStyles':{groupStyles:{}},'@packages/app-core/social/groupPresentation':{conversationTitle:(group:any)=>group.name,relatedEventOuting:()=>undefined},'./useGroups':{useGroups:()=>model},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../outings/OutingPrimitives':symbols('MemberAvatar','OutingPressable'),'../ui/ActionButton':symbols('ActionButton'),'../ui/FormInput':symbols('FormInput'),'../ui/Text':symbols('Text'),'../ui/common':symbols('Feedback','Loading'),'../ui/theme':{colors:{}}}).load(path.resolve(__dirname,'../src/groups/GroupInfoScreen.tsx'));
 const draw=()=>h.render(()=>GroupInfoScreen({groupId:'group'}));
 const action=(tree:any)=>find(tree,(n:any)=>n.type?.name==='GroupInfoAction');
 const open=(kind='leave')=>{const tree=draw(),key=kind==='leave'?'group-info-leave':'group-info-rename';find(tree,(n:any)=>n.props?.testID===key).props.onPress();return action(draw())};
 return {h,draw,action,open,model,reply,writes,navigation,setFocused:(value:boolean)=>{focused=value}};
}

test('leave acknowledgement survives private action unmount and navigates once from the owning page',async()=>{
 const t=info(),sheet=t.open(),pending=sheet.props.onLeave();assert.deepEqual(t.navigation,[]);t.reply.resolve(true);await pending;assert.deepEqual(JSON.parse(JSON.stringify(t.writes)),[{id:'group',body:{action:'leave'}}]);assert.equal(t.action(t.draw()),undefined,'Private action is removed immediately after revocation');assert.deepEqual(t.model.groups,[]);assert.deepEqual(t.navigation,[['Groups']]);t.h.unmount();
});

test('cancel or dismissed leave before acknowledgement cannot perform late navigation',async()=>{
 for(const dismiss of [false,true]){const t=info(),sheet=t.open(),pending=sheet.props.onLeave();sheet.props.close();if(dismiss)sheet.props.dismissed();t.draw();t.reply.resolve(true);await pending;assert.deepEqual(t.navigation,[]);assert.deepEqual(t.model.groups,[],'An actual acknowledged leave still purges private state');t.h.unmount()}
});

test('leaving the page or unmounting before leave acknowledgement cannot navigate back into groups',async()=>{
 for(const unmount of [false,true]){const t=info(),sheet=t.open(),pending=sheet.props.onLeave();if(unmount)t.h.unmount();else{t.setFocused(false);t.draw()}t.reply.resolve(true);await pending;assert.deepEqual(t.navigation,[]);t.h.unmount()}
});

test('failed leave acknowledgement preserves membership and does not navigate',async()=>{
 const t=info(),sheet=t.open(),pending=sheet.props.onLeave();t.reply.resolve(false);assert.equal(await pending,false);assert.equal(t.model.groups.length,1);assert.deepEqual(t.navigation,[]);t.h.unmount();
});

test('owner action footer is removed immediately when closing or authority is lost',async()=>{
 const t=info();t.model.user.id='owner';let sheet=t.open('rename');const child=hooks(),render=()=>child.render(()=>sheet.type(sheet.props));let tree=render();assert.ok(find(tree.props.footer,(n:any)=>n.props?.testID==='group-rename-save'));
 sheet={...sheet,props:{...sheet.props,closing:true}};tree=render();assert.equal(find(tree.props.footer,(n:any)=>n.props?.testID==='group-rename-save'),undefined);
 sheet={...sheet,props:{...sheet.props,closing:false,group:{...sheet.props.group,ownerId:'new-owner'}}};tree=render();assert.equal(find(tree.props.footer,(n:any)=>n.props?.testID==='group-rename-save'),undefined);assert.equal(t.writes.length,0);child.unmount();t.h.unmount();await settle();
});
