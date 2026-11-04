import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { clearAccountQueries } from '../src/data/sessionQueries';

test('account changes preserve public events by reference and remove every private query',()=>{
 const client=new QueryClient(),publicData={title:'Public night'};
 const publicKeys=[['home-events'],['promotions'],['events',{city:'Bucuresti'}],['event','public-event']];
 const privateKeys=[['tickets','old'],['orders','old'],['saved-events','old'],['event-social','public-event','old'],['public-profile','old','other'],['dashboard-events','old'],['admin'],['unknown'],['event','old','private'],['promotions','old']];
 for(const key of [...publicKeys,...privateKeys])client.setQueryData(key,publicData);
 clearAccountQueries(client);
 for(const key of publicKeys)assert.equal(client.getQueryData(key),publicData,'Public lists do not disappear or remount');
 for(const key of privateKeys)assert.equal(client.getQueryData(key),undefined,'Private results never survive an identity change');
 client.clear();
});

test('private requests abort while public discovery continues; a late private result cannot refill the cache',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 let privateAborted=false,publicAborted=false,finishPrivate!:(value:string)=>void,finishPublic!:(value:string)=>void;
 const privateRequest=client.fetchQuery({queryKey:['tickets','old'],queryFn:({signal})=>{signal.addEventListener('abort',()=>privateAborted=true);return new Promise<string>(resolve=>finishPrivate=resolve);}}).catch(()=>undefined);
 const publicRequest=client.fetchQuery({queryKey:['home-events'],queryFn:({signal})=>{signal.addEventListener('abort',()=>publicAborted=true);return new Promise<string>(resolve=>finishPublic=resolve);}});
 clearAccountQueries(client);
 assert.equal(privateAborted,true);assert.equal(publicAborted,false);
 finishPrivate('old account');finishPublic('public events');await Promise.all([privateRequest,publicRequest]);
 assert.equal(client.getQueryData(['tickets','old']),undefined);
 assert.equal(client.getQueryData(['home-events']),'public events');client.clear();
});
