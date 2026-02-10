const $ = (s) => document.querySelector(s);

const els = {
  grid: $("#grid"),
  empty: $("#empty"),
  q: $("#q"),
  sort: $("#sort"),
  pillCount: $("#pillCount"),
  pillState: $("#pillState"),
  btnReload: $("#btnReload"),
  btnAdd: $("#btnAdd"),

  modal: $("#modal"),
  mName: $("#mName"),
  mUpdated: $("#mUpdated"),
  mLink: $("#mLink"),
  mNote: $("#mNote"),
  mDownload: $("#mDownload"),
  btnCopy: $("#btnCopy"),
  mFav: $("#mFav"),

  add: $("#add"),
  repo: $("#repo"),
  branch: $("#branch"),
  token: $("#token"),
  game: $("#game"),
  link: $("#link"),
  updated: $("#updated"),
  note: $("#note"),
  btnSaveGitHub: $("#btnSaveGitHub"),
  addStatus: $("#addStatus"),
};

const state = {
  data: null,
  list: [],
  favs: new Set(),
};

function esc(x){
  return String(x ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtDate(iso){
  if(!iso) return "—";
  const [y,m,d] = iso.split("-").map(Number);
  if(!y||!m||!d) return iso;
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}

function absUrl(url){
  try { return new URL(url, location.href).toString(); }
  catch { return url; }
}

function loadFavs(){
  try{
    const raw = localStorage.getItem("sv_favs_v1");
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) state.favs = new Set(arr);
  }catch{}
}
function saveFavs(){
  try{ localStorage.setItem("sv_favs_v1", JSON.stringify([...state.favs])); }catch{}
}

function sortList(arr){
  const v = els.sort.value;
  return arr.sort((a,b)=>{
    if(v === "name_asc") return (a.name||"").localeCompare(b.name||"");
    if(v === "name_desc") return (b.name||"").localeCompare(a.name||"");
    return (b.updated_at||"").localeCompare(a.updated_at||"");
  });
}

function filterList(){
  const q = els.q.value.trim().toLowerCase();
  let arr = (state.data?.saves || []).slice();
  if(q) arr = arr.filter(s => (s.name||"").toLowerCase().includes(q));
  state.list = sortList(arr);
  render();
}

function itemHTML(s){
  const fav = state.favs.has(s.id);
  return `
    <article class="item">
      <div class="top">
        <div>
          <span class="tag">PC/STEAM</span>
          <div class="n">${esc(s.name)}</div>
          <div class="m">Atualizado: <strong>${esc(fmtDate(s.updated_at))}</strong></div>
          <div class="m">${esc(s.note || "")}</div>
          ${fav ? `<div class="m" style="margin-top:6px;">⭐ Favorito</div>` : ``}
        </div>
        <button class="icon" type="button" data-open="${esc(s.id)}">➜</button>
      </div>
      <div class="actions2">
        <a class="btn" href="${esc(s.path)}" download>Baixar</a>
        <button class="btn ghost" type="button" data-open="${esc(s.id)}">Detalhes</button>
      </div>
    </article>
  `;
}

function render(){
  const total = (state.data?.saves || []).length;
  els.pillCount.textContent = `${state.list.length} / ${total} saves`;
  els.grid.innerHTML = state.list.map(itemHTML).join("");
  els.empty.hidden = state.list.length !== 0;

  els.grid.querySelectorAll("[data-open]").forEach(b=>{
    b.addEventListener("click", ()=> openModal(b.getAttribute("data-open")));
  });
}

function openModal(id){
  const s = (state.data?.saves || []).find(x=>x.id===id);
  if(!s) return;

  els.mName.textContent = s.name || "—";
  els.mUpdated.textContent = `Atualizado: ${fmtDate(s.updated_at)}`;
  els.mLink.value = absUrl(s.path || "#");
  els.mNote.textContent = s.note || "—";
  els.mDownload.href = s.path || "#";

  const isFav = state.favs.has(s.id);
  els.mFav.textContent = isFav ? "✅ Favoritado" : "⭐ Favoritar";
  els.mFav.onclick = ()=>{
    if(state.favs.has(s.id)) state.favs.delete(s.id);
    else state.favs.add(s.id);
    saveFavs();
    filterList();
    els.mFav.textContent = state.favs.has(s.id) ? "✅ Favoritado" : "⭐ Favoritar";
  };

  els.btnCopy.onclick = async ()=>{
    try{
      await navigator.clipboard.writeText(els.mLink.value);
      els.btnCopy.textContent = "Copiado!";
      setTimeout(()=> els.btnCopy.textContent="Copiar", 900);
    }catch{
      els.btnCopy.textContent = "Falhou";
      setTimeout(()=> els.btnCopy.textContent="Copiar", 900);
    }
  };

  if(typeof els.modal.showModal === "function") els.modal.showModal();
  else els.modal.setAttribute("open","open");
}

async function loadData({bust=false}={}){
  els.pillState.textContent = "Carregando…";
  const url = bust ? `./data/saves.json?v=${Date.now()}` : "./data/saves.json";
  try{
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
    els.pillState.textContent = "OK • " + new Date().toLocaleString("pt-BR");
    filterList();
  }catch(e){
    els.pillState.textContent = "Erro ao carregar JSON";
    console.error(e);
  }
}

/* =========================
   SALVAR NO GITHUB (de verdade)
   - Lê o data/saves.json no repo
   - Adiciona o novo item
   - Faz PUT via GitHub Contents API
========================= */

function slugify(s){
  return String(s||"")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)+/g,"")
    .slice(0,60);
}

function b64EncodeUnicode(str){
  // base64 seguro pra unicode
  return btoa(unescape(encodeURIComponent(str)));
}

async function ghGetJson({repo, path, branch, token}){
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      "Accept":"application/vnd.github+json",
      "Authorization": `token ${token}`
    }
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.message || "Erro ao ler arquivo no GitHub");
  const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g,""))));
  return { json: JSON.parse(content), sha: data.sha };
}

async function ghPutJson({repo, path, branch, token, sha, json, message}){
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const body = {
    message,
    branch,
    sha,
    content: b64EncodeUnicode(JSON.stringify(json, null, 2))
  };
  const res = await fetch(url, {
    method:"PUT",
    headers:{
      "Accept":"application/vnd.github+json",
      "Authorization": `token ${token}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.message || "Erro ao salvar no GitHub");
  return data;
}

async function addSaveToGitHub(){
  els.addStatus.hidden = false;
  els.addStatus.textContent = "Salvando no GitHub…";

  const repo = els.repo.value.trim();
  const branch = (els.branch.value.trim() || "main");
  const token = els.token.value.trim();

  const name = els.game.value.trim();
  const pathLink = els.link.value.trim();
  const updated = (els.updated.value.trim() || new Date().toISOString().slice(0,10));
  const note = els.note.value.trim();

  if(!repo || !token || !name || !pathLink){
    els.addStatus.textContent = "Preencha: Repo, Token, Nome e Link.";
    return;
  }

  const id = slugify(name);

  try{
    const { json, sha } = await ghGetJson({
      repo, branch, token,
      path: "data/saves.json"
    });

    const saves = Array.isArray(json.saves) ? json.saves : [];
    if(saves.some(s => s.id === id)){
      throw new Error("Já existe um save com esse nome (ID igual). Troque o nome ou edite o JSON.");
    }

    saves.unshift({
      id,
      name,
      updated_at: updated,
      path: pathLink,
      note
    });

    const next = {
      meta: {
        title: json?.meta?.title || "Steam SaveVault",
        updated_at: updated
      },
      saves
    };

    await ghPutJson({
      repo, branch, token,
      path: "data/saves.json",
      sha,
      json: next,
      message: `Add save: ${name}`
    });

    els.addStatus.textContent = "✅ Salvo no GitHub! Agora clique em Atualizar no site.";
  }catch(e){
    els.addStatus.textContent = "❌ " + (e?.message || "Erro");
  }
}

function init(){
  loadFavs();

  els.q.addEventListener("input", filterList);
  els.sort.addEventListener("change", filterList);
  els.btnReload.addEventListener("click", ()=> loadData({bust:true}));

  els.btnAdd.addEventListener("click", ()=>{
    els.addStatus.hidden = true;
    els.addStatus.textContent = "";
    if(typeof els.add.showModal === "function") els.add.showModal();
    else els.add.setAttribute("open","open");
  });

  els.btnSaveGitHub.addEventListener("click", addSaveToGitHub);

  addEventListener("keydown", (e)=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"){
      e.preventDefault(); els.q.focus();
    }
  });

  loadData();
}

init();