import { h, $, clear, mountShell, loadJSON, store, shuffle, speak, playButton, sayItButton, recordWidget,
  canListen, logActivity } from "./app.js";

mountShell("sounds");
const app = clear($("#app"));
let sounds = [], week = {};
let practiceCount = 0;

function practiced() {
  practiceCount++;
  if (practiceCount === 5) logActivity("sounds");
}

function list() {
  clear(app);
  app.append(h("div", { class: "page-head" }, h("h1", {}, "發音 Sounds"),
    h("p", {}, "中文母語者最常遇到的 9 個發音。點一個開始練習。")));
  const stats = store.get("pairStats", {});
  const grid = h("div", { class: "sound-grid" });
  const ordered = [...sounds].sort((a, b) => (b.id === week.sound_of_week) - (a.id === week.sound_of_week));
  for (const s of ordered) {
    const st = stats[s.id];
    grid.append(h("a", { class: "sound-card", href: "#" + s.id, style: s.id === week.sound_of_week ? "border-color:var(--warm)" : "" },
      s.id === week.sound_of_week ? h("span", { class: "badge new" }, "本週") : null,
      h("b", {}, s.title_zh), h("span", {}, s.ipa || s.title_en),
      st ? h("div", { class: "small", style: "margin-top:4px;color:var(--accent);font-weight:700" }, `🎯 ${Math.round((st.right / st.total) * 100)}%`) : null));
  }
  app.append(grid);
  if (!canListen) {
    app.append(h("p", { class: "notice small", style: "margin-top:16px" },
      "💡 這個瀏覽器不支援語音辨識，可以用「錄音」聽自己的聲音。用 Chrome 或 Safari 可以讓電腦檢查你的發音。"));
  }
}

function detail(s) {
  clear(app);
  window.scrollTo(0, 0);
  const marks = s.stress_marks || s.linking_marks || {};
  app.append(h("a", { href: "#", class: "btn small ghost", style: "margin-bottom:10px" }, "← 全部發音 All sounds"));
  app.append(h("div", { class: "page-head" }, h("h1", {}, s.title_zh, " ", h("span", { class: "muted", style: "font-size:.7em" }, s.ipa || "")),
    h("p", {}, s.title_en)));

  app.append(h("section", { class: "card warm" },
    h("h2", {}, "常見問題 The problem"), h("p", { style: "margin:0" }, s.problem_zh)));

  app.append(h("section", { class: "card" },
    h("h2", {}, "怎麼發音 How to say it"),
    h("ol", { class: "steps" }, (s.how_zh || []).map(x => h("li", {}, x))),
    s.fun_tip_zh ? h("p", { class: "notice", style: "margin:12px 0 0" }, "😄 ", s.fun_tip_zh) : null));

  // practice words
  const wl = h("div", { class: "word-list" });
  for (const w of s.practice_words || []) {
    const out = h("div");
    wl.append(h("div", { class: "word-row" },
      h("div", { class: "w" }, w, marks[w] ? h("small", {}, marks[w]) : null, out),
      playButton(w), playButton(w, { slow: true }),
      sayItButton(w, out, { label: "🎤", onResult: practiced })));
  }
  app.append(h("section", { class: "card" }, h("h2", {}, "練習單字 Words"),
    h("p", { class: "muted small" }, canListen ? "🔊 聽 → 🎤 說，電腦會告訴你它聽到什麼。" : "🔊 聽，然後大聲跟著說。"), wl));

  // sentences
  const sl = h("div", { class: "word-list" });
  for (const t of s.practice_sentences || []) {
    const out = h("div");
    sl.append(h("div", { class: "word-row" },
      h("div", { class: "w", style: "font-size:1rem" }, t, out),
      playButton(t), playButton(t, { slow: true }), sayItButton(t, out, { label: "🎤", onResult: practiced })));
  }
  app.append(h("section", { class: "card" }, h("h2", {}, "練習句子 Sentences"), sl,
    h("div", { style: "margin-top:12px" }, h("p", { class: "muted small", style: "margin-bottom:6px" }, "錄下自己唸，再聽聽看跟原音哪裡不一樣："), recordWidget())));

  if ((s.pairs || []).length >= 2) {
    app.append(h("section", { class: "card" },
      h("h2", {}, "聽力遊戲 Can you hear it?"),
      h("p", { class: "muted" }, `聽一個字，選出你聽到的。例如 ${s.pairs[0].a} / ${s.pairs[0].b}`),
      h("button", { class: "btn primary big block", type: "button", onclick: () => pairGame(s) }, "🎧 開始 Start (10)"),
      h("details", { style: "margin-top:12px" }, h("summary", { class: "small", style: "cursor:pointer;font-weight:700" }, "全部單字組 All pairs"),
        h("div", { class: "word-list", style: "margin-top:8px" }, s.pairs.map(p => h("div", { class: "word-row" },
          h("div", { class: "w" }, p.a, h("small", {}, `${p.ipa_a} ${p.zh_a}`)), playButton(p.a),
          h("div", { class: "w" }, p.b, h("small", {}, `${p.ipa_b} ${p.zh_b}`)), playButton(p.b)))))));
  }
}

function pairGame(s) {
  const rounds = [];
  while (rounds.length < 10) rounds.push(...shuffle(s.pairs));
  const qs = rounds.slice(0, 10).map(p => ({ p, play: Math.random() < 0.5 ? "a" : "b", order: shuffle(["a", "b"]) }));
  let n = 0, right = 0;
  const show = () => {
    clear(app);
    if (n >= qs.length) {
      const stats = store.get("pairStats", {});
      const st = stats[s.id] || { right: 0, total: 0 };
      stats[s.id] = { right: st.right + right, total: st.total + qs.length };
      store.set("pairStats", stats);
      logActivity("sounds");
      app.append(h("section", { class: "card narrow", style: "text-align:center" },
        h("div", { class: "score-big" }, `${right}/10`),
        h("h2", {}, right >= 9 ? "你的耳朵很厲害！Great ears!" : right >= 7 ? "很好！Good!" : "多聽幾次就會越來越清楚。Keep listening!"),
        h("div", { class: "stack" },
          h("button", { class: "btn primary big block", type: "button", onclick: () => pairGame(s) }, "再玩一次 Again"),
          h("a", { class: "btn big block", href: "#" + s.id, onclick: () => detail(s) }, "回到 " + s.title_zh))));
      return;
    }
    const q = qs[n];
    const word = q.p[q.play];
    const fb = h("div");
    const buttons = q.order.map(k => h("button", { class: "btn", type: "button", onclick: () => {
      if (buttons[0].disabled) return;
      const ok = k === q.play;
      if (ok) right++;
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (q.order[i] === q.play) b.classList.add("right", "option");
        else if (q.order[i] === k) b.classList.add("wrong", "option");
      });
      fb.append(h("div", { class: "feedback " + (ok ? "good" : "bad") },
        h("div", { class: "answer" }, ok ? "✅ " : "❌ ", `你聽到的是 ${word}`),
        h("div", { class: "row", style: "margin-top:8px" },
          h("span", {}, q.p.a), playButton(q.p.a), h("span", { style: "margin-left:10px" }, q.p.b), playButton(q.p.b))),
        h("button", { class: "btn primary big block", type: "button", style: "margin-top:12px", onclick: () => { n++; show(); } }, "下一題 Next ▶"));
    } }, q.p[k]));
    app.append(h("section", { class: "card narrow" },
      h("div", { class: "qhead" }, h("span", {}, `${n + 1} / 10`),
        h("div", { class: "progress" }, h("div", { style: `width:${n * 10}%` })),
        h("a", { class: "btn small ghost", href: "#" + s.id, onclick: () => detail(s) }, "✕")),
      h("div", { class: "prompt" }, h("div", { class: "sub" }, "你聽到哪一個？Which word?"),
        h("div", { class: "row", style: "justify-content:center;margin-top:10px" },
          playButton(word, { cls: "btn primary big", label: "🔊 再聽一次" }), playButton(word, { slow: true, cls: "btn big" }))),
      h("div", { class: "pair-choices" }, buttons), fb));
    speak(word);
  };
  show();
}

function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  const s = sounds.find(x => x.id === id);
  s ? detail(s) : list();
}

Promise.all([loadJSON("sounds"), loadJSON("week").catch(() => ({}))]).then(([s, w]) => {
  sounds = s || []; week = w || {};
  window.addEventListener("hashchange", route);
  route();
}).catch(() => { clear(app).append(h("p", { class: "notice bad" }, "無法載入資料 Couldn't load data.")); });
