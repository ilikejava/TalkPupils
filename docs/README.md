# TalkPupils — website v44

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

v15: no more parent account — each pupil signs in with their own
name + password (no email; the name maps to a made-up
kid-&lt;name&gt;@talktupils.local address the app uses behind the
scenes, so sign-up only works with “Confirm email” turned off in
Supabase). A guest trial under the pupil's name moves into their
account on first sign-in. The Parent tab is now “Settings”. The AI
now reads the pupil's whole progress history: each reading/oral
mark comes with “What to work on next”, and the Progress tab has a
“Get AI ideas” button that proposes a practice plan. The Edge
Function gains a `plan` action — redeploy `supabase/functions/ai-mark/index.ts`
in the Supabase dashboard for the history-aware AI to work.

v44: Zeen's Cloze Words (unit 201) grows to 244 words with 83 more from the Vocabulary Exercises 41–44 and the Comprehension Exercises 45–70 — Alice in Wonderland (knelt, avenue, aspired, yearned, absurd, pointless, assuming), hurricane (lull, innate, swirling, spiral, inherited, soaring), acid rain (aquatic, oxides, erodes, taints, adjustments, dioxide), AI (assistants, recommend, preferences, judgement, justify, complicated, typical), the crow and the pitcher (dehydrated, exasperated, perched, stooped, quench), two travellers (continent, perhaps), bananas (crop, plantations), the fire plane (raging), the donkey (carefree, contented, meadow, melodious), the coal mine (mine, dimly, adapt, sprawling, impact), the Black Death (blotches), tornadoes (whirlwind), eye injuries (delay, obvious, evaluated, ophthalmologist, blurred, constant, rapid, detergents, delicate), meteors (hurtle, periodically), the fire at flats (ferociously), the astronaut (thermostabilised), the girl in the lift (inaudible, loitering, stunned, appalled, accompanied), wild boars (recent, adaptable, raid, elusive, conflicts, aggressive, tend, abundant), the water cycle (precipitation), Chinese New Year (deities, forbidden, simplified, superstitious, generation, households), night noises (eerie, convey), moody Alex (moody). "lethargic", "pungent", "invitation" and "shrill" were already in the vocabulary, so they were not added twice. Exercises 45–70 are comprehension cloze (fill in each blank with a suitable word — no word bank), so only their highlighted words went in — no Cloze-tab entries and no new reading passages. Four more workbook notes were corrected to the passage meaning: "raging" (the note gives "rage" = violent anger; in "raging flames" it means burning very fiercely), "contented" (the note gives "content" = the things contained in something; "contented" means happy and satisfied), "stunned" (the note says to make someone unconscious; in the passage it means very shocked), and "generation" (the note gives "generate" = to produce electricity; "generation" means all the people born around the same time). Exercise 6 (only page 11 sent) and Exercise 7 (never sent) are still missing.

v43: Zeen's Cloze Words (unit 201) grows to 161 words with 66 more from the Vocabulary Exercises 31–40 — asthma set (triggered, wheezing, symptom, prudent, asthma, erratic, chronic, seasonal, propelled, rationing, exhaustion, shrewd, wise), sea turtles (caruncle, venture, adulthood, differs, fluctuates), shadows (influences, sheds, conceals, favours), cyberbullying (cyberbullying, physical, rumours, seeps, validated, assist, conspire, acknowledge), water in the body (urination, formula, releases), Eiffel Tower (permitted, spectacular, paraded, possessed, coaxed, surreal, peculiar, imposing, complementary), Mrs Jones and Sally (accustomed, asserting), Jack and Snowball (commotion, rummage, oblivious, declared, reminisced), Ashrita Furman (lawnmower, feats, sheer, spurred, accomplished, consistent, pure, antics, instigated, inspired), volcanoes (dormant, geologists, settlements, categorised, indications, impractical, toxic). "distinct" was already in the Stellar vocabulary, so it was not added twice. Two more workbook notes were corrected to the passage meaning: "distinct" (the note says clearly heard; in "two distinct experiences" it means clearly different) and "settlements" (the note says an official agreement; near volcanoes it means places where people live). Exercises 23–40 are vocabulary multiple-choice, not cloze passages, so only their words went in — no Cloze-tab entries. Exercise 6 (only page 11 sent) and Exercise 7 (never sent) are still missing.

v42: a new Cloze tab (teal, after Read Aloud) with all 20 completed workbook exercises (1–5, 8–22 except 6–7, which are still missing pages). Each exercise shows its passage with the 10 blanks as dropdowns listing the word bank A–M; Check answers marks each blank green/red, shows the right word for wrong ones, gives a mark out of 10 and saves it as a Cloze session (worth up to 100 points). The filled passage for every exercise is also in Read Aloud and Typing as a built-in (now 26 built-ins). Zeen's Cloze Words (unit 201) grows to 95 words: 15 from Exercises 13–16, 6 from Exercises 18–19, 21 from Exercises 20–22 (circumstances, navigation, lethargic, captivating, predominantly, metabolic, fibrous, sluggish, secure, solitary, diverse, reveal, mineralised, unaltered, impression, dung, destruction, paleontologist, sedimentary, historical, amateur — "utilise" was already in the P5 spelling lists, so it was not added twice), and 35 from the Vocabulary Exercises 23–30 (gritted, ointment, dramatically, fractured, propped, bragged, gash, boasted, ranted, dent, chimed, stammered, wistfully, unconcernedly, thus, doubtful, pleased, tomcat, shrill, distress, monsoon, mewing, futile, dull, worthwhile, snorkel, surveying, grandest, obstacle, condensation, implied, ruin, blossom, essential, critical — "groaned" and "bellowed" were already in the Stellar vocabulary, so they were not added twice). Exercises 23–30 are vocabulary multiple-choice (5 questions each), not cloze passages, so only their words went in — no Cloze-tab entries. Three workbook notes were corrected to the passage meaning: "castings" (the note says choosing actors; in the earthworm passage it means worm droppings), "secure" (the note says to achieve something; in "a secure grip" it means firm and steady), and "wistfully" (the note says eagerly; in "said wistfully" it means in a sad way, wishing for something). Two pupil answers were corrected by grammar and elimination: Exercise 12 blank 7 is "of" (not "another") and Exercise 20 blank 7 is "then" (not "down"). Exercise 6 (only page 11 sent) and Exercise 7 (never sent) are still missing.
v41: Zeen's P4 cloze words and passage. (1) Five words from her Conquer English Cloze Workbook 4, Exercise 1, added to the Words tab as a new unit "Zeen's Cloze Words" (unit 201): dissatisfied, persistent, clutching, misguided, rapidly — meanings from the handwritten notes in her workbook. They appear in study, quiz and Listen & Spell like any other unit. (2) The Exercise 1 passage, "The Tortoise and the Eagle" (205 words, blanks filled with the correct answers), added to Read Aloud and Typing as Built-in 7. The P3 starting passage stays pinned to "A Morning in the Park" (built-in 6) so the shorter cloze passage does not move it. Exercise 2 (gravity) is not in yet — only its second page was sent, so the opening is missing.
v40: Word Rain double-start fix. Tapping "Start Word Rain" twice (or again mid-round) used to start a second set of timers: the 60-second countdown, the word spawn and the falling all ran twice as fast, and the first set of timers was never cleared, so every later round ran fast too until the page was reloaded. Now a second tap while a round is running is ignored, any stale timers are cleared on start, and the Start button is greyed out and reads "Playing…" until the round ends.
v39: two guest-mode fixes. (1) The "Sign up / Sign in" button in the guest banner now goes straight to the sign-in page instead of reloading the page — the reload relied on a sessionStorage flag that failed silently on some browsers, leaving the pupil stuck in guest mode with a dead button. Signing in still reloads the page (see doAuth), so a named guest trial still moves into the account on sign-in. (2) Signing in no longer wipes a guest trial that has no named profile: a trial under the built-in "Guest pupil" demo profile used to be deleted on sign-in; now it simply stays in that browser. (The trial is still cleared after a named profile moves across.)
v38: Word Rain can now play your own MP3 files instead of the built-in synthesized tunes. Put an MP3 in docs/content/music/ in the repo, named exactly tmth.mp3 (Take Me to Your Heart), moon.mp3 (The Moon Represents My Heart), twinkle.mp3, ode.mp3, row.mp3 or london.mp3. When the round starts, the site checks for that file: if it is there, the real recording plays (looped, 20% volume); if not, the synthesized tune plays as before. Songs can be swapped one at a time, and deleting the MP3 brings the synthesized tune back.
v37: Word Rain now plays music while a round runs. A Music dropdown in the Word Rain card offers six classic tunes — Take Me to Your Heart (the default), The Moon Represents My Heart, Twinkle Twinkle Little Star, Ode to Joy, Row, Row, Row Your Boat, London Bridge Is Falling Down — plus No music. The music starts when the round starts and stops when it ends (or when the pupil leaves the Typing tab); changing the tune mid-round switches it straight away, and the pick is remembered. All tunes play at 20% volume, softly, so they never drown out the typing. The tunes are soft synthesized versions played by the browser itself (Web Audio) — no audio file is needed, they work offline, and the site does not host the original recordings.
v36: Word Rain Levels 1–3 are slower for children new to the keyboard (Level 1 now ~40 seconds for a word to fall, a new word every 6 seconds; Levels 2–3 slowed one step too; Levels 4–6 unchanged). Primary 3 and Secondary 2 are now levels a pupil can pick at sign-up (and in the guest trial, the password reset and the file-import level list). Content follows the level on sign-in: a P3 pupil starts Word Rain at Level 1 and opens on the shortest Primary passage instead of the PSLE Oracle set; Sec 2 starts Word Rain at Level 4; P4/P5/P6/Sec 1 are unchanged (Levels 2/3/3/3, Passage 01). The speed dropdown and the passage dropdown still let any pupil change it by hand. The AI file-import can now tag passages P3 to Sec 2 — this needs the ai-mark function redeployed in Supabase (same redeploy as v34).
v35: The model reading now reads with feeling. Each sentence gets a voice to match what it says: excited or panicked lines ("Oh dear! I'm so late!") go faster and higher, happy lines lift a little, questions rise, worried or quiet lines ("clearly bewildered", "rubbing his eyes groggily") go slower and lower, spoken words are livelier than plain narration. The sentence-by-sentence highlighting stays exactly as before.
v34: AI copes better when Google's free Gemini is busy. On a "high demand" (503) answer the function now tries once more a few seconds later instead of failing straight away; if it is still busy, the message is plain — "Gemini is busy right now — try again in a few minutes" — instead of Google's long sentence. WILLIAM must redeploy supabase/functions/ai-mark/index.ts in the Supabase dashboard for this to take effect — the same redeploy also brings the v22 improvements (55-second timeout, low thinking) that were in the repo but not yet live.
v33: All 28 Oral Partner topics now have pictures. The 10 cheat-sheet topics (Health + Resident's corner) are linked to their new AI illustrations, and the 18 Oracle topics now show AI-generated pictures instead of the scanned pack photos (the original pack photos are backed up). No code change was needed for the 18 — they already pointed at practice-NN.jpg.
v32: Word Rain now answers back. Typing a word that is not falling gave no feedback at all — a child could not tell whether the game heard them. It now says "Caught …! +10" on a catch and "No match — type a word you can see falling." when the word is not on the screen. (Checked during the v31 layout test: a 0-point round was the words reaching the bottom before the test typed them, not a scoring bug.)
v31: Layout — less scrolling. (1) On wide screens the 6 tabs are now a vertical menu down the left side (sticky, so it stays visible while you scroll); phones keep the horizontal tab row. (2) The Progress tab's cards now sit side by side in two columns — glance and history span both — so the page is about half as long. (3) History shows the latest 10 sessions with a "Show all N sessions" button instead of all 50 at once.
v30: Leaderboard — compete with others. A new "🏆 Leaderboard" card in Progress shows the top 10 pupils by total points, with each pupil's registered name and level; your own row is highlighted, and your rank shows below the table if you are outside the top 10. One shared `leaderboard` row per pupil (name + points), updated automatically after every practice and on sign-in. WILLIAM must re-run supabase/schema.sql in the Supabase SQL Editor once for the new table — until then the card says the board is being set up. Guests see a sign-up note instead of the board.
v29: Oral Partner answer hardening. (1) Double-tapping Done could record the same answer twice and skip a question — the Done button is now disabled the moment an answer is submitted. (2) Marking now matches multi-word topic words ("time management", "study timetable") instead of only single words, and "timetable" was added to the Time management topic. (3) A genuine short answer (10+ words) now earns half a length point instead of a flat 0 — the same 19-word answer that scored 0/5 now scores 1.5/5.
v28: Points, awards and the Oral Partner mock fix. (1) Top-right points label — every session earns up to 100 points (reading mark x10, oral SBC x4, typing game points capped at 100, quiz/spell/quest/grammar as a percentage), shown as "⭐ N pts" beside the pupil name, with the day streak when it is more than 1 day. (2) Awards grow from 8 to 17: First Steps, Quest Starter, Perfect Quest (15/15), Quest Streak 3, Word Collector (10 words mastered), and points milestones Rising Star 500 / Superstar 1,000 / Champion 2,500 / Legend 5,000 — plus a "🏆 New award" pop-up the moment one is earned. Total points also shows in Progress. (3) BUG FIX: finishing an Oral Partner mock crashed (a mistyped variable name, aiSbcMark) so no review screen appeared and the round was never saved — fixed and verified with a 20-check harness.
v27: Words tab gains Zexi's AGrader P5 spelling lists — ALL 21 weeks, 105 words (Weeks 7 and 9 arrived 26 Nov), each with the sheet's printed meaning. They appear as "Spelling Week N" in the study/quiz/Listen & Spell unit dropdowns, alongside the 9 Stellar units; the heading is now just "Vocabulary". New: Daily Spelling Quest at the top of the Words tab — one spelling week a day (rotates by date), 3 quick rounds (hear it + spell it, pick the meaning, recall the word from its meaning), stars + points + a day streak, about 5 minutes. Three words (athlete, competent, occasionally) already existed in Stellar with shorter meanings — both versions are kept, so every weekly set stays complete at 5 words.
v26: Oral Partner gains the 10 Health/Neighbours topics from The Write Tribe's PSLE Oral Conversation Cheat Sheet SAMPLE (Sets 1-9 with PEEL model answers, Set 10 prompts only — the sample ends there; no pictures in this version, cards show "No picture"). PEEL (Point-Elaborate-Example-Link back) now shows in the prep screen's helpful-phrases box. Topics 19-28 in the Oral Partner menu.
v25: forgot-password via a secret word (pupils have no email, so no reset link is possible). Sign-up now asks for a secret word, stored in the account; the sign-in card has "Forgot password?" which checks name + level + secret word through a new Edge Function "auth-reset" (Verify JWT OFF — the pupil is not signed in; the secret word is the check; 5 wrong tries per name in 10 minutes). Settings has a "Password & secret word" card to change the password or set the word later — existing pupils (signed up before secret words) must set one there. The reset function uses the auto-provided SUPABASE_SERVICE_ROLE_KEY; no new secret to add.
v24: Words heading is now "Vocabulary — Stellar Units" (no "Primary 5") — later levels/units will be added, so no level is specified. Same change in the Typing tab note.
v23: removed the "Add new vocabulary" card (Words) and the Settings cards "Add your own picture topic", "AI marking (optional)" and "Add your own passage". AI marking is now on by default (runs whenever the server key is set, no toggle). "Add passages & words from a file" is now the only upload window for passages and vocabulary (PDF, photo or pasted text).
v22: Gemini calls now use low thinking (3.8-flash reasons longer by default; our marking calls are simple) and wait up to 55s — the first 3.8-flash test hung 30s and then Google answered "high demand, try again later". A timeout now says so plainly instead of "check the internet connection".
v21: default model switched to gemini-3.8-flash — Google retired gemini-2.5-flash for new users, and its own error message names 3.8-flash as the replacement. Same free tier.
v20: Gemini is now the only AI provider (gemini-2.5-flash, free tier from Google AI Studio, no card) and the default. ChatGPT and Claude are removed; the provider dropdown is gone. The Model box now also refuses a pasted Gemini key (AIza...).
v19: the AI service now always answers with a plain message instead of a generic error (unknown actions and bad model names return HTTP 200 with the reason, and the client explains when the Edge Function needs redeploying).
v18: Add passages & words from a file — upload a PDF (read in the browser with pdf.js) or a photo (read by Claude vision), or paste text; the AI splits it into 150-300-word passages with titles and levels and picks out new words with plain meanings; parent checks the list, then saves the ticked items into My Passages / My words. Needs the Claude key, like AI marking.
v17: AI default switched to Claude Haiku 5.5 (claude-haiku-5-5) — cheapest and fastest for marking, follow-ups and plans; ChatGPT stays as an option. The model box now refuses anything that looks like an API key (sk-...), and the Edge Function rejects it too — the key only ever goes in Supabase Secrets.
v16: database permission fix — the schema never granted the signed-in
role any privileges on the tables, so every signed-in query failed with
“permission denied for table …” even though the RLS policies were
right. `supabase/schema.sql` now grants select/insert/update/delete on
all 7 tables to `authenticated`. If you already ran the schema once,
run the whole file again in the SQL Editor — it only adds the grants.

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
- **Words** — Stellar vocabulary (Units 1–9, about 282 words), study,
  meaning quiz, and a form to add your own words.
- **Progress** — per-pupil history, weekly and monthly reports, practice
  streak, best marks, awards, and Mastered / Improving lists.
- **Spaced repetition** — words and passages answered well come back
  after 1, 3, 7, 14, then 30 days; wrong ones come back soon. No AI.
- **Parent** — marking requirements editor, add your own passages and
  picture topics, Oral Partner settings, backup download / restore.
- **Try without signing in** — a guest trial: pick a demo pupil (P3, P4, P6 or Sec 2)
  and use the whole app. Guest results stay only in that browser (localStorage); nothing is sent to Supabase and no account
  is created. A banner at the top says so, with a button to sign in
  and save progress properly. When the parent signs in on the same
  browser, the pupils added in the trial (and their sessions and
  progress) move into the parent account and show in the pupil list;
  the built-in “Guest pupil” demo profile does not move across.

## Try it without signing in (guest trial)

No setup needed except turning on the website (step 2 below). Open
the site, tap **Try as a P6 pupil**, **Try as a P4 pupil**, **Try as a P3 pupil** or **Try as a Sec 2 pupil**, and use
the whole app — reading, typing, words, Oral Partner, progress. The
guest trial works even before the database tables (step 1) are created,
because it does not touch Supabase at all. A direct link skips the
sign-in page entirely: add `?guest=P6` (or `?guest=P3`, `?guest=P4`, `?guest=Sec%201`, `?guest=Sec%202`) to the site
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
