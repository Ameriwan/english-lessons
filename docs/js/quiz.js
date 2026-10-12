import { h, $, clear, mountShell, loadJSON, store, shuffle, sample, speak, playButton, canListen, listen,
  checkSpeech, logActivity } from "./app.js";

mountShell("quiz");
const app = clear($("#app"));

const MODES = [
  { id: "en2zh", ico: "🇬🇧", zh: "看英文選中文", en: "English → 中文" },
  { id: "zh2en", ico: "🇹🇼", zh: "看中文選英文", en: "中文 → English" },
  { id: "listen", ico: "🎧", zh: "聽音選字", en: "Listen & choose" },
  { id: "fill", ico: "🧩", zh: "句子填空", en: "Fill the blank" },
  { id: "spell", ico: "⌨️", zh: "聽寫拼字", en: "Hear & spell" },
  { id: "say", ico: "🎤", zh: "說出英文", en: "Say it", needsMic: true },
];

let vocab = { units: [], items: [] };
let mistakes = [];
const settings = Object.assign({ units: [], mode: "en2zh", count: 10 }, store.get("quizSettings", {}));

const clean = s => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/'/g, "").replace(/\s+/g, " ").trim();

function missed() { return store.get("missed", {}); }
function markMissed(id, wrong) {
  const m = missed();
  if (wrong) m[id] = (m[id] || 0) + 1; else delete m[id];
  store.set("missed", m);
}

// ---------------------------------------------------------------- setup screen
function setup() {
  clear(app);
  const released = vocab.units.filter(u => u.released);
  if (!settings.units.length || settings.units.some(u => !released.find(r => r.unit_no === u))) {
    settings.units = released.slice(-1).map(u => u.unit_no);
  }
  const missedIds = Object.keys(missed()).filter(id => vocab.items.find(i => i.id === id));

  app.append(h("div", { class: "page-head" }, h("h1", {}, "測驗 Quiz"), h("p", {}, "選課、選模式，開始練習！Pick units and a mode.")));
  if (!released.length) {
    app.append(h("p", { class: "notice" }, "還沒有開放的課。No units released yet."));
    return;
  }

  const unitChips = h("div", { class: "chips" });
  const drawUnits = () => {
    clear(unitChips);
    unitChips.append(h("button", { class: "chip" + (settings.units.length === released.length ? " on" : ""), type: "button",
      onclick: () => { settings.units = released.map(u => u.unit_no); drawUnits(); } }, "全部 All"));
    for (const u of released) {
      const on = settings.units.includes(u.unit_no);
      unitChips.append(h("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on),
        onclick: () => {
          settings.units = on ? settings.units.filter(x => x !== u.unit_no) : [...settings.units, u.unit_no];
          if (!settings.units.length) settings.units = [u.unit_no];
          drawUnits();
        } }, `${u.unit_no}. ${u.unit_zh}`));
    }
  };
  drawUnits();

  const modeGrid = h("div", { class: "grid-2" });
  const drawModes = () => {
    clear(modeGrid);
    for (const m of MODES) {
      if (m.needsMic && !canListen) continue;
      modeGrid.append(h("button", { class: "btn option" + (settings.mode === m.id ? " on" : ""), type: "button",
        onclick: () => { settings.mode = m.id; drawModes(); } },
        h("span", { style: "font-size:1.4rem" }, m.ico), h("span", {}, m.zh, h("span", { class: "en-sub" }, m.en))));
    }
  };
  drawModes();

  const countChips = h("div", { class: "chips" });
  const drawCount = () => {
    clear(countChips);
    for (const n of [10, 20]) countChips.append(h("button", { class: "chip" + (settings.count === n ? " on" : ""), type: "button",
      onclick: () => { settings.count = n; drawCount(); } }, `${n} 題`));
  };
  drawCount();

  app.append(
    h("section", { class: "card" }, h("h2", {}, "1. 選課 Units"), unitChips),
    h("section", { class: "card" }, h("h2", {}, "2. 模式 Mode"), modeGrid),
    h("section", { class: "card" }, h("h2", {}, "3. 題數 Questions"), countChips),
    h("button", { class: "btn primary big block", type: "button", onclick: () => {
      store.set("quizSettings", settings);
      const pool = vocab.items.filter(i => settings.units.includes(i.unit));
      start(pool, settings.mode);
    } }, "開始 Start ▶"));

  const extra = h("div", { class: "grid-2", style: "margin-top:16px" });
  if (missedIds.length) {
    extra.append(h("button", { class: "tile", type: "button", style: "text-align:left;font:inherit;cursor:pointer",
      onclick: () => start(vocab.items.filter(i => missedIds.includes(i.id)), "mixed") },
      h("span", { class: "ico" }, "🔁"), h("div", {}, h("b", {}, `錯題複習（${missedIds.length}）`), h("span", {}, "Review words you missed"))));
  }
  if (mistakes.length) {
    extra.append(h("button", { class: "tile", type: "button", style: "text-align:left;font:inherit;cursor:pointer",
      onclick: () => fixMistakes() },
      h("span", { class: "ico" }, "🛠️"), h("div", {}, h("b", {}, `改錯練習（${mistakes.length}）`), h("span", {}, "Fix your own mistakes"))));
  }
  if (extra.children.length) app.append(extra);
}

// ---------------------------------------------------------------- building questions
function distractors(item, pool, field, n = 3) {
  const near = shuffle(pool.filter(i => i.unit === item.unit));
  const far = shuffle(vocab.items);
  const out = [];
  const seen = new Set([item[field].toLowerCase()]);
  for (const i of [...near, ...far]) {
    const v = i[field];
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

function blankFor(item) {
  const target = item.en.replace(/[.?!,]+$/, "");
  if (!item.ex || target.length < 2) return null;
  const idx = item.ex.toLowerCase().indexOf(target.toLowerCase());
  if (idx < 0) return null;
  return { before: item.ex.slice(0, idx), after: item.ex.slice(idx + target.length), answer: item.ex.slice(idx, idx + target.length) };
}

function makeQuestion(item, pool, mode) {
  if (mode === "mixed") {
    const options = ["en2zh", "zh2en", "listen"].concat(blankFor(item) ? ["fill"] : []);
    mode = options[Math.floor(Math.random() * options.length)];
  }
  if (mode === "fill") {
    const b = blankFor(item);
    if (!b) mode = "en2zh";
    else return { item, mode, blank: b, options: shuffle([b.answer, ...distractors(item, pool, "en")]), answer: b.answer };
  }
  if (mode === "en2zh") return { item, mode, options: shuffle([item.zh, ...distractors(item, pool, "zh")]), answer: item.zh };
  if (mode === "zh2en" || mode === "listen") return { item, mode, options: shuffle([item.en, ...distractors(item, pool, "en")]), answer: item.en };
  return { item, mode }; // spell, say
}

// ---------------------------------------------------------------- running a round
function start(pool, mode) {
  if (!pool.length) return;
  let items = sample(pool, Math.min(settings.count, pool.length));
  if (mode === "fill") {
    const ok = shuffle(pool.filter(blankFor));
    if (ok.length >= 4) items = ok.slice(0, Math.min(settings.count, ok.length));
  }
  const qs = items.map(i => makeQuestion(i, pool, mode));
  const results = [];
  let n = 0;

  const show = () => {
    if (n >= qs.length) return finish(qs, results, pool, mode);
    const q = qs[n];
    clear(app);
    const box = h("section", { class: "card narrow" });
    box.append(h("div", { class: "qhead" },
      h("span", {}, `${n + 1} / ${qs.length}`),
      h("div", { class: "progress" }, h("div", { style: `width:${(n / qs.length) * 100}%` })),
      h("button", { class: "btn small ghost", type: "button", onclick: setup }, "✕")));
    const prompt = h("div", { class: "prompt" });
    const area = h("div");
    box.append(prompt, area);
    app.append(box);

    const next = (correct, extra = {}) => {
      results.push({ q, correct, ...extra });
      markMissed(q.item.id, !correct);
    };
    const nextBtn = () => h("button", { class: "btn primary big block", type: "button", style: "margin-top:14px",
      onclick: () => { n++; show(); } }, n + 1 < qs.length ? "下一題 Next ▶" : "看結果 Results ▶");

    const reveal = (correct, note) => {
      speak(q.item.en);
      const fb = h("div", { class: "feedback " + (correct ? "good" : "bad") },
        h("div", {}, correct ? "✅ 答對了！Correct!" : "❌ 正確答案 Answer:", note ? " " + note : ""),
        h("div", { class: "row", style: "margin-top:4px" },
          h("div", { style: "flex:1" }, h("div", { class: "answer" }, q.item.en), h("div", {}, q.item.zh),
            h("div", { class: "muted small" }, [q.item.ipa, q.item.sl].filter(Boolean).join("  ·  "))),
          playButton(q.item.en), playButton(q.item.en, { slow: true })),
        q.item.ex ? h("div", { class: "small", style: "margin-top:8px" }, q.item.ex, h("span", { class: "en-sub" }, q.item.exzh)) : null,
        q.item.tip ? h("div", { class: "small", style: "margin-top:6px" }, "💡 ", q.item.tip) : null);
      const nb = nextBtn();
      area.append(fb, nb);
      nb.focus({ preventScroll: true });
    };

    // prompt
    if (q.mode === "en2zh") prompt.append(h("div", { class: "big" }, q.item.en), h("div", { class: "row", style: "justify-content:center;margin-top:8px" }, playButton(q.item.en)));
    if (q.mode === "zh2en") prompt.append(h("div", { class: "sub" }, "英文怎麼說？"), h("div", { class: "big" }, q.item.zh));
    if (q.mode === "listen") {
      prompt.append(h("div", { class: "sub" }, "聽聽看，選出你聽到的 Which one did you hear?"),
        h("div", { class: "row", style: "justify-content:center;margin-top:10px" },
          playButton(q.item.en, { cls: "btn primary big", label: "🔊 播放 Play" }), playButton(q.item.en, { slow: true, cls: "btn big" })));
      speak(q.item.en);
    }
    if (q.mode === "fill") {
      prompt.append(h("div", { class: "sub" }, "選出正確的字 Fill the blank"),
        h("div", { class: "mid", style: "margin-top:8px" }, q.blank.before, h("span", { style: "color:var(--accent)" }, " ____ "), q.blank.after),
        h("div", { class: "sub" }, q.item.exzh));
    }

    // answers
    if (q.options) {
      const opts = h("div", { class: "options" });
      const buttons = q.options.map((opt, i) => h("button", { class: "btn option", type: "button", onclick: () => choose(opt) },
        h("span", { class: "muted", style: "font-size:.85rem" }, `${i + 1}`), opt));
      const choose = opt => {
        if (results.length > n) return;
        const correct = opt === q.answer;
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (q.options[i] === q.answer) b.classList.add("right");
          else if (q.options[i] === opt) b.classList.add("wrong");
        });
        next(correct, { chose: opt });
        reveal(correct);
      };
      opts.append(...buttons);
      area.append(opts, h("button", { class: "btn ghost block idk", type: "button", onclick: () => choose(null) }, "我不知道 I don't know"));
      keyHandler = e => {
        const k = Number(e.key);
        if (k >= 1 && k <= q.options.length && results.length === n) choose(q.options[k - 1]);
      };
    }

    if (q.mode === "spell") {
      prompt.append(h("div", { class: "sub" }, "聽，然後拼出英文 Listen and type it"),
        h("div", { class: "mid", style: "margin:6px 0" }, q.item.zh),
        h("div", { class: "row", style: "justify-content:center" }, playButton(q.item.en, { cls: "btn primary", label: "🔊 播放" }), playButton(q.item.en, { slow: true })));
      speak(q.item.en);
      const input = h("input", { type: "text", class: "spell-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Type the English" });
      const go = h("button", { class: "btn primary big block", type: "submit", style: "margin-top:10px" }, "確定 Check");
      const form = h("form", { onsubmit: e => {
        e.preventDefault();
        if (results.length > n) return;
        const typed = clean(input.value), want = clean(q.item.en);
        const dist = lev(typed, want);
        const correct = typed === want || (want.length > 5 && dist === 1);
        input.disabled = true; go.remove();
        next(correct, { chose: input.value });
        reveal(correct, correct && typed !== want ? "（差一個字母 almost!）" : input.value ? `你寫 “${input.value}”` : "");
      } }, input, go);
      area.append(form, h("button", { class: "btn ghost block idk", type: "button", onclick: () => { input.value = ""; form.requestSubmit(); } }, "我不知道 I don't know"));
      setTimeout(() => input.focus(), 50);
    }

    if (q.mode === "say") {
      prompt.append(h("div", { class: "sub" }, "用英文說出來 Say it in English"), h("div", { class: "big" }, q.item.zh));
      const out = h("div", { style: "text-align:center;min-height:36px;margin-top:10px" });
      let tries = 0;
      const mic = h("button", { class: "btn primary big block", type: "button", onclick: async () => {
        mic.disabled = true; mic.textContent = "👂 在聽… Listening";
        try {
          const alts = await listen();
          const r = checkSpeech(q.item.en, alts);
          tries++;
          if (r.ok) { done(true); return; }
          clear(out).append(h("span", { class: "result-pill bad" }, alts.length ? `聽起來像 “${r.heard}”` : "沒聽到聲音"));
          if (tries >= 3) { done(false); return; }
        } catch { clear(out).append(h("span", { class: "result-pill bad" }, "無法使用麥克風 Mic unavailable")); }
        mic.disabled = false; mic.textContent = "🎤 再試一次 Try again";
      } }, "🎤 按我說 Tap & speak");
      const done = ok => { mic.remove(); giveUp.remove(); next(ok); reveal(ok); };
      const giveUp = h("button", { class: "btn ghost block idk", type: "button", onclick: () => done(false) }, "看答案 Show answer");
      area.append(mic, out, giveUp);
    }
  };
  show();
}

let keyHandler = null;
document.addEventListener("keydown", e => {
  if (e.target.matches("input, textarea")) return;
  keyHandler && keyHandler(e);
});

function finish(qs, results, pool, mode) {
  keyHandler = null;
  logActivity("quiz");
  const right = results.filter(r => r.correct).length;
  const wrong = results.filter(r => !r.correct);
  clear(app);
  const pct = Math.round((right / results.length) * 100);
  const msg = pct === 100 ? "太棒了！Perfect!" : pct >= 80 ? "很好！Great job!" : pct >= 50 ? "不錯，繼續加油！Keep going!" : "沒關係，多練幾次就會了！Practice makes progress!";
  const card = h("section", { class: "card narrow", style: "text-align:center" },
    h("div", { class: "score-big" }, `${right}/${results.length}`), h("h2", {}, msg));
  app.append(card);
  if (wrong.length) {
    app.append(h("section", { class: "card narrow" }, h("h2", {}, "要再練習的 To practice"),
      h("ul", { class: "missed-list" }, wrong.map(r => h("li", {},
        h("div", { class: "what" }, h("b", {}, r.q.item.en), h("small", {}, r.q.item.zh + (r.q.item.sl ? "  ·  " + r.q.item.sl : ""))),
        playButton(r.q.item.en))))));
  }
  app.append(h("div", { class: "narrow stack" },
    wrong.length ? h("button", { class: "btn primary big block", type: "button", onclick: () => start(wrong.map(r => r.q.item), mode === "mixed" ? "mixed" : mode) }, "🔁 再練錯的 Practice these again") : null,
    h("button", { class: "btn big block", type: "button", onclick: () => start(pool, mode) }, "再一回 Another round"),
    h("button", { class: "btn ghost block", type: "button", onclick: setup }, "換模式 Change mode")));
}

// ---------------------------------------------------------------- fix-the-mistake flashcards
function fixMistakes() {
  const list = shuffle(mistakes);
  let n = 0, good = 0;
  const show = () => {
    clear(app);
    if (n >= list.length) {
      logActivity("quiz");
      app.append(h("section", { class: "card narrow", style: "text-align:center" },
        h("div", { class: "score-big" }, `${good}/${list.length}`), h("h2", {}, "改錯完成！Done!"),
        h("button", { class: "btn primary big block", type: "button", onclick: setup }, "回到測驗 Back")));
      return;
    }
    const m = list[n];
    const answer = h("div", { hidden: true },
      h("div", { class: "feedback good" }, h("div", { class: "answer" }, "✅ ", m.correct), m.zh ? h("div", {}, m.zh) : null,
        m.note ? h("div", { class: "small" }, "💡 ", m.note) : null,
        h("div", { class: "row", style: "margin-top:6px" }, playButton(m.correct), playButton(m.correct, { slow: true }))),
      h("p", { class: "muted", style: "margin:12px 0 6px;text-align:center" }, "你說對了嗎？Did you get it?"),
      h("div", { class: "grid-2" },
        h("button", { class: "btn primary big", type: "button", onclick: () => { good++; n++; show(); } }, "👍 對了 Yes"),
        h("button", { class: "btn big", type: "button", onclick: () => { n++; show(); } }, "還沒 Not yet")));
    const showBtn = h("button", { class: "btn primary big block", type: "button", onclick: () => {
      showBtn.remove(); answer.hidden = false; speak(m.correct);
    } }, "看答案 Show answer");
    app.append(h("section", { class: "card narrow" },
      h("div", { class: "qhead" }, h("span", {}, `${n + 1} / ${list.length}`),
        h("div", { class: "progress" }, h("div", { style: `width:${(n / list.length) * 100}%` })),
        h("button", { class: "btn small ghost", type: "button", onclick: setup }, "✕")),
      h("div", { class: "prompt" }, h("div", { class: "sub" }, "這句哪裡不對？大聲說出正確的句子。"),
        h("div", { class: "mid", style: "color:var(--bad);margin-top:8px" }, "❌ ", m.wrong)),
      showBtn, answer));
  };
  show();
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

Promise.all([loadJSON("vocab"), loadJSON("mistakes").catch(() => [])]).then(([v, m]) => {
  vocab = v; mistakes = m || [];
  setup();
}).catch(() => { clear(app).append(h("p", { class: "notice bad" }, "無法載入資料 Couldn't load data.")); });
