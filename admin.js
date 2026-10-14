
let adminSecret="", works=[], judges=[], summary=[];

document.addEventListener("DOMContentLoaded",()=>initSupabase());

async function adminLogin(){
  if(!sb && !initSupabase())return;
  adminSecret=document.getElementById("adminSecret").value.trim();
  if(!adminSecret){alert("请输入管理员口令");return}
  const {data,error}=await sb.rpc("admin_check",{p_secret:adminSecret});
  if(error){alert("Supabase 调用失败："+error.message);return}
  if(data!==true){alert("管理员口令错误");return}
  loginPanel.classList.add("hidden");
  app.classList.remove("hidden");
  await refreshAll();
}

async function refreshAll(){
  const r=await sb.rpc("admin_dashboard",{p_secret:adminSecret});
  if(r.error){alert(r.error.message);return}
  const d=r.data||{};
  works=d.works||[];
  judges=d.judges||[];
  summary=d.summary||[];

  statWorks.textContent=works.length;
  statJudges.textContent=judges.length;
  statScores.textContent=d.score_count||0;

  judgeList.innerHTML=judges.map(j=>`
    <div class="file">
      <span class="fname"><b>${esc(j.name)}</b>　邀请码：${esc(j.code)}</span>
      <button class="btn small danger" onclick="delJudge('${j.id}')">删除</button>
    </div>`).join("") || '<div class="muted">暂无专家。系统按三位专家评分汇总，最多添加 3 位。</div>';

  workManage.innerHTML=works.map(w=>{
    const m=w.manifest||[];
    const hidden=m.filter(x=>x.hidden).length;
    const visible=m.length-hidden;
    return `<div class="file">
      <span class="fname"><b>${esc(w.code)}</b>　${esc(w.name)}
      <div class="muted">评委可见 ${visible} 个文件；后台隐藏 ${hidden} 个敏感文件</div></span>
      <button class="btn small danger" onclick="delWork('${w.id}')">删除</button>
    </div>`;
  }).join("") || '<div class="muted">暂无作品</div>';

  summaryWrap.innerHTML=renderSummary();
}

function rankClass(r){return r===1?"rank1":r===2?"rank2":r===3?"rank3":""}

function renderSummary(){
  if(!summary.length)return '<div class="muted">暂无成绩</div>';
  return `<table>
    <thead><tr>
      <th>排名</th><th>作品编号</th><th>已评专家</th><th>各评委最终得分</th><th>平均分</th><th>评分明细</th>
    </tr></thead>
    <tbody>${summary.map(x=>{
      const js=x.judge_scores||[];
      const scores=js.length?js.map(j=>`${esc(j.judge_name)}：<b>${Number(j.final_score).toFixed(2)}</b>`).join("<br>"):"—";
      const details=js.length?`
        <details class="score-detail"><summary>查看明细</summary>
        <table class="mini-table"><thead><tr>
          <th>评委</th><th>三视图24</th><th>数字视觉20</th><th>产业推广20</th><th>衍生前沿16</th><th>作品80</th><th>说明文档20</th><th>扣分</th><th>最终</th><th>评语</th>
        </tr></thead><tbody>
        ${js.map(j=>`<tr>
          <td>${esc(j.judge_name)}</td>
          <td>${j.c1}</td><td>${j.c2}</td><td>${j.c3}</td><td>${j.c4}</td>
          <td>${Number(j.work_score).toFixed(2)}</td><td>${Number(j.doc_score||0).toFixed(2)}</td>
          <td>${Number(j.deduction||0).toFixed(2)}</td>
          <td><b>${Number(j.final_score).toFixed(2)}</b></td><td>${esc(j.comment||"")}</td>
        </tr>`).join("")}
        </tbody></table></details>`:"—";
      return `<tr>
        <td class="${rankClass(x.rank)}">${x.rank??"待评"}</td>
        <td><b>${esc(x.code)}</b></td>
        <td>${x.judged_count||0}/3</td>
        <td>${scores}</td>
        <td><b>${x.avg_score==null?"—":Number(x.avg_score).toFixed(2)}</b></td>
        <td>${details}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

async function addJudge(){
  const name=judgeName.value.trim(),code=judgeCode.value.trim();
  if(!name||!code){alert("请填写专家姓名和邀请码");return}
  const r=await sb.rpc("admin_add_judge",{p_secret:adminSecret,p_name:name,p_code:code});
  if(r.error){alert(r.error.message);return}
  judgeName.value="";judgeCode.value="";
  await refreshAll();
}
async function delJudge(id){
  if(!confirm("确定删除该专家？相关评分也会删除。"))return;
  const r=await sb.rpc("admin_delete_judge",{p_secret:adminSecret,p_judge_id:id});
  if(r.error)alert(r.error.message);else refreshAll();
}
async function delWork(id){
  if(!confirm("确定删除该作品及其评分？"))return;
  const r=await sb.rpc("admin_delete_work",{p_secret:adminSecret,p_work_id:id});
  if(r.error)alert(r.error.message);else refreshAll();
}

function ext(n){return (n.split(".").pop()||"").toLowerCase()}

/* 修复部分 ZIP 内部文件名包含“孤立 UTF-16 代理字符”导致 PostgreSQL jsonb
   报 unsupported Unicode escape sequence。正常中文不受影响。 */
function sanitizeUnicode(str){
  str=String(str??"");
  let out="";
  for(let i=0;i<str.length;i++){
    const c=str.charCodeAt(i);
    if(c>=0xD800 && c<=0xDBFF){
      if(i+1<str.length){
        const n=str.charCodeAt(i+1);
        if(n>=0xDC00 && n<=0xDFFF){
          out+=str[i]+str[i+1];
          i++;
          continue;
        }
      }
      out+="�";
    }else if(c>=0xDC00 && c<=0xDFFF){
      out+="�";
    }else{
      out+=str[i];
    }
  }
  // Windows 压缩包里偶尔使用反斜杠，统一成 /；去掉 NUL 和不可见控制字符
  return out.replace(/\\\\/g,"/").replace(/\u0000/g,"").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g,"");
}
function basenameNoExt(path){
  const b=(path||"").split("/").filter(Boolean).pop()||"";
  return b.replace(/\.[^.]+$/,"");
}
function cleanPersonKey(s){
  return (s||"")
    .replace(/[（(].*?[）)]/g,"")
    .replace(/[-_+—–\s]+/g," ")
    .replace(/(学生组|职工组|教师组|学生|职工|教师|作品|设计说明|说明文档|设计报告|思路报告|报告|效果图|主图|展板|三视图|源文件|最终版|定稿|参赛)/gi," ")
    .replace(/\s+/g," ")
    .trim();
}
function isSensitiveName(name){
  return /(汇总|报名表?|报名信息|报名材料|名单|选手信息|参赛信息|信息汇总|统计表?|评分表?|打分表?|评审表?|成绩表?|获奖|登记表?)/i.test(name||"");
}

async function extractZip(file){
  const zip=await JSZip.loadAsync(file);
  const result=[];
  for(const e of Object.values(zip.files)){
    if(e.dir||e.name.includes("__MACOSX/"))continue;
    result.push({name:e.name.replace(/^\/+/,""), blob:await e.async("blob")});
  }
  return result;
}

let _ArchiveClass=null;
async function getArchiveClass(){
  if(_ArchiveClass)return _ArchiveClass;
  try{
    const mod=await import("https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/main.js");
    const workerResp=await fetch("https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js");
    if(!workerResp.ok)throw new Error("无法加载解压组件");
    const workerCode=await workerResp.text();
    const workerUrl=URL.createObjectURL(new Blob([workerCode],{type:"text/javascript"}));
    mod.Archive.init({workerUrl});
    _ArchiveClass=mod.Archive;
    return _ArchiveClass;
  }catch(e){
    throw new Error("RAR / 7Z 在线解压组件加载失败。请检查网络后重试；ZIP 不受影响。详情："+(e.message||e));
  }
}
async function extractRarOr7z(file){
  const Archive=await getArchiveClass();
  const archive=await Archive.open(file);
  const out=[];
  await archive.extractFiles(entry=>{
    if(entry && entry.file && entry.path){
      out.push({name:entry.path.replace(/^\/+/,""), blob:entry.file});
    }
  });
  return out;
}
async function extractArchive(file){
  const x=ext(file.name);
  if(x==="zip")return extractZip(file);
  if(x==="rar"||x==="7z")return extractRarOr7z(file);
  throw new Error("仅支持 ZIP / RAR / 7Z");
}

/* 多作品识别：
   1) 去掉所有文件共有的最外层文件夹；
   2) 如果剩余路径存在多个一级子文件夹，按一级子文件夹分组；
   3) 否则按文件名主体归并；
   4) 无法稳定归并时视为一个作品。
*/
function detectWorkGroups(entries, archiveBaseName){
  if(!entries.length)return [];

  let paths=entries.map(e=>e.name.split("/").filter(Boolean));
  const firsts=[...new Set(paths.filter(p=>p.length>1).map(p=>p[0]))];
  if(firsts.length===1 && paths.every(p=>p.length>1)){
    const root=firsts[0];
    entries=entries.map(e=>{
      const seg=e.name.split("/").filter(Boolean);
      return {...e,name:seg.slice(1).join("/")};
    });
  }

  const topFolders=[...new Set(entries
    .map(e=>e.name.split("/").filter(Boolean))
    .filter(p=>p.length>1)
    .map(p=>p[0]))];

  if(topFolders.length>=2){
    return topFolders.map(folder=>({
      label:sanitizeUnicode(folder),
      entries:entries.filter(e=>e.name.split("/").filter(Boolean)[0]===folder)
        .map(e=>{
          const seg=e.name.split("/").filter(Boolean);
          return {...e,name:seg.slice(1).join("/")};
        })
    })).filter(g=>g.entries.length);
  }

  // 同一文件夹内：按文件名主体聚类
  const candidates=new Map();
  for(const e of entries){
    if(isSensitiveName(e.name))continue;
    const stem=cleanPersonKey(basenameNoExt(e.name));
    if(!stem)continue;
    // 取前 12 个字符作为候选主体，避免“张三作品主图 / 张三设计说明”分开
    const key=stem.slice(0,12);
    if(!candidates.has(key))candidates.set(key,[]);
    candidates.get(key).push(e);
  }

  // 只把有至少2个关联文件，或本身包含图片+文档的候选作为独立作品
  const meaningful=[...candidates.entries()].filter(([k,arr])=>{
    const types=new Set(arr.map(x=>ext(x.name)));
    const hasImg=[...types].some(x=>["jpg","jpeg","png","webp","bmp"].includes(x));
    const hasDoc=[...types].some(x=>["doc","docx","pdf","ppt","pptx","txt","md"].includes(x));
    return arr.length>=2 || (hasImg&&hasDoc);
  });

  if(meaningful.length>=2){
    const used=new Set();
    const groups=meaningful.map(([k,arr])=>{
      arr.forEach(x=>used.add(x));
      return {label:sanitizeUnicode(k),entries:[...arr]};
    });
    // 敏感文件不归入任何作品，避免误发；剩余非敏感孤立文件加入第一组
    const leftovers=entries.filter(e=>!used.has(e)&&!isSensitiveName(e.name));
    if(leftovers.length)groups[0].entries.push(...leftovers);
    return groups;
  }

  return [{label:sanitizeUnicode(cleanPersonKey(archiveBaseName)||archiveBaseName),entries}];
}

function inferPrefix(fileName){
  const lower=fileName.toLowerCase();
  if(/学生|student/.test(lower))return "X";
  if(/职工|教师|教工|staff|teacher/.test(lower))return "Z";
  return "";
}

async function uploadOneDetectedWork(group, prefix){
  const cr=await sb.rpc("admin_create_work_auto",{
    p_secret:adminSecret,
    p_prefix:prefix,
    p_name:sanitizeUnicode(group.label||"匿名作品")
  });
  if(cr.error)throw cr.error;
  const wid=cr.data.id;
  const code=cr.data.code;
  const manifest=[];

  for(let k=0;k<group.entries.length;k++){
    const e=group.entries[k],blob=e.blob;
    const rawExt=ext(e.name);
    const safeExt=/^[a-z0-9]{1,10}$/i.test(rawExt)?rawExt:"bin";
    const path=`${wid}/${Date.now()}_${k}.${safeExt}`;
    const up=await sb.storage.from("works").upload(path,blob,{
      contentType:blob.type||"application/octet-stream",upsert:false
    });
    if(up.error)throw up.error;
    manifest.push({
      name:sanitizeUnicode(e.name),
      path,
      ext:rawExt,
      hidden:isSensitiveName(e.name)
    });
  }

  const mr=await sb.rpc("admin_set_manifest",{p_secret:adminSecret,p_work_id:wid,p_manifest:manifest});
  if(mr.error)throw mr.error;
  return code;
}

async function uploadZips(){
  const files=[...zipFiles.files];
  if(!files.length){alert("请选择 ZIP、RAR 或 7Z 文件");return}

  // 编号统一由数据库生成，避免刷新不及时、失败重试导致重复编号。
  prog.classList.remove("hidden");
  let doneArchives=0;
  const detectedSummary=[];

  for(const file of files){
    uploadMsg.textContent=`正在识别 ${file.name}…`;
    const prefix=inferPrefix(file.name);
    if(!prefix){
      alert(`${file.name} 无法判断组别。\n请在压缩包文件名中加入“学生组”或“职工组”后重新上传。`);
      doneArchives++; progBar.style.width=(doneArchives/files.length*100)+"%";
      continue;
    }

    try{
      const entries=await extractArchive(file);
      const groups=detectWorkGroups(entries,file.name.replace(/\.(zip|rar|7z)$/i,""));
      detectedSummary.push({archive:file.name,count:groups.length,labels:groups.map(g=>g.label)});

      for(const group of groups){
        await uploadOneDetectedWork(group,prefix);
      }
    }catch(err){
      alert(`${file.name} 上传失败：${err.message||err}`);
    }

    doneArchives++;
    progBar.style.width=(doneArchives/files.length*100)+"%";
  }

  uploadMsg.innerHTML="上传完成。<div class='detect-box'>"+
    detectedSummary.map(x=>`<div class='detect-item'><div class='detect-title'>${esc(x.archive)} → 识别为 ${x.count} 件作品</div><div class='detect-files'>${x.labels.map(esc).join("、")}</div></div>`).join("")+
    "</div>";

  await refreshAll();
}

function buildRankRows(){
  return summary.map(x=>{
    const js=x.judge_scores||[];
    const row={
      "排名":x.rank??"",
      "作品编号":x.code,
      "已评专家数":x.judged_count||0,
      "平均分":x.avg_score==null?"":Number(x.avg_score)
    };
    for(let i=0;i<3;i++){
      const j=js[i];
      row[`评委${i+1}姓名`]=j?.judge_name||"";
      row[`评委${i+1}最终得分`]=j?Number(j.final_score):"";
    }
    return row;
  });
}

function buildDetailRows(){
  const rows=[];
  for(const x of summary){
    for(const j of (x.judge_scores||[])){
      rows.push({
        "排名":x.rank??"",
        "作品编号":x.code,
        "评委":j.judge_name,
        "IP形象三视图规范度（24）":Number(j.c1),
        "数字化视觉设计表现（20）":Number(j.c2),
        "枣庄新兴产业推广性（20）":Number(j.c3),
        "IP衍生设计与前沿性（16）":Number(j.c4),
        "作品评分（80）":Number(j.work_score),
        "说明文档评分（20）":Number(j.doc_score||0),
        "扣分":Number(j.deduction||0),
        "最终得分":Number(j.final_score),
        "评语":j.comment||""
      });
    }
  }
  return rows;
}

function downloadText(name,text,type){
  const b=new Blob([text],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);a.download=name;a.click();
}
function exportCsv(){
  const rows=buildDetailRows();
  const headers=Object.keys(rows[0]||{
    "排名":"","作品编号":"","评委":"","IP形象三视图规范度（24）":"",
    "数字化视觉设计表现（20）":"","枣庄新兴产业推广性（20）":"",
    "IP衍生设计与前沿性（16）":"","作品评分（80）":"",
    "说明文档评分（20）":"","扣分":"","最终得分":"","评语":""
  });
  const lines=[headers.map(csvCell).join(",")];
  for(const r of rows)lines.push(headers.map(h=>csvCell(r[h]??"")).join(","));
  downloadText("专家评分明细.csv","\ufeff"+lines.join("\r\n"),"text/csv;charset=utf-8");
}
function exportExcel(){
  if(typeof XLSX==="undefined"){alert("Excel 导出组件未加载，请刷新页面后重试");return}
  const wb=XLSX.utils.book_new();
  const rankRows=buildRankRows();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rankRows.length?rankRows:[{"排名":"","作品编号":"","已评专家数":"","平均分":""}]),"成绩排名");

  const detailRows=buildDetailRows();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detailRows.length?detailRows:[{
    "排名":"","作品编号":"","评委":"","IP形象三视图规范度（24）":"",
    "数字化视觉设计表现（20）":"","枣庄新兴产业推广性（20）":"",
    "IP衍生设计与前沿性（16）":"","作品评分（80）":"",
    "说明文档评分（20）":"","扣分":"","最终得分":"","评语":""
  }]),"评委评分明细");

  const rubric=[
    ["部分","评价维度","评分要点","分值"],
    ["作品80%","IP形象三视图规范度","视图完整（正/侧/背）；比例统一、造型一致；线条规范，适合数字化二次制作",24],
    ["作品80%","数字化视觉设计表现","具备数字科技视觉语言与数字化视觉表现力；色彩质感适配线上传播",20],
    ["作品80%","枣庄新兴产业推广性","紧扣枣庄新兴产业数字化主题；融入枣庄地域文化符号；记忆点强，适合新媒体、城市宣传推广",20],
    ["作品80%","IP衍生设计与前沿性","应用场景效果图完整；IP造型可拓展虚拟形象、文创等；创意新颖，具有前沿性",16],
    ["说明文档20%","说明文档质量","创作思路清晰；主题表达准确；技术应用说明完整；与作品内容一致，结构规范、逻辑清楚",20],
    ["合计","","",100],
    [],
    ["扣分说明","抄袭、侵权、AI痕迹明显","扣20–40分"],
    ["扣分说明","文字错误、画面低级瑕疵","每处扣2分"],
    ["扣分说明","严重偏离主题、没有围绕IP形象设计、没有三视图","最终得分原则上控制在60分以下"]
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rubric),"评分标准");
  XLSX.writeFile(wb,"三评委专家评审成绩.xlsx");
}
