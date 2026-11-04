const assert = require('node:assert/strict'), test = require('node:test');
const {hooks, modules, find, deferred} = require('./helpers/qaHarness.cjs');

test('restored browser credentials remain editable until an explicit submit', async () => {
  const h=hooks(),effects=[],requests=[];let filled;
  const react={...h.react,Suspense:'Suspense',useEffect:fn=>effects.push(fn)};
  const provider={loading:false,user:null,login:async(...values)=>{requests.push(values);}};
  const {default:Page}=modules({react,'next/image':{default:'img'},'next/link':{default:'a'},
    '@/components/BackLink':{BackLink:'a'},'@/lib/native/navigation':{routeForPlatform:v=>v},
    'next/navigation':{useRouter:()=>({replace(){}}),useSearchParams:()=>new URLSearchParams('?activation=success')},'@/core/DataProviderContext':{useDataProvider:()=>provider},
    '@/components/auth/GoogleSignInButton':{GoogleSignInButton:'Google'},'react-i18next':{useTranslation:()=>({t:key=>key})},
    '@packages/api-client/client':{ApiError:class extends Error{}},'@/components/ui/ActionButton':{ActionButton:'button'},'@/components/ui/Field':{Input:'input'},
    '@packages/browser-core/auth/credentialFill':{
      completeCredentials:values=>values.email.includes('@')&&values.password.length>0,
      watchBrowserCredentialFill:(_email,_password,callback)=>{filled=callback;return()=>{};},
    },
  },{URLSearchParams,window:{location:{search:'?activation=success'}}}).load('app/login/page.tsx');
  const Login=Page().props.children.type;
  let tree=h.render(Login);
  const email=find(tree,n=>n.props?.id==='email'),password=find(tree,n=>n.props?.id==='password');
  email.props.ref.current={value:'saved@example.test'};password.props.ref.current={value:'saved-fixture-only'};
  for(const effect of effects.splice(0))effect();
  filled({email:'saved@example.test',password:'saved-fixture-only'});
  tree=h.render(Login);
  find(tree,n=>n.props?.id==='email').props.onChange({target:{value:'different@example.test'}});
  find(tree,n=>n.props?.id==='password').props.onChange({target:{value:'changed-fixture-only'}});
  email.props.ref.current.value='different@example.test';password.props.ref.current.value='changed-fixture-only';
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.deepEqual(requests,[],'Autofill, restore and editing cannot trigger login');
  tree=h.render(Login);await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.deepEqual(requests,[['different@example.test','changed-fixture-only']]);
});

test('Next login submits DOM autofill values, guards duplicate Enter and permits explicit retry', async () => {
  const h = hooks(), requests = [], task = deferred();
  const provider = {loading:false,user:null,login:(...values)=>{ requests.push(values); return task.promise; }};
  const {default:Page} = modules({react:{...h.react,Suspense:'Suspense'},'next/image':{default:'img'},'next/link':{default:'a'},
    '@/components/BackLink':{BackLink:'a'},'@/lib/native/navigation':{routeForPlatform:v=>v},
    'next/navigation':{useRouter:()=>({replace:()=>{}}),useSearchParams:()=>new URLSearchParams('?activation=success')},'@/core/DataProviderContext':{useDataProvider:()=>provider},
    '@/components/auth/GoogleSignInButton':{GoogleSignInButton:'Google'},'react-i18next':{useTranslation:()=>({t:key=>key})},
    '@packages/api-client/client':{ApiError:class extends Error{}},
    '@/components/ui/ActionButton':{ActionButton:'button'},'@/components/ui/Field':{Input:'input'},
  },{URLSearchParams,window:{location:{search:'?activation=success'}}}).load('app/login/page.tsx');
  const Login=Page().props.children.type;
  let tree = h.render(Login);
  const email = find(tree,n=>n.props?.id==='email'), password = find(tree,n=>n.props?.id==='password');
  email.props.ref.current = {value:' person@example.test '}; password.props.ref.current = {value:'fixture-only',focus:()=>{}};
  const submit = find(tree,n=>n.type==='form').props.onSubmit;
  let prevented = 0;
  const first = submit({preventDefault:()=>prevented++});
  await submit({preventDefault:()=>prevented++});
  assert.equal(prevented,2); assert.deepEqual(requests,[['person@example.test','fixture-only']]);
  task.reject(new Error('rejected')); await first;
  tree = h.render(Login); assert.ok(find(tree,n=>n.props?.role==='alert'));
  await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(requests.length,2,'Explicit Enter can retry after failure');
  h.unmount();
});

test('login returns to the intended route even before Next updates window.location',()=>{
  for(const target of ['/outings?event=00000000-0000-4000-8000-000000000004','/feed','//external.invalid']){
    const h=hooks(),redirects=[],provider={loading:false,user:null,login:async()=>{}};
    const {default:Page}=modules({react:{...h.react,Suspense:'Suspense'},'next/image':{default:'img'},'next/link':{default:'a'},
      '@/components/BackLink':{BackLink:'a'},'@/lib/native/navigation':{routeForPlatform:v=>v},
      'next/navigation':{useRouter:()=>({replace:v=>redirects.push(v)}),useSearchParams:()=>new URLSearchParams({returnTo:target})},
      '@/core/DataProviderContext':{useDataProvider:()=>provider},'@/components/auth/GoogleSignInButton':{GoogleSignInButton:'Google'},
      'react-i18next':{useTranslation:()=>({t:key=>key})},'@packages/api-client/client':{ApiError:class extends Error{}},
      '@/components/ui/ActionButton':{ActionButton:'button'},'@/components/ui/Field':{Input:'input'},
    },{URLSearchParams,window:{location:{search:'?event=old-destination'}}}).load('app/login/page.tsx');
    const Login=Page().props.children.type;h.render(Login);assert.equal(redirects.length,0);
    provider.user={properties:{role:'user'}};h.render(Login);
    assert.deepEqual(redirects,[target.startsWith('//')?'/users/me':target]);h.unmount();
  }
});
