const $=s=>document.querySelector(s), today=new Date().toLocaleDateString("en-CA");
const key="dne-zero-v1";
let db=JSON.parse(localStorage.getItem(key)||'{"lessons":[],"records":[]}'), session="morning";
const demo=[
 {id:"am-demo",date:today,session:"morning",title:"Add a verified article to begin",source:"News selection needed",url:"https://www.reuters.com/world/",status:"unverified",topic:"Current affairs",duration:"약 10분"},
 {id:"pm-demo",date:today,session:"evening",title:"Add a verified one-minute news segment",source:"News selection needed",url:"https://www.bbc.com/news",status:"unverified",topic:"Listening",duration:"약 1분 구간"}
];
function save(){localStorage.setItem(key,JSON.stringify(db));}
function current(){return db.lessons.find(x=>x.date===today&&x.session===session)||demo.find(x=>x.session===session)}
function rec(id){return db.records.find(x=>x.lessonId===id)||{lessonId:id,summary:"",dictation:"",notes:"",difficulty:3,completed:false,dictationDone:false}}
function render(){
 $("#today").textContent=new Date().toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});
 $("#completed").textContent=db.records.filter(x=>x.completed).length;
 document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.session===session));
 if(session==="history"){renderHistory();return}
 const l=current(),r=rec(l.id),evening=session==="evening";
 $("#lesson").innerHTML=`<div class="row"><span class="pill">${evening?"INTENSIVE LISTENING":"LISTEN + READ"}</span><span class="muted">${l.duration||""}</span></div>
 <div class="title">${esc(l.title)}</div><div class="muted">${esc(l.source)} · ${esc(l.topic||"")}</div>
 <p><a class="btn" href="${safeUrl(l.url)}" target="_blank" rel="noopener">언론사 원본 열기 ↗</a></p>
 <div class="notice">${l.status==="official"||l.status==="caption"?"대본 검증 상태가 사용자에 의해 등록되었습니다. 실제 영상과 원문 일치 여부를 다시 확인하세요.":"미검증 콘텐츠입니다. 받아쓰기 정답을 공개하지 않습니다."}</div>
 <div class="fieldtitle">1. 첫 청취 후 요약</div><p class="muted">핵심 사건, 근거, 기자의 논지를 영어 또는 한국어로 정리하세요.</p><textarea id="summary" placeholder="청취 요약">${esc(r.summary)}</textarea>
 ${evening?`<div class="fieldtitle">2. 받아쓰기</div><textarea id="dictation" placeholder="원문을 보지 않고 들리는 대로 작성하세요.">${esc(r.dictation)}</textarea><div class="actions"><button class="btn secondary" id="notdone">작성 중</button><button class="btn" id="dictdone">받아쓰기 완료 선언</button></div><div class="muted">${r.dictationDone?"완료 선언 기록됨. 대본 검증 후에만 교정 가능.":"완료 선언 전에는 정답을 공개하지 않습니다."}</div>`:""}
 <div class="fieldtitle">${evening?"3":"2"}. 난이도 체감</div><input id="difficulty" type="range" min="1" max="5" value="${r.difficulty}"><div class="muted">1 쉬움 · 5 매우 어려움 · 현재 ${r.difficulty}/5</div>
 <div class="fieldtitle">학습 메모</div><textarea id="notes" placeholder="헷갈린 발음, 표현, 복습할 부분">${esc(r.notes)}</textarea>
 <div class="actions"><button class="btn secondary" id="save">진도 저장</button><button class="btn" id="complete">학습 완료</button></div>`;
 $("#save").onclick=()=>store(false);$("#complete").onclick=()=>store(true);
 $("#notdone")?.addEventListener("click",()=>{r.dictationDone=false;upsert(r);render()});
 $("#dictdone")?.addEventListener("click",()=>{r.dictationDone=true;upsert(r);render()});
}
function store(done){let l=current(),r=rec(l.id);r.summary=$("#summary").value;r.dictation=$("#dictation")?.value||"";r.notes=$("#notes").value;r.difficulty=Number($("#difficulty").value);r.completed=done||r.completed;r.updatedAt=new Date().toISOString();upsert(r);render()}
function upsert(r){db.records=db.records.filter(x=>x.lessonId!==r.lessonId);db.records.push(r);save()}
function renderHistory(){let html='<h2>학습 기록</h2><p class="muted">기록은 이 기기의 브라우저에 저장됩니다.</p>';if(!db.records.length)html+='<p class="muted">아직 저장된 기록이 없습니다.</p>';db.records.slice().reverse().forEach(r=>{let l=db.lessons.find(x=>x.id===r.lessonId)||demo.find(x=>x.id===r.lessonId);html+=`<div class="word"><b>${esc(l?.title||"이전 학습")}</b><div class="muted">${r.completed?"완료":"진행 중"} · 난이도 ${r.difficulty}/5 · ${r.updatedAt?new Date(r.updatedAt).toLocaleString("ko-KR"):""}</div></div>`});$("#lesson").innerHTML=html}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(s){try{let u=new URL(s);return ["https:","http:"].includes(u.protocol)?u.href:"#"}catch{return "#"}}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{session=b.dataset.session;render()});
$("#addLesson").onclick=()=>{let title=$("#customTitle").value.trim(),source=$("#customSource").value.trim(),url=safeUrl($("#customUrl").value.trim());if(!title||!source||url==="#"){alert("제목, 언론사, 유효한 URL을 입력하세요.");return}let status=$("#customStatus").value;db.lessons=db.lessons.filter(x=>!(x.date===today&&x.session===session));db.lessons.push({id:crypto.randomUUID(),date:today,session,title,source,url,status,topic:"사용자 선택",duration:session==="morning"?"약 10분":"약 1분 구간"});save();render();alert("오늘 학습 자료를 저장했습니다.")};
$("#export").onclick=()=>{let blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="daily-news-english-backup.json";a.click();URL.revokeObjectURL(a.href)};
$("#importFile").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let data=JSON.parse(await f.text());if(!Array.isArray(data.lessons)||!Array.isArray(data.records))throw Error();db=data;save();render();alert("백업을 복원했습니다.")}catch{alert("올바른 백업 파일이 아닙니다.")}};
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
render();