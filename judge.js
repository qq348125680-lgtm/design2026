
let judgeCodeVal="",judgeNameVal="",works=[],idx=0,currentTab="images";

const criteriaDef=[
  {key:"c1",name:"IP 形象三视图规范度",max:24,desc:"视图完整（正 / 侧 / 背）；比例统一、造型一致；线条规范，适合矢量建模、印刷等数字化二次制作"},
  {key:"c2",name:"数字化视觉设计表现",max:20,desc:"具备数字科技视觉语言与数字化视觉表现力；色彩质感适配线上传播"},
  {key:"c3",name:"枣庄新兴产业推广性",max:20,desc:"紧扣枣庄新兴产业数字化主题；融入枣庄地域文化符号；记忆点强，适合新媒体、城市宣传推广"},
  {key:"c4",name:"IP 衍生设计与前沿性",max:16,desc:"应用场景效果图完整；IP 造型可拓展虚拟形象、文创等；创意新颖，文化与数字产业融合，具有前沿性"}
];

document.addEventListener("DOMContentLoaded",()=>{
  initSupabase();
  search.addEventListener("input",renderList);
  filter.addEventListener("change",renderList);
});

async function judgeLogin(){
  if(!sb && !initSupabase())return;
  judgeCodeVal=judgeCode.value.trim();
  if(!judgeCodeVal)return;
  const r=await sb.rpc("judge_login",{p_code:judgeCodeVal});
  if(r.error||!r.data?.ok){alert("邀请码无效");return}
  judgeNameVal=r.data.name;
  judgeWho.textContent="当前专家："+judgeNameVal;
  loginPanel.classList.add("hidden");app.classList.remove("hidden");
  await loadWorks();
}

async function loadWorks(){
  const r=await sb.rpc("judge_get_works",{p_code:judgeCodeVal});
  if(r.error){alert(r.error.message);return}
  works=r.data||[];idx=0;renderList();renderCurrent();
}
function renderList(){
  const q=search.value.trim().toLowerCase(),f=filter.value;
  workList.innerHTML=works.map((w,i)=>({w,i}))
    .filter(x=>(!q||x.w.code.toLowerCase().includes(q))&&(f==="all"||(f==="done"&&x.w.scored)||(f==="todo"&&!x.w.scored)))
    .map(x=>`<div class="workitem ${x.i===idx?"active":""}" onclick="pick(${x.i})">
      <div class="workid">${esc(x.w.code)} ${x.w.scored?"✓":""}</div><div class="workname">匿名作品</div></div>`).join("");
}
function pick(i){idx=i;currentTab="images";renderList();renderCurrent()}

async function renderCurrent(){
  const w=works[idx];
  if(!w){viewer.innerHTML='<div class="muted">暂无作品</div>';return}
  workTitle.textContent=w.code;
  workMeta.textContent=`匿名评审 · 共 ${(w.manifest||[]).length} 个可评审文件`;

  criteria.innerHTML=`
    <div class="section-title">一、作品评分（80分）</div>
    <div class="section-note">先对视觉作品本身评分，四项合计满分80分。</div>
    ${criteriaDef.map(c=>`
      <div class="scoreline">
        <label><span>${c.name}</span><span>0—${c.max}</span></label>
        <input type="number" min="0" max="${c.max}" step="0.5" id="${c.key}" oninput="calcTotal()">
        <div class="criterion-desc">${c.desc}</div>
      </div>`).join("")}
    <div class="section-title">二、说明文档评分（20分）</div>
    <div class="scoreline">
      <label><span>说明文档质量</span><span>0—20</span></label>
      <input type="number" min="0" max="20" step="0.5" id="docScore" oninput="calcTotal()">
      <div class="criterion-desc">创作思路清晰；主题表达准确；技术应用说明完整；与作品内容一致；结构规范、逻辑清楚、文字表达准确。</div>
    </div>
    <div class="deduct-box">
      <b>扣分</b>
      <div class="criterion-desc">
        1. 抄袭、侵权、AI 痕迹明显：扣 20–40 分；<br>
        2. 文字错误、画面低级瑕疵：每处扣 2 分；<br>
        3. 严重偏离主题、没有围绕 IP 形象设计、没有三视图：最终得分原则上控制在 60 分以下。
      </div>
      <div style="height:8px"></div>
      <input type="number" id="deduction" min="0" max="100" step="0.5" value="0" oninput="calcTotal()" placeholder="扣分值">
    </div>`;

  const sr=await sb.rpc("judge_get_score",{p_code:judgeCodeVal,p_work_id:w.id});
  if(!sr.error&&sr.data){
    for(const c of criteriaDef)document.getElementById(c.key).value=sr.data[c.key]??"";
    docScore.value=sr.data.doc_score??"";
    deduction.value=sr.data.deduction??0;
    comment.value=sr.data.comment||"";
  }else{
    docScore.value="";deduction.value=0;comment.value="";
  }
  calcTotal();showTab("images");
}

function calcTotal(){
  let work=0;
  for(const c of criteriaDef){
    const v=parseFloat(document.getElementById(c.key)?.value||0);
    work+=isNaN(v)?0:v;
  }
  const doc=parseFloat(document.getElementById("docScore")?.value||0);
  const d=parseFloat(document.getElementById("deduction")?.value||0);
  const final=Math.max(0,work+(isNaN(doc)?0:doc)-(isNaN(d)?0:d));
  total.textContent=final.toFixed(1);
}

async function saveScore(){
  const w=works[idx],payload={};
  for(const c of criteriaDef){
    const v=parseFloat(document.getElementById(c.key).value);
    if(isNaN(v)||v<0||v>c.max){alert(`${c.name}应为 0—${c.max} 分`);return}
    payload[c.key]=v;
  }
  const ds=parseFloat(docScore.value);
  if(isNaN(ds)||ds<0||ds>20){alert("说明文档评分应为 0—20 分");return}
  const d=parseFloat(deduction.value||0);
  if(isNaN(d)||d<0||d>100){alert("扣分应为 0—100");return}
  payload.doc_score=ds;payload.deduction=d;

  const r=await sb.rpc("judge_submit_score",{p_code:judgeCodeVal,p_work_id:w.id,p_score:payload,p_comment:comment.value.trim()});
  if(r.error){alert(r.error.message);return}
  saveMsg.textContent="已保存";w.scored=true;renderList();
  setTimeout(()=>saveMsg.textContent="",1500);
}

async function showTab(t){
  currentTab=t;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  const w=works[idx],arr=w.manifest||[];
  let list=t==="images"?arr.filter(x=>["jpg","jpeg","png","gif","webp","bmp","svg"].includes(x.ext))
    :t==="pdfs"?arr.filter(x=>x.ext==="pdf")
    :t==="docs"?arr.filter(x=>["doc","docx","ppt","pptx","xls","xlsx","txt","md","csv","json"].includes(x.ext))
    :arr;
  if(!list.length){viewer.innerHTML='<div class="muted">本分类暂无文件</div>';return}

  if(t==="images"){
    const html=[];
    for(let i=0;i<list.length;i++){
      const f=list[i],url=await getSignedUrl(f.path);
      html.push(`<div class="thumb" onclick="openLightbox('${encodeURIComponent(url)}')">
        <img src="${url}" loading="lazy" alt="作品图片 ${i+1}"><div class="cap">作品图片 ${i+1}</div></div>`);
    }
    viewer.innerHTML='<div class="gallery">'+html.join("")+'</div>';return;
  }
  if(t==="pdfs"){
    viewer.innerHTML=list.map((f,i)=>`<div class="file"><span class="badge">PDF</span><span class="fname">作品 PDF ${i+1}</span>
      <button class="btn small" onclick="previewAny('${f.path}','作品 PDF ${i+1}','pdf')">在线查看</button></div>`).join("");return;
  }
  if(t==="docs"){
    viewer.innerHTML=list.map((f,i)=>`<div class="file"><span class="badge">${esc((f.ext||"FILE").toUpperCase())}</span><span class="fname">说明文档 ${i+1}</span>
      <button class="btn small" onclick="previewAny('${f.path}','说明文档 ${i+1}','${f.ext}')">在线查看</button></div>`).join("");return;
  }
  viewer.innerHTML=list.map((f,i)=>`<div class="file"><span class="badge">${esc((f.ext||"FILE").toUpperCase())}</span><span class="fname">作品附件 ${i+1}</span>
    <button class="btn small" onclick="previewAny('${f.path}','作品附件 ${i+1}','${f.ext}')">在线查看</button></div>`).join("");
}

async function getSignedUrl(path){
  const r=await sb.storage.from("works").createSignedUrl(path,3600);
  if(r.error)throw r.error;return r.data.signedUrl;
}
function backToCurrentTab(){showTab(currentTab)}
async function previewAny(path,name,fileExt){
  const x=(fileExt||"").toLowerCase();
  viewer.innerHTML='<div class="muted">正在加载预览…</div>';
  try{
    const url=await getSignedUrl(path);
    if(["jpg","jpeg","png","gif","webp","bmp","svg"].includes(x)){
      viewer.innerHTML=`<div class="preview-head"><button class="btn small" onclick="backToCurrentTab()">← 返回</button><b>${esc(name)}</b>
      <div class="spacer"></div><button class="btn small" onclick="openLightbox('${encodeURIComponent(url)}')">全屏放大</button></div>
      <div style="text-align:center;background:#f7f8fa;border-radius:10px;padding:14px"><img src="${url}" style="max-width:100%;max-height:72vh;object-fit:contain;cursor:zoom-in" onclick="openLightbox('${encodeURIComponent(url)}')"></div>`;return;
    }
    if(x==="pdf"){
      viewer.innerHTML=`<div class="preview-head"><button class="btn small" onclick="backToCurrentTab()">← 返回</button><b>${esc(name)}</b></div><iframe class="preview-frame" src="${url}"></iframe>`;return;
    }
    if(["doc","docx","ppt","pptx","xls","xlsx"].includes(x)){
      const officeUrl="https://view.officeapps.live.com/op/embed.aspx?src="+encodeURIComponent(url);
      viewer.innerHTML=`<div class="preview-head"><button class="btn small" onclick="backToCurrentTab()">← 返回</button><b>${esc(name)}</b></div>
      <iframe class="preview-frame" src="${officeUrl}" allowfullscreen></iframe>
      <div class="muted" style="margin-top:8px">Office 在线预览由微软服务提供，网络较慢时可能需要等待。</div>`;return;
    }
    if(["txt","md","csv","json"].includes(x)){
      const res=await fetch(url);if(!res.ok)throw new Error("文件读取失败："+res.status);
      let text=await res.text();if(x==="json"){try{text=JSON.stringify(JSON.parse(text),null,2)}catch(e){}}
      const paras=text.replace(/\r\n/g,"\n").split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join("");
      viewer.innerHTML=`<div class="preview-head"><button class="btn small" onclick="backToCurrentTab()">← 返回</button><b>${esc(name)}</b></div><div class="text-preview">${paras||"<p>没有可显示内容。</p>"}</div>`;return;
    }
    viewer.innerHTML=`<div class="preview-head"><button class="btn small" onclick="backToCurrentTab()">← 返回</button><b>${esc(name)}</b></div><iframe class="preview-frame" src="${url}"></iframe>`;
  }catch(e){
    viewer.innerHTML=`<div class="notice">在线预览失败：${esc(e.message||String(e))}</div><div style="height:10px"></div><button class="btn" onclick="backToCurrentTab()">返回</button>`;
  }
}
function openLightbox(encodedUrl){
  const lb=document.getElementById("lightbox"),img=document.getElementById("lightboxImg");
  img.src=decodeURIComponent(encodedUrl);img.classList.remove("zoomed");lb.classList.add("show");document.body.style.overflow="hidden";
}
function closeLightbox(e){if(e.target.id==="lightbox"){lightbox.classList.remove("show");document.body.style.overflow=""}}
function forceCloseLightbox(e){e.stopPropagation();lightbox.classList.remove("show");document.body.style.overflow=""}
function toggleZoom(e){e.stopPropagation();e.currentTarget.classList.toggle("zoomed")}
document.addEventListener("keydown",e=>{if(e.key==="Escape"){lightbox.classList.remove("show");document.body.style.overflow=""}});
function prevWork(){if(idx>0){idx--;renderList();renderCurrent()}}
function nextWork(){if(idx<works.length-1){idx++;renderList();renderCurrent()}}
