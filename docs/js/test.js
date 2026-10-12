// Level test: computer parts (she answers on the device) alternate with teacher parts
// (the teacher reads a script and taps ratings). Progress is saved after every answer.
import { h, $, clear, mountShell, loadJSON, store, shuffle, speak, playButton, copyText, toast, fmtDate, today } from "./app.js";

mountShell("test");
const app = clear($("#app"));

let T = null;          // level-test.json
let S = null;          // progress state (saved)
const save = () => store.set("testProgress", S);

const SKILLS = [
  { id: "vocabulary", zh: "單字", en: "Vocabulary" },
  { id: "grammar", zh: "文法", en: "Grammar" },
  { id: "listening", zh: "聽力", en: "Listening" },
  { id: "speaking", zh: "口說", en: "Speaking" },
  { id: "pronunciation", zh: "發音", en: "Pronunciation" },
];
const RATE_TALK = [
  ["0", "No answer", "沒回答／聽不懂"],
  ["1", "Words only", "只有單字或中文"],
  ["2", "Simple sentence", "簡單句（有錯沒關係）"],
  ["3", "Clear & complete", "清楚完整"],
];
const RATE_READ = [
  ["0", "Couldn't read it", "唸不出來"],
  ["1", "Slow, many stops", "很慢、常停頓"],
  ["2", "Mostly OK", "大致可以"],
  ["3", "Smooth", "流暢"],
];
const RATE_ROLE = [
  ["0", "Couldn't do it", "無法完成"],
  ["1", "Lots of help", "需要很多幫忙"],
  ["2", "Did it, some mistakes", "完成，有些錯"],
  ["3", "Smooth & natural", "自然流暢"],
];

const levelName = n => {
  if (!n) return { zh: "零基礎", en: "Absolute beginner", cefr: "" };
  const l = T.levels.find(x => x.level === n) || {};
  return { zh: l.name_zh, en: l.name_en, cefr: l.cefr };
};
const levelsOf = list => [...new Set(list.map(x => x.level))].sort((a, b) => a - b);

// ================================================================ intro
function intro() {
  clear(app);
  const history = store.get("testResults", []);
  app.append(h("div", { class: "page-head" }, h("h1", {}, "程度測驗 Level test"),
    h("p", {}, "和老師一起做，大約 45–60 分鐘。With your teacher, about 45–60 minutes.")));
  app.append(h("section", { class: "card warm narrow" }, h("p", { style: "margin:0;white-space:pre-line" }, T.intro_zh)));
  app.append(h("details", { class: "howto narrow" }, h("summary", {}, "🧑‍🏫 For the teacher"),
    h("div", {}, h("p", { style: "white-space:pre-line" }, T.intro_teacher),
      h("p", { class: "small muted", style: "margin:0" }, "Each part stops by itself (or suggests stopping) once a level is too hard, so she never has to struggle through the whole thing. Progress is saved on this device — you can close the page and continue later."))));
  app.append(h("section", { class: "card narrow" }, h("h2", {}, "8 個部分 The 8 parts"),
    h("ul", { class: "part-list" }, T.parts.map((p, i) => h("li", {},
      h("span", { class: "muted", style: "width:20px" }, i + 1),
      h("span", { style: "flex:1" }, p.title_zh, h("span", { class: "en-sub" }, p.title_en)),
      h("span", { class: "tag " + p.mode }, p.mode === "teacher" ? "🧑‍🏫 老師" : "💻 自己")))),
  ));
  const progress = store.get("testProgress");
  const actions = h("div", { class: "narrow stack" });
  if (progress && progress.stage !== "results" && progress.partIdx > 0) {
    actions.append(
      h("button", { class: "btn primary big block", type: "button", onclick: () => { S = progress; run(); } },
        `繼續 Continue (Part ${progress.partIdx + 1})`),
      h("button", { class: "btn big block", type: "button", onclick: () => { if (confirm("重新開始？Start over?")) begin(); } }, "重新開始 Start over"));
  } else {
    actions.append(h("button", { class: "btn primary big block", type: "button", onclick: begin }, "開始 Start ▶"));
  }
  app.append(actions);
  if (history.length) {
    app.append(h("section", { class: "card narrow", style: "margin-top:16px" }, h("h2", {}, "以前的結果 Past results"),
      h("ul", { class: "part-list" }, history.slice().reverse().map(r => h("li", {},
        h("span", { style: "flex:1" }, fmtDate(r.date), " · ", h("b", {}, `Level ${r.overall} ${levelName(r.overall).en}`)),
        h("button", { class: "btn small", type: "button", onclick: () => results(r, true) }, "看 View"))))));
  }
}

function begin() {
  S = { started: today(), partIdx: 0, stage: "handoff", answers: {} };
  save();
  run();
}

// ================================================================ flow
function run() {
  window.scrollTo(0, 0);
  if (S.partIdx >= T.parts.length) {
    const r = compute();
    S.stage = "results"; save();
    return results(r, false);
  }
  const part = T.parts[S.partIdx];
  S.answers[part.id] = S.answers[part.id] || {};
  if (S.stage === "handoff") return handoff(part);
  const st = S.answers[part.id];
  const done = () => { st.finished = true; S.partIdx++; S.stage = "handoff"; save(); run(); };
  ({ choice: runChoice, listen: runChoice, pairs: runChoice, interview: runInterview,
     readaloud: runReadaloud, story: runStory, roleplay: runRoleplay })[part.kind](part, st, done);
}

function handoff(part) {
  clear(app);
  const n = S.partIdx + 1;
  const teacher = part.mode === "teacher";
  const progress = h("div", { class: "progress narrow", style: "margin-bottom:14px" }, h("div", { style: `width:${(S.partIdx / T.parts.length) * 100}%` }));
  const go = () => { S.stage = "part"; save(); run(); };
  const skip = h("button", { class: "btn ghost block", type: "button", onclick: () => {
    if (!confirm("跳過這部分？Skip this part?")) return;
    S.answers[part.id] = { skipped: true, finished: true }; S.partIdx++; save(); run();
  } }, "跳過這部分 Skip this part");

  if (!teacher) {
    app.append(progress, h("section", { class: "card handoff narrow" },
      h("div", { class: "emoji" }, "💻"),
      h("div", { class: "muted", style: "font-weight:800;margin-top:10px" }, `Part ${n} / ${T.parts.length}`),
      h("h2", {}, "換你了！Your turn"),
      h("p", { style: "font-size:1.15rem;font-weight:700;margin-bottom:4px" }, part.title_zh, h("span", { class: "en-sub" }, part.title_en)),
      h("p", {}, part.student_zh),
      h("p", { class: "small muted" }, "不知道就按「我不知道」，不要用猜的喔！"),
      h("button", { class: "btn primary big block", type: "button", onclick: go }, "開始 Start ▶")),
      h("div", { class: "narrow" }, skip));
    return;
  }
  const notes = h("section", { class: "card teacher narrow", hidden: true },
    h("div", { class: "teacher-bar" }, "🧑‍🏫 Teacher notes"),
    h("p", { style: "white-space:pre-line" }, part.teacher_notes || ""),
    h("button", { class: "btn teacher big block", type: "button", onclick: go }, "Start this part ▶"));
  const reveal = h("button", { class: "btn teacher big block", type: "button", onclick: () => {
    reveal.remove(); notes.hidden = false; notes.scrollIntoView({ behavior: "smooth", block: "start" });
  } }, "我是老師 I'm the teacher ▶");
  app.append(progress, h("section", { class: "card handoff teacher narrow" },
    h("div", { class: "emoji" }, part.skill === "speaking" ? "🗣️" : part.kind === "readaloud" ? "📖" : "👂"),
    h("div", { class: "muted", style: "font-weight:800;margin-top:10px" }, `Part ${n} / ${T.parts.length}`),
    h("h2", {}, part.skill === "speaking" ? "現在是口說時間！" : "老師時間！", h("span", { class: "en-sub" }, part.skill === "speaking" ? "Speaking time with your teacher" : "Teacher's turn")),
    h("p", { style: "font-size:1.15rem;font-weight:700;margin-bottom:4px" }, part.title_zh, h("span", { class: "en-sub" }, part.title_en)),
    h("p", {}, part.student_zh),
    h("p", { class: "notice small" }, part.kind === "readaloud" || part.kind === "roleplay"
      ? "📱 請和老師一起看螢幕。Share the screen with your teacher."
      : "📱 請把手機／電腦交給老師。Please hand the device to your teacher."),
    reveal), notes, h("div", { class: "narrow" }, skip));
}

function frame(part, { teacher = false, progress = 0 } = {}) {
  clear(app);
  const box = h("section", { class: "card narrow" + (teacher ? " teacher" : "") });
  if (teacher) box.append(h("div", { class: "teacher-bar" }, "🧑‍🏫 老師模式 Teacher mode", h("span", { class: "spacer" }), part.title_en));
  box.append(h("div", { class: "qhead" },
    h("span", {}, `Part ${S.partIdx + 1}`),
    h("div", { class: "progress" }, h("div", { style: `width:${progress * 100}%` })),
    h("button", { class: "btn small ghost", type: "button", title: "暫停 Pause", onclick: intro }, "⏸")));
  app.append(box);
  return box;
}

// Suggest stopping a teacher part when a level was too hard.
function stopPrompt(part, msg, onStop, onContinue) {
  const box = frame(part, { teacher: true, progress: 1 });
  box.append(h("h2", {}, "Suggest stopping here"), h("p", {}, msg),
    h("div", { class: "stack" },
      h("button", { class: "btn teacher big block", type: "button", onclick: onStop }, "Stop this part (recommended)"),
      h("button", { class: "btn block", type: "button", onclick: onContinue }, "Try the next level anyway")));
}

function ratingButtons(scale, onPick) {
  return h("div", { class: "rating" }, scale.map(([v, en, zh]) =>
    h("button", { class: "btn", type: "button", onclick: () => onPick(Number(v)) }, h("span", {}, `${v} · ${en}`), h("small", {}, zh))));
}

// ================================================================ computer parts
function runChoice(part, st, done) {
  const items = part.items;
  st.pos = st.pos || 0;
  st.res = st.res || [];
  if (st.pos >= items.length || st.stopped) return done();
  const item = items[st.pos];
  const box = frame(part, { progress: st.pos / items.length });
  const prompt = h("div", { class: "prompt" });
  box.append(prompt);

  let options, correct;
  if (part.kind === "pairs") {
    options = shuffle([item.a, item.b]);
    correct = item.play === "a" ? item.a : item.b;
    prompt.append(h("div", { class: "sub" }, "你聽到哪一個？Which word did you hear?"),
      h("div", { class: "row", style: "justify-content:center;margin-top:10px" },
        playButton(correct, { cls: "btn primary big", label: "🔊 播放 Play" })));
    speak(correct);
  } else {
    options = shuffle(item.options);
    correct = item.options[0];
    if (part.kind === "listen") {
      prompt.append(h("div", { class: "row", style: "justify-content:center;margin-bottom:10px" },
        playButton(item.say, { cls: "btn primary big", label: "🔊 播放 Play" }), playButton(item.say, { slow: true, cls: "btn big" })),
        h("div", { class: "mid" }, item.question_zh || "你聽到什麼？"));
      speak(item.say);
    } else if (part.id === "vocab") {
      prompt.append(h("div", { class: "big" }, item.prompt),
        h("div", { class: "row", style: "justify-content:center;margin-top:8px" }, playButton(item.prompt)));
    } else {
      prompt.append(h("div", { class: "mid" }, item.prompt), item.hint_zh ? h("div", { class: "sub" }, item.hint_zh) : null);
    }
  }

  const answer = chose => {
    st.res.push({ i: st.pos, level: item.level || 0, ok: chose === correct, chose, sound: item.sound_id || null });
    st.pos++;
    // adaptive stop: at the end of a level, stop if under half right
    const next = items[st.pos];
    if (item.level && (!next || next.level !== item.level)) {
      const lv = st.res.filter(r => r.level === item.level);
      if (lv.filter(r => r.ok).length / lv.length < 0.5) st.stopped = true;
    }
    save();
    if (st.stopped || st.pos >= items.length) partDoneScreen(part, done);
    else runChoice(part, st, done);
  };
  const opts = h("div", { class: part.kind === "pairs" ? "pair-choices" : "options" },
    options.map(o => h("button", { class: "btn " + (part.kind === "pairs" ? "" : "option"), type: "button", onclick: () => answer(o) }, o)));
  box.append(opts, h("button", { class: "btn ghost block idk", type: "button", onclick: () => answer(null) },
    part.kind === "pairs" ? "不確定 Not sure" : "我不知道 I don't know"));
}

function partDoneScreen(part, done) {
  const box = frame(part, { progress: 1 });
  box.append(h("div", { class: "handoff" }, h("div", { class: "emoji" }, "👍"),
    h("h2", {}, "這部分完成了！Part done!"), h("p", { class: "muted" }, "做得很好，休息一下也可以。"),
    h("button", { class: "btn primary big block", type: "button", onclick: done }, "下一部分 Next part ▶")));
}

// ================================================================ teacher parts
function runInterview(part, st, done) {
  const levels = part.levels;
  st.li = st.li || 0; st.qi = st.qi || 0; st.ratings = st.ratings || {};
  if (st.li >= levels.length || st.stopped) return done();
  const lv = levels[st.li];
  const q = lv.questions[st.qi];
  const total = levels.reduce((n, l) => n + l.questions.length, 0);
  const pos = levels.slice(0, st.li).reduce((n, l) => n + l.questions.length, 0) + st.qi;
  const box = frame(part, { teacher: true, progress: pos / total });
  box.append(
    h("div", { class: "row", style: "margin-bottom:8px" }, h("span", { class: "badge teacher" }, `Level ${lv.level} · ${levelName(lv.level).en}`), h("span", { class: "muted small" }, `Q${st.qi + 1}/${lv.questions.length}`)),
    h("div", { class: "say-label" }, "Ask her"), h("div", { class: "say" }, q.say),
    h("div", { class: "kv", style: "margin-top:12px" },
      q.simpler ? h("div", { class: "small" }, h("b", {}, "If she's stuck: "), q.simpler) : null,
      q.good_answer ? h("div", { class: "small" }, h("b", {}, "A good answer: "), h("i", {}, q.good_answer)) : null),
    h("div", { class: "say-label", style: "margin-top:14px" }, "Rate her answer"),
    ratingButtons(RATE_TALK, r => {
      (st.ratings[lv.level] = st.ratings[lv.level] || [])[st.qi] = r;
      st.qi++;
      if (st.qi >= lv.questions.length) {
        const rs = st.ratings[lv.level];
        const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
        st.qi = 0; st.li++;
        save();
        if (avg < 1.5 && st.li < levels.length) {
          return stopPrompt(part, `Level ${lv.level} average: ${avg.toFixed(1)} / 3. The next level will probably be frustrating.`,
            () => { st.stopped = true; save(); done(); }, () => runInterview(part, st, done));
        }
      }
      save();
      runInterview(part, st, done);
    }));
}

function runReadaloud(part, st, done) {
  st.pos = st.pos || 0; st.fluency = st.fluency || {}; st.flags = st.flags || {};
  if (st.pos >= part.passages.length || st.stopped) return done();
  const p = part.passages[st.pos];
  const box = frame(part, { teacher: true, progress: st.pos / part.passages.length });
  box.append(
    h("div", { class: "row", style: "margin-bottom:8px" }, h("span", { class: "badge teacher" }, `Level ${p.level}`), h("b", {}, p.title || "")),
    h("p", { class: "muted small", style: "margin-bottom:6px" }, "👩 請大聲唸出來，慢慢唸就好。Read this aloud."),
    h("div", { class: "passage" }, p.text));
  const checks = h("div", { class: "sound-checks" }, part.checks.map(c => {
    const b = h("button", { class: "btn sound-check" + (st.flags[c.sound_id] ? " on" : ""), type: "button", onclick: () => {
      st.flags[c.sound_id] = !st.flags[c.sound_id];
      b.classList.toggle("on", !!st.flags[c.sound_id]);
      save();
    } }, h("span", {}, `${c.label_en} · ${c.label_zh}`), h("small", {}, "listen for: " + c.watch.join(", ")));
    return b;
  }));
  box.append(h("details", { style: "margin-top:14px", open: true },
    h("summary", { class: "say-label", style: "cursor:pointer" }, "Teacher: tap any sound she had trouble with"),
    h("div", { style: "margin-top:8px" }, checks)),
    h("div", { class: "say-label", style: "margin-top:14px" }, "How did she read it?"),
    ratingButtons(RATE_READ, r => {
      st.fluency[p.level] = r;
      st.pos++;
      save();
      if (r < 2 && st.pos < part.passages.length) {
        return stopPrompt(part, "That passage was hard for her. Your sound notes are saved.",
          () => { st.stopped = true; save(); done(); }, () => runReadaloud(part, st, done));
      }
      runReadaloud(part, st, done);
    }));
}

function runStory(part, st, done) {
  st.pos = st.pos || 0; st.marks = st.marks || {};
  if (st.pos >= part.stories.length || st.stopped) return done();
  const s = part.stories[st.pos];
  const marks = st.marks[s.level] = st.marks[s.level] || [];
  const box = frame(part, { teacher: true, progress: st.pos / part.stories.length });
  const next = h("button", { class: "btn teacher big block", type: "button", style: "margin-top:14px", disabled: true, onclick: () => {
    const score = marks.reduce((a, b) => a + b, 0) / s.questions.length;
    st.pos++; save();
    if (score < 0.6 && st.pos < part.stories.length) {
      return stopPrompt(part, `She got ${Math.round(score * 100)}% on this story.`,
        () => { st.stopped = true; save(); done(); }, () => runStory(part, st, done));
    }
    runStory(part, st, done);
  } }, "Next ▶");
  const refresh = () => { next.disabled = s.questions.some((_, i) => marks[i] == null); };
  box.append(
    h("div", { class: "row", style: "margin-bottom:8px" }, h("span", { class: "badge teacher" }, `Level ${s.level}`), h("b", {}, s.title || "")),
    h("div", { class: "say-label" }, "Read this aloud (natural but slow; you may read it twice)"),
    h("div", { class: "passage", style: "font-size:1.15rem" }, s.text),
    h("div", { class: "say-label", style: "margin-top:16px" }, "Then ask — she may answer in English or Chinese"),
    h("div", { class: "stack" }, s.questions.map((q, i) => {
      const btns = [["✓ Correct", 1], ["½ Partly", 0.5], ["✗ Wrong", 0]].map(([label, v]) => {
        const b = h("button", { class: "btn small" + (marks[i] === v ? " on" : ""), type: "button", onclick: () => {
          marks[i] = v; save();
          btns.forEach(x => x.classList.remove("on")); b.classList.add("on"); refresh();
        } }, label);
        return b;
      });
      return h("div", { class: "card flat", style: "margin:0;padding:12px" },
        h("div", { style: "font-weight:800" }, q.q), h("div", { class: "small muted" }, "Answer: " + q.answer),
        h("div", { class: "row", style: "margin-top:8px" }, btns));
    })), next);
  refresh();
}

function runRoleplay(part, st, done) {
  st.pos = st.pos || 0; st.ratings = st.ratings || {};
  if (st.pos >= part.scenes.length || st.stopped) return done();
  const sc = part.scenes[st.pos];
  const box = frame(part, { teacher: true, progress: st.pos / part.scenes.length });
  box.append(
    h("div", { class: "row", style: "margin-bottom:8px" }, h("span", { class: "badge teacher" }, `Level ${sc.level}`), h("b", {}, `${sc.title_en} · ${sc.title_zh}`)),
    h("div", { class: "card warm flat", style: "margin:0 0 12px" }, h("div", { style: "font-weight:800;font-size:1.15rem" }, "👩 ", sc.setup_zh)),
    h("div", { class: "say-label" }, `You are: ${sc.teacher_role}. Your lines (improvise around them)`),
    h("div", { class: "dialogue" }, sc.lines.map(l => h("div", { class: "line T" }, l))),
    sc.success_en ? h("p", { class: "small", style: "margin-top:12px" }, h("b", {}, "Success looks like: "), sc.success_en) : null,
    h("div", { class: "say-label", style: "margin-top:12px" }, "Rate the role-play"),
    ratingButtons(RATE_ROLE, r => {
      st.ratings[sc.level] = r; st.pos++; save();
      if (r < 2 && st.pos < part.scenes.length) {
        return stopPrompt(part, "This scene was hard for her.",
          () => { st.stopped = true; save(); done(); }, () => runRoleplay(part, st, done));
      }
      runRoleplay(part, st, done);
    }));
}

// ================================================================ scoring
// Highest level L such that levels 1..L were all passed.
function reached(levels, passed) {
  let n = 0;
  for (const l of levels) { if (passed(l)) n = l; else break; }
  return n;
}

function partLevel(part, st) {
  if (!st || st.skipped) return null;
  if (part.kind === "choice" || part.kind === "listen") {
    const res = st.res || [];
    return reached(levelsOf(part.items), l => {
      const all = part.items.filter(i => i.level === l).length;
      const got = res.filter(r => r.level === l);
      return got.length === all && got.filter(r => r.ok).length / all >= 0.6;
    });
  }
  if (part.kind === "pairs") {
    const res = st.res || [];
    if (!res.length) return null;
    const pct = res.filter(r => r.ok).length / part.items.length;
    return pct >= 0.9 ? 4 : pct >= 0.75 ? 3 : pct >= 0.6 ? 2 : pct >= 0.4 ? 1 : 0;
  }
  if (part.kind === "interview") {
    return reached(part.levels.map(l => l.level), l => {
      const rs = (st.ratings || {})[l] || [];
      const q = part.levels.find(x => x.level === l).questions.length;
      return rs.filter(x => x != null).length === q && rs.reduce((a, b) => a + b, 0) / q >= 2;
    });
  }
  if (part.kind === "readaloud") return reached(levelsOf(part.passages), l => ((st.fluency || {})[l] ?? -1) >= 2);
  if (part.kind === "roleplay") return reached(levelsOf(part.scenes), l => ((st.ratings || {})[l] ?? -1) >= 2);
  if (part.kind === "story") {
    return reached(levelsOf(part.stories), l => {
      const m = (st.marks || {})[l] || [];
      const q = part.stories.find(s => s.level === l).questions.length;
      return m.filter(x => x != null).length === q && m.reduce((a, b) => a + b, 0) / q >= 0.6;
    });
  }
  return null;
}

const avg = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function compute() {
  const parts = {};
  for (const p of T.parts) parts[p.id] = { kind: p.kind, skill: p.skill, title: p.title_en, level: partLevel(p, S.answers[p.id]) };
  const bySkill = id => T.parts.filter(p => p.skill === id).map(p => parts[p.id].level);
  const skills = {};
  for (const s of SKILLS) skills[s.id] = avg(bySkill(s.id));
  const overallRaw = avg(Object.values(skills));
  const overall = overallRaw == null ? 0 : Math.round(overallRaw);

  // pronunciation priorities: sounds the teacher flagged (x2) + sound pairs she missed (x1)
  const score = {};
  const ra = T.parts.find(p => p.kind === "readaloud");
  const raSt = ra && S.answers[ra.id];
  for (const [id, on] of Object.entries((raSt && raSt.flags) || {})) if (on) score[id] = (score[id] || 0) + 2;
  const pr = T.parts.find(p => p.kind === "pairs");
  for (const r of ((pr && S.answers[pr.id]) || {}).res || []) if (!r.ok && r.sound) score[r.sound] = (score[r.sound] || 0) + 1;
  const labels = Object.fromEntries((ra ? ra.checks : []).map(c => [c.sound_id, `${c.label_en} · ${c.label_zh}`]));
  const sounds = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, label: labels[id] || id }));

  const gp = T.parts.find(p => p.id === "grammar");
  const grammarMisses = (((gp && S.answers[gp.id]) || {}).res || []).filter(r => !r.ok)
    .map(r => ({ prompt: gp.items[r.i].prompt, chose: r.chose, right: gp.items[r.i].options[0] }));

  return { date: today(), overall, overallRaw, skills, parts, sounds, grammarMisses, notes: "" };
}

function recommendation(r) {
  const lines = {
    0: "Start at Unit 1 and go slowly (about 1 unit a week). Spend extra time on letters, numbers and the basic sounds. Keep Anki to 5–8 new cards a day.",
    1: "Start at Unit 1, about 1–2 units a week. Lots of listening and repeating; keep role-plays short with strong hints.",
    2: "Phase 1 at a normal pace (2 units a week). Release Units 1–2 now; push full sentences in every answer.",
    3: "Move quickly through Phase 1 (release Units 1–6 and review them fast), then start Phase 2 within 2–3 weeks.",
    4: "Release Phase 1 for review only and teach from Phase 2 (Unit 7). Bring in Phase 3 conversation units soon.",
  };
  const out = [lines[r.overall] || lines[2]];
  const L = r.skills.listening, Sp = r.skills.speaking;
  if (L != null && Sp != null && L - Sp >= 1.5) out.push("She understands much more than she can say — give speaking the most time (role-plays, voice memos, 'say it' quiz mode).");
  if (L != null && Sp != null && Sp - L >= 1.5) out.push("Her speaking is ahead of her listening — add shadowing and listening quizzes every day.");
  if (r.sounds.length) out.push(`Start pronunciation work with: ${r.sounds.slice(0, 3).map(s => s.label).join(", ")}. Set "sound_of_week" in content/week.json to "${r.sounds[0].id}".`);
  return out;
}

function summaryText(r) {
  const ln = levelName(r.overall);
  return [
    `English level test · ${fmtDate(r.date)}`,
    `Overall: Level ${r.overall} — ${ln.en} ${ln.zh}${ln.cefr ? " (" + ln.cefr + ")" : ""}`,
    "Skills: " + SKILLS.map(s => `${s.en} ${r.skills[s.id] == null ? "–" : r.skills[s.id].toFixed(1)}`).join(" · "),
    r.sounds.length ? "Sounds to work on: " + r.sounds.map(s => s.label).join(", ") : "",
    r.grammarMisses.length ? "Grammar to review: " + r.grammarMisses.map(g => `"${g.prompt}" → ${g.right}`).join("; ") : "",
    "Plan: " + recommendation(r).join(" "),
    r.notes ? "Notes: " + r.notes : "",
  ].filter(Boolean).join("\n");
}

// ================================================================ results
function results(r, fromHistory) {
  clear(app);
  window.scrollTo(0, 0);
  const ln = levelName(r.overall);
  app.append(h("section", { class: "card narrow level-result" },
    h("div", { class: "muted", style: "font-weight:800" }, "🎉 完成了！Finished! · " + fmtDate(r.date)),
    h("div", { class: "lvl", style: "margin-top:8px" }, `Level ${r.overall}`),
    h("h2", {}, `${ln.zh} · ${ln.en}`), ln.cefr ? h("div", { class: "muted" }, "CEFR " + ln.cefr) : null,
    h("p", { class: "small muted", style: "margin:10px 0 0" }, "辛苦了！這個結果是給老師安排課程用的。Thanks — this helps your teacher plan.")));

  app.append(h("section", { class: "card narrow" }, h("h2", {}, "各項能力 Skills"),
    h("div", { class: "skill-bars" }, SKILLS.map(s => {
      const v = r.skills[s.id];
      return h("div", { class: "skill-bar" },
        h("div", { class: "top" }, h("span", {}, `${s.zh} ${s.en}`), h("span", { class: "muted" }, v == null ? "skipped" : `${v.toFixed(1)} / 4`)),
        h("div", { class: "meter" }, [1, 2, 3, 4].map(i => h("span", { class: v != null && v >= i - 0.25 ? "on" : "" }))));
    }))));

  const teacher = h("section", { class: "card teacher narrow" },
    h("div", { class: "teacher-bar" }, "🧑‍🏫 For the teacher"),
    h("h3", {}, "Recommended plan"), h("ul", {}, recommendation(r).map(x => h("li", {}, x))));
  if (r.sounds.length) {
    teacher.append(h("h3", {}, "Sounds to work on (most important first)"),
      h("div", { class: "chips", style: "margin-bottom:12px" }, r.sounds.map(s => h("a", { class: "chip", href: "sounds.html#" + s.id }, s.label))));
  }
  if (r.grammarMisses.length) {
    teacher.append(h("h3", {}, "Grammar she missed"), h("ul", { class: "small" }, r.grammarMisses.map(g =>
      h("li", {}, g.prompt, " → ", h("b", {}, g.right), g.chose ? h("span", { class: "muted" }, ` (she chose “${g.chose}”)`) : h("span", { class: "muted" }, " (didn't know)")))));
  }
  teacher.append(h("h3", {}, "Part by part"), h("ul", { class: "part-list" }, T.parts.map(p => {
    const pr = r.parts[p.id] || {};
    return h("li", {}, h("span", { style: "flex:1" }, p.title_en), h("span", { class: "tag " + p.mode }, p.mode),
      h("b", { style: "width:80px;text-align:right" }, pr.level == null ? "skipped" : `Level ${pr.level}`));
  })));
  const notes = h("textarea", { placeholder: "Your notes: confidence, accent, what she enjoyed, goals she mentioned…" });
  notes.value = r.notes || "";
  teacher.append(h("label", { class: "field", style: "margin-top:12px" }, h("span", {}, "Notes"), notes));
  app.append(teacher);

  const saveResult = () => {
    r.notes = notes.value.trim();
    const hist = store.get("testResults", []);
    const i = hist.findIndex(x => x.date === r.date && x.savedAt === r.savedAt);
    if (i >= 0) hist[i] = r; else { r.savedAt = Date.now(); hist.push(r); }
    store.set("testResults", hist);
  };
  if (!fromHistory) saveResult();
  notes.addEventListener("change", saveResult);

  app.append(h("div", { class: "narrow stack no-print" },
    h("button", { class: "btn primary big block", type: "button", onclick: () => { saveResult(); copyText(summaryText(r)); } }, "📋 複製結果 Copy summary"),
    h("button", { class: "btn big block", type: "button", onclick: () => { saveResult(); window.print(); } }, "🖨️ 列印 Print / save as PDF"),
    h("button", { class: "btn ghost block", type: "button", onclick: () => { saveResult(); store.remove("testProgress"); toast("已儲存 Saved"); intro(); } }, "完成 Done")),
    h("p", { class: "small muted narrow", style: "margin-top:12px" }, "建議每 2–3 個月重做一次，看看進步多少！Retake every 2–3 months to see progress."));
}

loadJSON("level-test").then(t => {
  T = t;
  if (!T || !T.parts) throw new Error("no test");
  intro();
}).catch(() => { clear(app).append(h("p", { class: "notice bad" }, "無法載入測驗 Couldn't load the test.")); });
