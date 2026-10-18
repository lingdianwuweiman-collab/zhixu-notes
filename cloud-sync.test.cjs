const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const cloud=source.slice(source.indexOf('const CLOUD_CFG_KEY='),source.indexOf("byId('cloudSyncBtn').onclick="));
const memory=new Map(),requests=[],nodes=new Map();let responder;
const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],querySelector:s=>element(s)});return nodes.get(id)};
const context=vm.createContext({Blob,Response,CompressionStream,DecompressionStream,Uint8Array,btoa,atob,STORAGE_KEY:'zhixu-study-space-v1',localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},byId:element,normalizeTreeTypes:()=>{},defaultResources:()=>[],setTimeout,clearTimeout,AbortController,URL,location:{href:'https://example.test/'},history:{replaceState(){}},window:{confirm:()=>true,scrollTo(){}},escapeHtml:v=>v,modal(){},closeModal(){},renderTree(){},renderMap(){},renderResources(){},renderStartDanmaku(){},updateStats(){},renderTags(){},renderOutline(){},toast(){},formatDate:v=>v,now:()=>new Date().toISOString(),save(){memory.set('zhixu-study-space-v1',JSON.stringify(context.state))},currentId:null,searchTimer:null,fetch:async(url,options)=>{requests.push({url,options});return responder(url,options)}});
vm.runInContext(cloud,context);
for(const name of ['current','syncNote','renderHome','openNote']){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),context)}
const run=code=>vm.runInContext(code,context),id='6a86e78bf5f4af5e292cc515';
const note=(id,title)=>({id,parentId:'folder',title,content:'<p>old</p>',tags:['学习'],updatedAt:'2026-10-18T00:00:00Z'});
const data=()=>({tree:[{id:'folder',name:'学习',type:'folder',children:[]}],notes:[note('a','旧标题'),note('b','第二篇')],todos:[],resources:[]});
const json=value=>({ok:true,status:200,json:async()=>structuredClone(value)});
function server(){let stored;responder=async(url,options)=>{if(options.method==='POST'||options.method==='PUT'){stored=JSON.parse(options.body);return json({record:stored,metadata:options.method==='POST'?{id}:{parentId:id}})}return json({record:stored,metadata:{id}})}}
(async()=>{
assert.equal(run("validBinId('undefined')"),false);
server();context.payload=JSON.stringify(data());assert.equal(await run("uploadCloudData('', 'test-key', payload)"),id);assert.equal(requests.at(-2).options.headers['X-Bin-Private'],'true');assert.equal(requests.at(-1).options.cache,'no-store');
assert.equal(await run(`uploadCloudData('${id}', 'test-key', payload)`),id);assert.equal(requests.at(-2).options.method,'PUT');assert.equal(requests.at(-2).options.headers['X-Bin-Versioning'],'true');
responder=async()=>json({record:data(),metadata:{id:'undefined'}});await assert.rejects(run("uploadCloudData('', 'test-key', payload)"));
responder=async(url,o)=>json({record:o.method?JSON.parse(o.body):{...data(),notes:[]},metadata:{parentId:id}});await assert.rejects(run(`uploadCloudData('${id}', 'test-key', payload)`),/不一致/);
responder=async()=>json({record:{...data(),notes:[]},metadata:{parentId:id}});await assert.rejects(run(`uploadCloudData('${id}', 'test-key', payload)`),/上传响应内容/);
responder=async()=>({ok:false,status:401,json:async()=>({message:'Invalid key'})});await assert.rejects(run("cloudRequest('', 'test-key')"),/401.*Invalid key/);
responder=async()=>({ok:true,status:200,json:async()=>{throw Error('bad json')}});await assert.rejects(run("cloudRequest('', 'test-key')"),/JSON/);
assert.throws(()=>run('validateCloudData({tree:[],notes:[{}]})'));
// Regression: edit and immediately navigate home or another note before debounce.
context.state=data();context.currentId='a';element('noteTitle').value='刚改的标题';element('editor').innerHTML='<p>刚编辑的内容</p>';run('renderHome()');assert.equal(context.state.notes[0].title,'刚改的标题');assert.equal(context.state.notes[0].content,'<p>刚编辑的内容</p>');
run("openNote('a')");element('editor').innerHTML='<p>立刻切换前的修改</p>';run("openNote('b')");assert.equal(context.state.notes[0].content,'<p>立刻切换前的修改</p>');
// Exercise actual upload/download button handlers with a realistic mock server.
context.currentId='a';element('noteTitle').value='最新版本';element('editor').innerHTML='<p>最新正文</p>';run('openCloudModal()');element('cloudApiKey').value='test-key';element('cloudBinId').value=id;server();await element('cloudUpload').onclick();assert.match(element('cloudStatus').textContent,/核对一致/);
// Repeated uploads, including a cleared input, must update the same Bin.
element('cloudBinId').value='';await element('cloudUpload').onclick();assert.equal(requests.at(-2).options.method,'PUT');assert.equal(requests.at(-2).url,'https://api.jsonbin.io/v3/b/'+id);assert.equal(element('cloudBinId').value,id);
assert.ok(!source.includes('cloudNewBin'));
const uploaded=JSON.parse(requests.at(-2).options.body);assert.equal(uploaded.notes[0].content,'<p>最新正文</p>');
element('editor').innerHTML='<p>尚未上传的另一次编辑</p>';await element('cloudDownload').onclick();assert.deepEqual(JSON.parse(JSON.stringify(context.state)),uploaded);assert.equal(JSON.parse(memory.get('zhixu-before-cloud-download-v1')).notes[0].content,'<p>尚未上传的另一次编辑</p>');assert.equal(context.currentId,null);
context.window.confirm=()=>false;const before=JSON.stringify(context.state);await element('cloudDownload').onclick();assert.equal(JSON.stringify(context.state),before);assert.match(element('cloudStatus').textContent,/取消/);assert.equal(element('cloudDownload').disabled,false);
// Failed read-back must not claim success, and must retain a newly created ID.
context.window.confirm=()=>true;run("cloudConfig.binId='';openCloudModal()");element('cloudApiKey').value='test-key';element('cloudBinId').value='';
responder=async(url,o)=>{if(o.method==='POST')return json({record:JSON.parse(o.body),metadata:{id}});throw Error('Network unavailable')};
await element('cloudUpload').onclick();assert.match(element('cloudStatus').textContent,/未确认成功/);assert.equal(element('cloudBinId').value,id);assert.equal(element('cloudUpload').disabled,false);
// Checkbox DOM properties must be serialized as attributes before taking a snapshot.
context.state=data();context.currentId='a';element('noteTitle').value='旧标题';const editor=element('editor');editor.innerHTML='<p>old</p>';
editor.querySelectorAll=()=>[{checked:true,toggleAttribute(name,value){if(value)editor.innerHTML='<input type="checkbox" checked>'}}];run('flushEditor()');assert.match(context.state.notes[0].content,/checked/);
// Over-100KB notes are compressed and restored exactly, including embedded images.
const {randomBytes}=require('node:crypto');const large=data();large.notes[0].content='<p>'+('中文笔记与 emoji 🌳'.repeat(12000))+'</p><img src="data:image/png;base64,'+randomBytes(32000).toString('base64')+'">';
context.largePayload=JSON.stringify(large);assert.ok(Buffer.byteLength(context.largePayload)>100000);server();await run(`uploadCloudData('${id}', 'test-key', largePayload)`);
const encoded=JSON.parse(requests.at(-2).options.body);assert.equal(encoded.format,'zhixu-gzip-v1');assert.ok(Buffer.byteLength(requests.at(-2).options.body)<99000);
const restored=await run(`readCloudSnapshot('${id}', 'test-key')`);assert.deepEqual(JSON.parse(JSON.stringify(restored.record)),large);
// Local existing backup is used only for round-trip validation; no data is uploaded.
const backupPath='BeiFeng/知序学习笔记备份_2026-09-12.json';if(fs.existsSync(backupPath)){
  const original=JSON.parse(fs.readFileSync(backupPath,'utf8').replace(/^\uFEFF/,''));context.backupPayload=JSON.stringify(original);
  const packed=await run('packCloudData(backupPayload)');context.packedBackup=packed;assert.ok(Buffer.byteLength(JSON.stringify(packed))<99000);
  const decoded=await run('unpackCloudData(packedBackup)');assert.deepEqual(JSON.parse(JSON.stringify(decoded)),original);
  console.log('Existing backup compression verified: '+Buffer.byteLength(context.backupPayload)+' -> '+Buffer.byteLength(JSON.stringify(packed))+' bytes; no network transmission.');
}
const tooLarge=data();tooLarge.notes[0].content=randomBytes(140000).toString('base64');context.tooLargePayload=JSON.stringify(tooLarge);const callCount=requests.length;
await assert.rejects(run(`uploadCloudData('${id}', 'test-key', tooLargePayload)`),/压缩后仍/);assert.equal(requests.length,callCount);
await assert.rejects(run("unpackCloudData({format:'zhixu-gzip-v1',data:'invalid compressed data'})"),/无法还原/);
context.CompressionStream=undefined;await assert.rejects(run('packCloudData(largePayload)'),/不支持自动压缩/);context.CompressionStream=CompressionStream;
console.log('PASS: large compressed notes and images round trip; old data compatibility; corrupt gzip rejection; local capacity preflight; unsupported-browser message.');
console.log('PASS: real POST/PUT shapes; response/read-back mismatch rejection; fresh reads; immediate navigation saves; complete upload-download round trip; recovery backup; cancel; error handling.');
})().catch(e=>{console.error(e);process.exitCode=1});

