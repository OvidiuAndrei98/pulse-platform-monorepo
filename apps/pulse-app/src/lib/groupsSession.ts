import type {GroupsStore} from '@packages/app-core/social/groups';
let session:{key:string;store:GroupsStore}|undefined;
export function groupSession(key:string,create:()=>GroupsStore){
 if(session?.key===key)return session.store;
 const previous=session,store=create();session={key,store};
 // Hooks select their account-scoped instance while rendering. Notify the old
 // subscribers after that render, never from inside another component's render.
 // Its captured token/account guard already prevents publishing new responses.
 if(previous)queueMicrotask(()=>previous.store.dispose());
 return store;
}
export function clearGroupSession(){session?.store.dispose();session=undefined;}
