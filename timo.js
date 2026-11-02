/* TIMO – Math English Buddy: a 10–15 minute voice lesson on the TIMO handbook words.
   Uses the chat page's voice, listening and card helpers (talk, startListening, addFriend, addCard…).

   A session: review up to 3 words that are due or often missed, then 2 new words.
   Each new word: 1 Listen · 2 Repeat · 3 Understand · 4 Practice · 5 Play (riddle) · 6 TIMO Challenge.
   Teaching rules:
     English first   – TIMO speaks English; Vietnamese only after two misses or a second "Con chưa hiểu".
     One question    – every question waits for the child before anything else is said.
     No answer first – a miss gets encouragement + hint + the question again; only a second miss shows the answer.
     Memory          – per word: seen, knows the word, solves the exam sentence, misses, next review day.
*/
(function(){
"use strict";
const W = window.TIMO_WORDS || [];
const SPK = "timo";
const day = () => Math.floor(Date.now() / 86400000);
const NEXT_REVIEW = [0, 1, 2, 4, 7, 14, 30];  // days until the next review, by memory level (box)

/* ---------- Memory ---------- */
let prog = store.get("timo", {});
const P = id => prog[id] || (prog[id] = {seen:0, box:0, due:0, wrong:0, right:0, wordOK:false, sentOK:false, last:0});
const save = () => store.set("timo", prog);
function schedule(id, ok){
  const p = P(id);
  p.box = ok ? Math.min(NEXT_REVIEW.length - 1, p.box + 1) : 0;
  p.due = day() + NEXT_REVIEW[p.box];
  p.last = day();
  save();
}

/* ---------- Everything TIMO says (also listed for the voice pack) ---------- */
const T = {
  hello: n => "Hello " + n + "! I'm TIMO, your math English buddy.",
  ready: "Today we are going to learn new math words. Are you ready?",
  readyBack: "Welcome back! Let's learn more math words. Are you ready?",
  great: "Great! Let's start.",
  review: "First, let's review some words you learned.",
  remember: "Do you remember this word? Listen.",
  newWord: "Now, let's learn a new word!",
  todays: w => "Today's word is " + w + ".",
  listen: "Listen carefully.",
  meaning: "Here is what it means.",
  sayAfter: s => "Now you say it: " + s + ".",
  almostWord: s => "Almost! Listen again: " + s + ". Your turn!",
  goodTry: "Good try! Let's keep going.",
  check: "Let me ask you a question.",
  practice: "Let's practice!",
  play: "Let's play a guessing game!",
  challenge: "Now, a TIMO challenge! Listen carefully.",
  hint: "Here is a hint.",
  listenAgain: "Listen again.",
  slowly: "No problem. Let me say it slowly.",
  yourTurn: "Your turn!",
  areYouThere: n => n + ", are you there? Take your time.",
  dontKnow: "That's okay! Here is a hint.",
  showAnswer: "Let me show you.",
  answerIs: x => "The answer is " + x + ".",
  iAm: w => "Yes! The word is " + w + "!",
  startsWith: l => "It starts with the letter " + l + ".",
  vnHelp: "Let me help you in Vietnamese.",
  done: n => "You did a great job today, " + n + "! See you next time!",
  wordsToday: "Today you learned:",
  allDone: "Wow! You have learned all the words. Let's review!"
};
const PRAISE = ["Excellent!", "Great job!", "Well done!", "Super!", "You got it!", "Perfect!", "Fantastic!"];
const TRY = ["Good try!", "Nice try!", "Almost!"];
const spokenWord = w => w.say.join(", ");
const riddleOf = w => ({q:w.g, a:w.keys, h:T.startsWith(w.say[0][0].toUpperCase()), ans:T.iAm(spokenWord(w))});

/* ---------- Board: the word card and pictures ---------- */
function board(w, showVi){
  const c = document.createElement("div"); c.className = "card timo-board";
  c.innerHTML = '<span class="label"></span><div class="tw"></div><div class="ipa"></div><div class="tpic"></div><button type="button" class="link-btn vi-peek">Ba mẹ xem nghĩa</button><div class="tvi" hidden></div>';
  c.querySelector(".label").textContent = window.TIMO_TOPICS[w.t] + " · Giai đoạn " + w.ph;
  c.querySelector(".tw").textContent = w.w;
  c.querySelector(".ipa").textContent = w.ipa;
  c.querySelector(".tpic").textContent = w.pic;
  c.querySelector(".tvi").textContent = w.w + " = " + w.vi;
  c.querySelector(".vi-peek").onclick = e => { e.target.hidden = true; c.querySelector(".tvi").hidden = false; };
  if (showVi){ c.querySelector(".vi-peek").hidden = true; c.querySelector(".tvi").hidden = false; }
  chat.appendChild(c); scrollDown();
}
function picCard(pic){
  if (!pic) return;
  const c = document.createElement("div"); c.className = "card timo-pic"; c.textContent = pic;
  chat.appendChild(c); scrollDown();
}

/* ---------- Talking and waiting, one question at a time ---------- */
let waiting = null, pendingHelp = false, running = false, silent = 0, current = null;
const STOP = {stop:true};
async function say(text, speech, card){
  if (!running) throw STOP;
  addFriend(text, SPK);
  if (card) card();
  await talk(speech || [text], SPK);
  if (!running) throw STOP;
}
async function sayVi(text){
  if (!running || !text) return;
  addFriend(text, SPK);
  await talk([{text, lang:"vi"}], SPK);
}
function answer(){
  return new Promise(res => {
    waiting = res;
    if (pendingHelp){ pendingHelp = false; waiting = null; res({help:true}); return; }
    setMic("idle");
    if (prefs.auto && canListen()) setTimeout(() => { if (waiting && micMode === "idle") startListening(true); }, 500);
  });
}
async function ask(text, speech, card){
  current = {text, speech};
  await say(text, speech, card);
  const r = await answer();
  if (r && r.stop) throw STOP;
  return r;
}

/* ---------- Understanding the child's answer ---------- */
const SMALL = {zero:0, oh:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
  thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19};
const TENS_W = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90};
function numbersIn(s){
  const out = [];
  String(s).replace(/\d+/g, m => { out.push(Number(m)); return m; });
  const toks = String(s).toLowerCase().replace(/-/g, " ").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  let cur = null;
  const flush = () => { if (cur !== null) out.push(cur); cur = null; };
  for (const w of toks){
    if (w in SMALL){
      if (cur !== null && cur % 10 === 0 && (cur >= 20 || cur >= 100) && SMALL[w] < 10 || cur !== null && cur >= 100 && cur % 100 === 0) cur += SMALL[w];
      else { flush(); cur = SMALL[w]; }
    } else if (w in TENS_W){
      if (cur !== null && cur >= 100 && cur % 100 === 0) cur += TENS_W[w]; else { flush(); cur = TENS_W[w]; }
    } else if (w === "hundred") cur = (cur || 1) * 100;
    else if (w === "and" && cur !== null && cur >= 100){ /* one hundred and ten */ }
    else if (w === "a" && cur === null){ /* a hundred */ }
    else flush();
  }
  flush();
  // Very short answers: "to" is often "two", "for" is "four"
  if (!out.length && toks.length <= 2){
    const homo = {to:2, too:2, for:4, won:1, ate:8, tree:3, free:3, sick:6, sex:6};
    toks.forEach(t => { if (t in homo) out.push(homo[t]); });
  }
  return out;
}
const YESES = ["yes", "yeah", "yep", "yup", "sure"], NOS = ["no", "nope"];
function judge(q, r){
  if (r.help) return "help";
  if (r.again) return "again";
  if (r.silent) return r.unclear ? "unclear" : "silent";
  const alts = r.alts || [];
  for (const a of alts){
    const t = norm(a);
    if (seqAt(t, ["do","not","know"]) >= 0 || seqAt(t, ["no","idea"]) >= 0) return "dontknow";
    if (seqAt(t, ["not","understand"]) >= 0 || seqAt(t, ["say","again"]) >= 0 || t.join(" ") === "what" || seqAt(t, ["what","does"]) >= 0) return "help";
  }
  for (const a of alts){
    const t = norm(a);
    if (q.n !== undefined){
      const target = q.n === "AGE" ? Number(prefs.age) : q.n;
      if (q.n === "AGE" ? numbersIn(a).some(x => x >= 3 && x <= 15) : numbersIn(a).includes(target)) return "right";
    }
    if (q.a){
      for (const k of q.a){
        const kt = norm(k);
        if (k === "yes" ? t.some(x => YESES.includes(x)) : k === "no" ? t.some(x => NOS.includes(x)) : seqAt(t, kt) >= 0) return "right";
      }
    }
  }
  return "wrong";
}
const answerText = q => q.ans || T.answerIs(q.n !== undefined ? (q.n === "AGE" ? prefs.age : q.n) : q.a[0]);

/* ---------- One question, with hint, second chance, then the answer ---------- */
async function quiz(q, opt = {}){
  let misses = 0, helps = 0, text = q.q;
  let speech = null;
  picCard(q.pic);
  for (let guard = 0; guard < 8; guard++){
    const r = await ask(text, speech);
    speech = null;
    const v = judge(q, r);
    if (v === "right"){
      silent = 0;
      await say(pick(PRAISE) + (q.ans ? " " + q.ans : ""));
      return {ok:true, first:misses === 0};
    }
    if (v === "again"){ text = q.q; speech = [{text:q.q, rate:prefs.rate * 0.85}]; continue; }
    if (v === "silent" || v === "unclear"){
      silent++;
      if (silent >= 3){ running = false; throw STOP; }
      text = (v === "unclear" ? "Sorry, I couldn't hear you well. Can you say it a little louder?" : T.areYouThere(kidName())) + " " + q.q;
      continue;
    }
    if (v === "help"){
      helps++;
      if (helps === 1){
        text = T.slowly + " " + q.q + (q.h ? " " + T.hint + " " + q.h : "");
        speech = [T.slowly, {text:q.q, rate:0.7}, ...(q.h ? [T.hint, q.h] : [])];
      } else {
        // Second "I don't understand": now Vietnamese helps (rule 1)
        await sayVi(q.vi || opt.vi || "");
        text = q.q; speech = [{text:q.q, rate:0.8}];
      }
      continue;
    }
    // wrong or "I don't know"
    misses++;
    silent = 0;
    if (misses === 1){
      const lead = v === "dontknow" ? T.dontKnow : pick(TRY) + (q.h ? " " + T.hint : "");
      text = lead + (q.h ? " " + q.h : "") + " " + T.listenAgain + " " + q.q;
      continue;
    }
    // second miss: show the answer, then Vietnamese support if it was the exam sentence
    await say(T.showAnswer + " " + answerText(q));
    if (opt.viAfter && (q.vi || opt.vi)){ await sayVi(T.vnHelpVi + " " + (q.vi || opt.vi)); }
    return {ok:false, first:false};
  }
  return {ok:false, first:false};
}
T.vnHelpVi = "Câu này nghĩa là:";

/* ---------- Pronunciation: the child repeats the word ---------- */
async function repeatWord(w){
  const s = spokenWord(w);
  const target = makeSentence(cap(s) + ".");
  for (let attempt = 0; attempt < 2; attempt++){
    const r = attempt === 0
      ? await ask(T.sayAfter(s), [T.sayAfter(s).replace(/: .*$/, ":"), {text:s, rate:0.75}], () => addCard("target", "Con nói theo", target))
      : await ask(T.almostWord(s), ["Almost! Listen again:", {text:s, rate:0.65}, "Your turn!"]);
    if (r.help || r.again) continue;
    if (!r.alts || !r.alts.length){ continue; }
    const chk = checkSentence(target, r.alts);
    addCard("check", passes(chk) ? "Con đã nói" : "Từ màu đỏ con nói chưa rõ, bấm vào để nghe", target, chk.okItems);
    const weak = typeof unsureWords === "function" ? unsureWords()[0] : null;
    if (passes(chk) && !weak){ await say(pick(PRAISE)); return true; }
    if (passes(chk) && weak){ await say(pick(PRAISE)); return true; }
  }
  await say(T.goodTry);
  return false;
}

/* ---------- The 6 steps for a new word ---------- */
async function teachWord(w){
  const s = spokenWord(w), p = P(w.id);
  // 1 Listen
  await say(T.newWord + " " + T.todays(s.toUpperCase()) + " " + T.listen,
    [T.newWord, T.todays(s), T.listen, {text:s, rate:0.6}, {text:s, rate:0.6}, {text:s}], () => board(w));
  await say(T.meaning + " " + w.def + " " + w.ex, [T.meaning, w.def, w.ex]);
  // 2 Repeat
  await repeatWord(w);
  // 3 Understand (English first; Vietnamese only after two misses)
  let misses = 0;
  const ur = await quiz(w.u); if (!ur.first) misses++;
  let understood = ur.ok;
  if (!understood){ await sayVi(w.w + " nghĩa là " + w.vi + "."); }
  // 4 Practice
  await say(T.practice);
  let practiceOK = 0;
  for (const q of w.p){ const r = await quiz(q); if (r.ok) practiceOK++; if (!r.first) misses++; }
  // 5 Play
  await say(T.play);
  const riddle = riddleOf(w);
  const rr = await quiz(riddle);
  const played = rr.ok;
  // 6 TIMO Challenge: the exam sentence
  await say(T.challenge);
  const ch = await quiz(w.c, {viAfter:true});
  if (!rr.first) misses++;
  if (!ch.first) misses++;
  p.seen++;
  p.wordOK = p.wordOK || (understood && played);
  p.sentOK = p.sentOK || ch.ok;
  if (ch.ok) p.right++;
  p.wrong += misses;
  // Perfect run: next review later. Any miss: the word comes back next session.
  schedule(w.id, misses === 0);
  return ch.ok;
}
/* A review: hear it, say it, then the exam sentence (or the meaning if not understood yet) */
async function reviewWord(w){
  const s = spokenWord(w), p = P(w.id);
  await say(T.remember, [T.remember, {text:s, rate:0.75}, {text:s}], () => board(w));
  await repeatWord(w);
  let ok;
  if (!p.wordOK){
    const u = await quiz(w.u);
    const g = await quiz(riddleOf(w));
    p.wordOK = u.ok && g.ok;
    ok = p.wordOK;
  } else {
    // Level 2: understand the exam sentence. Alternate between the challenge and a practice question
    const q = p.seen % 2 ? w.c : w.p[1];
    const r = await quiz(q, {viAfter:true});
    if (q === w.c && r.ok) p.sentOK = true;
    ok = r.ok;
  }
  p.seen++;
  if (ok) p.right++; else p.wrong++;
  schedule(w.id, ok);
  return ok;
}

/* ---------- Session ---------- */
function plan(only){
  if (only) return {due:[], fresh:[W.find(w => w.id === only)].filter(Boolean)};
  const today = day();
  const due = W.filter(w => prog[w.id] && prog[w.id].seen && prog[w.id].due <= today)
    .sort((a, b) => (P(b.id).wrong - P(a.id).wrong) || (P(a.id).box - P(b.id).box)).slice(0, 3);
  const fresh = W.filter(w => !prog[w.id] || !prog[w.id].seen).sort((a, b) => a.ph - b.ph || W.indexOf(a) - W.indexOf(b)).slice(0, 2);
  if (!fresh.length && !due.length){
    // Everything learned and nothing due: review the most-missed words anyway
    return {due:W.slice().sort((a, b) => P(b.id).wrong - P(a.id).wrong || P(a.id).box - P(b.id).box).slice(0, 4), fresh:[]};
  }
  return {due, fresh};
}
async function session(only){
  running = true; silent = 0;
  const name = kidName();
  const {due, fresh} = plan(only);
  const anySeen = W.some(w => prog[w.id] && prog[w.id].seen);
  const done = [];
  try{
    await ask(T.hello(name) + " " + (anySeen ? T.readyBack : T.ready));
    await say(T.great);
    if (due.length){ await say(T.review); for (const w of due){ await reviewWord(w); done.push(w); } }
    if (!fresh.length && !due.length) await say(T.allDone);
    for (const w of fresh){ await teachWord(w); done.push(w); }
    await say(T.done(name));
    summary(done);
  }catch(e){
    if (e !== STOP) console.error(e);
    if (done.length) summary(done);
  }finally{
    running = false; waiting = null;
    setMic("idle");
  }
}
function summary(words){
  const box = document.createElement("div"); box.className = "summary";
  const h = document.createElement("h2"); h.textContent = "Great job, " + kidName() + "!";
  const l = document.createElement("span"); l.className = "label"; l.textContent = "Hôm nay bé đã học với TIMO";
  const ul = document.createElement("ul");
  words.forEach(w => {
    const p = P(w.id), li = document.createElement("li");
    li.textContent = w.w + " (" + w.vi + ") · " + (p.sentOK ? "hiểu câu đề ✓" : p.wordOK ? "hiểu từ ✓, cần luyện câu đề" : "cần ôn lại");
    ul.appendChild(li);
  });
  const again = document.createElement("button"); again.type = "button"; again.className = "ghost"; again.textContent = "Học tiếp với TIMO";
  again.onclick = () => { box.remove(); session(); };
  box.append(h, l, ul, again);
  chat.appendChild(box); scrollDown();
}

/* ---------- Parent's progress page ---------- */
function progressHTML(){
  const st = w => { const p = prog[w.id]; if (!p || !p.seen) return "new"; if (p.sentOK && p.wordOK) return "sent"; if (p.wordOK) return "word"; return "learning"; };
  const counts = {new:0, learning:0, word:0, sent:0};
  W.forEach(w => counts[st(w)]++);
  let html = '<div class="tp-legend"><span class="tp new">Chưa học</span><span class="tp learning">Đang học</span><span class="tp word">Hiểu từ</span><span class="tp sent">Hiểu cả câu đề</span><span class="tp new miss">Hay nhầm</span></div>';
  html += '<p class="tp-sum">' + counts.sent + ' từ hiểu cả câu đề · ' + counts.word + ' từ hiểu nghĩa · ' + counts.learning + ' từ đang học · ' + counts.new + ' từ chưa học</p>';
  for (const ph of [1, 2, 3]){
    html += '<h3>Giai đoạn ' + ph + ' · ' + ["", "30 từ cơ bản", "27 từ mở rộng", "20 từ còn lại"][ph] + '</h3><div class="tp-grid">';
    W.filter(w => w.ph === ph).forEach(w => {
      const p = prog[w.id] || {};
      html += '<button type="button" class="tp ' + st(w) + ((p.wrong || 0) >= 2 ? " miss" : "") + '" data-id="' + w.id + '" title="' + w.vi + '">' + w.w + '</button>';
    });
    html += '</div>';
  }
  html += '<p class="note">Bấm vào một từ để TIMO dạy riêng từ đó.</p>';
  return html;
}

window.TIMO = {
  start(only){ if (!running) session(only); },
  isRunning: () => running,
  isWaiting: () => !!waiting,
  // The page hands every answer, silence and button press to TIMO while a lesson runs
  onAnswer(alts){ if (waiting){ const r = waiting; waiting = null; r({alts}); } },
  onSilence(unclear){ if (waiting){ const r = waiting; waiting = null; r({silent:true, unclear}); } },
  onHelp(){ if (waiting){ const r = waiting; waiting = null; r({help:true}); } else if (running) pendingHelp = true; },
  onAgain(){ if (waiting){ const r = waiting; waiting = null; r({again:true}); } },
  stop(){ running = false; if (waiting){ const r = waiting; waiting = null; r(STOP); } },
  progressHTML,
  resetProgress(){ prog = {}; save(); },
  // Every sentence TIMO can say, for build_voices.py (English) and the Vietnamese pack
  voiceLines(names){
    const en = new Set(), vi = new Set();
    const add = s => splitSentences(s).forEach(x => en.add(x));
    Object.values(T).forEach(v => { if (typeof v === "string" && !/[À-ỹ]/.test(v)) add(v); });
    [...PRAISE, ...TRY, "Sorry, I couldn't hear you well.", "Can you say it a little louder?", "Almost! Listen again:", "Your turn!", "Now you say it:"].forEach(add);
    names.forEach(n => { add(T.hello(n)); add(T.areYouThere(n)); add(T.done(n)); add("Great job, " + n + "!"); });
    for (const w of W){
      const s = spokenWord(w);
      add(s); add(T.todays(s)); add(T.sayAfter(s)); add(T.iAm(s)); add(w.def); add(w.ex); add(w.g);
      const qs = [w.u, ...w.p, w.c, riddleOf(w)];
      qs.forEach(q => { add(q.q); if (q.h) add(q.h); if (q.ans) add(q.ans); add(answerText(q)); });
      vi.add(w.w + " nghĩa là " + w.vi + "."); if (w.c.vi) vi.add(T.vnHelpVi + " " + w.c.vi); [w.u, ...w.p, w.c].forEach(q => { if (q.vi) vi.add(q.vi); });
    }
    return {timo:[...en].filter(Boolean), vi:[...vi]};
  }
};
})();
