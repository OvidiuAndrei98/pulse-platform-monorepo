import test from 'node:test';
import assert from 'node:assert/strict';
import { WardrobeStore,emptyItems,type Zone } from '../../pulse-app/src/features/wardrobe/model';
import { availableZones,canReserveBelongings,operatorAccount,wardrobeTasks,wardrobeEventDescription,taskDeposits,changeItemCount } from '../../pulse-app/src/features/wardrobe/flow';
test('rapid item updates compose without losing counts and preserve all limits',()=>{
  const first=changeItemCount(emptyItems(),'coat',1),second=changeItemCount(first,'bag',1);assert.deepEqual(second,{coat:1,bag:1,backpack:0});
  assert.equal(changeItemCount({coat:20,bag:0,backpack:0},'bag',1).bag,0);assert.equal(changeItemCount(emptyItems(),'bag',-1).bag,0);
  assert.equal(changeItemCount(second,'bag',1,{coat:1,bag:1,backpack:0}),second);
});
test('pickup never displays reservations or already returned belongings, including manual searches',()=>{
  const rows=['reserved','stored','returned','cancelled'].map((status,index)=>({id:String(index),status})) as import('../../pulse-app/src/features/wardrobe/model').Deposit[];
  assert.deepEqual(taskDeposits('pickup',rows).map(row=>row.id),['1']);assert.deepEqual(taskDeposits('receive',rows),[]);assert.equal(taskDeposits('history',rows),rows);
});
test('operator accounts have no personal surface and management tasks require event permissions',()=>{
  assert.equal(operatorAccount('organizer'),true);assert.equal(operatorAccount('admin'),true);assert.equal(operatorAccount('user'),false);
  assert.equal(wardrobeTasks(false).includes('setup'),false);assert.equal(wardrobeTasks(true).includes('setup'),true);
});
test('intake requires explicit item counts, an enabled compatible non-full zone and an accepting event',()=>{
  const zone:Zone={id:'zone',name:'Coats',prefix:'A',kind:'coat',capacity:2,enabled:true,revision:1,occupied:0};
  assert.equal(canReserveBelongings(emptyItems(),'zone',[zone],true),false);
  assert.equal(canReserveBelongings({coat:1,bag:0,backpack:0},'zone',[zone],true),true);
  assert.equal(canReserveBelongings({coat:1,bag:0,backpack:0},'zone',[zone],false),false);
  assert.equal(availableZones({coat:0,bag:1,backpack:0},[zone]).length,0);
  assert.equal(availableZones({coat:1,bag:0,backpack:0},[{...zone,occupied:2}]).length,0);
  assert.equal(availableZones({coat:1,bag:0,backpack:0},[{...zone,enabled:false}]).length,0);
});
test('operator store never requests personal belongings or silently selects an event',async()=>{
  const calls:string[]=[],event='11111111-1111-4111-8111-111111111111';
  const store=new WardrobeStore(async<T>(path:string)=>{calls.push(path);if(path==='/wardrobe/events')return [{id:event,title:'Event',canManage:true}] as T;return {eventId:event,title:'Event',zones:[],staff:[],deposits:[],audit:[],nextCursor:''} as T;},{personal:false,autoSelectFirst:false});
  await store.refresh(true);assert.deepEqual(calls,['/wardrobe/events']);assert.equal(store.snapshot().eventId,'');
  await store.change({eventId:event});assert.equal(store.snapshot().overview?.eventId,event);assert.equal(calls.includes('/wardrobe/mine'),false);
  await store.change({eventId:''});assert.equal(store.snapshot().eventId,'');assert.equal(store.snapshot().overview,undefined);store.dispose();
});
test('event captions use safe optional date/location metadata and tolerate older API responses',()=>{
  assert.equal(wardrobeEventDescription({id:'a',title:'Event',canManage:true},false),'');
  assert.equal(wardrobeEventDescription({id:'a',title:'Event',canManage:true,startTime:'bad',location:'Venue'},false),'Venue');
});
test('lookup never publishes an implicit selection while refreshing, and a changed desk discards the late result',async()=>{
  type Deposit=import('../../pulse-app/src/features/wardrobe/model').Deposit;
  const event='11111111-1111-4111-8111-111111111111',rows=[{id:'a',eventId:event,status:'reserved'},{id:'b',eventId:event,status:'stored'},{id:'c',eventId:event,status:'stored'}] as Deposit[];
  let hold=false,release:((value:unknown)=>void)|undefined;
  const overview={eventId:event,title:'Event',zones:[],staff:[],deposits:rows,audit:[],nextCursor:''};
  const store=new WardrobeStore(async<T>(path:string)=>{
    if(path==='/wardrobe/events')return [{id:event,title:'Event',canManage:true}] as T;
    if(path.endsWith('/commands'))return {deposits:rows} as T;
    if(hold)return await new Promise<T>(resolve=>{release=value=>resolve(value as T);});
    return overview as T;
  },{personal:false,autoSelectFirst:false});
  await store.change({eventId:event});const published:(string|undefined)[]=[];store.subscribe(()=>published.push(store.snapshot().selected?.id));
  hold=true;const pending=store.command({action:'lookup',code:'glow://friend/'+event});await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release);assert.equal(store.snapshot().selected,undefined);assert.equal(published.some(Boolean),false);
  release!(overview);assert.equal((await pending)?.deposits?.length,3);assert.equal(published.some(Boolean),false);
  const stale=store.command({action:'lookup',code:'glow://friend/'+event});await new Promise(resolve=>setImmediate(resolve));
  store.select();release!(overview);assert.equal(await stale,null,'A newer operation invalidates the old lookup before its caller can publish it');store.dispose();
});
