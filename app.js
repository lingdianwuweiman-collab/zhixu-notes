const STORAGE_KEY = 'zhixu-study-space-v1';
const $ = (s) => document.querySelector(s);
const byId = (id) => document.getElementById(id);
let state = loadState();
let currentId = null;
let view = 'home';
let searchTimer;

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function now(){ return new Date().toISOString(); }
function formatDate(value){ return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(new Date(value)); }
function textOf(html){ const d=document.createElement('div');d.innerHTML=html||'';return (d.innerText||'').replace(/\s+/g,' ').trim(); }
function escapeHtml(v){ return String(v||'').replace(/[&<>"]/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x])); }
function defaultContent(){ return '<h1>学习目标</h1><p>在这里写下本次学习想解决的问题。</p><h2>核心内容</h2><p>记录概念、例子和自己的理解。试试点击右侧大纲的一级标题，折叠整段内容。</p><h2>我的总结</h2><p>用自己的话复述一遍，记忆会更牢。</p>'; }
function defaultResources(){return [
  {id:uid(),name:'Hugging Face Learn',category:'AI / 大语言模型',url:'https://huggingface.co/learn'},
  {id:uid(),name:'Kaggle Learn',category:'机器学习实战',url:'https://www.kaggle.com/learn'},
  {id:uid(),name:'PyTorch Tutorials',category:'深度学习教程',url:'https://docs.pytorch.org/tutorials/'},
  {id:uid(),name:'Coursera Machine Learning',category:'机器学习课程',url:'https://www.coursera.org/learn/machine-learning'}
]}
function normalizeTreeTypes(nodes){(nodes||[]).forEach(node=>{node.type='folder';normalizeTreeTypes(node.children||[])})}
function loadState(){
  try{ const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(saved?.tree && saved?.notes){normalizeTreeTypes(saved.tree);saved.resources??=defaultResources();return saved;} }catch(e){}
  const root1={id:uid(),name:'编程开发',type:'folder',color:'#718f72',children:[]},root2={id:uid(),name:'阅读与思考',type:'folder',color:'#b8945d',children:[]},root3={id:uid(),name:'语言学习',type:'folder',color:'#7897a3',children:[]};
  const js={id:uid(),name:'JavaScript',type:'folder',color:'#718f72',children:[]};root1.children.push(js);
  const note={id:uid(),parentId:js.id,title:'JavaScript 学习笔记',content:defaultContent(),tags:['前端','入门'],favorite:false,createdAt:now(),updatedAt:now(),deleted:false};
  return {tree:[root1,root2,root3],notes:[note],todos:[],resources:defaultResources()};
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); byId('saveState').textContent='已保存'; updateStats(); }
function getNode(id,nodes=state.tree){ for(const n of nodes){if(n.id===id)return n;const found=getNode(id,n.children||[]);if(found)return found;} return null; }
function getParent(id,nodes=state.tree,parent=null){ for(const n of nodes){if(n.id===id)return parent;const found=getParent(id,n.children||[],n);if(found)return found;}return null; }
function nodePath(id){ const result=[];let node=getNode(id);while(node){result.unshift(node);node=getParent(node.id)}return result; }
function liveNotes(){return state.notes.filter(n=>!n.deleted)}
function noteForNode(id){return liveNotes().find(n=>n.parentId===id)}

function renderTree(){
  const container=byId('knowledgeTree'); container.innerHTML='';
  const buildFile=(note)=>{const row=document.createElement('div');row.className='tree-row tree-file'+(currentId===note.id?' active':'');row.dataset.id=note.id;row.dataset.type='file';row.innerHTML=`<span class="tree-toggle"></span><span class="tree-icon">▤</span><span class="tree-label">${escapeHtml(note.title)}</span><span class="tree-kind file-kind">文件</span>`;row.onclick=()=>openNote(note.id);return row};
  const build=(node,depth=0)=>{
    const wrap=document.createElement('div');wrap.className='tree-node';
    const row=document.createElement('div');row.className='tree-row tree-folder';row.dataset.id=node.id;row.dataset.type='folder';
    const files=liveNotes().filter(note=>note.parentId===node.id),hasKids=(node.children||[]).length+files.length>0; row.innerHTML=`<span class="tree-toggle">${hasKids?(node.collapsed?'›':'⌄'):''}</span><span class="tree-icon">▣</span><span class="tree-label">${escapeHtml(node.name)}</span><span class="tree-kind folder-kind">文件夹</span><span class="tree-actions" title="在此新增节点">＋</span>`;
    const children=document.createElement('div');children.className='tree-children'+(node.collapsed?' collapsed':'');
    row.querySelector('.tree-toggle').onclick=(e)=>{e.stopPropagation();node.collapsed=!node.collapsed;save();renderTree()};
    row.querySelector('.tree-actions').onclick=(e)=>{e.stopPropagation();askBranch(node.id)};
    row.onclick=()=>{node.collapsed=!node.collapsed;save();renderTree()};
    wrap.append(row);(node.children||[]).forEach(c=>children.append(build(c,depth+1)));files.forEach(note=>children.append(buildFile(note)));wrap.append(children);return wrap;
  }; state.tree.forEach(n=>container.append(build(n)));
}
function renderMap(){
  const canvas=byId('treeCanvas');canvas.innerHTML='';const roots=state.tree;
  if(!roots.length){canvas.innerHTML='<div class="empty-map">知识树还没有节点 <button id="emptyAdd">添加第一个文件夹</button></div>';byId('emptyAdd').onclick=()=>askBranch(null);return;}
  const diagram=document.createElement('div');diagram.className='tree-diagram';const root=document.createElement('div');root.className='diagram-node diagram-root';root.innerHTML='<b>我的学习</b><small>知识树根目录</small>';diagram.append(root);
  const level=document.createElement('div');level.className='diagram-children diagram-root-children';roots.forEach(node=>level.append(buildFolderDiagram(node)));diagram.append(level);canvas.append(diagram);
}
function buildFolderDiagram(node){const branch=document.createElement('div');branch.className='diagram-branch';const files=liveNotes().filter(note=>note.parentId===node.id);const folder=document.createElement('button');folder.className='diagram-node diagram-folder';folder.innerHTML=`<i>▣</i><span><b>${escapeHtml(node.name)}</b><small>文件夹 · ${countNotes(node)} 个文件</small></span>`;folder.onclick=()=>{node.collapsed=!node.collapsed;save();renderHome()};branch.append(folder);if(!node.collapsed&&((node.children||[]).length||files.length)){const children=document.createElement('div');children.className='diagram-children';(node.children||[]).forEach(child=>children.append(buildFolderDiagram(child)));files.forEach(note=>{const file=document.createElement('button');file.className='diagram-node diagram-file';file.innerHTML=`<i>▤</i><span><b>${escapeHtml(note.title)}</b><small>学习笔记文件</small></span>`;file.onclick=()=>openNote(note.id);children.append(file)});branch.append(children)}return branch}
function renderStartDanmaku(){
  const stage=byId('danmakuStage');if(!stage)return;stage.innerHTML='';
  const quotes=['先完成，再完美。','今天的积累，是明天的底气。','把问题拆小，把行动做实。','每一次理解，都是向前一步。','学习不是赶路，是长出自己的根。','代码会记住你的耐心。','保持好奇，保持输入。','慢一点，也是在前进。'];
  const items=[...quotes.map(text=>({text,type:'quote'})),...(state.resources||[]).map(resource=>({text:resource.name,type:'resource',url:resource.url}))];
  items.forEach((item,index)=>{const el=document.createElement(item.url?'a':'span');el.className='danmaku '+item.type;el.textContent=item.text;el.style.setProperty('--top',(8+(index*17)%80)+'%');el.style.setProperty('--duration',(18+(index%5)*4)+'s');el.style.setProperty('--delay',(-index*4.7)+'s');if(item.url){el.href=item.url;el.target='_blank';el.rel='noopener noreferrer';el.title='打开：'+item.url}stage.append(el)});
}
function renderResources(){
  const list=byId('resourceList');if(!list)return;const items=state.resources||[];
  list.innerHTML=items.length?items.map(r=>`<article class="resource-card"><i class="resource-dot"></i><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(r.url)}"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.category)} · ${escapeHtml(r.url.replace(/^https?:\/\//,''))}</span></a><button class="remove-resource" data-id="${r.id}" title="删除网址">×</button></article>`).join(''):'<p style="color:#89938a;font-size:12px">暂无资源，可点击右上角添加。</p>';
  list.querySelectorAll('.remove-resource').forEach(btn=>btn.onclick=()=>{state.resources=state.resources.filter(r=>r.id!==btn.dataset.id);save();renderResources();renderStartDanmaku();toast('已删除该网址')});
}
function countNotes(node){return state.notes.filter(n=>!n.deleted&&isDescendant(n.parentId,node.id)).length}
function isDescendant(nodeId,ancestorId){let node=getNode(nodeId);while(node){if(node.id===ancestorId)return true;node=getParent(node.id)}return false}
function findFirstNote(node){const direct=noteForNode(node.id);if(direct)return direct;for(const c of node.children||[]){const n=findFirstNote(c);if(n)return n}return null}
function updateStats(){const notes=liveNotes();byId('noteTotal').textContent=notes.length;byId('tagTotal').textContent=new Set(notes.flatMap(n=>n.tags)).size;byId('wordTotal').textContent=notes.reduce((sum,n)=>sum+textOf(n.content).replace(/\s/g,'').length,0);byId('favoriteCount').textContent=notes.filter(n=>n.favorite).length;byId('trashCount').textContent=state.notes.filter(n=>n.deleted).length;}
function renderHome(){view='home';currentId=null;byId('appShell').classList.remove('hidden');byId('welcomeView').classList.remove('hidden');byId('editorView').classList.add('hidden');renderTree();renderMap();renderResources();updateStats();}
function startLearning(){byId('startView').classList.add('hidden');renderHome()}
function createNote(parentId){const node=getNode(parentId); if(!node)return askBranch(null);const note={id:uid(),parentId,title:node.name+' 学习笔记',content:defaultContent(),tags:[],favorite:false,createdAt:now(),updatedAt:now(),deleted:false};state.notes.push(note);save();openNote(note.id);}
function openNote(id){const note=state.notes.find(n=>n.id===id);if(!note)return;currentId=id;view='editor';byId('welcomeView').classList.add('hidden');byId('editorView').classList.remove('hidden');byId('noteTitle').value=note.title;byId('editor').innerHTML=note.content;byId('lastEdit').textContent='更新于 '+formatDate(note.updatedAt);byId('favoriteBtn').classList.toggle('is-favorite',note.favorite);byId('favoriteBtn').textContent=note.favorite?'★':'☆';renderTags();renderOutline();renderTree();window.scrollTo(0,0)}
function current(){return state.notes.find(n=>n.id===currentId)}
function syncNote(){const note=current();if(!note)return;note.title=byId('noteTitle').value.trim()||'未命名笔记';note.content=byId('editor').innerHTML;note.updatedAt=now();byId('lastEdit').textContent='更新于 '+formatDate(note.updatedAt);byId('saveState').textContent='已保存';save();renderTree()}
function scheduleSync(){byId('saveState').textContent='正在保存';clearTimeout(searchTimer);searchTimer=setTimeout(()=>{syncNote();renderOutline()},350)}
function renderTags(){const note=current();const list=byId('tagList');list.innerHTML='';note.tags.forEach(tag=>{const el=document.createElement('span');el.className='tag';el.innerHTML=`#${escapeHtml(tag)} <button title="移除标签">×</button>`;el.querySelector('button').onclick=()=>{note.tags=note.tags.filter(t=>t!==tag);save();renderTags()};list.append(el)})}
function renderOutline(){const outline=byId('outline'),editor=byId('editor');outline.innerHTML='';const all=[...editor.querySelectorAll('h1,h2,h3')];byId('wordCount').textContent=textOf(editor.innerHTML).replace(/\s/g,'').length+' 字';if(!all.length){outline.innerHTML='<div class="outline-item">添加标题后会显示结构</div>';return}all.forEach((heading,index)=>{if(!heading.dataset.sid)heading.dataset.sid=uid();const item=document.createElement('div');const lev=heading.tagName.slice(1);item.className=`outline-item level-${lev}`;item.textContent=heading.textContent||'未命名标题';item.onclick=()=>{if(lev==='1')toggleSection(heading);else{heading.scrollIntoView({behavior:'smooth',block:'center'});flash(heading)}};outline.append(item)})}
function toggleSection(heading,force){const headings=[...byId('editor').querySelectorAll('h1,h2,h3,p,ul,ol,div,blockquote,img,hr')];const start=headings.indexOf(heading);if(start<0)return;const collapse=force===undefined?!heading.classList.contains('folded'):force;heading.classList.toggle('folded',collapse);heading.style.cursor='pointer';heading.title='点击折叠/展开这一章';for(let i=start+1;i<headings.length;i++){const el=headings[i];if(el.tagName==='H1')break;el.style.display=collapse?'none':''}heading.style.opacity=collapse?.64:'';toast(collapse?'已折叠本章内容':'已展开本章内容')}
function flash(el){el.style.background='#fff4cd';setTimeout(()=>el.style.background='',650)}
function askBranch(parentId){modal('新建节点',`<label>节点名称<input id="branchName" placeholder="例如：Python、数据结构、第一章笔记" autofocus></label><label>节点类型<select id="nodeType"><option value="folder">▣ 文件夹（可继续放入子文件夹或文件）</option><option value="file">▤ 文件（可直接编辑学习内容）</option></select></label><label>归属文件夹<select id="branchParent"><option value="">顶级目录</option>${flattenTree().map(n=>`<option value="${n.id}" ${n.id===parentId?'selected':''}>${'　'.repeat(n.depth)}${escapeHtml(n.name)}</option>`).join('')}</select></label>`,()=>{const name=byId('branchName').value.trim(),type=byId('nodeType').value,parent=getNode(byId('branchParent').value);if(!name)return toast('请填写节点名称');if(type==='file'){if(!parent)return toast('文件需要放入一个文件夹');const note={id:uid(),parentId:parent.id,title:name,content:defaultContent(),tags:[],favorite:false,createdAt:now(),updatedAt:now(),deleted:false};state.notes.push(note);save();closeModal();openNote(note.id);return;}const node={id:uid(),name,type:'folder',color:['#718f72','#b8945d','#7897a3','#a98287'][state.tree.length%4],children:[]};(parent?parent.children:state.tree).push(node);save();closeModal();renderHome()})}
function flattenTree(nodes=state.tree,depth=0){return nodes.flatMap(n=>[{...n,depth},...flattenTree(n.children||[],depth+1)])}
function modal(title,body,onConfirm,confirm='确定'){byId('modalRoot').innerHTML=`<div class="modal-cover"><div class="modal"><h3>${title}</h3>${body}<div class="modal-actions"><button id="cancelModal">取消</button><button id="confirmModal" class="primary">${confirm}</button></div></div></div>`;byId('cancelModal').onclick=closeModal;byId('confirmModal').onclick=onConfirm;document.querySelector('.modal-cover').onclick=(e)=>{if(e.target===e.currentTarget)closeModal()};setTimeout(()=>document.querySelector('.modal input')?.focus(),20)}
function closeModal(){byId('modalRoot').innerHTML=''}
function toast(msg){const el=byId('toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1800)}
function showSearch(filter=''){const results=liveNotes().filter(n=>{const target=(n.title+' '+n.tags.join(' ')+' '+textOf(n.content)).toLowerCase();return target.includes(filter.toLowerCase())});modal('查找学习内容',`<div class="side-search"><span>⌕</span><input id="modalSearch" value="${escapeHtml(filter)}" placeholder="输入关键词、标题或标签"></div><div id="searchResults">${searchResultHtml(results)}</div>`,()=>closeModal(),'关闭');byId('modalSearch').oninput=e=>{const val=e.target.value;const res=liveNotes().filter(n=>(n.title+' '+n.tags.join(' ')+' '+textOf(n.content)).toLowerCase().includes(val.toLowerCase()));byId('searchResults').innerHTML=searchResultHtml(res);bindSearchResults()};bindSearchResults()}
function searchResultHtml(items){return items.length?items.map(n=>`<button class="search-result" data-id="${n.id}"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.tags.map(t=>'#'+t).join('  '))}　${escapeHtml(textOf(n.content).slice(0,80))}</span></button>`).join(''):'<p style="color:#879087;font-size:12px">没有找到匹配的笔记</p>'}
function bindSearchResults(){document.querySelectorAll('.search-result').forEach(el=>el.onclick=()=>{closeModal();openNote(el.dataset.id)})}
function addTag(){const note=current();modal('添加标签','<label>标签名称<input id="newTag" placeholder="例如：重点、待复习、灵感"></label>',()=>{const tag=byId('newTag').value.trim().replace(/^#/,'');if(!tag)return toast('请输入标签');if(!note.tags.includes(tag))note.tags.push(tag);save();renderTags();closeModal()})}
function command(cmd,value=null){byId('editor').focus();document.execCommand('styleWithCSS',false,true);document.execCommand(cmd,false,value);scheduleSync()}
function insertChecklist(){command('insertHTML','<ul class="todo"><li><input type="checkbox"> 待完成事项</li></ul><p><br></p>')}
function insertImage(file){if(!file)return;if(file.size>2.5*1024*1024)return toast('图片请控制在 2.5MB 以内');const r=new FileReader();r.onload=()=>{command('insertHTML',`<img src="${r.result}" alt="学习笔记图片">`);toast('图片已插入')};r.readAsDataURL(file)}
function exportNote(){const n=current();const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(n.title)}</title><body style="max-width:850px;margin:45px auto;font-family:Microsoft YaHei,sans-serif;line-height:1.8;color:#263128"><h1>${escapeHtml(n.title)}</h1><p>标签：${escapeHtml(n.tags.map(x=>'#'+x).join('　'))}</p><hr>${n.content}</body></html>`;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));a.download=(n.title||'学习笔记')+'.html';a.click();URL.revokeObjectURL(a.href);toast('笔记已导出为 HTML 文件')}
function moveTrash(){const n=current();if(!n)return;n.deleted=true;save();toast('已移至回收站');renderHome()}
function showTrash(){const trash=state.notes.filter(n=>n.deleted);modal('回收站',trash.length?trash.map(n=>`<button class="search-result restore-note" data-id="${n.id}"><strong>${escapeHtml(n.title)}</strong><span>点击恢复这篇笔记</span></button>`).join(''):'<p style="color:#879087;font-size:12px">回收站是空的</p>',()=>closeModal(),'关闭');document.querySelectorAll('.restore-note').forEach(b=>b.onclick=()=>{state.notes.find(n=>n.id===b.dataset.id).deleted=false;save();closeModal();renderHome();toast('笔记已恢复')})}
function addTodo(){const n=current();state.todos.push({id:uid(),noteId:n.id,title:'复习：'+n.title,done:false,createdAt:now()});save();toast('已加入复习待办')}
function addResource(){modal('添加学习网址','<label>资源名称<input id="resourceName" placeholder="例如：Google AI 课程"></label><label>学习方向<input id="resourceCategory" placeholder="例如：人工智能"></label><label>网址<input id="resourceUrl" type="url" placeholder="https://..."></label>',()=>{const name=byId('resourceName').value.trim(),category=byId('resourceCategory').value.trim()||'学习资源',url=byId('resourceUrl').value.trim();if(!name||!/^https?:\/\/.+/.test(url))return toast('请填写名称和正确的网址');state.resources.push({id:uid(),name,category,url});save();renderResources();renderStartDanmaku();closeModal();toast('网址已加入启动页与资源清单')})}
async function checkResources(){const resources=[...(state.resources||[])];if(!resources.length)return toast('暂无需要检查的网址');byId('checkResourcesBtn').textContent='检查中…';const failed=[];await Promise.all(resources.map(async r=>{try{await fetch(r.url,{mode:'no-cors',cache:'no-store'});}catch(e){failed.push(r.id)}}));byId('checkResourcesBtn').textContent='检查链接';if(failed.length){state.resources=state.resources.filter(r=>!failed.includes(r.id));save();renderResources();renderStartDanmaku();toast(`已删除 ${failed.length} 个无法访问的网址`)}else toast('检查完成，当前网址均可连接')}

byId('today').textContent=formatDate(now());
byId('beginLearningBtn').onclick=startLearning;
byId('newNoteBtn').onclick=()=>askBranch(null);
byId('addRootBtn').onclick=()=>askBranch(null);
byId('backHomeBtn').onclick=renderHome;
byId('noteTitle').oninput=scheduleSync;
byId('editor').oninput=scheduleSync;
byId('editor').onclick=(e)=>{if(e.target.tagName==='H1')toggleSection(e.target)};
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));
document.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>command('formatBlock',b.dataset.block));
byId('checklistBtn').onclick=insertChecklist;
byId('imageBtn').onclick=()=>byId('imageInput').click();byId('imageInput').onchange=e=>{insertImage(e.target.files[0]);e.target.value=''};
byId('linkBtn').onclick=()=>{const url=prompt('输入链接地址');if(url)command('createLink',url)};
// ===== 文字颜色功能 =====
let lastColor='#c0392b';
const editorColorPanel=byId('colorPanel');
const editorColorBtn=byId('fontColorBtn');

// 保存选区，以便点击颜色后恢复
let savedRange=null;
function saveSelection(){
  const sel=window.getSelection();
  if(sel.rangeCount>0)savedRange=sel.getRangeAt(0).cloneRange();
}
function restoreSelection(){
  if(savedRange){
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    savedRange=null;
  }
}

function applyColor(color){
  restoreSelection();
  command('foreColor',color);
  lastColor=color;
  editorColorBtn.querySelector('.color-a').style.color=color;
  editorColorBtn.querySelector('.color-bar').style.background=color;
  byId('customColor').value=color;
  editorColorPanel.classList.add('hidden');
}

editorColorBtn.addEventListener('mousedown',saveSelection);
editorColorBtn.addEventListener('click',function(e){
  e.preventDefault();
  e.stopPropagation();
  // 先检查面板是否已经打开
  const isHidden=editorColorPanel.classList.contains('hidden');
  // 关闭所有右键菜单
  hideContextMenu();
  // 切换颜色面板
  if(isHidden){
    // 重新定位颜色面板
    const rect=editorColorBtn.getBoundingClientRect();
    editorColorPanel.style.top=(rect.bottom+4)+'px';
    editorColorPanel.style.left=rect.left+'px';
    editorColorPanel.style.position='fixed';
    editorColorPanel.style.zIndex='100';
    editorColorPanel.classList.remove('hidden');
  }else{
    editorColorPanel.classList.add('hidden');
  }
});

editorColorPanel.querySelectorAll('[data-color]').forEach(b=>{
  b.addEventListener('mousedown',function(e){e.preventDefault();saveSelection();});
  b.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    applyColor(this.dataset.color);
  });
});

byId('customColor').addEventListener('change',function(e){
  applyColor(this.value);
});

byId('clearColorBtn').addEventListener('click',function(e){
  e.preventDefault();
  e.stopPropagation();
  restoreSelection();
  command('foreColor','#30362f');
  editorColorPanel.classList.add('hidden');
  toast('已重置为默认颜色');
});

document.addEventListener('click',function(e){
  if(!editorColorPanel.contains(e.target)&&e.target!==editorColorBtn){
    editorColorPanel.classList.add('hidden');
  }
});
byId('addTagBtn').onclick=addTag;
byId('favoriteBtn').onclick=()=>{const n=current();n.favorite=!n.favorite;save();openNote(n.id);toast(n.favorite?'已加入收藏':'已取消收藏')};
byId('deleteBtn').onclick=moveTrash;byId('exportBtn').onclick=exportNote;byId('collapseAllBtn').onclick=()=>{const hs=[...byId('editor').querySelectorAll('h1')];const shouldFold=hs.some(h=>!h.classList.contains('folded'));hs.forEach(h=>toggleSection(h,shouldFold));byId('collapseAllBtn').textContent=shouldFold?'全部展开':'全部折叠'};
byId('addTodoBtn').onclick=addTodo;byId('copyLinkBtn').onclick=()=>{navigator.clipboard?.writeText(location.href+'#note='+currentId);toast('笔记链接已复制')};
byId('globalSearch').onfocus=e=>{showSearch(e.target.value);e.target.value=''};byId('globalSearch').onkeydown=e=>{if(e.key==='Enter')showSearch(e.target.value)};
byId('favoritesBtn').onclick=()=>{const favorite=liveNotes().filter(n=>n.favorite);modal('收藏的笔记',favorite.length?searchResultHtml(favorite):'<p style="color:#879087;font-size:12px">还没有收藏笔记</p>',()=>closeModal(),'关闭');bindSearchResults()};
byId('showTrashBtn').onclick=showTrash;byId('openRecentBtn').onclick=()=>{const recent=[...liveNotes()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));if(recent[0])openNote(recent[0].id);else askBranch(null)};
byId('addResourceBtn').onclick=addResource;byId('checkResourcesBtn').onclick=checkResources;
renderStartDanmaku();renderResources();renderTree();renderMap();updateStats();

// ===== 右键菜单 =====
let ctxTarget=null;
let ctxMode='tree'; // 'tree' | 'editor'

// 预设颜色
const QUICK_COLORS=[
  {color:'#c0392b',name:'红色'},{color:'#e67e22',name:'橙色'},
  {color:'#f1c40f',name:'黄色'},{color:'#27ae60',name:'绿色'},
  {color:'#2980b9',name:'蓝色'},{color:'#8e44ad',name:'紫色'},
  {color:'#2c3e50',name:'深色'},{color:'#95a5a6',name:'灰色'}
];

function showTreeContextMenu(e,type,id){
  e.preventDefault();e.stopPropagation();
  ctxMode='tree';
  ctxTarget={type,id};
  const menu=byId('contextMenu');
  menu.innerHTML=type==='folder'
    ?'<button class="ctx-item" data-act="add">＋ 添加子节点</button><button class="ctx-item ctx-danger" data-act="delete">⌫ 删除节点</button>'
    :'<button class="ctx-item ctx-danger" data-act="delete">⌫ 移至回收站</button>';
  showMenuAt(e.clientX,e.clientY);
}

function showEditorContextMenu(e){
  e.preventDefault();e.stopPropagation();
  ctxMode='editor';
  ctxTarget=null;
  const sel=window.getSelection();
  const hasSelection=sel.toString().trim().length>0&&byId('editor').contains(sel.anchorNode);

  const menu=byId('contextMenu');
  let html='';

  // 文字格式
  html+='<div class="ctx-section"><button class="ctx-item" data-cmd="bold"><b>B</b> 加粗</button>';
  html+='<button class="ctx-item" data-cmd="italic"><i>I</i> 斜体</button>';
  html+='<button class="ctx-item" data-cmd="underline"><u>U</u> 下划线</button></div>';
  html+='<div class="ctx-divider"></div>';

  // 标题
  html+='<div class="ctx-section"><button class="ctx-item" data-block="h1">H 一级标题</button>';
  html+='<button class="ctx-item" data-block="h2">H 二级标题</button>';
  html+='<button class="ctx-item" data-block="h3">H 三级标题</button>';
  html+='<button class="ctx-item" data-block="p">¶ 正文</button></div>';
  html+='<div class="ctx-divider"></div>';

  // 列表
  html+='<div class="ctx-section"><button class="ctx-item" data-cmd="insertUnorderedList">• 无序列表</button>';
  html+='<button class="ctx-item" data-cmd="insertOrderedList">1. 有序列表</button></div>';
  html+='<div class="ctx-divider"></div>';

  // 颜色
  html+='<div class="ctx-section"><span class="ctx-label">文字颜色</span><div class="ctx-colors">';
  QUICK_COLORS.forEach(c=>{
    html+=`<button class="ctx-color-swatch" data-color="${c.color}" style="background:${c.color}" title="${c.name}"></button>`;
  });
  html+='</div><button class="ctx-item" data-act="resetColor">⬤ 重置为默认颜色</button></div>';
  html+='<div class="ctx-divider"></div>';

  // 其他
  html+='<div class="ctx-section"><button class="ctx-item" data-act="insertLink">↗ 插入链接</button>';
  if(hasSelection){
    html+='<button class="ctx-item ctx-danger" data-act="cutText">✂ 剪切</button>';
    html+='<button class="ctx-item ctx-danger" data-act="deleteText">⌫ 删除选中文字</button>';
  }
  html+='</div>';

  menu.innerHTML=html;
  showMenuAt(e.clientX,e.clientY);
}

function showMenuAt(x,y){
  const menu=byId('contextMenu');
  menu.classList.remove('hidden');
  const r=menu.getBoundingClientRect();
  let px=x,py=y;
  if(px+r.width>window.innerWidth)px=window.innerWidth-r.width-6;
  if(py+r.height>window.innerHeight)py=window.innerHeight-r.height-6;
  if(px<0)px=6;if(py<0)py=6;
  menu.style.left=px+'px';menu.style.top=py+'px';
}

function hideContextMenu(){byId('contextMenu').classList.add('hidden');ctxTarget=null;ctxMode='tree';}

function deleteNote(id){
  const note=state.notes.find(n=>n.id===id);if(!note)return;
  note.deleted=true;save();
  if(currentId===id)renderHome();else{renderTree();renderMap();}
  toast('已移至回收站');
}
function deleteNode(id){
  const node=getNode(id);if(!node)return;
  const cnt=countNotes(node);
  modal('删除节点','<p style="font-size:13px;line-height:1.7;color:#566057;margin:0">确定删除「'+escapeHtml(node.name)+'」吗？'+(cnt?'<br>该节点下有 <b>'+cnt+'</b> 篇笔记，将一并移至回收站，可在回收站恢复。':'')+'</p>',()=>{
    const parent=getParent(id);const list=parent?parent.children:state.tree;
    const idx=list.findIndex(n=>n.id===id);
    if(idx<0){closeModal();return}
    (function collect(n){state.notes.filter(note=>note.parentId===n.id).forEach(note=>{note.deleted=true});(n.children||[]).forEach(collect)})(list[idx]);
    list.splice(idx,1);closeModal();save();renderHome();toast('已删除节点');
  },'删除');
}

byId('contextMenu').addEventListener('click',(e)=>{
  const btn=e.target.closest('.ctx-item,.ctx-color-swatch');if(!btn)return;
  e.stopPropagation();
  if(ctxMode==='tree'){
    const act=btn.dataset.act;const t=ctxTarget;hideContextMenu();
    if(act==='add')askBranch(t.id);
    else if(act==='delete'){if(t.type==='folder')deleteNode(t.id);else deleteNote(t.id)}
  }else if(ctxMode==='editor'){
    // 编辑器右键菜单
    byId('editor').focus();
    if(btn.dataset.cmd){
      command(btn.dataset.cmd);
      hideContextMenu();
    }else if(btn.dataset.block){
      command('formatBlock',btn.dataset.block);
      hideContextMenu();
    }else if(btn.dataset.color){
      command('foreColor',btn.dataset.color);
      hideContextMenu();
    }else if(btn.dataset.act){
      const act=btn.dataset.act;
      hideContextMenu();
      if(act==='resetColor'){command('foreColor','#30362f');toast('已重置为默认颜色');}
      else if(act==='insertLink'){const url=prompt('输入链接地址');if(url)command('createLink',url);}
      else if(act==='cutText'){document.execCommand('cut');scheduleSync();}
      else if(act==='deleteText'){document.execCommand('delete');scheduleSync();}
    }
  }
});

document.addEventListener('click',hideContextMenu);
document.addEventListener('contextmenu',function(e){
  // 关闭颜色面板
  editorColorPanel.classList.add('hidden');
  // 判断右键目标
  const treeRow=e.target.closest('.tree-row');
  const editor=byId('editor');
  if(treeRow){
    const id=treeRow.dataset.id;
    const type=treeRow.dataset.type;
    if(id&&type)showTreeContextMenu(e,type,id);
  }else if(editor&&editor.contains(e.target)&&currentId){
    // 在编辑器内右键
    showEditorContextMenu(e);
  }else{
    hideContextMenu();
  }
});

// ===== 整体备份：导出 / 导入全部笔记 =====
function exportBackup(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}));
  a.download='知序学习笔记备份_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(a.href);toast('已导出全部笔记备份');
}
function importBackup(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=()=>{
    let data;
    try{data=JSON.parse(r.result)}catch(e){return toast('导入失败：文件不是有效的 JSON')}
    if(!data.tree||!data.notes)return toast('导入失败：文件格式不正确');
    modal('导入备份','<p style="font-size:13px;line-height:1.7;color:#566057;margin:0">导入将<strong>覆盖当前全部数据</strong>，建议先导出当前备份。确定继续吗？</p>',()=>{
      normalizeTreeTypes(data.tree);
      data.resources??=defaultResources();data.todos??=[];
      state=data;closeModal();save();renderHome();renderStartDanmaku();toast('备份导入成功');
    },'导入');
  };
  r.readAsText(file);
}
byId('exportBackupBtn').onclick=exportBackup;
byId('importBackupBtn').onclick=()=>byId('backupFile').click();
byId('backupFile').onchange=e=>{importBackup(e.target.files[0]);e.target.value=''};

// ===== 云端同步：基于 JSONBin.io 保存/恢复全部数据 =====
const CLOUD_CFG_KEY='zhixu-cloud-config-v1';
let cloudConfig=(()=>{try{return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)||'{}')}catch(e){return {}}})();
function saveCloudConfig(){localStorage.setItem(CLOUD_CFG_KEY,JSON.stringify(cloudConfig))}

// 从云端拉取数据并覆盖当前 state（silent=true 时不弹确认框）
async function fetchCloudData(binId,apiKey,silent){
  if(!apiKey)throw new Error('请先在云端同步中填写 API Key');
  const headers={'X-Master-Key':apiKey};
  const res=await fetch('https://api.jsonbin.io/v3/b/'+binId+'/latest',{headers});
  if(!res.ok)throw new Error('HTTP '+res.status+(res.status===401?'（API Key 错误）':res.status===404?'（Bin 不存在）':''));
  const j=await res.json();
  const data=j.record;
  if(!data.tree||!data.notes)throw new Error('云端数据格式不正确');
  const apply=()=>{
    normalizeTreeTypes(data.tree);data.resources??=defaultResources();data.todos??=[];
    state=data;save();
    if(currentId){
      // 如果正在编辑器里，回到首页再重新渲染
      renderHome();
    }else{
      renderTree();renderMap();renderResources();updateStats();
    }
    renderStartDanmaku();
    toast('已从云端加载笔记');
  };
  if(silent){apply();return true}
  return new Promise(resolve=>{
    modal('确认下载','<p style="font-size:13px;line-height:1.7;color:#566057;margin:0">将用云端数据<strong>覆盖当前全部笔记</strong>，确定吗？</p>',()=>{
      apply();closeModal();resolve(true);
    },'确定');
    // 取消按钮不 resolve，保持 pending 即可
  });
}

function openCloudModal(){
  modal('云端同步（JSONBin.io）','<p style="font-size:12px;line-height:1.7;color:#707970;margin:0 0 8px">把全部笔记保存到<b>私有云端</b>。只有填入你的 API Key 才能读写数据。<br>在新设备打开网址后，在此填入 API Key 即可同步笔记。</p>'
    +'<label>API Key（X-Master-Key）<input id="cloudApiKey" type="password" placeholder="粘贴你的 Master Key（读写都需要）" value="'+(cloudConfig.apiKey||'')+'"></label>'
    +'<label>Bin ID（首次上传后自动生成）<input id="cloudBinId" placeholder="例如 6a86e78bf5f4af5e292cc515" value="'+(cloudConfig.binId||'')+'"></label>'
    +'<p id="cloudStatus" style="font-size:12px;color:#7e9b81;margin:8px 0 0"></p>',closeModal,'关闭');
  const actions=byId('modalRoot').querySelector('.modal-actions');
  actions.innerHTML='<button id="cloudSaveCfg">保存设置</button><button id="cloudUpload">上传到云端</button><button id="cloudDownload">从云端下载</button><button id="confirmModal" class="primary">关闭</button>';
  byId('confirmModal').onclick=closeModal;
  const status=(m,c)=>{const el=byId('cloudStatus');el.textContent=m;el.style.color=c||'#7e9b81'};
  const readInputs=()=>{cloudConfig.apiKey=byId('cloudApiKey').value.trim();cloudConfig.binId=byId('cloudBinId').value.trim();saveCloudConfig()};
  byId('cloudSaveCfg').onclick=()=>{readInputs();status('设置已保存')};
  byId('cloudUpload').onclick=async()=>{
    readInputs();
    if(!cloudConfig.apiKey)return status('上传需要 API Key','#b25d55');
    byId('cloudUpload').textContent='上传中…';
    try{
      let id=cloudConfig.binId;
      const headers={'X-Master-Key':cloudConfig.apiKey,'Content-Type':'application/json'};
      if(id){
        await fetch('https://api.jsonbin.io/v3/b/'+id,{method:'PUT',headers,body:JSON.stringify(state)});
      }else{
        const res=await fetch('https://api.jsonbin.io/v3/b',{method:'POST',headers,body:JSON.stringify(state)});
        const j=await res.json();
        id=j.metadata?.id;cloudConfig.binId=id;saveCloudConfig();
      }
      byId('cloudBinId').value=id;
      // 更新网址 hash，方便收藏
      history.replaceState(null,'','#bin='+id);
      status('上传成功！你的笔记网址：'+location.origin+location.pathname+'#bin='+id+'（在新设备填入 API Key 即可访问）','#7e9b81');
    }catch(e){status('上传失败：'+e.message,'#b25d55')}
    byId('cloudUpload').textContent='上传到云端';
  };
  byId('cloudDownload').onclick=async()=>{
    readInputs();
    if(!cloudConfig.binId)return status('请填写 Bin ID','#b25d55');
    byId('cloudDownload').textContent='下载中…';
    try{
      await fetchCloudData(cloudConfig.binId,cloudConfig.apiKey,false);
      status('下载成功');
    }catch(e){status('下载失败：'+e.message,'#b25d55')}
    byId('cloudDownload').textContent='从云端下载';
  };
}
byId('cloudSyncBtn').onclick=openCloudModal;

// ===== 关闭页面时自动静默上传（仅当数据有变更且已配置云端）=====
let lastCloudPayload=null;
function silentUpload(){
  if(!cloudConfig.apiKey||!cloudConfig.binId)return;
  let payload;
  try{payload=JSON.stringify(state)}catch(e){return}
  if(payload===lastCloudPayload)return;
  lastCloudPayload=payload;
  try{
    fetch('https://api.jsonbin.io/v3/b/'+cloudConfig.binId,{
      method:'PUT',
      headers:{'X-Master-Key':cloudConfig.apiKey,'Content-Type':'application/json'},
      body:payload,
      keepalive:true
    }).catch(()=>{});
  }catch(e){}
}
window.addEventListener('beforeunload',silentUpload);

// ===== URL hash 自动加载：打开带 #bin=xxx 的网址时自动从云端拉取 =====
(function(){
  const m=location.hash.match(/#bin=([a-zA-Z0-9]+)/);
  if(!m)return;
  const binId=m[1];
  cloudConfig.binId=binId;saveCloudConfig();
  // 等页面初始化完成后自动加载
  setTimeout(async()=>{
    // 如果没有配置 API Key，提示用户去设置
    if(!cloudConfig.apiKey){
      toast('检测到云端笔记 ID，请在「☁ 云端同步」中填入 API Key 以加载笔记');
      return;
    }
    // 如果本地没有数据（初始默认状态），静默加载；否则询问
    const hasLocalData=liveNotes().some(n=>n.content&&n.content!==defaultContent())||state.tree.length>3;
    try{
      await fetchCloudData(binId,cloudConfig.apiKey, !hasLocalData);
    }catch(e){
      toast('加载云端笔记失败：'+e.message+'（请检查 API Key 是否正确）');
    }
  },500);
})();
