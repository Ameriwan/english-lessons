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

// ---------- in-app browsers (LINE, Facebook, Instagram, WeChat) block the microphone
const UA = navigator.userAgent || "";
const IN_LINE = /\bLine\//i.test(UA);
const IN_APP = IN_LINE || /FBAN|FBAV|Instagram|MicroMessenger/i.test(UA);
if (IN_LINE && !/[?&]openExternalBrowser=1/.test(location.search)) {
  // LINE opens links that carry this flag in Safari / Chrome instead of its own browser
  const u = new URL(location.href);
  u.searchParams.set("openExternalBrowser", "1");
  location.replace(u.href);
}

// ---------- layout
export function mountShell(active) {
  if (IN_APP) {
    document.body.prepend(h("div", { class: "inapp-banner" },
      "⚠️ 請用 Safari 或 Chrome 打開這個網站，麥克風才能用。點右上角「⋯」→「用瀏覽器開啟」。"));
  }
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
// Two engines:
//   native  -- the browser's SpeechRecognition (good on Android / desktop Chrome)
//   whisper -- on-device Whisper model (iPhone, or wherever native keeps hearing nothing)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const CAN_WHISPER = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
  (window.AudioContext || window.webkitAudioContext) && window.WebAssembly);
export const canListen = !!(SR || CAN_WHISPER);

function engine() {
  if (CAN_WHISPER && (IS_IOS || !SR || store.get("speechEngine") === "whisper")) return "whisper";
  return SR ? "native" : null;
}
let nativeMisses = 0;

// Resolves with the transcripts heard (possibly several guesses). onReady fires once the
// mic is really open, so pages can say "speak now" and the first sound isn't cut off.
export async function listen(opts = {}) {
  if (engine() === "whisper") return listenWhisper(opts);
  const heard = await listenNative(opts);
  // native recogniser that never hears anything is broken here -- switch to Whisper
  if (!heard.length && CAN_WHISPER && ++nativeMisses >= 2) {
    store.set("speechEngine", "whisper");
    throw new Error("switched");
  }
  if (heard.length) nativeMisses = 0;
  return heard;
}

let whisperMod = null;
async function listenWhisper({ timeout = 8000, onReady, onProgress, onAnalyzing } = {}) {
  stopAudio();
  whisperMod = whisperMod || await import("./whisper.js");
  if (!store.get("whisperReady")) {
    if (!confirm("第一次使用要下載語音辨識（約 40MB，只需要一次，建議用 Wi-Fi）。\n現在下載嗎？\n\nDownload the speech checker now? (~40 MB, one time)")) {
      throw new Error("cancelled");
    }
  }
  await whisperMod.loadWhisper(onProgress);
  store.set("whisperReady", true);
  const audio = await whisperMod.recordSpeech({ maxMs: Math.min(timeout, 12000), onReady });
  if (!audio) return [];
  onAnalyzing && onAnalyzing();
  const text = await whisperMod.transcribe(audio);
  return text ? [text] : [];
}

// Start loading the Whisper model in the background if it was downloaded before.
export function warmUpSpeech() {
  if (engine() === "whisper" && store.get("whisperReady")) {
    import("./whisper.js").then(m => { whisperMod = m; m.loadWhisper(); }).catch(() => {});
  }
}

function listenNative({ timeout = 8000, onReady } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("unsupported"));
    stopAudio();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    const heard = new Set();
    let done = false;
    const finish = err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rec.stop(); } catch { /* ignore */ }
      err ? reject(err) : resolve([...heard]);
    };
    const timer = setTimeout(() => finish(), timeout + 3000);
    rec.onaudiostart = () => onReady && onReady();
    rec.onresult = e => {
      let final = false;
      for (const res of e.results) {
        for (const alt of res) if (alt.transcript.trim()) heard.add(alt.transcript.trim());
        if (res.isFinal) final = true;
      }
      if (final) finish();
    };
    rec.onerror = e => (e.error === "no-speech" || e.error === "aborted") ? finish() : finish(new Error(e.error || "error"));
    rec.onend = () => finish();
    try { rec.start(); } catch (e) { finish(e); }
  });
}

// ---------- comparing what was heard with what she meant to say
// Deliberately forgiving: recognisers often mishear accented speech, especially single
// words said with no context. Numbers, contractions, plurals/-ed endings and words that
// sound alike are all treated as matches.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUM_WORDS = new Set([...ONES, ...TENS.filter(Boolean), "hundred", "thousand"]);
function numWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numWords(n % 100) : "");
  if (n < 10000) return numWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numWords(n % 1000) : "");
  return String(n);
}
const ORD = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinal(words) { // "twenty one" -> "twenty first"
  const parts = words.split(" ");
  const last = parts.pop();
  return [...parts, ORD[last] || (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th")].join(" ");
}
const SAME = { okay: "ok", mister: "mr", missus: "mrs", alright: "all right", gonna: "going to", wanna: "want to",
  gotta: "got to", cannot: "can not", til: "until", till: "until", its: "it is" };
// words that sound the same -- the recogniser picks whichever spelling it likes
const HOMO = { two: "to", too: "to", four: "for", eight: "ate", one: "won", their: "there", write: "right", hear: "here",
  know: "no", knew: "new", sea: "see", buy: "by", bye: "by", our: "hour", wait: "weight", weak: "week", meat: "meet",
  whos: "who", whose: "who", red: "read", flour: "flower", sun: "son", ate: "eight" };
// small words count half -- they are the ones recognisers drop most
const LIGHT = new Set(("a an the is am are was were be been to of in on at it and or but for do does did i you he she we " +
  "they me my your his her our their this that these those with so can will would have has had there here").split(" "));

// "It's $20." -> ["it", "is", "twenty", "dollars"]
export function speechTokens(text) {
  let s = " " + String(text).toLowerCase().replace(/[’‘`]/g, "'") + " ";
  s = s.replace(/\$(\d+)(?:\.(\d\d))?/g, (_, d, c) => `${d} dollars${c && c !== "00" ? " " + c : ""}`)
    .replace(/(\d+)%/g, "$1 percent")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\b(\d{1,2}):00\b/g, "$1 o'clock")
    .replace(/\b(\d{1,2}):(\d\d)\b/g, (_, hr, m) => `${hr} ${m[0] === "0" ? "oh " + m[1] : m}`)
    .replace(/\b([ap])\.?\s?m\.?(?=\W)/g, "$1m")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, d) => ordinal(numWords(+d)))
    .replace(/\d+/g, d => " " + numWords(+d) + " ")
    .replace(/\bcan't\b/g, "can not").replace(/\bwon't\b/g, "will not")
    .replace(/n't\b/g, " not").replace(/'re\b/g, " are").replace(/'m\b/g, " am").replace(/'ll\b/g, " will")
    .replace(/'ve\b/g, " have").replace(/'d\b/g, " would")
    .replace(/\b(it|that|what|there|here|he|she|who|where|how|when|this)'s\b/g, "$1 is")
    .replace(/'/g, "")
    .replace(/[^a-z ]+/g, " ");
  return s.split(" ").filter(Boolean).flatMap(w => (SAME[w] || w).split(" "));
}

// Rough "sounds like" key: keeps th / sh / ch / v / w / l / r distinct, ignores most vowels.
function soundKey(w) {
  let s = w.replace(/^kn/, "n").replace(/^wr/, "r").replace(/^wh/, "w")
    .replace(/ph/g, "f").replace(/gh/g, "").replace(/ck/g, "k").replace(/t?ch/g, "C").replace(/sh/g, "S").replace(/th/g, "T")
    .replace(/dge/g, "j").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/q/g, "k").replace(/x/g, "ks").replace(/z/g, "s");
  const first = /[aeiouy]/.test(s[0]) ? "A" : s[0];
  return (first + s.slice(1).replace(/[aeiouy]/g, "")).replace(/(.)\1+/g, "$1");
}
const stem = w => w.length <= 3 ? w : w.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "");

export function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

// 1 = same word, ~0.85-0.95 = close enough, 0 = different word.
function wordSim(a, b) {
  if (a === b) return 1;
  if ((HOMO[a] || a) === (HOMO[b] || b)) return 0.95;
  if (NUM_WORDS.has(a) && NUM_WORDS.has(b)) return 0; // thirteen vs thirty really matters
  if (stem(a) === stem(b)) return 0.9;
  if (soundKey(a) === soundKey(b)) return 0.85;
  const m = Math.max(a.length, b.length);
  if (m < 4) return 0;
  const sim = 1 - lev(a, b) / m;
  return sim >= 0.75 ? sim : 0;
}

// Compare what was heard with the target.
//   ok      -> counts as right (perfect or close)
//   perfect -> every word matched cleanly
//   marks   -> "ok" | "close" | "miss" for each space-separated word of the target, for colouring
export function checkSpeech(target, heardAlternatives) {
  const display = String(target).trim().split(/\s+/);
  const tw = [];
  display.forEach((dw, i) => speechTokens(dw).forEach(t => tw.push({ t, i, w: LIGHT.has(t) ? 0.5 : 1 })));
  let best = { score: 0, heard: (heardAlternatives || [])[0] || "", sims: tw.map(() => 0) };
  for (const alt of heardAlternatives || []) {
    const hw = speechTokens(alt);
    const pool = new Set(hw);
    for (let k = 0; k < hw.length - 1; k++) pool.add(hw[k] + hw[k + 1]); // "every day" ~ "everyday"
    const sims = tw.map(({ t }) => {
      let s = 0;
      for (const h of pool) { s = Math.max(s, wordSim(t, h)); if (s === 1) break; }
      return s;
    });
    for (let k = 0; k < tw.length - 1; k++) if (pool.has(tw[k].t + tw[k + 1].t)) sims[k] = sims[k + 1] = 1;
    const total = tw.reduce((a, x) => a + x.w, 0) || 1;
    const score = tw.reduce((a, x, k) => a + x.w * sims[k], 0) / total;
    if (score > best.score) best = { score, heard: alt, sims };
  }
  const content = tw.filter(x => x.w === 1).length;
  const ok = tw.length > 0 && best.score >= (content <= 2 ? 0.75 : 0.65);
  const perfect = ok && best.sims.every(s => s >= 0.95);
  const marks = display.map((_, i) => {
    const s = tw.map((x, k) => x.i === i ? best.sims[k] : null).filter(v => v != null);
    const m = s.length ? Math.min(...s) : 1;
    return m >= 0.95 ? "ok" : m >= 0.75 ? "close" : "miss";
  });
  return { ok, perfect, close: ok && !perfect, score: best.score, heard: best.heard, marks, display };
}

// Friendly result pill for a checkSpeech() result.
export function speechPill(r, heardAny) {
  if (!heardAny) return h("span", { class: "result-pill bad" }, "沒聽到聲音 — 等「🔴 說吧」再開始說");
  if (r.perfect) return h("span", { class: "result-pill good" }, "✅ 很棒！Perfect!");
  if (r.ok) return h("span", { class: "result-pill close" }, `👍 很接近！Close · 電腦聽到 “${r.heard}”`);
  return h("span", { class: "result-pill bad" }, `🔁 再試一次 · 電腦聽到 “${r.heard}”`);
}

// Message for a failed listen().
export function speechErrorPill(e) {
  const m = (e && (e.name === "NotAllowedError" ? "not-allowed" : e.message)) || "";
  const text = m === "switched" ? "🔄 已改用另一種語音辨識，請再按一次 🎤"
    : m === "cancelled" ? "已取消。可以先用「🎙️ 錄音」聽自己的聲音"
    : /not-allowed|service-not-allowed|Permission/i.test(m) ? "請允許使用麥克風（設定 → Safari → 麥克風）"
    : IN_APP ? "請用 Safari 或 Chrome 打開這個網站"
    : "無法辨識，再試一次";
  return h("span", { class: "result-pill " + (m === "switched" ? "close" : "bad") }, text);
}

// Turn a mic button into "getting ready… → 🔴 speak now → analysing" while listening.
export async function listenWithButton(btn, opts = {}) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ 準備…";
  try {
    return await listen({
      ...opts,
      onProgress: p => { btn.textContent = `⬇️ 下載中 ${Math.round(p * 100)}%`; },
      onReady: () => { btn.textContent = "🔴 說吧！Speak"; btn.classList.add("live"); },
      onAnalyzing: () => { btn.classList.remove("live"); btn.textContent = "🤔 聽聽看…"; },
    });
  } finally {
    btn.disabled = false;
    btn.classList.remove("live");
    btn.textContent = label;
  }
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
    try {
      const alts = await listenWithButton(btn);
      const r = checkSpeech(target, alts);
      if (out) clear(out).append(speechPill(r, alts.length > 0));
      onResult && onResult(r, alts);
    } catch (e) {
      if (out) clear(out).append(speechErrorPill(e));
    }
  } }, label);
  warmUpSpeech();
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
