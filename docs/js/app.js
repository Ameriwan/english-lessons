// Shared helpers for every page: layout, storage, audio, speech checking, recording.

const NAV = [
  { id: "home", href: "index.html", ico: "🏠", zh: "首頁", en: "Home" },
  { id: "decks", href: "decks.html", ico: "🃏", zh: "卡片", en: "Decks" },
  { id: "quiz", href: "quiz.html", ico: "✏️", zh: "測驗", en: "Quiz" },
  { id: "sounds", href: "sounds.html", ico: "👄", zh: "發音", en: "Sounds" },
  { id: "shadow", href: "shadow.html", ico: "🔁", zh: "跟讀", en: "Shadow" },
];

// ---------- tiny DOM builder: h("div", {class: "x", onclick}, "text", child)
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function clear(el) { el.replaceChildren(); return el; }

// ---------- layout
export function mountShell(active) {
  const top = h("header", { class: "topbar" },
    h("div", { class: "topbar-inner" },
      h("a", { class: "brand", href: "index.html" }, h("span", { class: "brand-mark" }, "Ee"), "Everyday English"),
      h("nav", { class: "topnav", "aria-label": "Main" },
        NAV.map(n => h("a", { href: n.href, class: n.id === active ? "active" : "" }, `${n.zh} ${n.en}`))),
      h("div", { class: "toplinks" },
        h("a", { href: "test.html", class: active === "test" ? "active" : "" }, "程度測驗"),
        h("a", { href: "teacher.html", class: "teacher-link" + (active === "teacher" ? " active" : "") }, "老師"))));
  const bar = h("nav", { class: "tabbar", "aria-label": "Main" },
    NAV.map(n => h("a", { href: n.href, class: n.id === active ? "active" : "" },
      h("span", { class: "ico", "aria-hidden": "true" }, n.ico), n.zh)));
  document.body.prepend(top);
  document.body.append(bar);
}

export function toast(msg, ms = 2200) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- storage (never throws; site still works without it)
const PREFIX = "ee.";
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
  },
  remove(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ } },
};

// ---------- daily practice log, for the home checklist + streak
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function logActivity(kind, amount = 1) {
  const days = store.get("days", {});
  const day = days[today()] || {};
  day[kind] = (day[kind] === true ? 1 : day[kind] || 0) + amount;
  days[today()] = day;
  store.set("days", days);
}
export function setActivity(kind, value) {
  const days = store.get("days", {});
  const day = days[today()] || {};
  if (value) day[kind] = value; else delete day[kind];
  days[today()] = day;
  store.set("days", days);
}
export function streak() {
  const days = store.get("days", {});
  const active = key => days[key] && Object.keys(days[key]).length > 0;
  const d = new Date();
  const key = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (!active(key(d))) d.setDate(d.getDate() - 1); // today not done yet: streak still alive from yesterday
  let n = 0;
  while (active(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- data
const cache = {};
export function loadJSON(name) {
  if (!cache[name]) {
    cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); });
  }
  return cache[name];
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);

// ---------- audio: pre-made mp3 when the build made one, else the browser's own voice
// Must match norm() in tools/build.py.
export const norm = t => String(t).replace(/\s+/g, " ").trim().toLowerCase();

let audioIndex = {};
const ready = loadJSON("audio-index").then(x => { audioIndex = x || {}; }).catch(() => {});
let current = null;

export function stopAudio() {
  if (current) { try { current.pause(); } catch { /* ignore */ } current = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
  return voices.find(v => /natural|online|samantha|aria|jenny|google us/i.test(v.name)) || voices[0] || null;
}

// Resolves when playback ends. slow = 70% speed.
export async function speak(text, { slow = false } = {}) {
  await ready;
  stopAudio();
  const src = audioIndex[norm(text)];
  if (src) {
    const a = new Audio(src);
    a.playbackRate = slow ? 0.7 : 1;
    a.preservesPitch = true;
    current = a;
    return new Promise(resolve => {
      a.onended = a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }
  if (!("speechSynthesis" in window)) return;
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = slow ? 0.65 : 0.92;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
if ("speechSynthesis" in window) speechSynthesis.getVoices(); // warm up the voice list

export function playButton(text, { slow = false, label, cls = "btn icon" } = {}) {
  return h("button", {
    class: cls, type: "button", title: slow ? "慢速播放 Slow" : "播放 Play",
    "aria-label": (slow ? "Slow: " : "Play: ") + text,
    onclick: e => { e.stopPropagation(); speak(text, { slow }); },
  }, label || (slow ? "🐢" : "🔊"));
}

// ---------- speech recognition ("did the computer understand me?")
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

export function listen({ timeout = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("unsupported"));
    stopAudio();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    let done = false;
    const finish = (val, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rec.stop(); } catch { /* ignore */ }
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish([]), timeout);
    rec.onresult = e => {
      const alts = [];
      for (const res of e.results) for (const alt of res) alts.push(alt.transcript);
      finish(alts);
    };
    rec.onerror = e => finish(null, new Error(e.error || "error"));
    rec.onend = () => finish([]);
    rec.start();
  });
}

const words = t => norm(t).replace(/[^a-z0-9' ]+/g, " ").replace(/'/g, "").split(" ").filter(Boolean);
const NUM = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
const canon = w => NUM[w] || w;

// Compare what was heard with the target. Returns per-word hits so pages can colour words.
export function checkSpeech(target, heardAlternatives) {
  const tw = words(target);
  let best = { score: 0, heard: (heardAlternatives || [])[0] || "", hits: tw.map(() => false) };
  for (const alt of heardAlternatives || []) {
    const hw = new Set(words(alt).map(canon));
    const hits = tw.map(w => hw.has(canon(w)));
    const score = tw.length ? hits.filter(Boolean).length / tw.length : 0;
    if (score > best.score) best = { score, heard: alt, hits };
  }
  return { ...best, ok: best.score >= (tw.length <= 2 ? 1 : 0.8), words: tw };
}

// ---------- record yourself and listen back
export const canRecord = !!(navigator.mediaDevices && window.MediaRecorder);

export class Recorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }
  stop() {
    return new Promise(resolve => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/webm" });
        resolve(URL.createObjectURL(blob));
      };
      this.rec.stop();
    });
  }
}

// A record / play-back pair of buttons. Returns a <div>.
export function recordWidget() {
  if (!canRecord) return h("span");
  const rec = new Recorder();
  let url = null, recording = false;
  const play = h("button", { class: "btn", type: "button", disabled: true, onclick: () => {
    stopAudio();
    const a = new Audio(url);
    current = a;
    a.play();
  } }, "▶️ 聽我的");
  const btn = h("button", { class: "btn", type: "button", onclick: async () => {
    if (!recording) {
      try { await rec.start(); } catch { toast("無法使用麥克風 Microphone blocked"); return; }
      recording = true;
      btn.textContent = "⏹️ 停止";
      btn.classList.add("on");
    } else {
      recording = false;
      url = await rec.stop();
      btn.textContent = "🎙️ 錄音";
      btn.classList.remove("on");
      play.disabled = !url;
      if (url) play.click();
    }
  } }, "🎙️ 錄音");
  return h("div", { class: "row" }, btn, play);
}

// Mic button that checks pronunciation with speech recognition and reports into `out`.
export function sayItButton(target, out, { onResult, label = "🎤 說說看" } = {}) {
  if (!canListen) return null;
  const btn = h("button", { class: "btn", type: "button", onclick: async () => {
    btn.disabled = true;
    btn.textContent = "👂 在聽…";
    try {
      const alts = await listen();
      const r = checkSpeech(target, alts);
      if (out) {
        clear(out).append(!alts.length
          ? h("span", { class: "result-pill bad" }, "沒聽到聲音，再試一次")
          : h("span", { class: "result-pill " + (r.ok ? "good" : "bad") },
              r.ok ? `✅ 很好！ “${r.heard}”` : `🔁 聽起來像 “${r.heard}”`));
      }
      onResult && onResult(r, alts);
    } catch (e) {
      if (out) clear(out).append(h("span", { class: "result-pill bad" },
        e.message === "not-allowed" ? "請允許使用麥克風" : "無法辨識，再試一次"));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  } }, label);
  return btn;
}

export function copyText(text) {
  const fallback = () => {
    const ta = h("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
  };
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(fallback); else fallback();
  toast("已複製 Copied");
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}
