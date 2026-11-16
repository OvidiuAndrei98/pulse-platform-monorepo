import assert from 'node:assert/strict';
import test from 'node:test';
import {groupSharedEventReferences} from '../src/social/groupPresentation';
import type {GroupMessage} from '../src/social/groups';

const event={id:'party',title:'After Dark'};
const message=(id:string,outingId?:string,referenceMessageId?:string)=>({id,outingId,referenceMessageId,event,eventId:event.id,senderId:'author-'+id,username:'Name '+id,createdAt:'2026-11-16T20:00:00Z',seq:1,kind:'event',content:'Original '+id}) as GroupMessage;

test('the collection prefers the original author and source over a newer explicit alias',()=>{
 const source=message('original','outing','original'),alias=message('alias','outing','original');
 for(const order of [[alias,source],[source,alias]])assert.deepEqual(groupSharedEventReferences(order),[source]);
 assert.equal(alias.senderId,'author-alias','Projection never rewrites the raw alias author');
});
test('separate outings and references retain separate collection entries for the same event',()=>{
 const one=message('one','outing-one','one'),two=message('two','outing-two','two'),otherReference=message('three','outing-one','three');
 assert.deepEqual(groupSharedEventReferences([one,two,otherReference]),[one,two,otherReference]);
});
test('unbound shares remain separate, including when the event has an active outing reference',()=>{
 const first=message('first'),second=message('second'),bound=message('bound','outing','bound');
 assert.deepEqual(groupSharedEventReferences([first,second,bound]),[first,second,bound]);
});
test('an unloaded original is never invented or attributed to another author',()=>{
 const alias=message('alias','outing','source-not-loaded');
 assert.deepEqual(groupSharedEventReferences([alias]),[alias]);assert.equal(alias.content,'Original alias');
});
