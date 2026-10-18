// 用户选择的目录句柄保存在本机 IndexedDB；启动时只查询权限，不弹窗。
const backupHandleStore={
  async access(mode,handle){
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('zhixu-local-backup',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('settings');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('备份目录设置暂不可用'));
    });
    try{
      return await new Promise((resolve,reject)=>{
        const transaction=db.transaction('settings',mode);
        const store=transaction.objectStore('settings');
        const request=mode==='readonly'?store.get('directory'):store.put(handle,'directory');
        transaction.oncomplete=()=>resolve(request.result);
        transaction.onerror=()=>reject(transaction.error);
        transaction.onabort=()=>reject(transaction.error||new Error('目录设置未能保存'));
      });
    }finally{db.close()}
  },
  load(){return this.access('readonly')},
  save(handle){return this.access('readwrite',handle)}
};

class LocalBackup{
  constructor({getSnapshot,onStatus,handleStore=backupHandleStore}){
    this.getSnapshot=getSnapshot;
    this.onStatus=onStatus;
    this.handleStore=handleStore;
    this.pendingKey='zhixu-local-backup-pending-v1';
    this.revision=localStorage.getItem(this.pendingKey);
    this.directory=null;
    this.sequence=0;
    this.writeQueue=Promise.resolve();
    this.autoFile='知序学习笔记自动备份_'+this.fileStamp()+'.json';
    this.ready=this.restore();
    this.ready.then(()=>{if(this.revision&&this.directory)void this.backup()});
  }
  fileStamp(){
    const d=new Date(),pad=(v,n=2)=>String(v).padStart(n,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${pad(d.getMilliseconds(),3)}`;
  }
  async restore(){
    try{this.directory=await this.handleStore.load()||null}catch(e){}
    if(!this.directory){this.onStatus('首次导出时选择项目目录，备份会保存到 BeiFeng。');return}
    try{
      const permission=await this.directory.queryPermission({mode:'readwrite'});
      this.onStatus(permission==='granted'?'已连接 BeiFeng，修改后自动备份。':'点击「导出备份」重新允许写入 BeiFeng。');
    }catch(e){this.onStatus('备份目录暂不可用，请重新选择备份文件夹。')}
  }
  markChanged(){
    this.revision=Date.now()+'-'+(++this.sequence);
    localStorage.setItem(this.pendingKey,this.revision);
    this.onStatus(this.directory?'有更改，正在准备备份到 BeiFeng…':'有更改待备份，请点击「导出备份」选择 BeiFeng。');
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.backup(),600);
  }
  async chooseDirectory(){
    if(typeof window.showDirectoryPicker!=='function')throw new Error('请使用支持文件夹写入的 Chrome 或 Edge 浏览器');
    // 在点击处理期间立即打开选择器，保留浏览器要求的用户手势。
    const selected=await window.showDirectoryPicker({id:'zhixu-backup-directory',mode:'readwrite'});
    const directory=selected.name.toLowerCase()==='beifeng'?selected:await selected.getDirectoryHandle('BeiFeng',{create:true});
    await this.ready;
    this.directory=directory;
    try{await this.handleStore.save(directory)}catch(e){this.onStatus('本次已连接 BeiFeng；浏览器未能记住目录，下次需重新选择。')}
    return directory;
  }
  async configure(){
    try{await this.chooseDirectory();return await this.backup({force:true})}
    catch(e){if(e.name!=='AbortError')this.onStatus('未能设置备份文件夹：'+e.message);return false}
  }
  async export(){
    if(typeof window.showDirectoryPicker!=='function'){
      const url=URL.createObjectURL(new Blob([this.getSnapshot()],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='知序学习笔记备份_'+this.fileStamp()+'.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      this.onStatus('此浏览器不支持指定文件夹，JSON 已普通下载，请手动移入 BeiFeng；自动目录备份需使用 Chrome 或 Edge。');
      return false;
    }
    try{
      await this.ready;
      if(!this.directory)await this.chooseDirectory();
      if(await this.directory.queryPermission({mode:'readwrite'})!=='granted'){
        if(await this.directory.requestPermission({mode:'readwrite'})!=='granted')throw new Error('尚未允许写入 BeiFeng');
      }
      return await this.backup({manual:true});
    }catch(e){if(e.name!=='AbortError')this.onStatus('导出失败：'+e.message+'；笔记仍保存在浏览器中。');return false}
  }
  backup({manual=false,force=false}={}){
    clearTimeout(this.timer);
    const write=async()=>{
      await this.ready;
      if(!manual&&!force&&!this.revision)return true;
      if(!this.directory){this.onStatus('有更改待备份，请点击「导出备份」选择 BeiFeng。');return false}
      try{
        if(await this.directory.queryPermission({mode:'readwrite'})!=='granted'){
          this.onStatus('有更改待备份，请点击「导出备份」重新允许写入 BeiFeng。');return false;
        }
        const revision=this.revision,payload=this.getSnapshot();
        const filename=manual?'知序学习笔记备份_'+this.fileStamp()+'_'+(++this.sequence)+'.json':this.autoFile;
        const handle=await this.directory.getFileHandle(filename,{create:true});
        const writable=await handle.createWritable();
        try{await writable.write(payload);await writable.close()}
        catch(e){try{await writable.abort()}catch(_){}throw e}
        if(this.revision===revision){this.revision=null;localStorage.removeItem(this.pendingKey)}
        this.onStatus(this.revision?'备份已写入 BeiFeng，还有新修改待保存。':'已备份至 BeiFeng · '+new Date().toLocaleTimeString('zh-CN'));
        return true;
      }catch(e){this.onStatus('备份失败：'+e.message+'；笔记仍保存在浏览器中，请重新导出。');return false}
    };
    this.writeQueue=this.writeQueue.catch(()=>false).then(write);
    return this.writeQueue;
  }
}
