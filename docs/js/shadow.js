import { h, $, clear, mountShell, loadJSON, store, speak, stopAudio, recordWidget, canListen, listen, checkSpeech,
  logActivity, toast } from "./app.js";

mountShell("shadow");
const app = clear($("#app"));
let sentences = [];
let level = store.get("shadowLevel", 1);
const LEVELS = [[1, "短句 Short"], [2, "中句 Medium"], [3, "長句 Long"]];
const REPS = 5;

function list() {
  clear(app);
  const done = store.get("shadowDone", {});
  app.append(h("div", { class: "page-head" }, h("h1", {}, "跟讀 Shadowing"),
    h("p", {}, "聽一句，馬上跟著說，模仿速度和語調。每句練 5 次。")));
  app.append(h("details", { class: "howto" }, h("summary", {}, "🔁 怎麼跟讀？How to shadow"),
    h("div", {}, h("ol", { class: "steps" },
      h("li", {}, "先聽 2 次，看中文意思。"),
      h("li", {}, "按「🐢 慢速」，一邊聽一邊小聲跟著唸。"),
      h("li", {}, "按「自動跟讀 ×5」：每次播放後有一段空白，換你大聲說。"),
      h("li", {}, "錄下自己的聲音，聽聽看跟原音哪裡不一樣。")),
      h("p", { class: "small muted", style: "margin:8px 0 0" }, "重點不是每個字都完美，而是模仿「節奏」和「語調」。"))));
  app.append(h("div", { class: "level-tabs chips" }, LEVELS.map(([n, label]) =>
    h("button", { class: "chip" + (level === n ? " on" : ""), type: "button", onclick: () => { level = n; store.set("shadowLevel", n); list(); } }, label))));
  const items = sentences.filter(s => s.level === level);
  app.append(h("div", { class: "sentence-list" }, items.map(s =>
    h("button", { class: "btn sentence-item" + (done[s.id] ? " done" : ""), type: "button", onclick: () => player(s) },
      h("span", {}, (done[s.id] ? "✅ " : "") + s.en), h("small", {}, s.zh)))));
}

function player(s) {
  clear(app);
  window.scrollTo(0, 0);
  let reps = 0, auto = false;
  const words = s.en.split(/\s+/);
  const text = h("div", { class: "shadow-text" }, s.en);
  const dots = h("div", { class: "reps", "aria-label": "Repetitions" });
  const drawDots = () => {
    clear(dots).append(...Array.from({ length: REPS }, (_, i) => h("span", { class: i < reps ? "on" : "" })));
  };
  drawDots();
  const addRep = () => {
    reps = Math.min(REPS, reps + 1);
    drawDots();
    if (reps === REPS) {
      const done = store.get("shadowDone", {});
      if (!done[s.id]) { done[s.id] = true; store.set("shadowDone", done); }
      logActivity("shadow");
      toast("🎉 完成 5 次！Done!");
    }
  };

  const autoBtn = h("button", { class: "btn primary big block", type: "button", onclick: async () => {
    if (auto) { auto = false; stopAudio(); autoBtn.textContent = "🔁 自動跟讀 ×5 Auto shadow"; return; }
    auto = true;
    autoBtn.textContent = "⏹️ 停止 Stop";
    while (auto && reps < REPS) {
      const t0 = performance.now();
      await speak(s.en);
      if (!auto) break;
      const dur = Math.max(1500, performance.now() - t0);
      autoBtn.textContent = "🗣️ 換你說！Your turn… (⏹️)";
      await new Promise(r => setTimeout(r, dur * 1.3 + 600));
      if (!auto) break;
      addRep();
      autoBtn.textContent = "⏹️ 停止 Stop";
    }
    auto = false;
    autoBtn.textContent = "🔁 自動跟讀 ×5 Auto shadow";
  } }, "🔁 自動跟讀 ×5 Auto shadow");

  const out = h("div", { style: "text-align:center;min-height:30px" });
  const check = canListen ? h("button", { class: "btn", type: "button", onclick: async () => {
    check.disabled = true; check.textContent = "👂 在聽…";
    try {
      const alts = await listen({ timeout: 12000 });
      const r = checkSpeech(s.en, alts);
      // colour each word: green = heard, red = missed
      let k = 0;
      clear(text).append(...words.map((w, i) => {
        // same tokenising as checkSpeech, so "twenty-five" maps to two tokens
        const n = w.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/'/g, "").split(" ").filter(Boolean).length;
        const hit = r.hits.slice(k, k + n).every(Boolean);
        k += n;
        return [h("span", { class: hit ? "ok" : "miss" }, w), i < words.length - 1 ? " " : ""];
      }));
      clear(out).append(h("span", { class: "result-pill " + (r.ok ? "good" : "bad") },
        !alts.length ? "沒聽到聲音，再試一次" : r.ok ? `✅ 很好！${Math.round(r.score * 100)}%` : `🔁 ${Math.round(r.score * 100)}% · 紅色的字再練練`));
      if (r.ok) addRep();
    } catch { clear(out).append(h("span", { class: "result-pill bad" }, "無法使用麥克風 Mic unavailable")); }
    check.disabled = false; check.textContent = "🎤 檢查我 Check me";
  } }, "🎤 檢查我 Check me") : null;

  app.append(h("button", { class: "btn small ghost", type: "button", style: "margin-bottom:10px", onclick: () => { auto = false; stopAudio(); list(); } }, "← 全部句子 All sentences"));
  app.append(h("section", { class: "card narrow" },
    h("div", { class: "row" }, h("span", { class: "badge" }, s.topic), h("span", { class: "spacer" }), h("span", { class: "muted small" }, `Level ${s.level}`)),
    text,
    h("div", { style: "text-align:center", class: "muted" }, s.zh),
    s.focus ? h("p", { class: "notice small", style: "margin:12px 0 0" }, "🎯 ", s.focus) : null,
    dots,
    h("div", { class: "controls" },
      h("button", { class: "btn big", type: "button", onclick: () => speak(s.en) }, "🔊 聽 Play"),
      h("button", { class: "btn big", type: "button", onclick: () => speak(s.en, { slow: true }) }, "🐢 慢速 Slow"),
      h("button", { class: "btn big", type: "button", onclick: addRep }, "✋ 我說了 +1"),
      check || h("span")),
    out,
    h("div", { style: "margin-top:12px" }, autoBtn),
    h("div", { style: "margin-top:14px" }, h("p", { class: "muted small", style: "margin-bottom:6px" }, "錄音比較 Record & compare:"), recordWidget())));

  const items = sentences.filter(x => x.level === s.level);
  const i = items.indexOf(s);
  if (items[i + 1]) app.append(h("div", { class: "narrow" }, h("button", { class: "btn block", type: "button", onclick: () => { auto = false; stopAudio(); player(items[i + 1]); } }, "下一句 Next sentence ▶")));
  speak(s.en);
}

loadJSON("shadowing").then(s => { sentences = s || []; list(); })
  .catch(() => { clear(app).append(h("p", { class: "notice bad" }, "無法載入資料 Couldn't load data.")); });
