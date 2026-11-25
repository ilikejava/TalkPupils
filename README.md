# TalkPupils

Free PSLE Oral, typing and vocabulary practice for Singapore pupils — read aloud,
talk to the Oral Partner, type, spell and build vocabulary, with progress that
grows with the child.

## What it does

- **Read** — 10 PSLE-style passages from the Oral Pack, 6 built-in Primary passages,
  plus passages a parent adds. Model reading, microphone reading test (or timed
  read), speed / clarity / smoothness scores, and a PSLE mark out of 10 with
  marker feedback. After a reading test, **Review grammar** highlights the
  grammar in the same passage with plain explanations and a short quiz.
- **Oral Partner** — the app acts as a PSLE Oral examiner: 18 stimulus-based
  conversation topics with photos, a 2-minute preparation timer, 3 questions
  asked by voice, answers by speaking or typing, voice recordings saved for
  playback, and a refined version of each answer with the gaps pointed out.
  SBC mark out of 25.
- **Type** — Sentence Race and Word Rain using the same passages, plus
  Listen & Spell using the vocabulary words.
- **Words** — P5 Stellar vocabulary (Units 1–9, about 282 words) to study by unit,
  with a meaning quiz. A parent can add new vocabulary.
- **Progress** — per-pupil history, weekly and monthly reports, practice streak,
  best marks, awards, and Mastered / Improving lists.
- **Spaced repetition** — words and passages answered well come back after 1, 3, 7,
  14, then 30 days; wrong ones come back soon. No AI needed.
- **Optional AI marking** — with your own ChatGPT or Claude API key, the app can
  also ask the AI to mark a reading or refine an oral answer. The key is stored
  only on your laptop and is never included in backups.

## How to run it (pilot, on a laptop)

Needs Python 3 and Google Chrome.

Windows: double-click `start.bat`. Mac / Linux: run `sh start.sh`.
The app opens at http://localhost:8080. Keep the server window open while
practising.

All pupil data is saved as JSON files in `data/` on the laptop — nothing is
saved in the browser. Answer recordings are kept for 7 days, then deleted
automatically to save space.

## Roadmap

The pilot runs on a laptop. The next step is a free website for all Singapore
pupils: this code on GitHub, with Supabase for pupil sign-in, the database
for profiles and progress, and storage for pictures and answer audio.

## Privacy

No pupil data is committed to this repo — see `.gitignore`. The AI API key
(`data/ai_config.json`) is never committed and never included in backups.
