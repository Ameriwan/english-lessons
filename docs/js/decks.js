import { h, $, clear, mountShell, loadJSON, fmtDate, setActivity } from "./app.js";

mountShell("decks");
const app = clear($("#app"));

const isNew = iso => iso && (Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000 <= 7;

function deckCard(d, big = false) {
  return h("div", { class: "card" + (big ? " warm" : "") },
    h("div", { class: "row", style: "align-items:flex-start" },
      h("div", { style: "flex:1;min-width:200px" },
        h("h2", { style: "margin-bottom:2px" }, d.title_zh, " ", isNew(d.updated) ? h("span", { class: "badge new" }, "NEW") : null),
        h("div", { class: "muted small" }, d.title_en),
        h("p", { style: "margin:8px 0 0" }, d.desc_zh),
        h("div", { class: "muted small", style: "margin-top:4px" }, `${d.cards} 張卡片 cards · 更新 updated ${fmtDate(d.updated)}`)),
      h("a", { class: "btn " + (big ? "primary big" : ""), href: d.file, download: "",
        onclick: () => setActivity("download", true) }, "⬇️ 下載 Download")));
}

async function render() {
  const data = await loadJSON("decks").catch(() => ({ decks: [] }));
  const decks = data.decks || [];
  app.append(h("div", { class: "page-head" },
    h("h1", {}, "Anki 卡片 Decks"),
    h("p", {}, "下載後用 Anki 打開，就會自動加入。每天在 Anki 點「English 英文」開始練習。")));

  if (!decks.length) {
    app.append(h("p", { class: "notice" }, "還沒有卡片。No decks yet."));
    return;
  }
  const bundle = decks.find(d => d.kind === "bundle");
  if (bundle) {
    app.append(h("p", { class: "small muted", style: "margin:0 0 6px" }, "⭐ 最簡單：每次有新卡片，只要下載這一個 Easiest: just get this one"));
    app.append(deckCard(bundle, true));
  }

  app.append(h("details", { class: "howto" },
    h("summary", {}, "📲 怎麼匯入？How to import"),
    h("div", {},
      h("h3", {}, "手機 Phone (AnkiDroid / AnkiMobile)"),
      h("ol", { class: "steps" },
        h("li", {}, "點上面的「下載」。"),
        h("li", {}, "下載完成後點那個檔案，選擇用 Anki 開啟。"),
        h("li", {}, "等它顯示匯入完成，就可以開始練習了。")),
      h("h3", { style: "margin-top:12px" }, "電腦 Computer (Anki)"),
      h("ol", { class: "steps" },
        h("li", {}, "下載檔案（.apkg）。"),
        h("li", {}, "雙擊檔案，Anki 會自動打開並匯入。")),
      h("p", { class: "small muted", style: "margin-top:10px" },
        "重複匯入同一個卡片包不會變成兩份，只會更新內容，你的學習進度也會保留。"))));

  const groups = [
    ["unit", "每一課 By unit"],
    ["sounds", "發音 Sounds"],
    ["mistakes", "我的錯誤 My mistakes"],
  ];
  for (const [kind, title] of groups) {
    const list = decks.filter(d => d.kind === kind).sort((a, b) => (b.unit_no || 0) - (a.unit_no || 0));
    if (!list.length) continue;
    app.append(h("h2", { style: "margin-top:24px" }, title));
    list.forEach(d => app.append(deckCard(d)));
  }
  app.append(h("p", { class: "muted small" }, "卡片包更新日期 Built " + fmtDate(data.built)));
}

render();
