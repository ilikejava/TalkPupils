TalkPupils — Standalone Laptop App
=================================

A practice app for Singapore primary pupils: read aloud, talk to the Oral
Partner, type, learn vocabulary, and see progress — all saved on this
laptop, with no internet needed after setup.

WHAT YOU NEED
-------------
1. Python 3 — free from https://www.python.org/downloads/
   (During the install, tick "Add Python to PATH".)
2. Google Chrome — needed for the microphone reading test and the
   spoken words in Listen & Spell. Any modern browser works for the
   rest, but Chrome is best.

HOW TO RUN IT
-------------
Windows:
  Double-click start.bat
  The server starts and the app opens in Chrome at http://localhost:8080
  Keep the black window open while practising. Close it to stop the app.

Mac / Linux:
  Double-click start.sh (or run: sh start.sh)
  The app opens at http://localhost:8080

If port 8080 is already in use, the server picks the next free port
up to 8090 and prints the address in the server window.

WHAT IS INSIDE
--------------
Tabs:
  Read    — 10 PSLE-style passages from the Oral Pack (Passage 01–10),
            6 built-in Primary passages, plus any passages a parent adds.
            Model reading, microphone reading test (or timed read),
            speed / clarity / smoothness scores, and a PSLE mark out of
            10 with marker feedback. After a reading test, "Review
            grammar" shows the same passage with its grammar points
            highlighted (past and present tense, direct speech,
            connectors, prepositions, describing words, punctuation).
            Tap a coloured word to see why the writer used it, and take
            a short grammar quiz drawn from the same passage. The
            grammar points for the 16 built-in passages are checked
            in advance; for passages a parent adds, they are picked
            out automatically.
  Type    — Sentence Race and Word Rain, using the same passages as
            reading, plus Listen & Spell using the vocabulary words.
  Words   — P5 Stellar vocabulary (Units 1–9, about 282 words) to study
            by unit, with a meaning quiz. A parent can add new
            vocabulary (word or phrase, meaning, unit, category) — the
            new words appear in the study list, the meaning quiz and
            Listen & Spell, and can be deleted. The Words tab also
            shows "Mastered" and "Improving" lists: words answered
            right several times in a row are tested less and less
            often (next review in 1, 3, 7, 14, then 30 days), while
            words answered wrong come back soon. Quizzes and Listen &
            Spell mostly use words that are due or still improving,
            with a few mastered words mixed in to check they are
            remembered. The same idea applies to reading passages: a
            passage scored 8/10 or more twice in a row is scheduled
            less often; a low mark brings it back sooner. A "Suggested
            next" hint on the Read and Type tabs shows which passage
            is due.
  Oral    — Oral Partner: practise the PSLE Stimulus-Based Conversation
            with an examiner who asks questions about a picture, just
            like the real oral. 18 picture topics from the Oral Pack
            (with the pack's photos), plus any picture topics a parent
            adds. Mock exam = 3 questions (picture → experience →
            opinion) with 2 minutes to prepare, marked out of 25;
            one-topic practice = all 5 questions; one question type =
            5 questions of one kind across topics. Helpful phrases
            are shown only while preparing, never while answering.
            Answers can be spoken (microphone) or typed; the voice is
            saved on this laptop so the child can listen back (a
            parent can switch this off). After each round the review
            shows "You said" next to "A stronger version", the gaps
            in plain words, and a score out of 5 per answer. With the
            optional AI on, the AI also gives a refined answer and an
            SBC mark out of 25 — only the answer text is sent, never
            the audio. Weak oral topics come back sooner, like words
            and passages.
  Progress— Per-pupil history, weekly and monthly reports, practice
            streak, best marks and awards, plus the "Mastered" and
            "Improving" lists for words, reading passages and oral
            topics.
  Parent  — Edit the PSLE marking requirements, add or delete a custom
            passage, add your own picture topics for Oral Partner
            (upload a photo, title it, and type the questions or use
            the 3-question generator), change the Oral Partner
            preparation time and the "save answer audio" setting,
            download a backup of all data, or restore one.
            Optional AI marking: with your own ChatGPT or Claude API key,
            the app can also ask the AI to mark each reading and give
            feedback in simple words. The same key is used for Oral
            Partner feedback (a refined answer and an SBC mark). The key
            is stored only on this laptop (data/ai_config.json) and is
            never included in backups. When AI marking is on, the passage
            text and what the microphone heard are sent to the AI provider
            you chose; for Oral Partner, the question and the child's
            spoken answer (as text) are sent; no audio is sent. If the AI
            is off, unreachable, or the key is wrong, the app simply uses
            the local mark. See the “AI marking (optional)” card in the
            Parent tab for step-by-step instructions on getting a key.

First create a pupil profile (top right: name + level, e.g. P5),
then pick a passage and start practising.

First create a pupil profile (top right: name + level, e.g. P5),
then pick a passage and start practising.

WHERE THE DATA LIVES
--------------------
All pupil data is saved as JSON files in the data/ folder next to
server.py (profiles.json, sessions.json, custom_passages.json,
custom_vocab.json, custom_topics.json, mastery.json, settings.json).
The optional AI settings live in data/ai_config.json — the API key
is stored there only, never in the browser, and never in backup
downloads. Parent-added pictures live in data/stimuli/ and recorded
answer audio in data/audio/ — these are files, not JSON, so they are
not included in backup downloads either. Answer recordings are kept
for 7 days, then deleted automatically to save space; the written
answers and scores are kept. Nothing is saved in the
browser. To back up everything, copy the whole app folder. To back
up just the text data, use the "Download backup" button in Progress.
To move the app to another laptop, copy the whole app folder and run
start.bat / start.sh there (you will need to paste the API key
again on the new laptop).

TROUBLESHOOTING
---------------
- "Python was not found": install Python 3 and tick "Add Python to
  PATH" during setup, then run start.bat again.
- Microphone test does not start: use Google Chrome, allow the
  microphone when it asks, and check the laptop microphone works.
  The timed read works without a microphone.
- No voice for model reading / Listen & Spell: check the laptop
  sound is on and a voice is installed (Chrome uses the computer's
  voices). The app says so on screen if no voice is available.
- Page will not load: make sure the server window is still open and
  the address matches the one the server printed.
