// TalkPupils password reset — Supabase Edge Function.
//
// Pupils sign in with name + password and no email, so the usual
// "email me a reset link" cannot work — the address behind each
// account (kid-<name>@talktupils.local) is made up and nobody reads
// it. Instead each pupil picks a secret word at sign-up (only the
// pupil and their parent should know it). This function checks the
// name + level + secret word and, if they match, sets a new password
// through the Auth Admin API.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Create function,
// name it "auth-reset", paste this file, Deploy. Turn "Verify JWT"
// OFF for this function only: a pupil who forgot their password is
// not signed in, so there is no JWT to verify — the secret word is
// the check. (Leave Verify JWT ON for "ai-mark".)
// No secrets to add: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided to Edge Functions by Supabase automatically. The service
// role key never leaves the server — it is only used in the Auth
// Admin API calls below, and is never sent to the browser.
//
// POST JSON body {name, level, recoveryWord, newPassword} ->
//   {ok: true} on success, {ok: false, error} otherwise. The error
//   is deliberately the same for a wrong name, level or secret word,
//   so the reply never reveals whether the account exists.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Same generic error for every failed check, so the reply never
// reveals whether the account exists or which part was wrong.
const NO_MATCH =
  "That name, level or secret word does not match. Check them and try again — or ask a parent for help.";

// The made-up email behind a pupil account (same rule as the website).
function kidEmail(name: string): string {
  const clean = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? "kid-" + clean + "@talktupils.local" : "";
}

// Best-effort guard against guessing the secret word: 5 failed
// tries per name in 10 minutes, then refuse for a while.
const attempts = new Map<string, { count: number; first: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
function tooMany(email: string): boolean {
  const now = Date.now();
  const rec = attempts.get(email);
  if (!rec) return false;
  if (now - rec.first > WINDOW_MS) {
    attempts.delete(email);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}
function noteFailure(email: string) {
  const now = Date.now();
  const rec = attempts.get(email);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(email, { count: 1, first: now });
  } else {
    rec.count += 1;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return err("Send a JSON body: {name, level, recoveryWord, newPassword}.");
  }
  const name = String(body.name || "").trim();
  const level = String(body.level || "").trim();
  const word = String(body.recoveryWord || "").trim().toLowerCase();
  const next = String(body.newPassword || "");
  if (!name || !level || !word) return err(NO_MATCH);
  if (next.length < 6) {
    return err("Use a password with at least 6 characters.");
  }
  const email = kidEmail(name);
  if (!email) return err(NO_MATCH);
  if (tooMany(email)) {
    return err("Too many tries — wait 10 minutes and try again.");
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return err("Password reset is not set up on the server yet.");
  }
  const headers = {
    apikey: serviceKey,
    Authorization: "Bearer " + serviceKey,
    "Content-Type": "application/json",
  };
  try {
    // Find the account by its made-up email (1000 users per page is
    // far more than this app has; revisit if it ever grows past that).
    const list = await fetch(
      url + "/auth/v1/admin/users?per_page=1000",
      { headers },
    );
    if (!list.ok) {
      throw new Error("Could not check the account — try again in a moment.");
    }
    const data = (await list.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const users = (data.users || []) as Array<Record<string, unknown>>;
    const user = users.find(
      (u) => String(u.email || "").toLowerCase() === email,
    );
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const savedWord = String(meta.recovery_word || "").trim().toLowerCase();
    const savedLevel = String(meta.level || "").trim();
    if (!user || !savedWord || savedWord !== word || savedLevel !== level) {
      noteFailure(email);
      return err(NO_MATCH);
    }
    const upd = await fetch(
      url + "/auth/v1/admin/users/" + String(user.id),
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ password: next }),
      },
    );
    if (!upd.ok) {
      throw new Error("Could not change the password — try again in a moment.");
    }
    attempts.delete(email);
    return json({ ok: true });
  } catch (e) {
    return err(
      e instanceof Error ? e.message : "Password reset failed — try again in a moment.",
    );
  }
});
