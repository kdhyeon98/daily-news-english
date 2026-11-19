
const $ = s => document.querySelector(s);
const today = new Date().toLocaleDateString("en-CA");
const key = "dne-zero-v1";

let db = JSON.parse(localStorage.getItem(key) || '{"lessons":[],"records":[]}');
db.lessons = db.lessons || [];
db.records = db.records || [];
db.vocabulary = db.vocabulary || [];

let session = "morning";
let articles = [];
const articleWordCache = new Map();

const demo = [
  {id:"am-demo",date:today,session:"morning",title:"News is being loaded",source:"Daily News English",url:"https://www.bbc.com/news",status:"unverified",topic:"World",duration:"약 10분"},
  {id:"pm-demo",date:today,session:"evening",title:"News is being loaded",source:"Daily News English",url:"https://www.bbc.com/news",status:"unverified",topic:"Listening",duration:"약 1분"}
];

const STOPWORDS = new Set(`
about above across after again against almost along already also although always
among another any anyone anything around because become been before being below
between both business came can cannot could country countries current daily
during each early economic economy even every expected first following from
further general government governments group groups have having here however
including into itself just large later least less made make many market markets
might more most much must near need never new news next none nothing number
often once only other others our out over own part people person place policy
public rather really recently said same several should since some something
still such take than that the their them then there these they thing things
think those through time today together under until upon very was were what
when where which while who why will with within without would year years
according administration agency announced around authorities officials
officials report reported reports statement statements monday tuesday
wednesday thursday friday saturday sunday january february march april may
june july august september october november december
international national regional global latest major
million billion trillion percent percentage
company companies officials leaders minister president
country countries world
`.trim().split(/\s+/));

const ADVANCED_WORDS = new Set(`
accountability adverse alleviate amid apprehension austerity bolster
cohesion contentious deteriorate discrepancy disruption exacerbate
expenditure facilitate fiscal fluctuate foster hamper implication
incentive infrastructure instability intervention mitigate momentum
persistent pivotal prevalence recession resilience scrutiny substantial
sustainable unprecedented volatile vulnerability vulnerable
acknowledge allocate anticipate apparent assert capacity compelling
consecutive consensus constraint controversial credible cumulative
decline deficit deploy deteriorate diminish disclose emerge emphasis
enforce enhance ensure establish estimate evaluate evidence expand
exposure framework fundamental generate impose incentive incorporate
inevitable influence initiative insight integral intensify interpret
justify legislation substantial undermine undertake widespread
`.trim().split(/\s+/));

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
    const u=new URL(s);
    return ["https:","http:"].includes(u.protocol)?u.href:"#";
  }catch{return "#";}
}

function current(){
  return db.lessons.find(x=>x.date===today&&x.session===session)
    ||demo.find(x=>x.session===session);
}

function rec(id){
  return db.records.find(x=>x.lessonId===id)
    ||{lessonId:id,summary:"",dictation:"",notes:"",difficulty:3,completed:false,dictationDone:false};
}

function upsert(r){
  db.records=db.records.filter(x=>x.lessonId!==r.lessonId);
  db.records.push(r);
  save();
}

function assignNews(){
  if(!articles.length)return;

  const morningArticle=
    articles.find(a=>["World","Business","Science","Technology"].includes(a.topic))
    ||articles[0];

  const eveningArticle=
    articles.find(a=>a.id!==morningArticle.id)||morningArticle;

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
    if(!response.ok)throw new Error("News unavailable");

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
    if(manual)manual.before(section);
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
            <button class="btn" data-extract="${esc(a.id)}">핵심 어휘 5개 추출</button>
          </div>
          <div id="article-vocab-${esc(a.id)}"></div>
        </div>
      `).join("")}
    `;
  }

  $("#reloadNews")?.addEventListener("click",loadNews);

  section.querySelectorAll("[data-pick]").forEach(button=>{
    button.addEventListener("click",()=>{
      const article=articles.find(a=>a.id===button.dataset.pick);
      if(!article)return;

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

  section.querySelectorAll("[data-extract]").forEach(button=>{
    button.addEventListener("click",()=>{
      const article=articles.find(a=>a.id===button.dataset.extract);
      if(article)extractArticleVocabulary(article);
    });
  });
}

// 뉴스 제목과 RSS 요약에서 고급 어휘 후보를 고른다.
function extractCandidates(article){
  const text=(article.title||"")+" "+(article.summary||"");
  const words=text.toLowerCase().match(/\b[a-z][a-z'-]{5,}\b/g)||[];
  const counts={};

  words.forEach(raw=>{
    const word=raw.replace(/['-]/g,"");
    if(word.length<6||STOPWORDS.has(word))return;
    if(!/^[a-z]+$/.test(word))return;
    counts[word]=(counts[word]||0)+1;
  });

  return Object.entries(counts)
    .map(([word,count])=>({
      word,
      score:
        Math.min(word.length,12)+
        count*2+
        (ADVANCED_WORDS.has(word)?12:0)
    }))
    .sort((a,b)=>b.score-a.score)
    .slice(0,5)
    .map(x=>x.word);
}

async function getWordInfo(word){
  let part="";
  let definition="";
  let example="";
  let meaning="한국어 뜻을 가져오지 못했어요.";

  try{
    const response=await fetch(
      "https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(word)
    );

    if(response.ok){
      const data=await response.json();
      const entry=data[0];
      const meanings=entry.meanings||[];

      part=meanings.map(m=>m.partOfSpeech||"").filter(Boolean).slice(0,2).join(", ");
      definition=meanings
        .slice(0,2)
        .map(m=>m.definitions?.[0]?.definition||"")
        .filter(Boolean)
        .join(" / ");

      example=meanings
        .flatMap(m=>m.definitions||[])
        .find(d=>d.example)?.example||"";
    }
  }catch(error){
    console.log("Dictionary unavailable:",word,error);
  }

  try{
    const response=await fetch(
      "https://api.mymemory.translated.net/get?q="+
      encodeURIComponent(word)+"&langpair=en|ko"
    );

    if(response.ok){
      const data=await response.json();
      const translated=data.responseData?.translatedText;
      if(translated&&data.responseStatus===200)meaning=translated;
    }
  }catch(error){
    console.log("Translation unavailable:",word,error);
  }

  return {word,part,definition,example,meaning};
}

async function extractArticleVocabulary(article){
  const panel=$("#article-vocab-"+article.id);
  if(!panel)return;

  panel.innerHTML='<p class="muted">기사에서 어휘를 찾고 사전 정보를 가져오는 중이에요...</p>';

  const candidates=extractCandidates(article);

  if(!candidates.length){
    panel.innerHTML='<p class="muted">이 기사 요약에서는 어휘 후보를 찾지 못했어요. 다른 기사를 선택해 주세요.</p>';
    return;
  }

  const results=await Promise.all(candidates.map(getWordInfo));

  results.forEach(item=>{
    articleWordCache.set(item.word.toLowerCase(),item);
  });

  panel.innerHTML=`
    <div style="margin-top:14px;padding:12px;background:rgba(127,127,127,.08);border-radius:10px">
      <b>이 기사에서 찾은 핵심 어휘</b>
      <p class="muted">제목과 RSS 요약에 등장한 단어를 분석했어요.</p>
      ${results.map(item=>`
        <div class="word" style="padding:12px 0;border-bottom:1px solid #ddd">
          <b>${esc(item.word)}</b>
          <div class="muted">${esc(item.part||"")}</div>
          <p><b>한국어 뜻</b>: ${esc(item.meaning)}</p>
          ${item.definition?`<p class="muted"><b>영영 정의</b>: ${esc(item.definition)}</p>`:""}
          ${item.example?`<p class="muted"><b>예문</b>: ${esc(item.example)}</p>`:""}
          <button class="btn secondary" data-save-article-word="${esc(item.word.toLowerCase())}">단어장에 저장</button>
        </div>
      `).join("")}
    </div>
  `;

  panel.querySelectorAll("[data-save-article-word]").forEach(button=>{
    button.addEventListener("click",()=>{
      const item=articleWordCache.get(button.dataset.saveArticleWord);
      if(item)saveVocabularyWord(item,button);
    });
  });
}

function saveVocabularyWord(item,button){
  db.vocabulary=db.vocabulary||[];

  if(db.vocabulary.some(w=>w.word.toLowerCase()===item.word.toLowerCase())){
    button.textContent="이미 저장됨";
    button.disabled=true;
    return;
  }

  db.vocabulary.push({
    word:item.word,
    part:item.part,
    meaning:item.meaning,
    definition:item.definition,
    example:item.example,
    savedAt:new Date().toISOString()
  });

  save();
  button.textContent="저장 완료";
  button.disabled=true;
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

function renderVocabulary(){
  db.vocabulary=db.vocabulary||[];
  const words=db.vocabulary;

  $("#lesson").innerHTML=`
    <h2>나만의 영어 단어장</h2>
    <p class="muted">뉴스 어휘를 추출하거나 직접 검색해 저장하세요.</p>

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
    if(e.key==="Enter")searchVocabulary();
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

    if(!dictionaryResponse.ok)throw new Error("Word not found");

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

        if(translated&&translationData.responseStatus===200){
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
      const item={word:entry.word,part,meaning:korean,definition,example};
      const button=$("#saveWord");
      saveVocabularyWord(item,button);
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


/* ===== NEWS LISTENING FEATURE ===== */
(function installNewsListening() {
  const lesson = document.querySelector("#lesson");
  if (!lesson) return;

  let currentUtterance = null;
  let speechRate = 1;

  function stopSpeech() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    currentUtterance = null;
  }

  function getCurrentLesson() {
    try {
      return typeof current === "function" ? current() : null;
    } catch {
      return null;
    }
  }

  function addListeningPanel() {
    if (!lesson || !lesson.querySelector("a[href]")) return;

    const existingLink = lesson.querySelector("a[href]");
    if (existingLink) {
      existingLink.textContent = "원문·기사 내 오디오 확인 ↗";
    }

    if (lesson.querySelector("#newsListeningPanel")) return;

    const panel = document.createElement("div");
    panel.id = "newsListeningPanel";
    panel.className = "word";
    panel.style.cssText =
      "margin:16px 0;padding:16px;border-radius:12px;background:rgba(127,127,127,.08)";

    panel.innerHTML = `
      <div class="fieldtitle">뉴스 듣기</div>
      <p class="muted">
        먼저 언론사 원문을 열어 기사에 포함된 실제 음성·영상이 있는지 확인하세요.
      </p>
      <p class="muted">
        앱 음성은 실제 기자 음성이 아닌 기기 내 영어 합성 음성(TTS)입니다.
      </p>
      <div class="actions">
        <button class="btn" id="newsSpeak">앱 음성 재생</button>
        <button class="btn secondary" id="newsPause">일시정지</button>
        <button class="btn secondary" id="newsResume">이어 듣기</button>
        <button class="btn secondary" id="newsStop">정지</button>
      </div>
      <div class="fieldtitle">음성 속도</div>
      <select id="newsSpeechRate" class="input">
        <option value="0.8">0.8배속</option>
        <option value="1" selected>1.0배속</option>
        <option value="1.2">1.2배속</option>
      </select>
      <p id="newsSpeechStatus" class="muted">
        원문 음성을 우선 이용하고, 필요할 때 앱 음성을 사용하세요.
      </p>
    `;

    const linkParagraph = existingLink.closest("p");
    if (linkParagraph) {
      linkParagraph.after(panel);
    } else {
      lesson.prepend(panel);
    }

    panel.querySelector("#newsSpeechRate").onchange = e => {
      speechRate = Number(e.target.value);
    };

    panel.querySelector("#newsSpeak").onclick = () => {
      const l = getCurrentLesson();
      const status = panel.querySelector("#newsSpeechStatus");

      if (!("speechSynthesis" in window)) {
        status.textContent = "이 브라우저에서는 음성 재생을 지원하지 않습니다.";
        return;
      }

      const text = [l?.title, l?.summary]
        .filter(Boolean)
        .join(". ");

      if (!text.trim()) {
        status.textContent = "재생할 뉴스 요약이 없습니다. 원문 링크를 이용해 주세요.";
        return;
      }

      stopSpeech();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = speechRate;

      const voices = window.speechSynthesis.getVoices();
      const englishVoice =
        voices.find(v => v.lang === "en-US") ||
        voices.find(v => v.lang?.startsWith("en"));

      if (englishVoice) utterance.voice = englishVoice;

      utterance.onstart = () => {
        status.textContent = "영어 합성 음성을 재생하고 있습니다.";
      };

      utterance.onend = () => {
        status.textContent = "재생이 끝났습니다.";
      };

      utterance.onerror = () => {
        status.textContent = "음성 재생에 실패했습니다. 원문 링크를 이용해 주세요.";
      };

      currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    };

    panel.querySelector("#newsPause").onclick = () => {
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
        panel.querySelector("#newsSpeechStatus").textContent = "일시정지했습니다.";
      }
    };

    panel.querySelector("#newsResume").onclick = () => {
      if (window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
        panel.querySelector("#newsSpeechStatus").textContent = "이어서 재생합니다.";
      }
    };

    panel.querySelector("#newsStop").onclick = () => {
      stopSpeech();
      panel.querySelector("#newsSpeechStatus").textContent = "재생을 정지했습니다.";
    };
  }

  const observer = new MutationObserver(() => {
    addListeningPanel();
  });

  observer.observe(lesson, {
    childList: true,
    subtree: true
  });

  addListeningPanel();

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", stopSpeech);
  });
})();
