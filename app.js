const $ = s => document.querySelector(s);
const today = new Date().toLocaleDateString("en-CA");
const key = "dne-zero-v1";

let db;
try {
  db = JSON.parse(localStorage.getItem(key) || '{"lessons":[],"records":[],"vocabulary":[]}');
} catch {
  db = { lessons: [], records: [], vocabulary: [] };
}
db.lessons = Array.isArray(db.lessons) ? db.lessons : [];
db.records = Array.isArray(db.records) ? db.records : [];
db.vocabulary = Array.isArray(db.vocabulary) ? db.vocabulary : [];

let session = "morning";
let articles = [];
let audioLessons = {};
const articleWordCache = new Map();

const demo = [
  {id:"am-demo",date:today,session:"morning",title:"BBC Learning English",source:"BBC Learning English",url:"https://www.bbc.co.uk/learningenglish",topic:"Listening",duration:"오디오 준비 중"},
  {id:"pm-demo",date:today,session:"evening",title:"BBC News",source:"BBC World Service",url:"https://www.bbc.co.uk/sounds/play/live:bbc_world_service",topic:"Listening",duration:"오디오 준비 중"}
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
international national regional global latest major million billion trillion
percent percentage company companies leaders minister president world
`.trim().split(/\s+/));

const ADVANCED_WORDS = new Set(`
accountability adverse alleviate amid apprehension austerity bolster cohesion
contentious deteriorate discrepancy disruption exacerbate expenditure facilitate
fiscal fluctuate foster hamper implication incentive infrastructure instability
intervention mitigate momentum persistent pivotal prevalence recession resilience
scrutiny substantial sustainable unprecedented volatile vulnerability vulnerable
acknowledge allocate anticipate apparent assert capacity compelling consecutive
consensus constraint controversial credible cumulative decline deficit deploy
diminish disclose emerge emphasis enforce enhance ensure establish estimate
evaluate evidence expand exposure framework fundamental generate impose
incorporate inevitable influence initiative insight integral intensify interpret
justify legislation undermine undertake widespread
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

function secureAudioUrl(s){
  const url=safeUrl(s);
  return url.startsWith("http://")
    ?url.replace("http://","https://")
    :url;
}

function formatDuration(value){
  const seconds=Number(value);
  if(!Number.isFinite(seconds)||seconds<=0)return "";
  const min=Math.floor(seconds/60);
  const sec=seconds%60;
  return sec?`${min}분 ${sec}초`:`${min}분`;
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

/* BBC 실제 오디오 자료를 오늘의 학습으로 연결 */
function assignAudioLessons(){
  ["morning","evening"].forEach(s=>{
    const a=audioLessons[s];
    if(!a||!a.audio_available||!a.audio_url)return;
    const existing=db.lessons.find(x=>x.date===today&&x.session===s);

    if(existing&&!existing.auto)return;

    const id=existing?.id||`audio-${today}-${s}`;
    const lesson={
      id,
      date:today,
      session:s,
      title:a.episode_title||a.title||"BBC News",
      source:a.source||"BBC",
      url:a.episode_url||a.feed_url||"",
      audio_url:secureAudioUrl(a.audio_url),
      transcript_url:a.transcript_url||"",
      transcript_available:!!a.transcript_available,
      status:"official-audio",
      topic:s==="morning"?"Learning English":"News Listening",
      summary:a.description||"",
      duration:formatDuration(a.duration),
      published:a.published||"",
      auto:true
    };

    if(existing){
      Object.assign(existing,lesson);
    }else{
      db.lessons.push(lesson);
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
    audioLessons=data.audio_lessons||{};
    assignAudioLessons();
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
    else $(".shell")?.append(section);
  }

  if(!articles.length){
    section.innerHTML=`
      <h2>오늘의 자동 뉴스</h2>
      <p class="muted">뉴스 데이터를 불러오지 못했어요.</p>
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
            <button class="btn" data-extract="${esc(a.id)}">핵심 어휘 5개 추출</button>
          </div>
          <div id="article-vocab-${esc(a.id)}"></div>
        </div>
      `).join("")}
    `;
  }

  $("#reloadNews")?.addEventListener("click",loadNews);

  section.querySelectorAll("[data-extract]").forEach(button=>{
    button.addEventListener("click",()=>{
      const article=articles.find(a=>a.id===button.dataset.extract);
      if(article)extractArticleVocabulary(article);
    });
  });
}

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
      score:Math.min(word.length,12)+count*2+(ADVANCED_WORDS.has(word)?12:0)
    }))
    .sort((a,b)=>b.score-a.score)
    .slice(0,5)
    .map(x=>x.word);
}

async function getWordInfo(word){
  let part="",definition="",example="";
  let meaning="한국어 뜻을 가져오지 못했어요.";

  try{
    const response=await fetch(
      "https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(word)
    );
    if(response.ok){
      const data=await response.json();
      const meanings=data[0].meanings||[];
      part=meanings.map(m=>m.partOfSpeech||"").filter(Boolean).slice(0,2).join(", ");
      definition=meanings.slice(0,2).map(m=>m.definitions?.[0]?.definition||"").filter(Boolean).join(" / ");
      example=meanings.flatMap(m=>m.definitions||[]).find(d=>d.example)?.example||"";
    }
  }catch(error){
    console.log("Dictionary unavailable:",word,error);
  }

  try{
    const response=await fetch(
      "https://api.mymemory.translated.net/get?q="+encodeURIComponent(word)+"&langpair=en|ko"
    );
    if(response.ok){
      const data=await response.json();
      const translated=data.responseData?.translatedText;
      if(translated&&data.responseStatus===200)meaning=translated;
    }
  }catch(error){
    console.log("Translation unavailable:",error);
  }

  return {word,part,definition,example,meaning};
}

async function extractArticleVocabulary(article){
  const panel=$("#article-vocab-"+article.id);
  if(!panel)return;

  panel.innerHTML='<p class="muted">어휘 정보를 가져오는 중이에요...</p>';
  const candidates=extractCandidates(article);

  if(!candidates.length){
    panel.innerHTML='<p class="muted">어휘 후보를 찾지 못했어요.</p>';
    return;
  }

  const results=await Promise.all(candidates.map(getWordInfo));
  results.forEach(item=>articleWordCache.set(item.word.toLowerCase(),item));

  panel.innerHTML=`
    <div style="margin-top:14px;padding:12px;background:rgba(127,127,127,.08);border-radius:10px">
      <b>이 기사에서 찾은 핵심 어휘</b>
      <p class="muted">제목과 RSS 요약을 분석했어요.</p>
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
    </div>`;

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
  const audioUrl=secureAudioUrl(l.audio_url||"");
  const hasAudio=audioUrl!=="#";
  const sourceUrl=safeUrl(l.url||"");
  const hasTranscript=!!l.transcript_available&&!!l.transcript_url;

  $("#lesson").innerHTML=`
    <div class="row">
      <span class="pill">${evening?"EVENING NEWS":"MORNING ENGLISH"}</span>
      <span class="muted">${esc(l.duration||"")}</span>
    </div>
    <div class="title">${esc(l.title)}</div>
    <div class="muted">${esc(l.source)} · ${esc(l.topic||"")}</div>
    ${l.published?`<p class="muted">방송일: ${esc(l.published)}</p>`:""}

    ${sourceUrl!=="#"?`
      <p>
        <a class="btn secondary" href="${sourceUrl}" target="_blank" rel="noopener">
          BBC 공식 에피소드 페이지 ↗
        </a>
      </p>
    `:""}

    ${hasAudio?`
      <section class="word" style="margin:16px 0;padding:16px">
        <h3>BBC 실제 오디오</h3>
        <audio controls preload="none" playsinline style="width:100%">
          <source src="${audioUrl}" type="audio/mpeg">
          오디오를 재생할 수 없습니다.
        </audio>
        <p class="muted">
          ${evening
            ?"BBC World Service의 실제 뉴스 앵커 보도입니다."
            :"BBC Learning English의 학습자용 뉴스 오디오입니다."}
        </p>
      </section>
    `:`
      <div class="notice">
        현재 실제 오디오 주소를 찾지 못했어요.
        BBC 공식 에피소드 페이지에서 확인할 수 있습니다.
      </div>
    `}

    ${l.summary?`
      <section class="word" style="margin:16px 0;padding:14px">
        <h3>자료 안내</h3>
        <p class="muted">${esc(l.summary)}</p>
      </section>
    `:""}

    <div class="notice">
      합성 음성은 사용하지 않습니다.
      ${hasTranscript
        ?"공식 transcript가 연결되어 있습니다."
        :"현재 이 에피소드의 공식 자막은 RSS에서 확인되지 않았습니다."}
    </div>

    <div class="fieldtitle">1. 첫 청취 후 요약</div>
    <p class="muted">핵심 사건과 기자의 논지를 영어 또는 한국어로 정리하세요.</p>
    <textarea id="summary" placeholder="청취 요약">${esc(r.summary)}</textarea>

    ${evening?`
      <div class="fieldtitle">2. 받아쓰기</div>
      <p class="muted">원문을 보지 않고 들리는 대로 작성하세요.</p>
      <textarea id="dictation" placeholder="들은 내용을 입력하세요.">${esc(r.dictation)}</textarea>
      <div class="actions">
        <button class="btn secondary" id="notdone">작성 중</button>
        <button class="btn" id="dictdone">받아쓰기 완료 선언</button>
      </div>
      <div class="muted">
        ${r.dictationDone?"받아쓰기 완료를 기록했어요.":"완료 선언 전에는 답안을 공개하지 않습니다."}
      </div>
      ${!hasTranscript?`
        <div class="notice">
          공식 받아쓰기 원문이 제공되지 않아 자동 정답 비교는 할 수 없습니다.
          완료 선언은 학습 기록용으로만 저장됩니다.
        </div>
      `:""}
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
    saveDictationState(false);
  });

  $("#dictdone")?.addEventListener("click",()=>{
    saveDictationState(true);
  });
}

/* 입력값을 화면 갱신 전에 모두 저장 */
function readForm(r){
  r.summary=$("#summary")?.value??r.summary??"";
  r.dictation=$("#dictation")?.value??r.dictation??"";
  r.notes=$("#notes")?.value??r.notes??"";
  r.difficulty=Number($("#difficulty")?.value||r.difficulty||3);
  r.updatedAt=new Date().toISOString();
  return r;
}

/* 받아쓰기 상태 저장 */
function saveDictationState(done){
  const l=current();
  const r=readForm(rec(l.id));
  r.dictationDone=done;
  upsert(r);
  render();
}

/* 일반 학습 진도 저장 */
function store(done){
  const l=current();
  const r=readForm(rec(l.id));
  r.completed=done||r.completed;
  upsert(r);
  render();
}

function renderHistory(){
  let html='<h2>학습 기록</h2><p class="muted">기록은 이 기기의 브라우저에 저장됩니다.</p>';

  if(!db.records.length){
    html+='<p class="muted">아직 저장된 기록이 없습니다.</p>';
  }

  db.records.slice().reverse().forEach(r=>{
    const l=db.lessons.find(x=>x.id===r.lessonId)||demo.find(x=>x.id===r.lessonId);

    html+=`
      <div class="word">
        <b>${esc(l?.title||"이전 학습")}</b>
        <div class="muted">
          ${r.completed?"완료":"진행 중"} · 난이도 ${r.difficulty}/5 ·
          ${r.updatedAt?new Date(r.updatedAt).toLocaleString("ko-KR"):""}
        </div>
        <p>${esc(r.summary||"")}</p>
        ${r.dictation?`<p>${esc(r.dictation)}</p>`:""}
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
        if(translated&&translationData.responseStatus===200)korean=translated;
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
      saveVocabularyWord(item,$("#saveWord"));
    };
  }catch(error){
    result.innerHTML=`
      <p class="muted">검색 결과를 찾지 못했어요.</p>
      <p class="muted">철자를 확인하거나 잠시 후 다시 시도해 주세요.</p>`;
  }
}

/* 탭 이동 */
document.querySelectorAll(".tab").forEach(b=>{
  b.onclick=()=>{
    session=b.dataset.session;
    render();
  };
});

/* 백업 내보내기 */
$("#export")?.addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="daily-news-english-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* 백업 복원 */
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

/* 앱 시작 */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}

render();
loadNews();
