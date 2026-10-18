const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const source=fs.readFileSync('backup.js','utf8');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhixu-backup-test-'));
const pendingKey='zhixu-local-backup-pending-v1';

function environment({storedHandle=null,pending=null,picker=true}={}){
  const memory=new Map(pending?[[pendingKey,pending]]:[]),statuses=[],timers=new Map();
  const env={payload:{tree:[],notes:[{title:'最新中文笔记',content:'<p>内容 🌳</p>'}],resources:[]},permission:'granted',requests:0,picks:0,writes:[],fail:false,gate:null,active:0,maxActive:0};
  const root=fs.mkdtempSync(path.join(temp,'case-'));
  const folderPath=path.join(root,'BeiFeng');fs.mkdirSync(folderPath);
  env.directory={
    name:'BeiFeng',
    async queryPermission(){return env.permission},
    async requestPermission(){env.requests++;return env.permission='granted'},
    async getFileHandle(filename){
      assert.equal(path.basename(filename),filename);
      return {async createWritable(){
        let contents;
        env.active++;env.maxActive=Math.max(env.maxActive,env.active);
        return {
          async write(value){contents=value;if(env.gate)await env.gate;if(env.fail)throw new Error('disk full')},
          async close(){fs.writeFileSync(path.join(folderPath,filename),contents);env.writes.push({filename,contents});env.active--},
          async abort(){env.active--}
        };
      }};
    }
  };
  const store={handle:storedHandle==='directory'?env.directory:storedHandle,async load(){return this.handle},async save(handle){this.handle=handle}};
  const window=picker?{async showDirectoryPicker(options){env.picks++;assert.equal(options.mode,'readwrite');if(env.cancel)throw Object.assign(new Error('cancel'),{name:'AbortError'});return {name:'project',async getDirectoryHandle(name,options){assert.equal(name,'BeiFeng');assert.equal(options.create,true);return env.directory}}}}:{};
  const sandbox={window,localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},Date,Blob,URL,setTimeout:fn=>{const id=Symbol();timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),console};
  const context=vm.createContext(sandbox);
  vm.runInContext(source,context);
  const Backup=vm.runInContext('LocalBackup',context);
  const manager=new Backup({getSnapshot:()=>JSON.stringify(env.payload,null,2),onStatus:message=>statuses.push(message),handleStore:store});
  return Object.assign(env,{manager,memory,statuses,timers,folderPath,context,store});
}

(async()=>{
  const env=environment();await env.manager.ready;
  assert.equal(env.picks,0);assert.equal(env.requests,0);assert.equal(env.writes.length,0);
  env.manager.markChanged();assert.ok(env.memory.has(pendingKey));
  assert.equal(await env.manager.backup(),false);assert.equal(env.picks,0);assert.equal(env.requests,0);
  assert.equal(await env.manager.export(),true);assert.equal(env.picks,1);assert.equal(env.store.handle,env.directory);
  assert.equal(env.memory.has(pendingKey),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.folderPath,env.writes[0].filename),'utf8')),env.payload);
  assert.match(env.writes[0].filename,/^知序学习笔记备份_/);
  const unchanged=env.writes.length;await env.manager.backup();assert.equal(env.writes.length,unchanged);
  env.payload.notes[0].content='<p>再次更改</p>';env.manager.markChanged();await env.manager.backup();
  const autoName=env.writes.at(-1).filename;assert.match(autoName,/^知序学习笔记自动备份_/);
  env.payload.notes[0].title='下一次修改';env.manager.markChanged();await env.manager.backup();assert.equal(env.writes.at(-1).filename,autoName);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.folderPath,autoName),'utf8')),env.payload);
  // Idle autosave invokes a write without requiring navigation.
  env.payload.notes[0].title='空闲自动备份';env.manager.markChanged();
  const idle=[...env.timers.values()].at(-1);idle();await env.manager.writeQueue;
  assert.equal(JSON.parse(env.writes.at(-1).contents).notes[0].title,'空闲自动备份');
  // Writes are serialized; edits during a write remain pending until the next write.
  let release;env.gate=new Promise(resolve=>release=resolve);
  env.payload.notes[0].title='写入中的版本';env.manager.markChanged();const first=env.manager.backup();
  while(!env.active)await new Promise(resolve=>setImmediate(resolve));
  env.payload.notes[0].title='写入期间新增修改';env.manager.markChanged();const second=env.manager.backup();
  release();await Promise.all([first,second]);env.gate=null;
  assert.equal(env.maxActive,1);assert.equal(env.manager.revision,null);
  assert.equal(JSON.parse(env.writes.at(-1).contents).notes[0].title,'写入期间新增修改');
  // A failed disk write retains pending work and leaves the last valid file intact.
  const oldFile=fs.readFileSync(path.join(env.folderPath,autoName),'utf8');
  env.fail=true;env.payload.notes[0].title='待恢复的修改';env.manager.markChanged();
  assert.equal(await env.manager.backup(),false);assert.ok(env.memory.has(pendingKey));assert.match(env.statuses.at(-1),/备份失败/);
  assert.equal(fs.readFileSync(path.join(env.folderPath,autoName),'utf8'),oldFile);
  env.fail=false;await env.manager.backup();assert.equal(env.memory.has(pendingKey),false);
  // Revoked permission never causes an automatic prompt or a false success.
  env.permission='prompt';env.manager.markChanged();const requestCount=env.requests;
  assert.equal(await env.manager.backup(),false);assert.equal(env.requests,requestCount);assert.ok(env.manager.revision);
  assert.equal(await env.manager.export(),true);assert.equal(env.requests,requestCount+1);
  // Canceling initial folder selection preserves the pending local data.
  const canceled=environment();await canceled.manager.ready;canceled.manager.markChanged();canceled.cancel=true;
  assert.equal(await canceled.manager.export(),false);assert.equal(canceled.writes.length,0);assert.ok(canceled.memory.has(pendingKey));
  // Startup resumes a previously interrupted backup only with existing permission.
  const resumed=environment({storedHandle:'directory',pending:'previous-session'});await resumed.manager.ready;await resumed.manager.writeQueue;
  assert.equal(resumed.writes.length,1);assert.equal(resumed.picks,0);assert.equal(resumed.requests,0);
  assert.equal(resumed.memory.has(pendingKey),false);
  // Integration: actual save/renderHome flushes pending editor text before exporting.
  const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
  assert.ok(!/cloudSyncBtn|openCloudModal|api\.jsonbin\.io/.test(app+html));
  assert.ok(html.indexOf('src="backup.js')<html.indexOf('src="app.js'));
  const nodes=new Map();const byId=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}},querySelectorAll:()=>[]});return nodes.get(id)};
  const runtime=environment({storedHandle:'directory'});await runtime.manager.ready;
  Object.assign(runtime.context,{STORAGE_KEY:'zhixu-study-space-v1',state:{tree:[],notes:[{id:'one',title:'旧标题',content:'<p>旧正文</p>',updatedAt:'2026-10-18T00:00:00Z'}]},currentId:'one',view:'editor',searchTimer:null,byId,updateStats(){},renderTree(){},renderMap(){},renderResources(){},formatDate:v=>v,now:()=>new Date().toISOString()});
  for(const name of ['current','syncNote','flushEditor','backupContent','markBackupChanged','save','renderHome']){
    const start=app.indexOf('function '+name+'('),next=app.indexOf('\nfunction ',start+1);
    const last=app.indexOf('\nlet observedBackupContent=',start);
    const end=last>=0&&(next<0||last<next)?last:next;
    vm.runInContext(app.slice(start,end),runtime.context);
  }
  runtime.context.manager=runtime.manager;
  vm.runInContext('const localBackup=manager;let observedBackupContent=backupContent()',runtime.context);
  runtime.manager.getSnapshot=()=>JSON.stringify(runtime.context.state);
  byId('noteTitle').value='立即离开前的新标题';byId('editor').innerHTML='<p>最后一次输入</p>';
  vm.runInContext('renderHome()',runtime.context);await runtime.manager.writeQueue;
  assert.equal(JSON.parse(runtime.writes.at(-1).contents).notes[0].content,'<p>最后一次输入</p>');
  console.log('PASS: BeiFeng JSON writes; manual and idle backup; no-change skip; serialized latest edits; failed-write recovery; canceled/revoked permission; silent startup recovery; editor navigation; cloud UI disabled.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('zhixu-backup-test-'));fs.rmSync(resolved,{recursive:true,force:true})});
