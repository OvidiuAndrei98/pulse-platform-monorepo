// Read-only inventory: every Next route and Native screen, plus its transitive
// local UI dependencies and shared shells. Candidates are not WCAG findings.
const fs=require('node:fs'),path=require('node:path'),ts=require('../apps/pulse-app/node_modules/typescript');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/pulse-app/src'),native=path.join(root,'apps/spottr-native/src'),app=path.join(web,'app');
const slash=file=>path.relative(root,file).replaceAll('\\','/');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const sources=[...files(web),...files(native)].filter(file=>/\.tsx?$/.test(file)),cache=new Map();
const shared=new Set(['ActionButton','ActionLink','IconButton','UIActionButton','UIActionLink','UIInput','UITextArea','Input','TextArea','Field','SharedField','Surface','PageHeader','StatusNotice','ThemedSelect','DashboardDropdown','ModalFrame','ModalHeader','AppModal']);
function inspect(file){
 if(cache.has(file))return cache.get(file);
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),imports=[],flags=[],ui={buttons:0,fields:0,dialogs:0,headings:0,shared:0};
 function visit(node){
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
   const spec=node.moduleSpecifier.text,base=spec.startsWith('@/')?path.join(web,spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(file),spec):null;
   if(base){const resolved=[base+'.tsx',base+'.ts',base+'/index.tsx',base+'/index.ts',base].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());if(resolved&&/\.tsx?$/.test(resolved)&&(resolved.startsWith(web)||resolved.startsWith(native)))imports.push(resolved);}
  }
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(tree),attrs=node.attributes.properties.filter(ts.isJsxAttribute),attr=name=>attrs.find(a=>a.name.getText(tree)===name),text=name=>attr(name)?.initializer?.getText(tree)??'';
   if(['button','Pressable'].includes(tag))ui.buttons++;
   if(['input','textarea','TextInput','FormInput','Input','TextArea','UIInput','UITextArea'].includes(tag))ui.fields++;
   if(['dialog','Modal','AppSheet','AppModal','ModalFrame'].includes(tag)||/dialog/.test(text('role')))ui.dialogs++;
   if(/^h[1-6]$/.test(tag)||/header/.test(text('accessibilityRole')))ui.headings++;
   if(shared.has(tag))ui.shared++;
   if(['input','textarea','UIInput','UITextArea','TextInput','FormInput'].includes(tag)&&!['id','aria-label','aria-labelledby','accessibilityLabel'].some(attr))flags.push({line:tree.getLineAndCharacterOfPosition(node.getStart()).line+1,kind:'field-label-context',status:'candidate'});
  }ts.forEachChild(node,visit);
 }visit(tree);
 const result={file:slash(file),imports,ui,flags};cache.set(file,result);return result;
}
sources.forEach(inspect);
const entries=sources.filter(file=>file.startsWith(app)&&path.basename(file)==='page.tsx'||file.startsWith(native)&&/Screen\.tsx$/.test(file)),nativeEntries=new Set(entries.filter(file=>file.startsWith(native)));
function closure(start,stop=new Set()){
 const seen=new Set();function walk(file){if(seen.has(file)||stop.has(file))return;seen.add(file);inspect(file).imports.forEach(walk);}start.forEach(walk);return [...seen];
}
function layouts(file){const result=[];for(let dir=path.dirname(file);dir.startsWith(app);dir=path.dirname(dir)){const layout=path.join(dir,'layout.tsx');if(fs.existsSync(layout))result.push(layout);}return result.reverse();}
const nativeShell=closure([path.join(native,'App.tsx')],nativeEntries);
const matrix=entries.map(file=>{
 const platform=file.startsWith(web)?'web':'native',shellEntries=platform==='web'?layouts(file):[path.join(native,'App.tsx')],owned=closure([file]),shell=platform==='web'?closure(shellEntries):nativeShell,all=[...new Set([...owned,...shell])],dependencies=all.map(inspect),ownedUI=owned.map(inspect).filter(item=>Object.values(item.ui).some(Boolean));
 return {entry:slash(file),platform,route:platform==='web'?'/'+path.relative(app,path.dirname(file)).replaceAll('\\','/'):null,shellEntries:shellEntries.map(slash),ownedUISources:ownedUI.map(item=>item.file),sharedShellUISources:shell.map(inspect).filter(item=>Object.values(item.ui).some(Boolean)).map(item=>item.file),ui:dependencies.reduce((all,item)=>Object.fromEntries(Object.keys(all).map(key=>[key,all[key]+item.ui[key]])),{buttons:0,fields:0,dialogs:0,headings:0,shared:0}),candidateCount:dependencies.reduce((n,item)=>n+item.flags.length,0)};
});
const logicalViews={nativeDashboard:['overview','events','new','edit','finance','invoicing','profile','purchases','promotions','company','agreement','stripe-info','wardrobe'],nativeAdmin:['overview','organizers','verifications','cancellations','refunds','invoices','commissions','errors'],nativeProfile:['home','details','password','language'],nativeFeed:['feed','friends'],validation:['event-list','scan','history','configuration','staff'],wardrobe:['event-list','receive','pickup','settings']};
const report={scope:'Source scan, not a runtime/accessibility certification',sourceCount:sources.length,entries:matrix,logicalViews,overlaySources:[...cache.values()].filter(item=>item.ui.dialogs).map(({file,ui})=>({file,dialogs:ui.dialogs})),candidates:[...cache.values()].filter(item=>item.flags.length).map(({file,flags})=>({file,flags}))};
if(process.argv.includes('--write')){const target=path.join(root,'docs/interface-coverage.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log('Wrote '+slash(target));}
else if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else console.log(matrix.map(item=>item.platform+' | '+(item.route??item.entry)+' | '+item.ownedUISources.length+' owned UI sources | '+item.sharedShellUISources.length+' shell UI sources | '+item.candidateCount+' candidates').join('\n')+'\nSources: '+sources.length+'; web routes: '+matrix.filter(row=>row.platform==='web').length+'; native screens: '+matrix.filter(row=>row.platform==='native').length);
