
const cfg=window.APP_CONFIG||{};
let sb=null;
function initSupabase(){
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR_PROJECT") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY==="YOUR_ANON_KEY"){
    const e=document.getElementById("setupWarn"); if(e){e.classList.remove("hidden");e.textContent="尚未配置 Supabase。请先按照《部署说明.html》完成一次免费配置。"} return false;
  }
  sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY); return true;
}
function esc(s){return (s??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function ext(n){return (n.split(".").pop()||"").toLowerCase()}
function csvCell(s){s=(s??"").toString().replaceAll('"','""');return '"'+s+'"'}
