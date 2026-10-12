import { h, $, clear, mountShell, loadJSON, store, today, setActivity, streak, fmtDate } from "./app.js";

mountShell("home");
const app = clear($("#app"));

const TASKS = [
  { id: "anki", zh: "Anki 卡片 15 分鐘", en: "Anki: new cards + reviews", manual: true, href: "decks.html" },
  { id: "quiz", zh: "做一回測驗", en: "One quiz round", href: "quiz.html" },
  { id: "sounds", zh: "練習發音", en: "Sound practice", href: "sounds.html" },
  { id: "shadow", zh: "跟讀一個句子 5 次", en: "Shadow a sentence ×5", href: "shadow.html" },
];

function greeting() {
  const hr = new Date().getHours();
  if (hr < 11) return ["早安！", "Good morning!"];
  if (hr < 18) return ["午安！", "Good afternoon!"];
  return ["晚安！", "Good evening!"];
}

async function render() {
  const [week, decks] = await Promise.all([
    loadJSON("week").catch(() => ({})),
    loadJSON("decks").catch(() => ({ decks: [] })),
  ]);
  const day = store.get("days", {})[today()] || {};
  const [zh, en] = greeting();
  const n = streak();

  app.append(h("div", { class: "hello" },
    h("div", {}, h("h1", {}, zh), h("div", { class: "muted" }, en)),
    h("div", { class: "streak", title: "連續練習天數 Day streak" }, `🔥 ${n}`, h("small", {}, "天 days"))));

  const newest = (decks.decks || []).filter(d => d.kind === "unit")
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || "") || b.unit_no - a.unit_no)[0];
  if (newest && daysAgo(newest.updated) <= 7) {
    app.append(h("a", { class: "tile", href: "decks.html", style: "margin-bottom:16px;border-color:var(--warm)" },
      h("span", { class: "ico" }, "🆕"),
      h("div", {}, h("b", {}, "有新卡片！New cards"), h("span", {}, `${newest.title_en} ${newest.title_zh}`))));
  }

  // today's checklist
  const list = h("ul", { class: "checklist" });
  const doneCount = () => TASKS.filter(t => (store.get("days", {})[today()] || {})[t.id]).length;
  const count = h("span", { class: "badge" });
  const refreshCount = () => { count.textContent = `${doneCount()} / ${TASKS.length}`; };
  for (const t of TASKS) {
    const done = !!day[t.id];
    const box = h("button", { class: "check" + (done ? " done" : ""), type: "button",
      "aria-label": t.zh, "aria-pressed": String(done),
      onclick: () => {
        if (!t.manual) { location.href = t.href; return; }
        const on = !box.classList.contains("done");
        box.classList.toggle("done", on);
        box.setAttribute("aria-pressed", String(on));
        setActivity(t.id, on);
        refreshCount();
      } }, "✓");
    list.append(h("li", {}, box,
      h("a", { class: "what", href: t.href, style: "color:inherit;text-decoration:none" },
        h("b", {}, t.zh), h("small", {}, t.en + (t.manual ? " · 做完請打勾 tick when done" : " · 完成會自動打勾"))),
      h("a", { class: "btn small", href: t.href }, "去 Go")));
  }
  refreshCount();
  app.append(h("section", { class: "card" },
    h("div", { class: "row", style: "margin-bottom:6px" }, h("h2", { style: "margin:0" }, "今天的練習 ", h("span", { class: "en-sub", style: "display:inline" }, "Today")), h("span", { class: "spacer" }), count),
    list));

  // this week
  if (week && (week.homework || week.next_session_zh)) {
    const sec = h("section", { class: "card warm" },
      h("h2", {}, "這週 This week", week.week_of ? h("span", { class: "en-sub" }, "Week of " + fmtDate(week.week_of)) : null));
    if (week.next_session_zh) {
      sec.append(h("p", {}, h("b", {}, "下次上課："), week.next_session_zh,
        week.next_session_en ? h("span", { class: "en-sub" }, week.next_session_en) : null));
    }
    if (week.homework?.length) {
      sec.append(h("ol", { class: "week-list" }, week.homework.map(x =>
        h("li", {}, x.zh, x.en ? h("span", { class: "en-sub" }, x.en) : null))));
    }
    if (week.sound_of_week) {
      sec.append(h("p", { style: "margin-top:10px" },
        h("a", { class: "btn small", href: `sounds.html#${week.sound_of_week}` }, "👄 本週發音 Sound of the week")));
    }
    if (week.voice_memo_zh) sec.append(h("p", { class: "small" }, "🎙️ 語音作業：", week.voice_memo_zh));
    if (week.note_zh) sec.append(h("p", { class: "small", style: "margin:0" }, "💬 老師的話：", week.note_zh));
    app.append(sec);
  }

  app.append(h("div", { class: "grid-2" },
    tile("decks.html", "🃏", "下載 Anki 卡片", "Download decks"),
    tile("quiz.html", "✏️", "單字測驗", "Quiz yourself"),
    tile("sounds.html", "👄", "發音練習", "How to say the sounds"),
    tile("shadow.html", "🔁", "跟讀練習", "Listen & repeat"),
    tile("test.html", "📋", "程度測驗", "Level test (with your teacher)"),
    tile("teacher.html", "🧑‍🏫", "老師專用", "Teacher toolkit", "teacher")));
}

function tile(href, ico, zh, en, cls = "") {
  return h("a", { class: "tile " + cls, href }, h("span", { class: "ico" }, ico), h("div", {}, h("b", {}, zh), h("span", {}, en)));
}

function daysAgo(iso) {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
}

render();
