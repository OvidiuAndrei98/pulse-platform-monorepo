import type {GroupsStore} from '@packages/app-core/social/groups';
import type {NightDraft} from './GroupDialogs';
// An optional event selection is navigation, not a write. Keep only this local
// draft across those two routes, scoped to the authenticated store instance.
const drafts=new WeakMap<GroupsStore,Map<string,NightDraft>>();
export function nightDraft(store:GroupsStore,groupId:string){return drafts.get(store)?.get(groupId)}
export function saveNightDraft(store:GroupsStore,groupId:string,draft:NightDraft){let rows=drafts.get(store);if(!rows){rows=new Map();drafts.set(store,rows)}rows.set(groupId,draft)}
export function clearNightDraft(store:GroupsStore,groupId:string){drafts.get(store)?.delete(groupId)}
