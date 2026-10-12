// Teacher toolkit: 2-hour session timer with the day's lesson content, lesson plans,
// a mistake logger that feeds the "My Mistakes" Anki deck, and saved test results.
import { h, $, clear, mountShell, loadJSON, store, playButton, copyText, toast, today, fmtDate } from "./app.js";

mountShell("teacher");
const app = clear($("#app"));

const BLOCKS = [
  { id: "warmup", min: 10, en: "Warm-up chat", zh: "暖身聊天" },
  { id: "review", min: 15, en: "Anki & quiz review", zh: "複習" },
  { id: "sound", min: 30, en: "Pronunciation drill", zh: "發音練習" },
  { id: "break", min: 10, en: "Break", zh: "休息" },
  { id: "lesson", min: 30, en: "Mini-lesson", zh: "小課程" },
  { id: "roleplay", min: 20, en: "Role-play", zh: "角色扮演" },
  { id: "wrap", min: 5, en: "Wrap-up", zh: "總結" },
];
const TABS = [
  ["session", "⏱ Session"], ["lessons", "📚 Lessons"], ["mistakes", "✍️ Mistakes"],
  ["results", "📊 Test results"], ["update", "🔄 Weekly update"],
];

let lessons = [], sounds = [], week = {};
let tab = store.get("teacherTab", "session");
let unitNo = null;
let tick = null;

const lessonFor = n => lessons.find(l => l.unit_no === n) || lessons[0];
const soundName = id => (sounds.find(s => s.id === id) || {}).title_zh || id;

function render() {
  clearInterval(tick);
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, "🧑‍🏫 Teacher toolkit"),
    h("p", {}, "Everything for your 2-hour sessions. (Data stays on this device.)")));
  app.append(h("div", { class: "tabs", role: "tablist" }, TABS.map(([id, label]) =>
    h("button", { class: "chip" + (tab === id ? " on" : ""), type: "button", role: "tab", "aria-selected": String(tab === id),
      onclick: () => { tab = id; store.set("teacherTab", id); render(); } }, label))));
  const body = h("div");
  app.append(body);
  ({ session, lessons: lessonsTab, mistakes: mistakesTab, results: resultsTab, update: updateTab })[tab](body);
}

function unitPicker(onChange) {
  const sel = h("select", { "aria-label": "Unit", onchange: () => { unitNo = Number(sel.value); store.set("teacherUnit", unitNo); onChange(); } },
    lessons.map(l => h("option", { value: l.unit_no, selected: l.unit_no === unitNo ? true : null },
      `Unit ${l.unit_no} · ${l.title_en} ${l.title_zh}${l.released ? "" : " (not released yet)"}`)));
  return sel;
}

// ================================================================ session timer
function timerState() {
  return store.get("sessionTimer", { idx: 0, remaining: BLOCKS[0].min * 60, running: false, endsAt: null });
}
const fmt = s => { const a = Math.abs(Math.round(s)); return `${s < 0 ? "+" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
    });
  } catch { /* no audio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function session(body) {
  let st = timerState();
  const lesson = lessonFor(unitNo);
  const clock = h("div", { class: "clock" });
  const name = h("div", { class: "block-name" });
  const startBtn = h("button", { class: "btn primary big", type: "button" });
  const timeline = h("ul", { class: "timeline" });
  const content = h("div");
  let beeped = false;

  const remaining = () => st.running ? (st.endsAt - Date.now()) / 1000 : st.remaining;
  const persist = () => store.set("sessionTimer", st);
  const go = idx => {
    st = { idx, remaining: BLOCKS[idx].min * 60, running: st.running, endsAt: st.running ? Date.now() + BLOCKS[idx].min * 60000 : null };
    beeped = false; persist(); draw(); drawContent();
  };
  const draw = () => {
    const r = remaining();
    clock.textContent = fmt(r);
    clock.style.color = r < 0 ? "var(--bad)" : r < 60 ? "var(--warm)" : "";
    const b = BLOCKS[st.idx];
    name.textContent = `${b.en} · ${b.zh}`;
    startBtn.textContent = st.running ? "⏸ Pause" : "▶ Start";
    clear(timeline);
    let t = 0;
    BLOCKS.forEach((bl, i) => {
      timeline.append(h("li", { class: i === st.idx ? "now" : i < st.idx ? "past" : "", onclick: () => go(i) },
        h("span", { class: "t" }, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`),
        h("span", { style: "flex:1" }, `${bl.en} · ${bl.zh}`), h("span", { class: "muted small" }, `${bl.min} min`)));
      t += bl.min;
    });
    if (r <= 0 && !beeped && st.running) { beeped = true; beep(); }
  };
  const drawContent = () => { clear(content).append(blockContent(BLOCKS[st.idx].id, lessonFor(unitNo))); };

  startBtn.onclick = () => {
    if (st.running) { st = { ...st, running: false, remaining: remaining(), endsAt: null }; }
    else { st = { ...st, running: true, endsAt: Date.now() + st.remaining * 1000 }; }
    persist(); draw();
  };

  body.append(h("section", { class: "card" },
    h("label", { class: "field" }, h("span", {}, "Today's unit"), unitPicker(() => { drawContent(); })),
    h("div", { class: "timer-face" }, name, clock),
    h("div", { class: "row", style: "justify-content:center;margin:12px 0 4px" },
      h("button", { class: "btn", type: "button", onclick: () => st.idx > 0 && go(st.idx - 1) }, "◀ Prev"),
      startBtn,
      h("button", { class: "btn", type: "button", onclick: () => st.idx < BLOCKS.length - 1 && go(st.idx + 1) }, "Next ▶")),
    h("div", { class: "row", style: "justify-content:center" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => { st = { idx: 0, remaining: BLOCKS[0].min * 60, running: false, endsAt: null }; persist(); draw(); drawContent(); } }, "↺ Reset session"))),
    h("div", { class: "grid-2", style: "align-items:start" },
      h("section", { class: "card", style: "order:2" }, h("h2", {}, "Plan"), timeline),
      h("section", { style: "order:1" }, content)));
  if (!lesson) content.append(h("p", { class: "notice" }, "No lessons found."));
  draw(); drawContent();
  tick = setInterval(draw, 500);
}

// Content shown for each block of the session.
function blockContent(id, l) {
  const box = h("div", { class: "card" });
  if (!l) return box;
  if (id === "warmup") {
    box.append(h("h2", {}, "Warm-up questions"),
      h("p", { class: "muted small" }, "Just chat. Don't correct yet — note mistakes for the wrap-up."),
      ...["easy", "medium", "hard"].map(k => h("div", { style: "margin-top:10px" },
        h("span", { class: "badge" }, k), h("ul", { style: "margin:6px 0 0" }, (l.warmup?.[k] || []).map(q => h("li", {}, q))))));
  } else if (id === "review") {
    box.append(h("h2", {}, "Review"),
      h("ul", {},
        h("li", {}, "Ask her to open the site on her phone: is her 🔥 streak going? Did she do Anki every day?"),
        h("li", {}, "Quiz → 錯題複習 (missed words): go through them together."),
        h("li", {}, "Quiz → 改錯練習: last session's mistakes.")),
      h("h3", {}, "Key phrases for this unit"), phraseList(l.key_phrases));
  } else if (id === "sound") {
    const sf = l.sound_focus || {};
    box.append(h("h2", {}, `Sound focus: ${soundName(sf.sound_id)}`),
      h("ol", { class: "steps" },
        h("li", {}, "Model the sound slowly. Show your mouth. Use the steps on the Sounds page."),
        h("li", {}, "Minimal pairs: play the listening game together (she taps, you discuss)."),
        h("li", {}, "Words below: you say → she repeats → she says alone."),
        h("li", {}, "The sentence: slow, then normal speed. Record her and play it back.")),
      h("div", { class: "chips", style: "margin:12px 0" }, (sf.words || []).map(w => h("span", { class: "chip" }, w, playButton(w, { cls: "btn small ghost" })))),
      sf.sentence ? h("p", {}, h("b", {}, sf.sentence), " ", playButton(sf.sentence, { cls: "btn small" })) : null,
      sf.sound_id ? h("a", { class: "btn", href: "sounds.html#" + sf.sound_id, target: "_blank" }, "Open Sounds page ↗") : null,
      week.sound_of_week && week.sound_of_week !== sf.sound_id
        ? h("p", { class: "small muted", style: "margin-top:10px" }, `Also this week's sound: ${soundName(week.sound_of_week)}`) : null);
  } else if (id === "break") {
    box.append(h("h2", {}, "☕ Break"), h("p", {}, "Rest. If she wants, keep chatting casually in English — no corrections."));
  } else if (id === "lesson") {
    box.append(grammarCard(l), h("h3", { style: "margin-top:14px" }, "Steps (30 min)"),
      h("ol", { class: "steps" }, (l.mini_lesson || []).map(s => h("li", {}, s))));
  } else if (id === "roleplay") {
    box.append(h("h2", {}, "Role-plays"), ...(l.roleplays || []).map(roleplayView));
  } else if (id === "wrap") {
    box.append(h("h2", {}, "Wrap-up"),
      h("ol", { class: "steps" },
        h("li", {}, "Pick her 3 biggest mistakes today and fix them together."),
        h("li", {}, "Log them below → they become her “My Mistakes” Anki cards."),
        h("li", {}, "Give homework (below) and praise one thing she did well.")),
      mistakeForm(() => toast("Saved ✓")),
      h("h3", { style: "margin-top:14px" }, "Homework 作業"), h("ul", {}, (l.homework_zh || []).map(x => h("li", {}, x))));
  }
  return box;
}

function phraseList(list = []) {
  return h("div", {}, list.map(p => h("div", { class: "phrase" },
    h("div", { class: "what" }, h("b", {}, p.en), h("small", {}, p.zh)), playButton(p.en, { cls: "btn small" }))));
}

function grammarCard(l) {
  const g = l.grammar || {};
  return h("div", {},
    h("h2", {}, g.point_en || "Grammar", h("span", { class: "en-sub" }, g.point_zh || "")),
    g.explain_zh ? h("p", { class: "notice" }, g.explain_zh) : null,
    h("ul", {}, (g.examples || []).map(e => h("li", {}, h("b", {}, e.en), h("span", { class: "en-sub" }, e.zh)))),
    g.common_mistake ? h("div", { class: "card flat", style: "margin:8px 0 0;padding:12px" },
      h("div", { style: "color:var(--bad)" }, "❌ ", g.common_mistake.wrong),
      h("div", { style: "color:var(--good);font-weight:800" }, "✅ ", g.common_mistake.right),
      h("div", { class: "small muted" }, g.common_mistake.why_zh)) : null);
}

function roleplayView(r) {
  return h("div", { class: "card flat", style: "padding:14px" },
    h("div", { class: "row" }, h("span", { class: "badge " + (r.level === "easy" ? "good" : "new") }, r.level), h("b", {}, r.title)),
    h("p", { class: "small", style: "margin:8px 0" }, r.setup_zh, h("span", { class: "en-sub" }, `You: ${r.teacher_role} · She: ${r.student_role}`)),
    h("div", { class: "dialogue" }, (r.lines || []).map(x => h("div", { class: "line " + x.who },
      h("b", {}, x.who === "T" ? r.teacher_role || "You" : r.student_role || "Her"), x.en, x.zh ? h("small", {}, x.zh) : null))),
    r.teacher_twists?.length ? h("div", { style: "margin-top:10px" }, h("b", { class: "small" }, "🌀 Twists to add:"),
      h("ul", { class: "small", style: "margin:4px 0 0" }, r.teacher_twists.map(t => h("li", {}, t)))) : null);
}

// ================================================================ lessons
function lessonsTab(body) {
  const view = h("div");
  const draw = () => {
    const l = lessonFor(unitNo);
    clear(view);
    if (!l) { view.append(h("p", { class: "notice" }, "No lessons found.")); return; }
    view.append(
      h("section", { class: "card" },
        h("div", { class: "row" }, h("h2", { style: "margin:0" }, `Unit ${l.unit_no}: ${l.title_en}`), l.released ? h("span", { class: "badge good" }, "released") : h("span", { class: "badge" }, "not released")),
        h("div", { class: "muted" }, `${l.title_zh} · Phase ${l.phase}`),
        h("h3", { style: "margin-top:12px" }, "Goals"), h("ul", {}, (l.goals || []).map(g => h("li", {}, g)))),
      h("div", { class: "grid-2", style: "align-items:start" },
        h("div", {}, blockContent("warmup", l), h("section", { class: "card" }, h("h2", {}, "Key phrases"), phraseList(l.key_phrases)), blockContent("sound", l)),
        h("div", {}, blockContent("lesson", l), h("section", { class: "card" }, h("h2", {}, "Homework 作業"), h("ul", {}, (l.homework_zh || []).map(x => h("li", {}, x)))))),
      blockContent("roleplay", l));
  };
  body.append(h("label", { class: "field" }, h("span", {}, "Unit"), unitPicker(draw)), view);
  draw();
}

// ================================================================ mistakes
const csvCell = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const mistakeRow = m => [m.id, m.date, m.wrong, m.correct, m.chinese, m.note].map(x => csvCell(x || "")).join(",");

function mistakeForm(onSave) {
  const wrong = h("input", { type: "text", placeholder: "Yesterday I go to the market." });
  const correct = h("input", { type: "text", placeholder: "Yesterday I went to the market." });
  const zh = h("input", { type: "text", placeholder: "昨天我去了市場。(optional)" });
  const note = h("input", { type: "text", placeholder: "過去式要用 went (optional)" });
  return h("form", { class: "card flat", style: "padding:14px;margin-top:12px", onsubmit: e => {
    e.preventDefault();
    if (!wrong.value.trim() || !correct.value.trim()) { toast("Fill in both sentences"); return; }
    const log = store.get("mistakeLog", []);
    log.push({ id: `m-${today().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`, date: today(),
      wrong: wrong.value.trim(), correct: correct.value.trim(), chinese: zh.value.trim(), note: note.value.trim(), exported: false });
    store.set("mistakeLog", log);
    [wrong, correct, zh, note].forEach(i => { i.value = ""; });
    wrong.focus();
    onSave && onSave();
  } },
    h("label", { class: "field" }, h("span", {}, "❌ She said"), wrong),
    h("label", { class: "field" }, h("span", {}, "✅ Correct"), correct),
    h("div", { class: "grid-2" }, h("label", { class: "field" }, h("span", {}, "中文"), zh), h("label", { class: "field" }, h("span", {}, "Tip (中文 is best)"), note)),
    h("button", { class: "btn primary block", type: "submit" }, "+ Add mistake"));
}

function mistakesTab(body) {
  const listBox = h("section", { class: "card" });
  const draw = () => {
    const log = store.get("mistakeLog", []);
    const fresh = log.filter(m => !m.exported);
    clear(listBox).append(h("div", { class: "row" }, h("h2", { style: "margin:0" }, `Logged (${log.length})`), h("span", { class: "spacer" }),
      fresh.length ? h("span", { class: "badge new" }, `${fresh.length} not exported`) : null));
    if (!log.length) { listBox.append(h("p", { class: "muted", style: "margin:8px 0 0" }, "Nothing yet. Add mistakes during the session.")); return; }
    listBox.append(h("div", {}, log.slice().reverse().map(m => h("div", { class: "mistake-row" },
      h("div", { class: "what" }, h("div", { style: "color:var(--bad)" }, "❌ ", m.wrong), h("div", { style: "color:var(--good);font-weight:700" }, "✅ ", m.correct),
        h("div", { class: "small muted" }, [fmtDate(m.date), m.chinese, m.note, m.exported ? "exported" : ""].filter(Boolean).join(" · "))),
      h("button", { class: "btn small ghost", type: "button", "aria-label": "Delete", onclick: () => {
        if (!confirm("Delete this mistake?")) return;
        store.set("mistakeLog", store.get("mistakeLog", []).filter(x => x.id !== m.id)); draw();
      } }, "🗑")))));
    const rows = (fresh.length ? fresh : log).map(mistakeRow).join("\n");
    listBox.append(
      h("h3", { style: "margin-top:16px" }, fresh.length ? "New rows to add to content/mistakes.csv" : "All rows"),
      h("pre", { class: "copybox" }, rows),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: () => {
          copyText(rows);
          store.set("mistakeLog", store.get("mistakeLog", []).map(x => ({ ...x, exported: true })));
          draw();
        } }, "📋 Copy rows & mark exported"),
        h("button", { class: "btn", type: "button", onclick: () => {
          const csv = "﻿id,date,wrong,correct,chinese,note\n" + log.map(mistakeRow).join("\n") + "\n";
          const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "mistakes.csv" });
          document.body.append(a); a.click(); a.remove();
        } }, "⬇️ Download full mistakes.csv")),
      h("p", { class: "small muted", style: "margin-top:10px" }, "Paste the rows at the end of content/mistakes.csv (or replace the file with the download), run the update, and she'll get them in the “My Mistakes” deck and the 改錯練習 quiz."));
  };
  body.append(mistakeForm(draw), listBox);
  draw();
}

// ================================================================ results
function resultsTab(body) {
  const hist = store.get("testResults", []);
  if (!hist.length) {
    body.append(h("section", { class: "card" }, h("p", { style: "margin:0" }, "No test results on this device yet. ",
      h("a", { href: "test.html" }, "Start the level test →")),
      h("p", { class: "small muted", style: "margin:8px 0 0" }, "If she took the test on her phone, open the result there and tap “Copy summary”.")));
    return;
  }
  for (const r of hist.slice().reverse()) {
    body.append(h("section", { class: "card" },
      h("div", { class: "row" }, h("h2", { style: "margin:0" }, `Level ${r.overall}`), h("span", { class: "muted" }, fmtDate(r.date)), h("span", { class: "spacer" }),
        h("a", { class: "btn small", href: "test.html" }, "Open test page")),
      h("p", { class: "small", style: "margin:8px 0 0" }, Object.entries(r.skills).map(([k, v]) => `${k} ${v == null ? "–" : v.toFixed(1)}`).join(" · ")),
      r.sounds?.length ? h("p", { class: "small", style: "margin:6px 0 0" }, "Sounds: " + r.sounds.map(s => s.label).join(", ")) : null,
      r.notes ? h("p", { class: "small muted", style: "margin:6px 0 0" }, r.notes) : null));
  }
}

// ================================================================ weekly update guide
function updateTab(body) {
  body.append(h("section", { class: "card" },
    h("h2", {}, "Every week (about 5 minutes)"),
    h("ol", { class: "steps" },
      h("li", {}, h("b", {}, "content/week.json"), " — add the next unit number to ", h("code", {}, "released_units"), ", update homework, ", h("code", {}, "sound_of_week"), " and the note."),
      h("li", {}, h("b", {}, "content/mistakes.csv"), " — paste the rows from the ✍️ Mistakes tab."),
      h("li", {}, "Double-click ", h("b", {}, "update-site.cmd"), " in the project folder. It builds the decks + audio and pushes to GitHub."),
      h("li", {}, "Wait ~1 minute, then tell her: “有新卡片！” She downloads ", h("b", {}, "全部卡片 Everything"), " on the Decks page and opens it with Anki."))),
    h("section", { class: "card" },
      h("h2", {}, "Adding your own words"),
      h("p", {}, "Open ", h("b", {}, "content/vocab/unit-NN.csv"), " (one file per unit) in Excel or Google Sheets and add rows. Columns:"),
      h("pre", { class: "copybox" }, "id,unit_no,unit_en,unit_zh,english,chinese,ipa,sounds_like,example,example_zh,tip_zh\nu01-21,1,Greetings & Introductions,打招呼與自我介紹,See you later!,待會見！,/si ju ˈleɪtɚ/,see-yoo-LAY-ter,See you later at the station!,待會在車站見！,"),
      h("p", { class: "small muted", style: "margin:0" }, "Audio is made automatically. Keep the id unique — changing an id makes a new card; keeping it updates the old one without losing her progress.")),
    h("section", { class: "card" },
      h("h2", {}, "Ideas that work well"),
      h("ul", {},
        h("li", {}, "Ask for a 1-minute voice memo every weekend (topic is on the home page). Reply with 1 thing she did well + 1 sound to fix."),
        h("li", {}, "Retake the level test every 2–3 months and compare results."),
        h("li", {}, "Use her real life in role-plays: her job, her family, places she actually goes."),
        h("li", {}, "When she says something wrong twice, it goes in the mistakes deck."))));
}

Promise.all([loadJSON("lessons"), loadJSON("sounds").catch(() => []), loadJSON("week").catch(() => ({}))]).then(([l, s, w]) => {
  lessons = l || []; sounds = s || []; week = w || {};
  unitNo = store.get("teacherUnit", null) ?? week.focus_unit ?? (lessons[0] && lessons[0].unit_no);
  render();
}).catch(() => { clear(app).append(h("p", { class: "notice bad" }, "Couldn't load lessons.")); });
