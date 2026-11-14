import {GroupsStore} from '@packages/app-core/social/groups';
let session:{key:string;store:GroupsStore}|undefined;
export function clearGroupSession(){session?.store.dispose();session=undefined;}
export function sessionGroupStore(key:string,create:()=>GroupsStore){
 if(session?.key===key)return session.store;
 const previous=session?.store;const store=create();session={key,store};
 // Session changes can render several consumers together. The old store's
 // current-account guard is already false; notify its consumers after render.
 if(previous)queueMicrotask(()=>previous.dispose());return store;
}
