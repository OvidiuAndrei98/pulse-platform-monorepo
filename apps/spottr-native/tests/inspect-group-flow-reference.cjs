// Decode a local reference recording at a regular interval across its complete
// duration. This is evidence extraction, never a claim of reproducing its bugs.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {withBrowser}=require('./browser-harness.cjs');
const file=process.argv[2],prefix=process.argv[3]||'group-flow-reference',interval=Number(process.argv[4]||1);
if(!file||!Number.isFinite(interval)||interval<=0)throw Error('video path and positive interval required');
const total=fs.statSync(file).size,dir=path.resolve(__dirname,'../artifacts',prefix);fs.mkdirSync(dir,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url!=='/reference.mp4'){res.setHeader('content-type','text/html');res.end('<!doctype html><video id="video" muted preload="auto" src="/reference.mp4"></video><canvas id="frames"></canvas>');return}
 const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(total-1,Number(match[2])):total-1;
 res.writeHead(match?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(match?{'content-range':`bytes ${start}-${end}/${total}`}:{})});fs.createReadStream(file,{start,end}).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await withBrowser(async({call,evaluate,until})=>{
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await until('video.readyState>=2',30000);
  const metadata=await evaluate('({duration:video.duration,width:video.videoWidth,height:video.videoHeight})');
  const times=process.env.FLOW_FRAME_TIMES?process.env.FLOW_FRAME_TIMES.split(',').map(Number):Array.from({length:Math.ceil(metadata.duration/interval)},(_,i)=>Math.min(metadata.duration-.05,i*interval));
  if(times.at(-1)<metadata.duration-.06&&!process.env.FLOW_FRAME_TIMES)times.push(metadata.duration-.05);
  const tileWidth=Number(process.env.FLOW_FRAME_WIDTH||256),columns=tileWidth===512?2:4,sheetSize=columns*4,tileHeight=Math.round(tileWidth*metadata.height/metadata.width),rowHeight=tileHeight+24,sheets=[];
  for(let base=0;base<times.length;base+=sheetSize){
   const slice=times.slice(base,base+sheetSize),rows=Math.ceil(slice.length/columns);
   await evaluate(`window.qaCanvas=document.getElementById('frames');qaCanvas.width=${columns*tileWidth};qaCanvas.height=${rows*rowHeight};window.ctx=qaCanvas.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,qaCanvas.width,qaCanvas.height)`);
   for(let i=0;i<slice.length;i++){
    const time=slice[i];
    await evaluate(`(async()=>{if(Math.abs(video.currentTime-${time})>.001)await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error('Reference decode failed'));video.currentTime=${time}});const x=${i%columns}*${tileWidth},y=${Math.floor(i/columns)}*${rowHeight};ctx.drawImage(video,x,y,${tileWidth},${tileHeight});ctx.fillStyle='#fff';ctx.font='14px system-ui';ctx.fillText('${time.toFixed(2)} s',x+8,y+${rowHeight-5})})()`);
   }
   const file='contact-'+String(sheets.length+1).padStart(2,'0')+'.png',image=await evaluate('qaCanvas.toDataURL("image/png")');
   fs.writeFileSync(path.join(dir,file),Buffer.from(image.split(',')[1],'base64'));sheets.push({file,times:slice});
  }
  fs.writeFileSync(path.join(dir,'frames.json'),JSON.stringify({source:path.basename(file),metadata,interval,sheets},null,2));console.log(JSON.stringify({metadata,samples:times.length,sheets:sheets.length,dir}));
 });
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>server.close());
