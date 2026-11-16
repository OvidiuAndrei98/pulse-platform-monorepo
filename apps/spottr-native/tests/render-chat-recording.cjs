// Encode captured Chrome frames at their measured timestamps. This is browser
// navigation footage, not a recording of native keyboard gestures or frame rate.
const fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('./browser-harness.cjs');
const phase=process.argv[2]||'after',family=process.argv[3]||'chat-audit';
if(!['chat-audit','chat-return','chat-card-date','groups-16nov'].includes(family))throw Error('Unknown local QA recording family');
const dir=path.resolve(__dirname,'../artifacts/'+family+'-'+phase+'-recording');
const source=JSON.parse(fs.readFileSync(path.join(dir,'frames.json'),'utf8'));
const first=source.frames[0].timestamp;
const frames=source.frames.map(frame=>({time:(frame.timestamp-first)*1000,data:'data:image/jpeg;base64,'+fs.readFileSync(path.join(dir,frame.file)).toString('base64')}));
withBrowser(async({call,evaluate})=>{
 await call('Page.navigate',{url:'about:blank'});
 await evaluate(`window.__recordingReady=false;void(async()=>{
  const frames=${JSON.stringify(frames)},images=await Promise.all(frames.map(frame=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=frame.data}))),canvas=document.createElement('canvas');
  canvas.width=images[0].width;canvas.height=images[0].height;document.body.append(canvas);const ctx=canvas.getContext('2d'),stream=canvas.captureStream(30),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1000000}),done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}))}});
  ctx.drawImage(images[0],0,0);recorder.start();const started=performance.now();
  for(let i=1;i<frames.length;i++){await new Promise(resolve=>setTimeout(resolve,Math.max(0,frames[i].time-(performance.now()-started))));ctx.drawImage(images[i],0,0)}
  await new Promise(resolve=>setTimeout(resolve,600));recorder.stop();const result=await done;stream.getTracks().forEach(track=>track.stop());window.__recordingResult=result;window.__recordingReady=true;
 })()`);
 const deadline=Date.now()+180000;while(!await evaluate('window.__recordingReady')){if(Date.now()>deadline)throw Error('Recording encoding timeout');await new Promise(resolve=>setTimeout(resolve,400))}const encoded=await evaluate('window.__recordingResult');
 fs.writeFileSync(path.join(dir,'continuous-browser.webm'),Buffer.from(encoded.split(',')[1],'base64'));
 const title=family==='groups-16nov'?'Share event ? Propose ? No ? Tickets ? drag ? return to chat':family==='chat-return'?'Chat → event selector → Back / share':family==='chat-card-date'?'Event cards and working date selection':'Chat → outing → chat → send';
 fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><title>SPOTTR chat browser QA</title><style>body{background:#111;color:#eee;font:15px system-ui;max-width:650px;margin:24px auto}video{width:390px;max-width:100%;display:block;margin:auto}p{line-height:1.5}</style><h1>'+title+'</h1><p>Continuous Chrome CDP capture with isolated fixture data. Frames replay at their captured timestamps. This does not verify iOS keyboard gestures, Liquid Glass or device performance.</p><video controls playsinline src="continuous-browser.webm"></video>');
 console.log('Recorded browser video:',path.join(dir,'continuous-browser.webm'),frames.length,'captured frames');
}).catch(error=>{console.error(error);process.exitCode=1});
