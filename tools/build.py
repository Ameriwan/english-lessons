"""Build everything the site needs from the files in content/.

    python tools/build.py              full build (audio + Anki decks + site data)
    python tools/build.py --no-audio   skip text-to-speech (faster, offline)

What it makes (all inside docs/, which GitHub Pages serves):
    docs/audio/*.mp3        spoken audio for words, sentences and test items
    docs/decks/*.apkg       Anki decks she downloads
    docs/data/*.json        data the web pages read
Only the units listed in content/week.json -> "released_units" are published.
"""

import argparse
import asyncio
import csv
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
DOCS = ROOT / "docs"
AUDIO_DIR = DOCS / "audio"
DATA_DIR = DOCS / "data"
DECK_DIR = DOCS / "decks"

VOICE = "en-US-AriaNeural"
VOICE_RATE = "-8%"  # a touch slower than normal speech
TODAY = dt.date.today().isoformat()

warnings = []


def warn(msg):
    warnings.append(msg)
    print("  ! " + msg)


# ---------------------------------------------------------------- reading

def read_csv(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = []
        for row in csv.DictReader(f):
            clean = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            if any(clean.values()):
                rows.append(clean)
        return rows


def read_json(path, default=None):
    if not path.exists():
        return default
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(name, data):
    with open(DATA_DIR / f"{name}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- audio

def norm(text):
    """Same normalisation as norm() in docs/js/app.js -- keep them in sync."""
    return re.sub(r"\s+", " ", text).strip().lower()


def audio_name(text):
    return "en_" + hashlib.sha1(norm(text).encode("utf-8")).hexdigest()[:12] + ".mp3"


class AudioBank:
    """Collects every text that needs a voice, then renders the missing ones."""

    def __init__(self):
        self.texts = {}

    def want(self, text):
        text = (text or "").strip()
        if not text or "___" in text:
            return None
        self.texts.setdefault(norm(text), text)
        return audio_name(text)

    def render(self, enabled):
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        todo = [t for t in self.texts.values() if not (AUDIO_DIR / audio_name(t)).exists()]
        if todo and not enabled:
            print(f"  audio: skipped {len(todo)} new clips (--no-audio)")
        elif todo:
            asyncio.run(self._render_all(todo))
        index = {}
        for key, text in self.texts.items():
            if self.has(text):
                index[key] = "audio/" + audio_name(text)
        wanted = {audio_name(t) for t in self.texts.values()}
        for f in AUDIO_DIR.glob("en_*.mp3"):  # clips nothing uses any more
            if f.name not in wanted:
                f.unlink()
        return index

    # Each engine: async (text, path) -> None, raising on failure.
    @staticmethod
    async def _edge(text, path):
        import edge_tts
        await asyncio.wait_for(edge_tts.Communicate(text, VOICE, rate=VOICE_RATE).save(str(path)), 30)

    @staticmethod
    async def _google(text, path):
        from gtts import gTTS
        await asyncio.wait_for(asyncio.to_thread(lambda: gTTS(text, lang="en", tld="us").save(str(path))), 30)

    async def _pick_engine(self, sample):
        """Microsoft's voice sounds best but is sometimes blocked; fall back to Google's."""
        probe = AUDIO_DIR / "_probe.mp3"
        for name, fn in (("Microsoft Aria", self._edge), ("Google", self._google)):
            try:
                await fn(sample, probe)
                if probe.exists() and probe.stat().st_size > 1000:
                    return name, fn
            except ImportError:
                pass
            except Exception:
                pass
            finally:
                if probe.exists():
                    probe.unlink()
        return None, None

    async def _render_all(self, todo):
        name, engine = await self._pick_engine(todo[0])
        if not engine:
            warn("no text-to-speech service reachable -- the site and Anki will use the device's own voice")
            return
        print(f"  audio: generating {len(todo)} new clips with the {name} voice ...")
        sem = asyncio.Semaphore(6 if engine is self._edge else 3)
        failed = []

        async def one(text):
            async with sem:
                path = AUDIO_DIR / audio_name(text)
                for attempt in range(3):
                    try:
                        await engine(text, path)
                        if path.exists() and path.stat().st_size > 500:
                            return
                    except Exception:  # network hiccups -- retry, then give up quietly
                        pass
                    if path.exists():
                        path.unlink()
                    await asyncio.sleep(1 + 2 * attempt)
                failed.append(text)

        await asyncio.gather(*(one(t) for t in todo))
        if failed:
            warn(f"{len(failed)} audio clips failed (they fall back to the device voice): " + ", ".join(failed[:5]))

    def has(self, text):
        if not text:
            return False
        p = AUDIO_DIR / audio_name(text)
        return p.exists() and p.stat().st_size > 500


# ---------------------------------------------------------------- anki

CARD_CSS = """
.card { font-family: "Nunito", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", Arial, sans-serif;
  font-size: 22px; line-height: 1.5; text-align: center; color: #2b2a28; background: #fbf8f3; padding: 14px; }
.en { font-size: 36px; font-weight: 800; margin-top: 8px; }
.zh { font-size: 30px; font-weight: 600; }
.sl { color: #b4541f; font-weight: 700; letter-spacing: .5px; margin-top: 4px; }
.ipa { color: #77726a; font-size: 18px; }
.ex { margin-top: 18px; font-size: 21px; }
.exzh { color: #77726a; font-size: 18px; }
.tip { margin: 16px auto 0; max-width: 520px; background: #fdecc8; border-radius: 12px; padding: 10px 14px;
  font-size: 17px; text-align: left; }
.hint { color: #9b958c; font-size: 16px; margin-top: 12px; }
.choices { font-size: 30px; font-weight: 800; margin-top: 14px; }
.bad { color: #c2410c; font-size: 24px; }
.good { color: #0f766e; font-size: 28px; font-weight: 800; }
hr#answer { border: 0; border-top: 1px solid #e3ddd2; margin: 18px 0; }
.nightMode .card, .card.nightMode { background: #1d1c1a; color: #f1ede6; }
.nightMode .tip, .card.nightMode .tip { background: #3b2f1c; }
.nightMode .sl, .card.nightMode .sl { color: #f0a36f; }
.nightMode .good, .card.nightMode .good { color: #5eead4; }
"""

# Recorded audio when the build made it, otherwise Anki's built-in device voice.
SAY = "{{#Audio}}{{Audio}}{{/Audio}}{{^Audio}}{{tts en_US:English}}{{/Audio}}"
SAY_A = "{{#AudioA}}{{AudioA}}{{/AudioA}}{{^AudioA}}{{tts en_US:WordA}}{{/AudioA}}"
SAY_B = "{{#AudioB}}{{AudioB}}{{/AudioB}}{{^AudioB}}{{tts en_US:WordB}}{{/AudioB}}"

BACK_DETAILS = """
<div class="ipa">{{IPA}}</div>
<div class="sl">{{SoundsLike}}</div>
{{#Example}}<div class="ex">{{Example}} {{ExampleAudio}}</div><div class="exzh">{{ExampleZh}}</div>{{/Example}}
{{#Tip}}<div class="tip">💡 {{Tip}}</div>{{/Tip}}
"""


def stable_id(name):
    return int(hashlib.sha1(name.encode("utf-8")).hexdigest()[:12], 16) % (1 << 40) + (1 << 40)


def anki_models():
    import genanki

    vocab = genanki.Model(
        stable_id("model:vocab:v1"),
        "Everyday English · Vocab",
        fields=[{"name": n} for n in
                ["English", "Chinese", "IPA", "SoundsLike", "Audio", "Example", "ExampleZh",
                 "ExampleAudio", "Tip", "ID"]],
        templates=[
            {"name": "1 English → 中文",
             "qfmt": '<div class="en">{{English}}</div>' + SAY + '<div class="hint">這是什麼意思？</div>',
             "afmt": '<div class="en">{{English}}</div>' + SAY + '<hr id="answer"><div class="zh">{{Chinese}}</div>'
                     + BACK_DETAILS},
            {"name": "2 中文 → English",
             "qfmt": '<div class="zh">{{Chinese}}</div><div class="hint">用英文說出來 · Say it in English</div>',
             "afmt": '<div class="zh">{{Chinese}}</div><hr id="answer"><div class="en">{{English}}</div>' + SAY
                     + BACK_DETAILS},
            {"name": "3 Listen 聽",
             "qfmt": '<div class="en">🎧</div>' + SAY + '<div class="hint">聽聽看，這是什麼？</div>',
             "afmt": '<div class="en">{{English}}</div>' + SAY + '<hr id="answer">'
                     '<div class="zh">{{Chinese}}</div>' + BACK_DETAILS},
        ],
        css=CARD_CSS,
    )
    pairs = genanki.Model(
        stable_id("model:pairs:v1"),
        "Everyday English · Sound pairs",
        fields=[{"name": n} for n in
                ["Choices", "WordA", "WordB", "IPA_A", "IPA_B", "ZhA", "ZhB", "AudioA", "AudioB", "Sound", "ID"]],
        templates=[
            {"name": "Hear A",
             "qfmt": '<div class="hint">🎧 你聽到哪一個？Which word?</div><div class="choices">{{Choices}}</div>' + SAY_A,
             "afmt": '<div class="choices">{{Choices}}</div>' + SAY_A + '<hr id="answer">'
                     '<div class="good">✅ {{WordA}}</div><div class="ipa">{{IPA_A}} · {{ZhA}}</div>'
                     '<div class="hint">比較 compare: {{WordB}} {{IPA_B}} {{ZhB}}</div>'},
            {"name": "Hear B",
             "qfmt": '<div class="hint">🎧 你聽到哪一個？Which word?</div><div class="choices">{{Choices}}</div>' + SAY_B,
             "afmt": '<div class="choices">{{Choices}}</div>' + SAY_B + '<hr id="answer">'
                     '<div class="good">✅ {{WordB}}</div><div class="ipa">{{IPA_B}} · {{ZhB}}</div>'
                     '<div class="hint">比較 compare: {{WordA}} {{IPA_A}} {{ZhA}}</div>'},
        ],
        css=CARD_CSS,
    )
    mistakes = genanki.Model(
        stable_id("model:mistakes:v1"),
        "Everyday English · My mistakes",
        fields=[{"name": n} for n in ["Wrong", "Correct", "Chinese", "Note", "Audio", "ID"]],
        templates=[
            {"name": "Fix it 改正",
             "qfmt": '<div class="hint">這句哪裡不對？怎麼說才對？</div><div class="bad">❌ {{Wrong}}</div>',
             "afmt": '<div class="bad">❌ {{Wrong}}</div><hr id="answer"><div class="good">✅ {{Correct}}</div>'
                     '{{#Audio}}{{Audio}}{{/Audio}}{{^Audio}}{{tts en_US:Correct}}{{/Audio}}{{#Chinese}}<div class="exzh">{{Chinese}}</div>{{/Chinese}}'
                     '{{#Note}}<div class="tip">💡 {{Note}}</div>{{/Note}}'},
        ],
        css=CARD_CSS,
    )
    return vocab, pairs, mistakes


def sound_tag(name):
    return f"[sound:{name}]" if name else ""


# ---------------------------------------------------------------- build

def main():
    try:  # Windows consoles may not be UTF-8; don't crash on Chinese text in messages
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-audio", action="store_true", help="don't generate new audio")
    args = ap.parse_args()

    for d in (DATA_DIR, DECK_DIR, AUDIO_DIR):
        d.mkdir(parents=True, exist_ok=True)

    print("Reading content/ ...")
    week = read_json(CONTENT / "week.json", {}) or {}
    released = sorted({int(u) for u in week.get("released_units", [])})

    vocab_rows = []
    for path in sorted((CONTENT / "vocab").glob("*.csv")):
        rows = read_csv(path)
        for r in rows:
            r["_file"] = path.name
        vocab_rows += rows
    seen = set()
    units = {}
    for r in vocab_rows:
        if not r.get("id") or not r.get("english"):
            warn(f"{r['_file']}: row without id/english skipped: {r}")
            continue
        if r["id"] in seen:
            warn(f"{r['_file']}: duplicate id {r['id']}")
        seen.add(r["id"])
        try:
            r["unit_no"] = int(r["unit_no"])
        except (KeyError, ValueError):
            warn(f"{r['_file']}: bad unit_no in {r['id']}")
            continue
        u = units.setdefault(r["unit_no"], {"unit_no": r["unit_no"], "unit_en": r.get("unit_en", ""),
                                            "unit_zh": r.get("unit_zh", ""), "items": []})
        u["items"].append(r)
    for u in units.values():
        u["phase"] = (u["unit_no"] - 1) // 6 + 1

    lessons = []
    for path in sorted((CONTENT / "lessons").glob("*.json")):
        data = read_json(path, [])
        lessons += data if isinstance(data, list) else [data]
    lessons.sort(key=lambda l: l.get("unit_no", 0))

    sounds = read_json(CONTENT / "pronunciation" / "sounds.json", [])
    pairs = read_csv(CONTENT / "pronunciation" / "minimal-pairs.csv")
    shadow = read_csv(CONTENT / "shadowing" / "sentences.csv")
    test = read_json(CONTENT / "level-test.json", {})
    mistakes = read_csv(CONTENT / "mistakes.csv")
    for m in mistakes:
        if not m.get("id"):
            m["id"] = "m-" + hashlib.sha1((m.get("wrong", "") + "|" + m.get("correct", "")).encode()).hexdigest()[:8]
    mistakes = [m for m in mistakes if m.get("wrong") and m.get("correct")]

    print(f"  {len(vocab_rows)} vocab rows in {len(units)} units, released: {released or 'none'}")
    print(f"  {len(lessons)} lessons, {len(sounds)} sounds, {len(pairs)} sound pairs, "
          f"{len(shadow)} shadowing sentences, {len(mistakes)} mistakes")

    # ---- audio
    bank = AudioBank()
    for n in released:
        for r in units.get(n, {}).get("items", []):
            bank.want(r["english"])
            bank.want(r.get("example"))
    for p in pairs:
        bank.want(p.get("word_a"))
        bank.want(p.get("word_b"))
    for s in sounds:
        for w in s.get("practice_words", []) + s.get("practice_sentences", []):
            bank.want(w)
    for s in shadow:
        bank.want(s.get("english"))
    for m in mistakes:
        bank.want(m["correct"])
    for part in test.get("parts", []):
        for item in part.get("items", []):
            if part.get("kind") == "listen":
                bank.want(item.get("say"))
            elif part.get("kind") == "pairs":
                bank.want(item.get("a"))
                bank.want(item.get("b"))
            elif part.get("id") == "vocab":
                bank.want(item.get("prompt"))
    audio_index = bank.render(not args.no_audio)
    print(f"  audio: {len(audio_index)} clips available")

    # ---- anki decks
    try:
        import genanki
    except ImportError:
        warn("genanki not installed: run  python -m pip install -r tools/requirements.txt")
        genanki = None

    old_decks = {d["id"]: d for d in (read_json(DATA_DIR / "decks.json", {}) or {}).get("decks", [])}
    decks_out = []
    built_decks = []

    def media_for(names):
        return [str(AUDIO_DIR / n) for n in names if n and (AUDIO_DIR / n).exists()]

    def finish_deck(deck_id, title_en, title_zh, desc_zh, kind, deck, media, fingerprint, unit_no=None):
        file = f"{deck_id}.apkg"
        path = DECK_DIR / file
        old = old_decks.get(deck_id)
        changed = not old or old.get("fingerprint") != fingerprint or not path.exists()
        if changed:
            genanki.Package(deck, media_files=sorted(set(media))).write_to_file(str(path))
        built_decks.append((deck, media))
        decks_out.append({
            "id": deck_id, "file": "decks/" + file, "title_en": title_en, "title_zh": title_zh,
            "desc_zh": desc_zh, "kind": kind, "unit_no": unit_no, "cards": count_cards(deck),
            "notes": len(deck.notes), "updated": TODAY if changed else old.get("updated", TODAY),
            "fingerprint": fingerprint,
        })

    def count_cards(deck):
        total = 0
        for note in deck.notes:
            total += len(note.cards)
        return total

    if genanki:
        m_vocab, m_pairs, m_mistakes = anki_models()
        for n in released:
            unit = units.get(n)
            if not unit:
                warn(f"released unit {n} has no vocab rows")
                continue
            name = f"English 英文::Unit {n:02d} {unit['unit_en']} {unit['unit_zh']}"
            deck = genanki.Deck(stable_id("deck:" + f"unit{n:02d}"), name)
            media = []
            for r in unit["items"]:
                a1, a2 = audio_name(r["english"]), audio_name(r.get("example", "")) if r.get("example") else ""
                a1 = a1 if bank.has(r["english"]) else ""
                a2 = a2 if a2 and bank.has(r["example"]) else ""
                media += [a1, a2]
                deck.add_note(genanki.Note(
                    model=m_vocab,
                    fields=[r["english"], r.get("chinese", ""), r.get("ipa", ""), r.get("sounds_like", ""),
                            sound_tag(a1), r.get("example", ""), r.get("example_zh", ""), sound_tag(a2),
                            r.get("tip_zh", ""), r["id"]],
                    guid=genanki.guid_for("vocab", r["id"]),
                    tags=[f"unit{n:02d}", f"phase{unit['phase']}"],
                ))
            fp = fingerprint_of([n.fields for n in deck.notes])
            finish_deck(f"unit-{n:02d}", f"Unit {n:02d} · {unit['unit_en']}", unit["unit_zh"],
                        f"第 {n} 課單字與句子（{len(unit['items'])} 個）", "unit", deck, media_for(media), fp, n)

        if pairs:
            deck = genanki.Deck(stable_id("deck:pairs"), "English 英文::Sounds 發音")
            media = []
            for p in pairs:
                a, b = p.get("word_a", ""), p.get("word_b", "")
                fa = audio_name(a) if bank.has(a) else ""
                fb = audio_name(b) if bank.has(b) else ""
                media += [fa, fb]
                deck.add_note(genanki.Note(
                    model=m_pairs,
                    fields=[" · ".join(sorted([a, b], key=str.lower)), a, b, p.get("ipa_a", ""), p.get("ipa_b", ""),
                            p.get("zh_a", ""), p.get("zh_b", ""), sound_tag(fa), sound_tag(fb),
                            p.get("sound_id", ""), p.get("id", a + "/" + b)],
                    guid=genanki.guid_for("pair", p.get("id", a + "/" + b)),
                    tags=["sounds", p.get("sound_id", "")],
                ))
            fp = fingerprint_of([n.fields for n in deck.notes])
            finish_deck("sounds", "Sound pairs", "發音聽力：分辨相似的音",
                        f"聽一個字，分辨像 ship / sheep 這樣的音（{len(pairs)} 組）", "sounds", deck, media_for(media), fp)

        if mistakes:
            deck = genanki.Deck(stable_id("deck:mistakes"), "English 英文::My Mistakes 我的錯誤")
            media = []
            for m in mistakes:
                fa = audio_name(m["correct"]) if bank.has(m["correct"]) else ""
                media.append(fa)
                deck.add_note(genanki.Note(
                    model=m_mistakes,
                    fields=[m["wrong"], m["correct"], m.get("chinese", ""), m.get("note", ""), sound_tag(fa), m["id"]],
                    guid=genanki.guid_for("mistake", m["id"]),
                    tags=["mistakes"],
                ))
            fp = fingerprint_of([n.fields for n in deck.notes])
            finish_deck("my-mistakes", "My mistakes", "我的錯誤句子",
                        f"上課時說錯的句子，練習改正（{len(mistakes)} 句）", "mistakes", deck, media_for(media), fp)

        if built_decks:
            fp = fingerprint_of([d["fingerprint"] for d in decks_out])
            old = old_decks.get("everything")
            path = DECK_DIR / "everything.apkg"
            changed = not old or old.get("fingerprint") != fp or not path.exists()
            if changed:
                all_media = sorted({m for _, media in built_decks for m in media})
                genanki.Package([d for d, _ in built_decks], media_files=all_media).write_to_file(str(path))
            decks_out.insert(0, {
                "id": "everything", "file": "decks/everything.apkg", "title_en": "Everything so far",
                "title_zh": "全部卡片（推薦）", "kind": "bundle", "unit_no": None,
                "desc_zh": "包含目前所有的課、發音和錯誤句子。重複匯入也不會重複，只會更新。",
                "cards": sum(d["cards"] for d in decks_out), "notes": sum(d["notes"] for d in decks_out),
                "updated": TODAY if changed else old.get("updated", TODAY), "fingerprint": fp,
            })

    # remove decks that are no longer published
    keep = {d["file"].split("/")[-1] for d in decks_out}
    for f in DECK_DIR.glob("*.apkg"):
        if f.name not in keep:
            f.unlink()

    # ---- site data
    write_json("decks", {"built": TODAY, "decks": decks_out})
    write_json("vocab", {
        "units": [{"unit_no": u["unit_no"], "phase": u["phase"], "unit_en": u["unit_en"], "unit_zh": u["unit_zh"],
                   "count": len(u["items"]), "released": u["unit_no"] in released}
                  for u in sorted(units.values(), key=lambda x: x["unit_no"])],
        "items": [{"id": r["id"], "unit": n, "en": r["english"], "zh": r.get("chinese", ""),
                   "ipa": r.get("ipa", ""), "sl": r.get("sounds_like", ""), "ex": r.get("example", ""),
                   "exzh": r.get("example_zh", ""), "tip": r.get("tip_zh", "")}
                  for n in released for r in units.get(n, {}).get("items", [])],
    })
    by_sound = {}
    for p in pairs:
        by_sound.setdefault(p.get("sound_id", ""), []).append(
            {"a": p.get("word_a", ""), "b": p.get("word_b", ""), "ipa_a": p.get("ipa_a", ""),
             "ipa_b": p.get("ipa_b", ""), "zh_a": p.get("zh_a", ""), "zh_b": p.get("zh_b", "")})
    write_json("sounds", [dict(s, pairs=by_sound.get(s.get("id"), [])) for s in sounds])
    write_json("shadowing", [{"id": s.get("id"), "level": int(s.get("level") or 1), "topic": s.get("topic", ""),
                              "en": s.get("english", ""), "zh": s.get("chinese", ""), "focus": s.get("focus_zh", "")}
                             for s in shadow])
    write_json("lessons", [dict(l, released=l.get("unit_no") in released) for l in lessons])
    write_json("level-test", test)
    write_json("mistakes", [{"id": m["id"], "wrong": m["wrong"], "correct": m["correct"],
                             "zh": m.get("chinese", ""), "note": m.get("note", "")} for m in mistakes])
    write_json("week", dict(week, built=TODAY))
    write_json("audio-index", audio_index)

    print(f"Done. {len(decks_out)} decks, site data in docs/data/.")
    if warnings:
        print(f"{len(warnings)} warning(s) -- see above.")
    return 0


def fingerprint_of(obj):
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]


if __name__ == "__main__":
    sys.exit(main())
