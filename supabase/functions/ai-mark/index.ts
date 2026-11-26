// TalkPupils AI marking — Supabase Edge Function.
//
// The website is a static page (GitHub Pages), so the app's API key
// can never live in the page: anyone could copy it from the source and
// spend the credit. This function holds the keys as Supabase
// secrets (OPENAI_API_KEY / ANTHROPIC_API_KEY) and calls the provider
// on the website's behalf. The browser only ever sends pupil work
// (passage text, recognised words, answers, and a short summary of
// the pupil's progress so far) and gets back a mark and feedback.
// No audio is ever sent.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Create function,
// name it "ai-mark", paste this file, Deploy. Then add the secrets:
// Edge Functions -> Secrets -> OPENAI_API_KEY and/or ANTHROPIC_API_KEY.
// Keep "Verify JWT" ON: only a signed-in pupil can call it.
// Default provider is Claude (Haiku 5.5, claude-haiku-5-5) — cheapest
// and fastest for these short calls; ChatGPT stays available as an
// option. Every action that gives feedback (mark/oral/plan) is sent
// the pupil's progress summary, so the AI judges this pupil, not a
// stranger — that history is in the prompt for both providers.
//
// Actions (POST JSON body {action, provider, model, ...}):
//   status -> {ok, keys: {openai: bool, anthropic: bool}}
//   test   -> {ok} when the provider answers (tiny call)
//   mark   -> {ok, ai: {mark, strengths, improvements, nextSteps}, provider}
//   oral   -> {ok, ai: {refined, strengths, gaps, relevance, elaboration,
//             vocabulary, grammar, mark25, nextSteps}, provider}
//   plan   -> {ok, ai: {title, focus: [{area, activity}], encourage}, provider}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-5-5",
};
const PROVIDER_NAMES: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
};
const SECRET_NAMES: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

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

function providerKey(provider: string): string {
  const key = Deno.env.get(SECRET_NAMES[provider]) || "";
  if (!key) {
    throw new Error(
      "No " + (PROVIDER_NAMES[provider] || provider) +
        " key is set on the server — add " + SECRET_NAMES[provider] +
        " in Supabase → Edge Functions → Secrets.",
    );
  }
  return key;
}

async function callProvider(
  provider: string,
  key: string,
  model: string,
  userText: string,
  systemText: string | null,
  test: boolean,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    let url = "";
    let payload: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    if (provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      payload = {
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: systemText || "You are a kind primary school English teacher.",
          },
          { role: "user", content: userText },
        ],
      };
      if (!test) payload.response_format = { type: "json_object" };
      if (test) payload.max_tokens = 5;
      headers = {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      };
    } else {
      // anthropic
      url = "https://api.anthropic.com/v1/messages";
      payload = {
        model,
        max_tokens: test ? 5 : 800,
        temperature: 0.3,
        messages: [{ role: "user", content: userText }],
      };
      if (systemText) payload.system = systemText;
      headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };
    }
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (_e) {
      throw new Error(
        "could not reach the AI provider — check the internet connection",
      );
    }
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const e = (raw as Record<string, unknown>).error as
        | Record<string, unknown>
        | undefined;
      let msg =
        (e && (e.message as string)) ||
        (e && (e.type as string)) ||
        ("provider returned HTTP " + resp.status);
      if (resp.status === 401 || resp.status === 403) {
        msg = "the API key was rejected — check the key and try again";
      }
      throw new Error(msg);
    }
    if (provider === "openai") {
      const text = (raw as Record<string, unknown>).choices as
        | Array<Record<string, unknown>>
        | undefined;
      const content = text?.[0]?.message as
        | Record<string, unknown>
        | undefined;
      if (typeof content?.content !== "string") {
        throw new Error("unexpected reply from the AI provider");
      }
      return content.content as string;
    }
    const blocks = (raw as Record<string, unknown>).content as
      | Array<Record<string, unknown>>
      | undefined;
    const text = (blocks || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return err("Send a JSON body: {action, provider, model, ...}.", 400);
  }
  const action = String(body.action || "");
  const provider = String(body.provider || "anthropic");
  if (provider !== "openai" && provider !== "anthropic") {
    return err("Unknown provider: " + provider + ".", 400);
  }
  const model =
    String(body.model || "").trim() || DEFAULT_MODELS[provider];
  if (/^sk-(ant-|proj-)?/i.test(model)) {
    return err("That model name looks like an API key — leave the model blank to use the default. The key only goes in Supabase → Edge Functions → Secrets.", 400);
  }

  try {
    if (action === "status") {
      return json({
        ok: true,
        keys: {
          openai: !!Deno.env.get("OPENAI_API_KEY"),
          anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
        },
      });
    }
    if (action === "test") {
      const key = providerKey(provider);
      await callProvider(
        provider,
        key,
        model,
        "Reply with the single word OK.",
        null,
        true,
      );
      return json({ ok: true, provider });
    }
    if (action === "mark") {
      const key = providerKey(provider);
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        provider,
        key,
        model,
        markPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiMark(text), provider });
    }
    if (action === "oral") {
      const key = providerKey(provider);
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        provider,
        key,
        model,
        oralPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiOral(text), provider });
    }
    if (action === "plan") {
      const key = providerKey(provider);
      const payload = (body.payload || body) as Record<string, unknown>;
      const text = await callProvider(
        provider,
        key,
        model,
        planPrompt(payload),
        "You are a kind primary school English teacher.",
        false,
      );
      return json({ ok: true, ai: parseAiPlan(text), provider });
    }
    return err("Unknown action: " + action + ".", 400);
  } catch (e) {
    return err(e instanceof Error ? e.message : "AI marking failed");
  }
});
