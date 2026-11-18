
const $ = s => document.querySelector(s);
const today = new Date().toLocaleDateString("en-CA");
const key = "dne-zero-v1";

let db = JSON.parse(localStorage.getItem(key) || '{"lessons":[],"records":[]}');
db.lessons = db.lessons || [];
db.records = db.records || [];
db.vocabulary = db.vocabulary || [];

let session = "morning";
let articles = [];

const demo = [
  {id:"am-demo",date:today,session:"morning",title:"News is being loaded",source:"Daily News English",url:"https://www.bbc.com/news",status:"unverified",topic:"World",duration:"약 10분"},
  {id:"pm-demo",date:today,session:"evening",title:"News is being loaded",source:"Daily News English",url:"https://www.bbc.com/news",status:"unverified",topic:"Listening",duration:"약 1분"}
];

function save(){
  localStorage.setItem(key,JSON.stringify(db));
}

function esc(s=""){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function safeUrl(s){
  try{
    const u = new URL(s);
    return ["https:","http:"].includes(u.protocol) ? u.href : "#";
  }catch{return "#";}
}

function current(){
  return db.lessons.find(x=>x.date===today&&x.session===session)
    || demo.find(x=>x.session===session);
}

function rec(id){
  return db.records.find(x=>x.lessonId===id)
    || {lessonId:id,summary:"",dictation:"",notes:"",difficulty:3,completed:false,dictationDone:false};
}

function upsert(r){
  db.records=db.records.filter(x=>x.lessonId!==r.lessonId);
  db.records.push(r);
  save();
}

function assignNews(){
  if(!articles.length) return;

  const morningArticle =
    articles.find(a=>["World","Business","Science","Technology"].includes(a.topic))
    || articles[0];

  const eveningArticle =
    articles.find(a=>a.id!==morningArticle.id)
    || morningArticle;

  [morningArticle,eveningArticle].forEach((a,i)=>{
    const s=i===0?"morning":"evening";
    const exists=db.lessons.find(x=>x.date===today&&x.session===s);

    if(!exists){
      db.lessons.push({
        id:`auto-${today}-${s}-${a.id}`,
        date:today,
        session:s,
        title:a.title,
        source:a.source,
        url:a.url,
        status:"unverified",
        topic:a.topic,
        summary:a.summary,
        duration:s==="morning"?"약 10분":"약 1분 구간",
        auto:true
      });
    }
  });

  save();
}

async function loadNews(){
  try{
    const response=await fetch("./data/news.json?t="+Date.now(),{cache:"no-store"});
    if(!response.ok) throw new Error("News unavailable");

    const data=await response.json();
    articles=Array.isArray(data.articles)?data.articles:[];
    assignNews();
    renderNews();
    render();
  }catch(error){
    console.log("News loading failed:",error);
    renderNews();
  }
}

function renderNews(){
  let section=$("#newsFeed");

  if(!section){
    section=document.createElement("section");
    section.id="newsFeed";
    section.className="card";

    const manual=$("#addLesson")?.closest(".card");
    if(manual) manual.before(section);
    else $(".shell").append(section);
  }

  if(!articles.length){
    section.innerHTML=`
      <h2>오늘의 자동 뉴스</h2>
      <p class="muted">뉴스 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      <button class="btn secondary" id="reloadNews">뉴스 다시 불러오기</button>`;
  }else{
    section.innerHTML=`
      <div class="row">
        <h2>오늘의 자동 뉴스</h2>
        <span class="pill">${articles.length} ARTICLES</span>
      </div>
      <p class="muted">BBC · The Guardian 공개 RSS</p>
      ${articles.slice(0,15).map(a=>`
        <div class="word" style="padding:12px 0;border-bottom:1px solid #ddd">
          <div class="muted">${esc(a.source)} · ${esc(a.topic)}</div>
          <b>${esc(a.title)}</b>
          <p class="muted">${esc(a.summary||"")}</p>
          <div class="actions">
            <a class="btn secondary" href="${safeUrl(a.url)}" target="_blank" rel="noopener">원문 보기</a>
            <button class="btn secondary" data-pick="${esc(a.id)}" data-session="morning">아침 자료로 선택</button>
            <button class="btn secondary" data-pick="${esc(a.id)}" data-session="evening">저녁 자료로 선택</button>
          </div>
        </div>
      `).join("")}
    `;
  }

  $("#reloadNews")?.addEventListener("click",loadNews);

  section.querySelectorAll("[data-pick]").forEach(button=>{
    button.addEventListener("click",()=>{
      const article=articles.find(a=>a.id===button.dataset.pick);
      if(!article) return;

      const s=button.dataset.session;
      db.lessons=db.lessons.filter(x=>!(x.date===today&&x.session===s));

      db.lessons.push({
        id:`selected-${today}-${s}-${article.id}`,
        date:today,
        session:s,
        title:article.title,
        source:article.source,
        url:article.url,
        status:"unverified",
        topic:article.topic,
        summary:article.summary,
        duration:s==="morning"?"약 10분":"약 1분 구간",
        auto:true
      });

      save();
      session=s;
      render();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
}

function render(){
  $("#today").textContent=new Date().toLocaleDateString("ko-KR",{
    month:"long",day:"numeric",weekday:"short"
  });

  $("#completed").textContent=db.records.filter(x=>x.completed).length;

  document.querySelectorAll(".tab").forEach(b=>
    b.classList.toggle("active",b.dataset.session===session)
  );

  if(session==="history"){
    renderHistory();
    return;
  }

  if(session==="vocabulary"){
    renderVocabulary();
    return;
  }

  const l=current();
  const r=rec(l.id);
  const evening=session==="evening";

  $("#lesson").innerHTML=`
    <div class="row">
      <span class="pill">${evening?"INTENSIVE LISTENING":"LISTEN + READ"}</span>
      <span class="muted">${l.duration||""}</span>
    </div>
    <div class="title">${esc(l.title)}</div>
    <div class="muted">${esc(l.source)} · ${esc(l.topic||"")}</div>
    <p><a class="btn" href="${safeUrl(l.url)}" target="_blank" rel="noopener">언론사 원본 열기 ↗</a></p>
    <div class="notice">미검증 콘텐츠입니다. 받아쓰기 정답을 공개하지 않습니다.</div>
    ${l.summary?`<p class="muted">${esc(l.summary)}</p>`:""}
    <div class="fieldtitle">1. 첫 청취 후 요약</div>
    <p class="muted">핵심 사건과 기자의 논지를 정리하세요.</p>
    <textarea id="summary" placeholder="청취 요약">${esc(r.summary)}</textarea>
    ${evening?`
      <div class="fieldtitle">2. 받아쓰기</div>
      <textarea id="dictation" placeholder="원문을 보지 않고 들리는 대로 작성하세요.">${esc(r.dictation)}</textarea>
      <div class="actions">
        <button class="btn secondary" id="notdone">작성 중</button>
        <button class="btn" id="dictdone">받아쓰기 완료 선언</button>
      </div>
      <div class="muted">${r.dictationDone?"완료 선언 기록됨.":"완료 선언 전에는 정답을 공개하지 않습니다."}</div>
    `:""}
    <div class="fieldtitle">${evening?"3":"2"}. 난이도 체감</div>
    <input id="difficulty" type="range" min="1" max="5" value="${r.difficulty}">
    <div class="muted">1 쉬움 · 5 매우 어려움 · 현재 ${r.difficulty}/5</div>
    <div class="fieldtitle">학습 메모</div>
    <textarea id="notes" placeholder="헷갈린 발음, 표현, 복습할 부분">${esc(r.notes)}</textarea>
    <div class="actions">
      <button class="btn secondary" id="save">진도 저장</button>
      <button class="btn" id="complete">학습 완료</button>
    </div>
  `;

  $("#save").onclick=()=>store(false);
  $("#complete").onclick=()=>store(true);

  $("#notdone")?.addEventListener("click",()=>{
    r.dictationDone=false;
    upsert(r);
    render();
  });

  $("#dictdone")?.addEventListener("click",()=>{
    r.dictationDone=true;
    upsert(r);
    render();
  });
}

function store(done){
  const l=current();
  const r=rec(l.id);

  r.summary=$("#summary").value;
  r.dictation=$("#dictation")?.value||"";
  r.notes=$("#notes").value;
  r.difficulty=Number($("#difficulty").value);
  r.completed=done||r.completed;
  r.updatedAt=new Date().toISOString();

  upsert(r);
  render();
}

function renderHistory(){
  let html='<h2>학습 기록</h2><p class="muted">기록은 이 기기의 브라우저에 저장됩니다.</p>';

  if(!db.records.length){
    html+='<p class="muted">아직 저장된 기록이 없습니다.</p>';
  }

  db.records.slice().reverse().forEach(r=>{
    const l=db.lessons.find(x=>x.id===r.lessonId)
      ||demo.find(x=>x.id===r.lessonId);

    html+=`
      <div class="word">
        <b>${esc(l?.title||"이전 학습")}</b>
        <div class="muted">
          ${r.completed?"완료":"진행 중"} · 난이도 ${r.difficulty}/5 ·
          ${r.updatedAt?new Date(r.updatedAt).toLocaleString("ko-KR"):""}
        </div>
      </div>`;
  });

  $("#lesson").innerHTML=html;
}

async function renderVocabulary(){
  db.vocabulary=db.vocabulary||[];

  const words=db.vocabulary;

  $("#lesson").innerHTML=`
    <h2>나만의 영어 단어장</h2>
    <p class="muted">뉴스를 읽으며 발견한 영어 단어를 검색하고 저장하세요.</p>

    <div class="fieldtitle">단어 검색</div>
    <div class="actions">
      <input id="wordSearch" class="input" placeholder="예: resilience">
      <button class="btn" id="searchWord">검색</button>
    </div>

    <div id="wordResult"></div>

    <div class="fieldtitle">저장한 단어 ${words.length}개</div>
    <div id="savedWords">
      ${words.length?words.slice().reverse().map((w,i)=>`
        <div class="word" style="padding:12px 0;border-bottom:1px solid #ddd">
          <b>${esc(w.word)}</b>
          <div class="muted">${esc(w.part||"")}</div>
          <p>${esc(w.meaning||"뜻 없음")}</p>
          ${w.definition?`<p class="muted">${esc(w.definition)}</p>`:""}
          ${w.example?`<p>예문: ${esc(w.example)}</p>`:""}
          <button class="btn secondary" data-delete-word="${words.length-1-i}">삭제</button>
        </div>
      `).join(""):'<p class="muted">아직 저장한 단어가 없습니다.</p>'}
    </div>
  `;

  $("#searchWord").onclick=searchVocabulary;
  $("#wordSearch").onkeydown=e=>{
    if(e.key==="Enter") searchVocabulary();
  };

  $("#savedWords").querySelectorAll("[data-delete-word]").forEach(btn=>{
    btn.onclick=()=>{
      db.vocabulary.splice(Number(btn.dataset.deleteWord),1);
      save();
      renderVocabulary();
    };
  });
}

async function searchVocabulary(){
  const word=$("#wordSearch").value.trim();
  const result=$("#wordResult");

  if(!word){
    result.textContent="검색할 단어를 입력해 주세요.";
    return;
  }

  result.innerHTML='<p class="muted">사전과 번역 서비스를 검색하고 있어요...</p>';

  try{
    const dictionaryResponse=await fetch(
      "https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(word)
    );

    if(!dictionaryResponse.ok) throw new Error("Word not found");

    const data=await dictionaryResponse.json();
    const entry=data[0];
    const meanings=entry.meanings||[];

    const definitions=meanings.slice(0,3).map(m=>({
      part:m.partOfSpeech||"",
      definition:m.definitions?.[0]?.definition||"",
      example:m.definitions?.find(d=>d.example)?.example||""
    }));

    const definition=definitions.map(d=>d.definition).filter(Boolean).join(" / ");
    const part=definitions.map(d=>d.part).filter(Boolean).join(", ");
    const example=definitions.map(d=>d.example).find(Boolean)||"";

    let korean="한국어 뜻을 가져오지 못했어요.";

    try{
      const translationResponse=await fetch(
        "https://api.mymemory.translated.net/get?q="+
        encodeURIComponent(entry.word)+"&langpair=en|ko"
      );

      if(translationResponse.ok){
        const translationData=await translationResponse.json();
        const translated=translationData.responseData?.translatedText;
        if(translated && translationData.responseStatus===200){
          korean=translated;
        }
      }
    }catch(error){
      console.log("Translation unavailable",error);
    }

    result.innerHTML=`
      <div class="word" style="margin-top:16px">
        <h3>${esc(entry.word)}</h3>
        <div class="muted">${esc(part)}</div>
        <p><b>한국어 뜻</b><br>${esc(korean)}</p>
        <p><b>영어 사전 설명</b><br>${esc(definition)}</p>
        ${example?`<p><b>예문</b><br>${esc(example)}</p>`:""}
        <button class="btn" id="saveWord">단어장에 저장</button>
      </div>
    `;

    $("#saveWord").onclick=()=>{
      db.vocabulary=db.vocabulary||[];

      if(db.vocabulary.some(w=>w.word.toLowerCase()===entry.word.toLowerCase())){
        alert("이미 저장된 단어예요.");
        return;
      }

      db.vocabulary.push({
        word:entry.word,
        part,
        meaning:korean,
        definition,
        example,
        savedAt:new Date().toISOString()
      });

      save();
      renderVocabulary();
    };

  }catch(error){
    result.innerHTML=`
      <p class="muted">검색 결과를 찾지 못했어요.</p>
      <p class="muted">철자를 확인하거나 잠시 후 다시 시도해 주세요.</p>
    `;
  }
}

document.querySelectorAll(".tab").forEach(b=>{
  b.onclick=()=>{
    session=b.dataset.session;
    render();
  };
});

$("#addLesson")?.addEventListener("click",()=>{
  const title=$("#customTitle").value.trim();
  const source=$("#customSource").value.trim();
  const url=safeUrl($("#customUrl").value.trim());

  if(!title||!source||url==="#"){
    alert("제목, 언론사, 유효한 URL을 입력하세요.");
    return;
  }

  const status=$("#customStatus").value;

  db.lessons=db.lessons.filter(x=>!(x.date===today&&x.session===session));

  db.lessons.push({
    id:crypto.randomUUID(),
    date:today,
    session,
    title,
    source,
    url,
    status,
    topic:"사용자 선택",
    duration:session==="morning"?"약 10분":"약 1분 구간"
  });

  save();
  render();
  alert("오늘 학습 자료를 저장했습니다.");
});

$("#export")?.addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="daily-news-english-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#importFile")?.addEventListener("change",async e=>{
  const f=e.target.files[0];
  if(!f)return;

  try{
    const data=JSON.parse(await f.text());

    if(!Array.isArray(data.lessons)||!Array.isArray(data.records)){
      throw Error();
    }

    data.vocabulary=data.vocabulary||[];
    db=data;
    save();
    render();
    alert("백업을 복원했습니다.");
  }catch{
    alert("올바른 백업 파일이 아닙니다.");
  }
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}

render();
loadNews();
