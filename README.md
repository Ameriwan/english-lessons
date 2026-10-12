# Everyday English 每日英文

A small website + Anki decks for teaching English to a Traditional-Chinese (Taiwan) speaker.
Focus: **pronunciation** and **everyday conversation**. Works on phone and laptop.

**Live site:** GitHub Pages serves the `docs/` folder.

## What's on the site

| Page | For | What it does |
|---|---|---|
| 首頁 Home | her | Today's checklist, 🔥 streak, this week's homework |
| 卡片 Decks | her | Download Anki decks (one "Everything" bundle + one per unit) |
| 測驗 Quiz | her | 6 modes: EN→中, 中→EN, listen, fill-in, spelling, say-it (speech recognition); review missed words; fix-your-mistakes |
| 發音 Sounds | her | 9 problem sounds for Mandarin speakers: how-to in Chinese, practice words, mic check, record & compare, minimal-pair listening game |
| 跟讀 Shadow | her | 45 sentences in 3 levels, slow mode, auto-shadow ×5, word-by-word mic check |
| 程度測驗 Level test | both | 8 parts alternating computer parts and teacher-run speaking/listening parts, adaptive, gives a level + plan |
| 老師 Teacher | you | 2-hour session timer with the day's content, all 18 lesson plans, mistake logger, test results, weekly guide |

## Weekly workflow

1. Edit `content/week.json` — add the next unit to `released_units`, update homework / `sound_of_week`.
2. Paste new mistakes (Teacher → ✍️ Mistakes → Copy rows) into `content/mistakes.csv`.
3. Double-click **`update-site.cmd`** (builds, commits, pushes).

## Content files (edit these)

```
content/
  week.json                  what's released + this week's homework
  vocab/phase-1..3.csv       18 units × 20 items (open in Excel/Sheets)
  lessons/phase-1..3.json    lesson plans for the teacher page
  pronunciation/sounds.json  the 9 sounds
  pronunciation/minimal-pairs.csv
  shadowing/sentences.csv
  level-test.json            the placement test
  mistakes.csv               her mistakes → "My Mistakes" deck
```

Everything in `docs/data`, `docs/audio` and `docs/decks` is generated — don't edit by hand.

## Build manually

```
python -m pip install -r tools/requirements.txt
python tools/build.py            # full build (needs internet for new audio)
python tools/build.py --no-audio # skip new audio
```

Preview locally: `python -m http.server 8781 --directory docs` → http://localhost:8781

Audio is Microsoft's free neural voice (via `edge-tts`), generated once and cached. Card IDs are stable,
so re-importing a deck updates cards without duplicating them or resetting her progress.
