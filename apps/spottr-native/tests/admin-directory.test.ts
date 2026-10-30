import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectoryPage,parseDirectoryDetail,organizerIssues,isOrganizerId } from '../../pulse-app/src/features/admin/organizers';
import { adminSection,adminHref,adminSections } from '../../pulse-app/src/features/admin/navigation';
import { createAdminApi } from '../src/admin/data';
import { createHttp } from '../src/data/http';

const id='11111111-1111-4111-8111-111111111111';
const item={userId:id,companyName:'Legal Company',cui:'12345678',username:'organizer',email:'company@example.invalid',verificationStatus:'approved',accountActive:true,stripeStatus:'active',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'};
const detail={...item,fiscalAddress:'Fiscal address',verifiedAt:'',stripeAccountId:'acct_public_identifier',stripeChargesEnabled:true,stripePayoutsEnabled:true,stripeDetailsSubmitted:true,agreementVersion:'2026-10-18',agreementAcceptedAt:'',standard:{rateBps:400,perTicketBani:250,revision:1},commissionOverride:null,commissionRevision:0,eventCount:2,upcomingCount:1,liveRefundsAttention:1,testRefundsAttention:2,unknownRefundsAttention:3,recentEvents:[{id,title:'Event A',startTime:'2026-11-01T10:00:00Z',status:'published',location:'Venue'}]};

test('directory reconstructs allowlisted public admin fields, with strict pages and no credential spill',()=>{
  const parsed=parseDirectoryPage({items:[{...item,passwordHash:'never-export',stripeAccountId:'not-on-directory'}],nextCursor:''});
  assert.equal(parsed.items[0]!.companyName,'Legal Company');assert.equal(JSON.stringify(parsed).includes('never-export'),false);assert.equal(JSON.stringify(parsed).includes('stripeAccountId'),false);
  for(const value of [{items:Array(26).fill(item),nextCursor:''},{items:[{...item,userId:'bad'}],nextCursor:''},{items:[{...item,accountActive:1}],nextCursor:''},{items:[],nextCursor:'company@example.invalid'}])assert.throws(()=>parseDirectoryPage(value));
  assert.equal(isOrganizerId('private@example.invalid'),false);
});
test('detail preserves revisioned terms and separates issues without attributing anonymous errors',()=>{
  const parsed=parseDirectoryDetail({...detail,passwordHash:'never-export',credentialsEncrypted:'never-export',errors:[{message:'never-export'}]});
  assert.equal(parsed.standard.rateBps,400);assert.equal(parsed.commissionRevision,0);assert.equal(JSON.stringify(parsed).includes('never-export'),false);
  assert.deepEqual(organizerIssues(parsed,false),['Live refunds to review: 1','Test refunds to review: 2','Refunds with unverified environment: 3']);
  for(const patch of [{eventCount:-1},{eventCount:Infinity},{commissionRevision:-1},{standard:{rateBps:20000,perTicketBani:0,revision:1}},{recentEvents:Array(21).fill(detail.recentEvents[0])}])assert.throws(()=>parseDirectoryDetail({...detail,...patch}));
});
test('admin navigation has stable pages and rejects unrecognized sections',()=>{
  assert.equal(adminSection('private@example.invalid'),'overview');assert.equal(adminHref('overview'),'/admin');assert.equal(new Set(adminSections.map(adminHref)).size,adminSections.length);
});
test('directory search stays in a bounded POST body and non-admin callers never reach the network',async()=>{
  const calls:{url:string;options:RequestInit}[]=[];
  let role='admin';const http=createHttp('https://mock/api/v1',async(input,options)=>{calls.push({url:String(input),options:options!});return new Response(JSON.stringify(String(input).endsWith(id)?detail:{items:[item],nextCursor:''}));});
  const api=createAdminApi(http,()=>({role,token:'test-only'}));
  await api.directory({search:'company@example.invalid',status:'all',after:''});
  assert.equal(calls[0]!.options.method,'POST');assert.equal(calls[0]!.url.includes('company@example'),false);assert.equal(JSON.parse(String(calls[0]!.options.body)).search,'company@example.invalid');
  await api.detail(id);assert.equal(calls.length,2);
  role='organizer';await assert.rejects(api.directory({search:'',status:'all',after:''}));await assert.rejects(api.detail(id));assert.equal(calls.length,2);
});
