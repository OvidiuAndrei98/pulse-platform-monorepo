// Read-only local reference inspection. The source recording is never changed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {withBrowser}=require('./browser-harness.cjs');
const file=process.argv[2]||'D:/CHROME DOWNLOADS/group party/ScreenRecording_11-15-2026 20-44-26_1.mp4';
const total=fs.statSync(file).size,output=path.resolve(__dirname,'../artifacts',process.argv[3]||'chat-reference-contact-sheet.png');
const server=http.createServer((req,res)=>{
 if(req.url!=='/reference.mp4'){res.setHeader('content-type','text/html');res.end('<!doctype html><video id="video" muted preload="auto" src="/reference.mp4"></video><canvas id="frames"></canvas>');return}
 const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(total-1,Number(match[2])):total-1;
 res.writeHead(match?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(match?{'content-range':`bytes ${start}-${end}/${total}`}:{})});fs.createReadStream(file,{start,end}).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await withBrowser(async({call,evaluate,until})=>{
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await until('document.getElementById("video")?.readyState>=2',30000);
  const metadata=await evaluate('({duration:video.duration,width:video.videoWidth,height:video.videoHeight})'),times=Array.from({length:16},(_,i)=>Math.min(metadata.duration-.1,i*(metadata.duration-.1)/15));
  await evaluate('window.qaCanvas=document.getElementById("frames");qaCanvas.width=4*256;qaCanvas.height=4*580;window.context=qaCanvas.getContext("2d");context.fillStyle="#111";context.fillRect(0,0,qaCanvas.width,qaCanvas.height)');
  for(let i=0;i<times.length;i++){const time=times[i];await evaluate(`(async()=>{if(Math.abs(video.currentTime-${time})>.001)await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error('Reference video decode failed'));video.currentTime=${time}});const x=${i%4}*256,y=${Math.floor(i/4)}*580;context.drawImage(video,x,y,256,556);context.fillStyle='#fff';context.font='14px system-ui';context.fillText('${time.toFixed(2)} s',x+8,y+575)})()`)}
  const image=await evaluate('qaCanvas.toDataURL("image/png")');fs.writeFileSync(output,Buffer.from(image.split(',')[1],'base64'));fs.writeFileSync(output.replace('.png','.json'),JSON.stringify({source:path.basename(file),metadata,times},null,2));console.log('Read reference recording',metadata,'contact sheet',output);
 });
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>server.close());
