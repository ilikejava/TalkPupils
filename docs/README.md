# TalkPupils — website v14

Free PSLE Oral, typing and vocabulary practice for Singapore pupils.
This is the website version: a static frontend on **GitHub Pages** with
**Supabase** for parent sign-in, pupil profiles, progress and storage.
It is the same app as the laptop pilot, rebuilt for the web.

Live site (after the steps below): **https://ilikejava.github.io/TalkPupils/**

v12: the Delete pupil button is gone from the top bar, so a pupil
profile can no longer be deleted by an accidental tap.

v13: a brighter, kid-friendly look — each tab has its own colour
(Read Aloud blue, Typing Quest orange, Words green, Oral Partner
purple, Progress pink, Parent grey), the page background is a soft
sky-to-cream gradient, and the header is a blue-to-purple gradient.

v14: sign-in page fixes from the login test — the “Resend
confirmation email” hint only appears together with its button
(it used to promise a button that was hidden), and Supabase's
email rate-limit / not-authorized errors now show plain messages.

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
  and save progress properly. When the parent signs in on the same
  browser, the pupils added in the trial (and their sessions and
  progress) move into the parent account and show in the pupil list;
  the built-in “Guest pupil” demo profile does not move across.

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
   then sign in. (If the link does not arrive: tap “Resend confirmation
   email” on the sign-in card, or in Supabase → Authentication
   → Providers → Email → turn off “Confirm email” — with that off, a
   new sign-up signs the parent straight in with no email step.)
2. At the top right, tap **+ P6 pupil** — the name is already filled in
   as “P6”; change it to your child's name if you like, then **Save pupil**.
   Do the same with **+ P4 pupil**.
3. Try one reading test (Read Aloud tab, microphone or timed read) and
   one Oral Partner mock (3 questions). Check the **Progress** tab — the
   session, mark and streak should be there. Switch pupils at the top
   right to see each child's own progress.

### 4. Turn on AI marking (optional, about 5 minutes)

The website is a static page, so the API key can never live in it —
anyone could copy it from the page source. A small Supabase Edge
Function holds the key instead.

1. Open your Supabase project → left menu → **Edge Functions** →
   **Create a new function**. Name it exactly `ai-mark`.
2. Open `supabase/functions/ai-mark/index.ts` in this repo, copy the
   whole file, paste it into the function editor, and click **Deploy**.
   Leave **Verify JWT** on (only a signed-in parent can call it).
3. Still in Edge Functions → **Secrets** (or **Manage secrets**) → add
   a secret: name `OPENAI_API_KEY`, value your ChatGPT key. For Claude,
   add `ANTHROPIC_API_KEY` instead (or as well).
4. On the website, sign in, go to the **Parent** tab → **AI marking**,
   pick the provider, tick **Use AI marking**, **Save AI settings**,
   then **Test connection**. The Parent tab shows whether the server
   has a key for the chosen provider.

Cost: about $0.0025 per reading on ChatGPT (gpt-5.4-mini) and about
$0.0003 on Claude Haiku. The key is never shown on the page and never
sent to the browser — only the mark and feedback come back.

## Notes for tonight

- **Photos:** the 18 Oral Partner pictures load from this repo
  (`content/sbc_stimuli/`). If a picture is not in the repo yet, the
  topic still works and shows a “Picture coming soon” placeholder.
- **Microphone:** use Google Chrome on a laptop. Speech recognition
  does not work in iPad browsers (type the answers instead).
- **Answer recordings** are saved in Supabase storage. Recordings older
  than 7 days are deleted automatically when the parent signs in.
  Written answers and scores are kept.
- **AI marking (v10)** — optional. After a reading test, the AI gives a
  second mark out of 10 plus two strengths and two improvements; for
  Oral Partner it refines the answer and gives a mark out of 25. It
  runs through a Supabase Edge Function (`supabase/functions/ai-mark/`)
  that holds the API key as a server secret, so the key never appears
  on the page. See “AI marking setup” below. The local mark always
  counts, even if the AI is off or fails. Guest trials use the local
  mark only.
- **Privacy:** each parent only sees their own pupils (row level
  security). No `service_role` key is used anywhere in this website —
  only the publishable key, which is safe to embed in frontend code.

## Files

- `index.html`, `app.js`, `styles.css` — the website (served from `docs/`)
- `content/` — passages, vocabulary, grammar highlights, SBC topics
- `supabase/schema.sql` — database tables, security rules, storage buckets
- `supabase/functions/ai-mark/index.ts` — AI marking Edge Function
  (deploy it from the Supabase dashboard; see “AI marking setup” above)
