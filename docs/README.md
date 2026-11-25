# TalkPupils — website v1

Free PSLE Oral, typing and vocabulary practice for Singapore pupils.
This is the website version: a static frontend on **GitHub Pages** with
**Supabase** for parent sign-in, pupil profiles, progress and storage.
It is the same app as the laptop pilot, rebuilt for the web.

Live site (after the steps below): **https://ilikejava.github.io/TalkPupils/**

## What it does

- **Read Aloud** — 10 PSLE-style passages from the Oral Pack + 6 built-in
  Primary passages. Model reading, microphone reading test (or timed
  read), speed / clarity / smoothness, and a PSLE mark out of 10 with
  marker feedback. **Review grammar** highlights the grammar in the
  passage with plain explanations and a short quiz.
- **Oral Partner** — the app acts as a PSLE Oral examiner: 18 picture
  topics, a 2-minute preparation timer, 3 questions asked by voice,
  answers by speaking or typing, voice recordings saved for playback,
  and a refined version of each answer with the gaps pointed out.
  SBC mark out of 25.
- **Typing Quest** — Sentence Race, Word Rain and Listen & Spell, using
  the same passages and vocabulary as reading.
- **Words** — P5 Stellar vocabulary (Units 1–9, about 282 words), study,
  meaning quiz, and a form to add your own words.
- **Progress** — per-pupil history, weekly and monthly reports, practice
  streak, best marks, awards, and Mastered / Improving lists.
- **Spaced repetition** — words and passages answered well come back
  after 1, 3, 7, 14, then 30 days; wrong ones come back soon. No AI.
- **Parent** — marking requirements editor, add your own passages and
  picture topics, Oral Partner settings, backup download / restore.
- **Try without signing in** — a guest trial: pick a demo P6 or P4
  pupil and use the whole app. Guest results stay only in that
  browser (localStorage); nothing is sent to Supabase and no account
  is created. A banner at the top says so, with a button to sign in
  and save progress properly. Leaving guest mode clears the trial data.

## Try it without signing in (guest trial)

No setup needed except turning on the website (step 2 below). Open
the site, tap **Try as a P6 pupil** or **Try as a P4 pupil**, and use
the whole app — reading, typing, words, Oral Partner, progress. The
guest trial works even before the database tables (step 1) are created,
because it does not touch Supabase at all. A direct link skips the
sign-in page entirely: add `?guest=P6` (or `?guest=P4`) to the site
URL.

## Test tonight — 3 steps

### 1. Create the database tables (one time, about 2 minutes)

1. Open your Supabase project: https://supabase.com/dashboard/project/cajdrfofhsfejfcyhfdr
2. Left menu → **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` in this repo, copy the whole file, paste it
   into the query box, and click **Run**. It should say “Success. No rows
   returned.” (It is safe to run again.)

### 2. Turn on the website (one time, about 1 minute)

1. In GitHub, open the repo → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/docs**. Click **Save**.
4. Wait about a minute, then open **https://ilikejava.github.io/TalkPupils/**

### 3. Sign up and add the two pupils

1. On the site, sign up with your email and a password (parent account).
   If it asks you to confirm your email, click the link in the email,
   then sign in. (If the link does not arrive: Supabase → Authentication
   → Providers → Email → turn off “Confirm email”.)
2. At the top right, tap **+ P6 pupil** — the name is already filled in
   as “P6”; change it to your child's name if you like, then **Save pupil**.
   Do the same with **+ P4 pupil**.
3. Try one reading test (Read Aloud tab, microphone or timed read) and
   one Oral Partner mock (3 questions). Check the **Progress** tab — the
   session, mark and streak should be there. Switch pupils at the top
   right to see each child's own progress.

## Notes for tonight

- **Photos:** the 18 Oral Partner pictures load from this repo
  (`content/sbc_stimuli/`). If a picture is not in the repo yet, the
  topic still works and shows a “Picture coming soon” placeholder.
- **Microphone:** use Google Chrome on a laptop. Speech recognition
  does not work in iPad browsers (type the answers instead).
- **Answer recordings** are saved in Supabase storage. Recordings older
  than 7 days are deleted automatically when the parent signs in.
  Written answers and scores are kept.
- **AI marking is NOT in v1.** Readings are marked on the page, out of
  10, from the measured speed / clarity / smoothness, using the marking
  requirements in the Parent tab. AI marking (ChatGPT / Claude) needs a
  secure server and comes in a later update.
- **Privacy:** each parent only sees their own pupils (row level
  security). No `service_role` key is used anywhere in this website —
  only the publishable key, which is safe to embed in frontend code.

## Files

- `index.html`, `app.js`, `styles.css` — the website (served from `docs/`)
- `content/` — passages, vocabulary, grammar highlights, SBC topics
- `supabase/schema.sql` — database tables, security rules, storage buckets
