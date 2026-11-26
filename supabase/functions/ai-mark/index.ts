// TalkPupils AI marking — Supabase Edge Function.
//
// The website is a static page (GitHub Pages), so the app's API key
// can never live in the page: anyone could copy it from the source and
// spend the credit. This function holds the keys as Supabase
// secret (GEMINI_API_KEY) and calls Gemini on the website's behalf.
// on the website's behalf. The browser only ever sends pupil work
// (passage text, recognised words, answers, and a short summary of
// the pupil's progress so far) and gets back a mark and feedback.
// No audio is ever sent.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Create function,
// name it "ai-mark", paste this file, Deploy. Then add the secrets:
// Edge Functions -> Secrets -> GEMINI_API_KEY (free from Google AI Studio).
// Keep "Verify JWT" ON: only a signed-in pupil can call it.
// The only provider is Gemini (gemini-2.5-flash). Every action that gives
// feedback (mark/oral/plan) is sent the pupil's progress summary, so the
// AI judges this pupil, not a stranger — that history is in the prompt.
//
// Actions (POST JSON body {action, provider, model, ...}):
//   status -> {ok, keys: {gemini: bool}}
//   test   -> {ok} when the provider answers (tiny call)
//   mark   -> {ok, ai: {mark, strengths, improvements, nextSteps}, provider}
//   oral   -> {ok, ai: {refined, strengths, gaps, relevance, elaboration,
//             vocabulary, grammar, mark25, nextSteps}, provider}
//   plan   -> {ok, ai: {title, focus: [{area, activity}], encourage}, provider}
//   extract -> {ok, text, provider}  (photo of a page -> transcribed text, Gemini vision)
//   organise -> {ok, organised: {passages: [{title, text, level}], vocabulary:
//             [{word, meaning}]}, provider}  (raw text -> passages + new words)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// One provider only: Gemini (free tier from Google AI Studio, no card).
// The model is fixed here; the Model box on the site is only an
// override — blank means this default.
const DEFAULT_MODEL = "gemini-2.5-flash";
const PROVIDER_NAME = "Gemini";
const SECRET_NAME = "GEMINI_API_KEY";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 200): Response {
  return json({ ok: false, error: message }, status);
}

function providerKey(): string {
  const key = Deno.env.get(SECRET_NAME) || "";
  if (!key) {
    throw new Error(
      "No " + PROVIDER_NAME +
        " key is set on the server — add " + SECRET_NAME +
        " in Supabase → Edge Functions → Secrets.",
    );
  }
  return key;
}

async function callProvider(
  key: string,
  model: string,
  userText: string,
  systemText: string | null,
  test: boolean,
  imageDataUrl: string | null = null,
  maxTokens = 0,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const parts: Record<string, unknown>[] = [];
    if (imageDataUrl) {
      const m = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!m) throw new Error("That photo could not be read — try a JPG or PNG.");
      parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    }
    parts.push({ text: userText });
    const payload: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: test ? 5 : (maxTokens || 800),
      },
    };
    // Ask for JSON on the calls that expect it (mark/oral/plan/organise);
    // extract (photo -> text) and test expect plain text.
    if (!test && !imageDataUrl) {
      (payload.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
    }
    if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
    let resp: Response;
    try {
      resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        },
      );
    } catch (_e) {
      throw new Error("could not reach the AI provider — check the internet connection");
    }
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const e = (raw as Record<string, unknown>).error as
        | Record<string, unknown>
        | undefined;
      let msg =
        (e && (e.message as string)) ||
        ("provider returned HTTP " + resp.status);
      if (resp.status === 401 || resp.status === 403) {
        msg = "the API key was rejected — check the key and try again";
      }
      if (resp.status === 429) {
        msg = "the free daily limit was reached — try again tomorrow";
      }
      throw new Error(msg);
    }
    const cands = (raw as Record<string, unknown>).candidates as
      | Array<Record<string, unknown>>
      | undefined;
    const content = cands?.[0]?.content as
      | Record<string, unknown>
      | undefined;
    const cparts = (content?.parts as
      | Array<Record<string, unknown>>
      | undefined) || [];
    const text = cparts
      .filter((q) => typeof q.text === "string")
      .map((q) => q.text as string)
      .join("");
    if (!text) throw new Error("unexpected reply from the AI provider");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("the AI reply was not in the expected format");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_e) {
    throw new Error("the AI reply was not in the expected format");
  }
}

function markPrompt(d: Record<string, unknown>): string {
  const parts: string[] = [
    "You are marking a primary school pupil's English read-aloud (PSLE oral, Singapore).",
    "Passage the pupil read:",
    String(d.passageText || "").slice(0, 3000),
  ];
  if (d.recognisedText) {
    parts.push(
      "What the microphone heard the pupil say (speech recognition, so some words may be mis-heard):",
    );
    parts.push(String(d.recognisedText).slice(0, 2000));
  }
  const stumbles = (d.stumbles as string[]) || [];
  if (stumbles.length) {
    parts.push("Words the pupil stumbled on: " + stumbles.slice(0, 30).join(", "));
  }
  parts.push(
    "Speed: " + d.wpm + " words per minute. Clarity: " + d.clarity +
      "%. Smoothness: " + d.smoothness + "%. Local mark: " + d.localMark + "/10.",
  );
  if (d.history) {
    parts.push(
      "This pupil's progress so far (use it to make the feedback specific to them — name the pattern you see across their readings, not just this one):",
    );
    parts.push(String(d.history).slice(0, 2500));
  }
  if (d.markingRequirements) {
    parts.push("Marking requirements:");
    parts.push(String(d.markingRequirements).slice(0, 4000));
  }
  parts.push(
    'Reply with JSON only, exactly this shape: {"mark": <number 1-10>, ' +
      '"strengths": ["...", "..."], "improvements": ["...", "..."], ' +
      '"nextSteps": ["...", "..."]}. ' +
      "Give exactly 2 strengths, 2 improvements and 2 next steps, in simple words a primary school pupil can understand. " +
      "The next steps must follow from the pupil's progress so far (e.g. if smoothness has been low in several readings, say to slow down and pause at commas) and name one concrete thing to do in the next practice.",
  );
  return parts.join("\n\n");
}

function parseAiMark(text: string): Record<string, unknown> {
  const data = parseJsonObject(text);
  const mark = data.mark;
  const strengths = data.strengths;
  const improvements = data.improvements;
  if (
    typeof mark !== "number" ||
    !Array.isArray(strengths) ||
    !Array.isArray(improvements) ||
    !strengths.length ||
    !improvements.length
  ) {
    throw new Error("the AI reply was missing the mark or feedback");
  }
  return {
    mark: Math.max(1, Math.min(10, Math.round(mark))),
    strengths: (strengths as unknown[]).slice(0, 2).map((s) => String(s).slice(0, 300)),
    improvements: (improvements as unknown[]).slice(0, 2).map((s) => String(s).slice(0, 300)),
    nextSteps: Array.isArray(data.nextSteps)
      ? (data.nextSteps as unknown[]).slice(0, 2).map((s) => String(s).slice(0, 300))
      : [],
  };
}

function oralPrompt(d: Record<string, unknown>): string {
  const parts: string[] = [
    "You are a kind primary school English teacher marking a PSLE oral Stimulus-Based Conversation (SBC) answer, Singapore.",
    "Topic: " + String(d.topicTitle || ""),
    "Examiner's question (" + String(d.qtype || "question") + "):",
    String(d.question || "").slice(0, 1000),
    "The pupil's answer (transcribed from speech, so some words may be mis-heard):",
    String(d.transcript || "").slice(0, 2000),
  ];
  if (d.modelAnswer) {
    parts.push(
      "A strong model answer for this question (from the practice pack — the pupil must NOT memorise it, just learn the ideas and vocabulary):",
    );
    parts.push(String(d.modelAnswer).slice(0, 2500));
  }
  if (d.history) {
    parts.push(
      "This pupil's progress so far (use it to make the feedback specific to them — name the pattern you see across their answers, not just this one):",
    );
    parts.push(String(d.history).slice(0, 2500));
  }
  parts.push(
    'Reply with JSON only, exactly this shape: {"refined": "<a stronger version of the SAME answer, in the pupil\'s own voice, keeping the pupil\'s own ideas and experience but complete: direct answer, reasons with because/so, a personal example if the question asks for one, and a closing line. 3-5 sentences, simple words>", ' +
      '"strengths": ["...", "..."], "gaps": ["...", "..."], ' +
      '"relevance": <1-5>, "elaboration": <1-5>, "vocabulary": <1-5>, ' +
      '"grammar": <1-5>, "mark25": <0-25>, "nextSteps": ["...", "..."]}. ' +
      "Give exactly 2 strengths and 1-3 gaps, in simple words a primary school pupil can understand. " +
      "Gaps must name what is missing (too short, no reason, no example, no personal experience, vague word with a better word, off-topic). " +
      "mark25 is the overall SBC mark out of 25 for this one answer scaled to a full 3-question mock (a good single answer is about 17-21). " +
      "nextSteps are 2 concrete things to practise next, following from the pupil's progress so far.",
  );
  return parts.join("\n\n");
}

function parseAiOral(text: string): Record<string, unknown> {
  const data = parseJsonObject(text);
  const refined = data.refined;
  const strengths = data.strengths;
  const gaps = data.gaps;
  if (
    typeof refined !== "string" ||
    !refined.trim() ||
    !Array.isArray(strengths) ||
    !strengths.length ||
    !Array.isArray(gaps)
  ) {
    throw new Error("the AI reply was missing the refined answer or feedback");
  }
  const score = (v: unknown): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
  };
  const m25 = Math.round(Number(data.mark25));
  return {
    refined: refined.trim().slice(0, 2000),
    strengths: (strengths as unknown[]).slice(0, 2).map((s) => String(s).slice(0, 300)),
    gaps: (gaps as unknown[]).slice(0, 3).map((s) => String(s).slice(0, 300)),
    relevance: score(data.relevance),
    elaboration: score(data.elaboration),
    vocabulary: score(data.vocabulary),
    grammar: score(data.grammar),
    mark25: Number.isFinite(m25) ? Math.max(0, Math.min(25, m25)) : null,
    nextSteps: Array.isArray(data.nextSteps)
      ? (data.nextSteps as unknown[]).slice(0, 2).map((s) => String(s).slice(0, 300))
      : [],
  };
}

function planPrompt(d: Record<string, unknown>): string {
  const parts: string[] = [
    "You are a kind primary school English teacher and coach for a Singapore pupil (PSLE oral, reading aloud, typing and vocabulary).",
    "Here is the pupil's practice history so far:",
    String(d.history || "No sessions yet.").slice(0, 3000),
    "Propose a short, encouraging practice plan for this pupil for the next week.",
    'Reply with JSON only, exactly this shape: {"title": "<short plan title>", "focus": [{"area": "<e.g. Reading smoothness>", "activity": "<one concrete thing to do, with how often>"}, ...], "encourage": "<one warm sentence>"}. ' +
      "Give 2-3 focus areas, ordered by what matters most. Each activity must be something the pupil can actually do in this app (read a passage aloud, play a typing game, practise spelling, do an Oral Partner mock). Use simple words a primary school pupil can understand. If there is almost no history yet, say so in the title and suggest a first week of mixed practice.",
  ];
  return parts.join("\n\n");
}

function parseAiPlan(text: string): Record<string, unknown> {
  const data = parseJsonObject(text);
  const focus = data.focus;
  if (!Array.isArray(focus) || !focus.length) {
    throw new Error("the AI reply was missing the plan");
  }
  return {
    title: String(data.title || "Your practice plan").slice(0, 200),
    focus: (focus as unknown[])
      .slice(0, 3)
      .map((f) => {
        const o = (f || {}) as Record<string, unknown>;
        return {
          area: String(o.area || "").slice(0, 120),
          activity: String(o.activity || "").slice(0, 400),
        };
      })
      .filter((f) => f.area && f.activity),
    encourage: String(data.encourage || "").slice(0, 300),
  };
}

function organisePrompt(d: Record<string, unknown>): string {
  const text = String(d.text || "").slice(0, 12000);
  return [
    "You are organising reading material for Singapore primary school pupils (PSLE oral, Primary 4-6).",
    "Split the text below into reading passages and pick out new words. Keep the pupils' own words — do NOT rewrite the passages, only split them and give each one a short title.",
    "Passages: each 150-300 words. If the text is one short piece, return one passage. If it is long, split at natural breaks (paragraphs, stories, sections). At most 6 passages. Give each a short title (under 10 words) and a level: P4, P5 or P6, by how hard the words and sentences are.",
    "Vocabulary: up to 20 words a Primary 4-6 pupil may not know, each with a plain one-line meaning in simple words (under 100 characters). Skip names of people and places, and skip easy words (cat, run, happy).",
    "Reply with JSON only, exactly this shape: {\"passages\": [{\"title\": \"...\", \"text\": \"...\", \"level\": \"P6\"}], \"vocabulary\": [{\"word\": \"...\", \"meaning\": \"...\"}]}.",
    "Text to organise:",
    text,
  ].join("\n\n");
}

function parseAiOrganise(text: string): Record<string, unknown> {
  const data = parseJsonObject(text);
  const level = (v: unknown): string => {
    const l = String(v || "").toUpperCase().trim();
    return l === "P4" || l === "P5" || l === "P6" ? l : "P6";
  };
  const passages = (Array.isArray(data.passages) ? data.passages : [])
    .slice(0, 6)
    .map((p) => {
      const o = (p || {}) as Record<string, unknown>;
      return {
        title: String(o.title || "").slice(0, 80),
        text: String(o.text || "").slice(0, 3000),
        level: level(o.level),
      };
    })
    .filter((p) => p.title && p.text);
  const vocabulary = (Array.isArray(data.vocabulary) ? data.vocabulary : [])
    .slice(0, 30)
    .map((v) => {
      const o = (v || {}) as Record<string, unknown>;
      return {
        word: String(o.word || "").slice(0, 80),
        meaning: String(o.meaning || "").slice(0, 150),
      };
    })
    .filter((v) => v.word && v.meaning);
  return { passages, vocabulary };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return err("Send a JSON body: {action, provider, model, ...}.");
  }
  const action = String(body.action || "");
  const provider = "gemini"; // the only provider
  const model =
    String(body.model || "").trim() || DEFAULT_MODEL;
  if (/^(sk-(ant-|proj-)?|AIza)/i.test(model)) {
    return err("That model name looks like an API key — leave the model blank to use the default. The key only goes in Supabase → Edge Functions → Secrets.");
  }

  try {
    if (action === "status") {
      return json({
        ok: true,
        keys: {
          gemini: !!Deno.env.get("GEMINI_API_KEY"),
        },
      });
    }
    if (action === "test") {
      const key = providerKey();
      await callProvider(
        key,
        model,
        "Reply with the single word OK.",
        null,
        true,
      );
      return json({ ok: true, provider });
    }
    if (action === "mark") {
      const key = providerKey();
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        key,
        model,
        markPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiMark(text), provider });
    }
    if (action === "oral") {
      const key = providerKey();
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        key,
        model,
        oralPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiOral(text), provider });
    }
    if (action === "extract") {
      const key = providerKey();
      const image = String(body.image || "");
      if (!image.startsWith("data:image/")) {
        return err("Send a photo (JPG or PNG).");
      }
      const text = await callProvider(
        key,
        model,
        "Transcribe all the text in this photo exactly as printed, line by line. Do not add, change or summarise any words. If a word is unclear, write [?].",
        "You transcribe text from photos.",
        false,
        image,
        2000,
      );
      return json({ ok: true, text, provider });
    }
    if (action === "organise") {
      const key = providerKey();
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        key,
        model,
        organisePrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, organised: parseAiOrganise(text), provider });
    }
    if (action === "plan") {
      const key = providerKey();
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        key,
        model,
        planPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiPlan(text), provider });
    }
    return err("Unknown action: " + action + ". — the Edge Function needs redeploying in Supabase (Edge Functions → ai-mark → Deploy).");
  } catch (e) {
    return err(e instanceof Error ? e.message : "AI marking failed");
  }
});
