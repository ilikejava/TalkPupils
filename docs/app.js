/* TalkPupils — website v1 (GitHub Pages + Supabase).
   Pupil data lives in Supabase (Auth + Postgres + Storage). Each
   pupil has their own account — name + password, no email — and
   their own profile row, sessions and progress. Speech recognition /
   synthesis are browser APIs (best in Google Chrome). No AI marking
   in v1.
   Guest mode ("Try without signing in") is the exception: a demo pupil
   (P6 or P4) whose data lives only in this browser's localStorage.
   In guest mode the app makes no Supabase calls at all — no sign-in,
   no tables, no storage uploads; answer audio stays as a blob URL in
   the browser. When a pupil signs in on the same browser, the trial
   profile with their name (and its sessions, progress and added
   words/passages/topics) moves into their account, and that trial
   copy is then cleared. The built-in "Guest pupil" demo profile
   itself does not move across. */
"use strict";

/* ---------------- Supabase (website) ---------------- */
const SUPABASE_URL = "https://cajdrfofhsfejfcyhfdr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EOAak7ss2rMprUIObIMetg_tgvhoAPl";
/* Built-in Oral Partner photos live in the repo (content/sbc_stimuli/);
   the website loads them from GitHub's raw host. */
const SBC_PHOTO_BASE = "https://raw.githubusercontent.com/ilikejava/TalkPupils/main/content/";
const TP_PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
  '<rect width="640" height="360" fill="#eef2f8"/>' +
  '<text x="320" y="180" font-family="sans-serif" font-size="24" fill="#667085" ' +
  'text-anchor="middle">Picture coming soon</text></svg>');
window.tpImgFallback = function (img) { img.onerror = null; img.src = TP_PLACEHOLDER; };
/* The Supabase library comes from a CDN. If it fails to load, the whole
   app must NOT die with it — guest mode ("Try without signing in") needs
   no Supabase at all, so the client is null and sign-in just reports
   itself unavailable until the page is reloaded. */
const sbClient = (typeof window !== "undefined" && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

async function sbUserId() {
  if (!sbClient) throw new Error("Sign-in is unavailable right now — the sign-in library did not load. Check your connection and reload.");
  const { data } = await sbClient.auth.getUser();
  if (!data || !data.user) throw new Error("Not signed in. Please sign in again.");
  return data.user.id;
}

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
function normWord(w) {
  return w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}
function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}
function wordCount(text) { return tokenize(text).length; }
function splitSentences(text) {
  return text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g)
    .map((s) => s.trim()).filter(Boolean);
}
function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/* ---------------- API (Supabase) ----------------
   Same {ok:true, ...} shapes the pilot's /api/ endpoints returned,
   now backed by Supabase tables + storage. */
function mapProfile(r) { return { id: r.id, name: r.name, level: r.level, createdAt: r.created_at }; }
function mapSession(r) { return Object.assign({ id: r.id, profileId: r.profile_id, createdAt: r.created_at }, r.details || {}); }
function mapCustomVocab(r) { return { id: r.id, word: r.word, meaning: r.meaning, unit: (/^\d+$/.test(String(r.unit)) ? parseInt(r.unit, 10) : r.unit), category: r.category, createdAt: r.created_at }; }
function mapCustomPassage(r) { return { id: r.id, title: r.title, text: r.text, createdAt: r.created_at }; }
function mapCustomTopic(r) { return { id: r.id, title: r.title, image: r.image || "", linkedTopicId: r.linked_topic_id || "", keywords: r.keywords || [], questions: r.questions || [], createdAt: r.created_at }; }
function mapSettings(r) { return { markingRequirements: r ? r.marking_requirements : null, oralPrepSeconds: r ? r.oral_prep_seconds : 120, oralSaveAudio: r ? r.oral_save_audio !== false : true, aiProvider: "gemini", aiModel: r && r.ai_model ? r.ai_model : "", aiEnabled: r ? !!r.ai_enabled : false }; }

async function apiGet(path) {
  if (guestMode) return guestApiGet(path);
  const parts = path.split("?");
  const p = parts[0];
  const qs = new URLSearchParams(parts[1] || "");
  if (p === "/api/profiles") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("profiles").select("*").eq("parent_id", uid).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, profiles: (data || []).map(mapProfile) };
  }
  if (p === "/api/sessions") {
    const pid = qs.get("profileId");
    const { data, error } = await sbClient.from("sessions").select("*").eq("profile_id", pid).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, sessions: (data || []).map(mapSession) };
  }
  if (p === "/api/mastery") {
    const pid = qs.get("profileId");
    const { data, error } = await sbClient.from("mastery").select("*").eq("profile_id", pid);
    if (error) throw new Error(error.message);
    const mastery = { words: {}, passages: {}, oral: {} };
    for (const r of data || []) {
      const rec = { streak: r.streak || 0, tested: r.tested || 0, lastTested: r.last_tested, nextDue: r.next_due };
      if (mastery[r.item_type]) mastery[r.item_type][r.item_key] = rec;
    }
    return { ok: true, mastery };
  }
  if (p === "/api/custom-vocab") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("custom_vocab").select("*").eq("parent_id", uid).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, customVocab: (data || []).map(mapCustomVocab) };
  }
  if (p === "/api/custom-topics") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("custom_topics").select("*").eq("parent_id", uid).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, customTopics: (data || []).map(mapCustomTopic) };
  }
  if (p === "/api/custom-passages") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("custom_passages").select("*").eq("parent_id", uid).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, customPassages: (data || []).map(mapCustomPassage) };
  }
  if (p === "/api/settings") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("settings").select("*").eq("parent_id", uid).maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, settings: mapSettings(data) };
  }
  if (p === "/api/settings/marking") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("settings").select("marking_requirements").eq("parent_id", uid).maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, markingRequirements: data ? data.marking_requirements : null };
  }
  if (p === "/api/ai-config") {
    // AI settings live in the settings row; whether a key exists lives
    // on the server (the Supabase Edge Function "ai-mark"). If the
    // function is not deployed yet, the call fails quietly and the
    // the pupil sees "no key set" until it is.
    const uid = await sbUserId();
    const { data } = await sbClient.from("settings").select("ai_provider, ai_model, ai_enabled").eq("parent_id", uid).maybeSingle();
    let keys = {};
    try {
      const r = await callAiFunction({ action: "status" });
      if (r && r.ok) keys = r.keys || {};
    } catch (err) { /* function not deployed yet — keys stay empty */ }
    const provider = "gemini";
    return { ok: true, config: { provider, model: (data && data.ai_model) || "", enabled: !!(data && data.ai_enabled), keySaved: !!keys[provider], keyLast4: "", keys } };
  }
  throw new Error("GET " + path + " is not available on the website");
}
async function apiPost(path, body) {
  if (guestMode) return guestApiPost(path, body);
  if (path === "/api/profiles") {
    const uid = await sbUserId();
    const name = (body.name || "").trim();
    if (!name) throw new Error("name is required");
    const { data, error } = await sbClient.from("profiles").insert({ parent_id: uid, name: name.slice(0, 60), level: (body.level || "P5").slice(0, 10) }).select().single();
    if (error) throw new Error(error.message);
    const all = await apiGet("/api/profiles");
    return { ok: true, profile: mapProfile(data), profiles: all.profiles };
  }
  if (path === "/api/sessions") {
    const profileId = body.profileId;
    const kind = body.kind;
    if (!profileId || !kind) throw new Error("profileId and kind are required");
    const details = Object.assign({}, body);
    delete details.profileId;
    const { data, error } = await sbClient.from("sessions").insert({ profile_id: profileId, kind: kind, details: details }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, session: mapSession(data) };
  }
  if (path === "/api/mastery") {
    const pid = body.profileId;
    const mastery = body.mastery || {};
    if (!pid) throw new Error("profileId is required");
    const del = await sbClient.from("mastery").delete().eq("profile_id", pid);
    if (del.error) throw new Error(del.error.message);
    const rows = [];
    for (const type of ["words", "passages", "oral"]) {
      for (const key of Object.keys(mastery[type] || {})) {
        const rec = mastery[type][key] || {};
        rows.push({ profile_id: pid, item_type: type, item_key: key, streak: rec.streak || 0, tested: rec.tested || 0, last_tested: rec.lastTested || null, next_due: rec.nextDue || null });
      }
    }
    if (rows.length) {
      const ins = await sbClient.from("mastery").insert(rows);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true, mastery: mastery };
  }
  if (path === "/api/custom-vocab") {
    const uid = await sbUserId();
    const word = (body.word || "").trim();
    const meaning = (body.meaning || "").trim();
    if (!word || !meaning) throw new Error("word and meaning are required");
    const { data, error } = await sbClient.from("custom_vocab").insert({ parent_id: uid, word: word.slice(0, 80), meaning: meaning.slice(0, 160), unit: String(body.unit), category: body.category || "words & phrases" }).select().single();
    if (error) throw new Error(error.message);
    const all = await apiGet("/api/custom-vocab");
    return { ok: true, entry: mapCustomVocab(data), customVocab: all.customVocab };
  }
  if (path === "/api/custom-passages") {
    const uid = await sbUserId();
    const title = (body.title || "").trim();
    const text = (body.text || "").trim();
    if (!title || text.length < 20) throw new Error("title and passage text (20+ chars) are required");
    const { data, error } = await sbClient.from("custom_passages").insert({ parent_id: uid, title: title.slice(0, 80), text: text.slice(0, 3000) }).select().single();
    if (error) throw new Error(error.message);
    const all = await apiGet("/api/custom-passages");
    return { ok: true, passage: mapCustomPassage(data), customPassages: all.customPassages };
  }
  if (path === "/api/custom-topics") {
    const uid = await sbUserId();
    const title = (body.title || "").trim();
    const questions = (body.questions || []).slice(0, 5).map((q) => ({ q: String(q.q || "").slice(0, 500), type: ["picture", "experience", "opinion", "evaluative"].indexOf(q.type) >= 0 ? q.type : "opinion", model: String(q.model || "").slice(0, 2500) }));
    if (!title) throw new Error("a title is required");
    if (!questions.length) throw new Error("1 to 5 questions are required");
    const { data, error } = await sbClient.from("custom_topics").insert({ parent_id: uid, title: title.slice(0, 80), image: String(body.imageFile || "").slice(0, 500), image_file: String(body.imageFile || "").slice(0, 500), linked_topic_id: String(body.linkedTopicId || "").slice(0, 20), keywords: (body.keywords || []).slice(0, 12), questions: questions }).select().single();
    if (error) throw new Error(error.message);
    const all = await apiGet("/api/custom-topics");
    return { ok: true, topic: mapCustomTopic(data), customTopics: all.customTopics };
  }
  if (path === "/api/settings") {
    const uid = await sbUserId();
    const patch = {};
    if (body.oralPrepSeconds != null) patch.oral_prep_seconds = Math.max(30, Math.min(600, parseInt(body.oralPrepSeconds, 10) || 120));
    if (typeof body.oralSaveAudio === "boolean") patch.oral_save_audio = body.oralSaveAudio;
    if (body.markingRequirements != null) patch.marking_requirements = String(body.markingRequirements).slice(0, 8000);
    const { data, error } = await sbClient.from("settings").upsert(Object.assign({ parent_id: uid }, patch), { onConflict: "parent_id" }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, settings: mapSettings(data) };
  }
  if (path === "/api/settings/marking") {
    const uid = await sbUserId();
    const { data, error } = await sbClient.from("settings").upsert({ parent_id: uid, marking_requirements: String(body.markingRequirements || "").slice(0, 8000) }, { onConflict: "parent_id" }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, settings: mapSettings(data), markingRequirements: data.marking_requirements };
  }
  if (path === "/api/ai-config") {
    // The API key itself is never sent here — it lives as a Supabase
    // secret on the server. Only the pupil's choice (provider, model,
    // on/off) is saved, in the settings row.
    const uid = await sbUserId();
    const provider = "gemini";
    const patch = { parent_id: uid, ai_provider: provider, ai_model: String(body.model || "").slice(0, 80), ai_enabled: !!body.enabled };
    const { error } = await sbClient.from("settings").upsert(patch, { onConflict: "parent_id" }).select().single();
    if (error) throw new Error(error.message);
    return apiGet("/api/ai-config");
  }
  if (path === "/api/ai-test") {
    const cfg = await apiGet("/api/ai-config");
    const provider = "gemini";
    const model = (cfg.config.model || "").trim() || AI_DEFAULT_MODELS[provider];
    const r = await callAiFunction({ action: "test", provider, model });
    if (!r.ok) throw new Error(r.error || "AI test failed");
    return { ok: true };
  }
  throw new Error("POST " + path + " is not available on the website");
}
async function apiDelete(path) {
  if (guestMode) return guestApiDelete(path);
  const parts = path.split("/").filter(Boolean);
  const kind = parts[1];
  const id = decodeURIComponent(parts[2] || "");
  let table = null;
  if (kind === "profiles") table = "profiles";
  else if (kind === "custom-vocab") table = "custom_vocab";
  else if (kind === "custom-topics") table = "custom_topics";
  else if (kind === "custom-passages") table = "custom_passages";
  if (!table) throw new Error("DELETE " + path + " is not available on the website");
  const { error } = await sbClient.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------------- guest mode ("Try without signing in") ----------------
   A demo pupil (P6 or P4) with the full app, but all data in this
   browser's localStorage and ZERO Supabase calls. These functions
   answer the same apiGet/apiPost/apiDelete shapes the signed-in layer
   answers, so the rest of the app works unchanged. Guest rows are kept
   in database-row shape so the mapProfile/mapSession/etc. mappers are
   reused as-is. When the pupil signs in on the same browser, the
   trial profile with their name moves into their account (see
   migrateGuestToKid); until then the trial lives only here. */
const GUEST_KEY = "talktupils_guest_v1";
let guestMode = false;

function guestStore() {
  try {
    const s = JSON.parse(localStorage.getItem(GUEST_KEY) || "null");
    return (s && s.version === 1 && Array.isArray(s.profiles)) ? s : null;
  } catch (err) { return null; }
}
function guestSave(store) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(store)); }
  catch (err) { /* storage full or blocked: keep going in memory only */ }
}
function guestClear() {
  try { localStorage.removeItem(GUEST_KEY); } catch (err) { /* ignore */ }
}
function guestId() {
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function guestNewStore(level) {
  const now = new Date().toISOString();
  return {
    version: 1,
    profiles: [{ id: "guest-" + level.toLowerCase(), name: "Guest pupil", level: level, created_at: now }],
    sessions: [],            // {id, profile_id, kind, created_at, details}
    mastery: {},             // profileId -> {words:{}, passages:{}, oral:{}}
    customVocab: [],         // rows {id, word, meaning, unit, category, created_at}
    customTopics: [],        // rows {id, title, image, image_file, linked_topic_id, keywords, questions, created_at}
    customPassages: [],      // rows {id, title, text, created_at}
    settings: { marking_requirements: null, oral_prep_seconds: 120, oral_save_audio: true },
  };
}
function guestMastery(pid) {
  const store = guestStore();
  const m = (store && store.mastery && store.mastery[pid]) || { words: {}, passages: {}, oral: {} };
  if (!m.words) m.words = {};
  if (!m.passages) m.passages = {};
  if (!m.oral) m.oral = {};
  return m;
}
function guestRequireStore() {
  const store = guestStore();
  if (!store) throw new Error("Guest trial ended. Tap “Try without signing in” to start again.");
  return store;
}
async function guestApiGet(path) {
  const store = guestRequireStore();
  const parts = path.split("?");
  const p = parts[0];
  const qs = new URLSearchParams(parts[1] || "");
  if (p === "/api/profiles") return { ok: true, profiles: store.profiles.map(mapProfile) };
  if (p === "/api/sessions") {
    const pid = qs.get("profileId");
    const rows = store.sessions.filter((s) => s.profile_id === pid)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : (a.created_at > b.created_at ? -1 : 0)));
    return { ok: true, sessions: rows.map(mapSession) };
  }
  if (p === "/api/mastery") return { ok: true, mastery: guestMastery(qs.get("profileId")) };
  if (p === "/api/custom-vocab") return { ok: true, customVocab: store.customVocab.map(mapCustomVocab) };
  if (p === "/api/custom-topics") return { ok: true, customTopics: store.customTopics.map(mapCustomTopic) };
  if (p === "/api/custom-passages") return { ok: true, customPassages: store.customPassages.map(mapCustomPassage) };
  if (p === "/api/settings") return { ok: true, settings: mapSettings(store.settings) };
  if (p === "/api/settings/marking") return { ok: true, markingRequirements: store.settings ? store.settings.marking_requirements : null };
  if (p === "/api/ai-config") return { ok: true, config: { provider: "gemini", model: "", enabled: false, keySaved: false, keyLast4: "" } };
  throw new Error("GET " + path + " is not available in guest mode");
}
async function guestApiPost(path, body) {
  const store = guestRequireStore();
  const now = new Date().toISOString();
  if (path === "/api/profiles") {
    const name = (body.name || "").trim();
    if (!name) throw new Error("name is required");
    const row = { id: guestId(), name: name.slice(0, 60), level: (body.level || "P5").slice(0, 10), created_at: now };
    store.profiles.push(row);
    guestSave(store);
    return { ok: true, profile: mapProfile(row), profiles: store.profiles.map(mapProfile) };
  }
  if (path === "/api/sessions") {
    const profileId = body.profileId;
    const kind = body.kind;
    if (!profileId || !kind) throw new Error("profileId and kind are required");
    const details = Object.assign({}, body);
    delete details.profileId;
    const row = { id: guestId(), profile_id: profileId, kind: kind, created_at: now, details: details };
    store.sessions.unshift(row);
    guestSave(store);
    return { ok: true, session: mapSession(row) };
  }
  if (path === "/api/mastery") {
    const pid = body.profileId;
    if (!pid) throw new Error("profileId is required");
    store.mastery[pid] = body.mastery || { words: {}, passages: {}, oral: {} };
    guestSave(store);
    return { ok: true, mastery: store.mastery[pid] };
  }
  if (path === "/api/custom-vocab") {
    const word = (body.word || "").trim();
    const meaning = (body.meaning || "").trim();
    if (!word || !meaning) throw new Error("word and meaning are required");
    const row = { id: guestId(), word: word.slice(0, 80), meaning: meaning.slice(0, 160), unit: String(body.unit), category: body.category || "words & phrases", created_at: now };
    store.customVocab.unshift(row);
    guestSave(store);
    return { ok: true, entry: mapCustomVocab(row), customVocab: store.customVocab.map(mapCustomVocab) };
  }
  if (path === "/api/custom-passages") {
    const title = (body.title || "").trim();
    const text = (body.text || "").trim();
    if (!title || text.length < 20) throw new Error("title and passage text (20+ chars) are required");
    const row = { id: guestId(), title: title.slice(0, 80), text: text.slice(0, 3000), created_at: now };
    store.customPassages.unshift(row);
    guestSave(store);
    return { ok: true, passage: mapCustomPassage(row), customPassages: store.customPassages.map(mapCustomPassage) };
  }
  if (path === "/api/custom-topics") {
    const title = (body.title || "").trim();
    const questions = (body.questions || []).slice(0, 5).map((q) => ({ q: String(q.q || "").slice(0, 500), type: ["picture", "experience", "opinion", "evaluative"].indexOf(q.type) >= 0 ? q.type : "opinion", model: String(q.model || "").slice(0, 2500) }));
    if (!title) throw new Error("a title is required");
    if (!questions.length) throw new Error("1 to 5 questions are required");
    // No 500-char slice here (unlike the signed-in layer): a guest
    // picture is a data URL kept in this browser, and slicing would
    // break it. The 1 MB upload cap keeps the store small.
    const row = { id: guestId(), title: title.slice(0, 80), image: String(body.imageFile || ""), image_file: String(body.imageFile || ""), linked_topic_id: String(body.linkedTopicId || "").slice(0, 20), keywords: (body.keywords || []).slice(0, 12), questions: questions, created_at: now };
    store.customTopics.unshift(row);
    guestSave(store);
    return { ok: true, topic: mapCustomTopic(row), customTopics: store.customTopics.map(mapCustomTopic) };
  }
  if (path === "/api/settings") {
    if (body.oralPrepSeconds != null) store.settings.oral_prep_seconds = Math.max(30, Math.min(600, parseInt(body.oralPrepSeconds, 10) || 120));
    if (typeof body.oralSaveAudio === "boolean") store.settings.oral_save_audio = body.oralSaveAudio;
    if (body.markingRequirements != null) store.settings.marking_requirements = String(body.markingRequirements).slice(0, 8000);
    guestSave(store);
    return { ok: true, settings: mapSettings(store.settings) };
  }
  if (path === "/api/settings/marking") {
    store.settings.marking_requirements = String(body.markingRequirements || "").slice(0, 8000);
    guestSave(store);
    return { ok: true, settings: mapSettings(store.settings), markingRequirements: store.settings.marking_requirements };
  }
  if (path === "/api/ai-config" || path === "/api/ai-test") {
    throw new Error("AI marking needs your own account — sign up to use it. Guest trials use the local mark only.");
  }
  throw new Error("POST " + path + " is not available in guest mode");
}
async function guestApiDelete(path) {
  const store = guestRequireStore();
  const parts = path.split("/").filter(Boolean);
  const kind = parts[1];
  const id = decodeURIComponent(parts[2] || "");
  if (kind === "profiles") {
    store.profiles = store.profiles.filter((r) => r.id !== id);
    store.sessions = store.sessions.filter((s) => s.profile_id !== id);
    if (store.mastery) delete store.mastery[id];
  } else if (kind === "custom-vocab") store.customVocab = store.customVocab.filter((r) => r.id !== id);
  else if (kind === "custom-topics") store.customTopics = store.customTopics.filter((r) => r.id !== id);
  else if (kind === "custom-passages") store.customPassages = store.customPassages.filter((r) => r.id !== id);
  else throw new Error("DELETE " + path + " is not available in guest mode");
  guestSave(store);
  return { ok: true };
}

/* ---------------- state (memory only) ---------------- */
const state = {
  parentId: null,
  profiles: [],
  currentProfileId: null,
  sessions: [],
  customPassages: [],
  settings: { markingRequirements: null },
  ai: { provider: "gemini", model: "", enabled: false, keySaved: false, keyLast4: "", keys: {} },
  markingDefault: "",
  oracle: {},       // "1" -> {title, text}
  builtin: {},      // "1" -> {title, text}
  vocab: [],        // {word, unit, unitName, category, meaning}
  customVocab: [],  // [{id, word, meaning, unit, category, createdAt}]
  grammar: {},      // passage id -> {highlights: [{text, type, note}]}
  mastery: { words: {}, passages: {}, oral: {} },  // per-word / per-passage / per-topic spaced-repetition records
  passages: [],     // unified list {id, num, group, title, text}
  sbc: null,        // built-in Oral Partner bank {topics: [...], starters: {...}}
  customTopics: [], // pupil-added oral topics [{id, title, image, keywords, questions}]
  oralSettings: { prepSeconds: 120, saveAudio: true },
  currentPassage: null,
  readMode: null,   // "mic" | "timed" | null
  readStart: 0,
  readTimer: null,
  recognition: null,
  recogRestarts: 0,
  recogSegments: [],  // {text, at}
  transcript: "",
  stumbles: new Set(),
  speaking: false,
  speakQueue: [],
  speakToken: 0,
};

/* ---------------- speech ---------------- */
function pickVoice() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const pref = ["en-SG", "en-GB", "en-AU", "en-US"];
  for (const p of pref) {
    const v = voices.find((x) => (x.lang || "").toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return voices.find((x) => (x.lang || "").toLowerCase().startsWith("en")) || voices[0] || null;
}
function speakText(text, opts) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = (opts && opts.rate) || 0.9;
    u.pitch = (opts && opts.pitch) || 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
function stopSpeaking() {
  state.speakToken++;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  state.speaking = false;
}

/* ---------------- profiles ---------------- */
async function loadProfiles() {
  const j = await apiGet("/api/profiles");
  state.profiles = j.profiles;
  renderProfiles();
}
function renderProfiles() {
  const sel = $("profileSelect");
  sel.innerHTML = "";
  if (!state.profiles.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— No pupil yet —";
    sel.appendChild(o);
    state.currentProfileId = null;
  } else {
    for (const p of state.profiles) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name + " (" + p.level + ")";
      sel.appendChild(o);
    }
    if (!state.currentProfileId ||
        !state.profiles.some((p) => p.id === state.currentProfileId)) {
      state.currentProfileId = state.profiles[0].id;
    }
    sel.value = state.currentProfileId;
  }
  const delBtn = $("deleteProfileBtn");
  if (delBtn) delBtn.disabled = !state.currentProfileId;
}
function currentProfile() {
  return state.profiles.find((p) => p.id === state.currentProfileId) || null;
}
async function loadSessions() {
  if (!state.currentProfileId) { state.sessions = []; return; }
  const j = await apiGet("/api/sessions?profileId=" + state.currentProfileId);
  state.sessions = j.sessions;
}
async function saveSession(fields) {
  if (!state.currentProfileId) {
    alert("Add a pupil profile first (top right).");
    return null;
  }
  const j = await apiPost("/api/sessions", Object.assign({ profileId: state.currentProfileId }, fields));
  state.sessions.unshift(j.session);
  return j.session;
}

/* ---------------- tabs ---------------- */
function initTabs() {
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tabpage").forEach((x) => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "progress") renderProgress();
    if (b.dataset.tab === "settings") renderSettings();
    if (b.dataset.tab === "oral") renderOralTopics();
  });
}

/* ---------------- passages ---------------- */
function buildPassageList() {
  const list = [];
  for (const k of Object.keys(state.oracle).sort((a, b) => +a - +b)) {
    const p = state.oracle[k];
    list.push({ id: "oracle-" + k, num: "Passage " + String(k).padStart(2, "0"),
                group: "Oracle Pack", title: p.title, text: p.text });
  }
  for (const k of Object.keys(state.builtin).sort((a, b) => +a - +b)) {
    const p = state.builtin[k];
    list.push({ id: "builtin-" + k, num: "Built-in " + k,
                group: "Built-in", title: p.title, text: p.text });
  }
  for (const p of state.customPassages) {
    list.push({ id: "custom-" + p.id, num: "My Passage", group: "My Passages",
                title: p.title, text: p.text });
  }
  state.passages = list;
  return list;
}
function fillPassageSelect(sel, list) {
  sel.innerHTML = "";
  for (const p of list) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.num + " — " + p.title + " · " + wordCount(p.text) + " words";
    sel.appendChild(o);
  }
}
function passageById(id) {
  return state.passages.find((p) => p.id === id) || state.passages[0] || null;
}
function selectPassage(id) {
  const p = passageById(id);
  if (!p) return;
  state.currentPassage = p;
  $("passageSelect").value = p.id;
  $("racePassageSelect").value = p.id;
  $("rainPassageSelect").value = p.id;
  $("passageMeta").textContent = p.num + " · " + p.title + " · " +
    wordCount(p.text) + " words";
  renderPassageText();
  $("readResult").classList.add("hidden");
  $("readResult").innerHTML = "";
  $("grammarCard").classList.add("hidden");
}
function renderPassageText() {
  const p = state.currentPassage;
  if (!p) { $("passageText").textContent = ""; return; }
  const sentences = splitSentences(p.text);
  $("passageText").innerHTML = sentences.map((s, i) => {
    const words = tokenize(s).map((w, j) =>
      '<span class="w" data-wi="' + i + "-" + j + '">' + esc(w) + "</span>").join(" ");
    return '<span class="sent" data-si="' + i + '">' + words + "</span>";
  }).join(" ");
}

/* ---------------- model reading ---------------- */
async function playModelReading() {
  const p = state.currentPassage;
  if (!p) return;
  if (!("speechSynthesis" in window)) {
    $("modelStatus").textContent = "This browser has no speech voice, so the model reading is not available.";
    return;
  }
  stopSpeaking();
  const token = ++state.speakToken;
  state.speaking = true;
  $("modelStatus").textContent = "Reading…";
  const sentences = splitSentences(p.text);
  const spans = document.querySelectorAll("#passageText .sent");
  for (let i = 0; i < sentences.length; i++) {
    if (token !== state.speakToken) return;
    spans.forEach((s) => s.classList.remove("sent-current"));
    if (spans[i]) spans[i].classList.add("sent-current");
    await speakText(sentences[i], { rate: 0.9 });
  }
  spans.forEach((s) => s.classList.remove("sent-current"));
  state.speaking = false;
  $("modelStatus").textContent = "Finished.";
}

/* ---------------- reading test ---------------- */
function paceScore(wpm) {
  if (wpm >= 110 && wpm <= 150) return 100;
  if (wpm >= 90) return 90;
  if (wpm >= 70) return 75;
  if (wpm >= 50) return 60;
  if (wpm >= 150 && wpm <= 170) return 90;
  if (wpm > 170 && wpm <= 200) return 70;
  if (wpm > 200) return 45;
  return 45;
}
function computeMark(clarity, smoothness, wpm) {
  const pace = paceScore(wpm);
  const total = clarity * 0.4 + smoothness * 0.3 + pace * 0.3;
  const mark = Math.max(1, Math.min(10, Math.round(total / 10)));
  return { mark, pace };
}
function starsFor(mark) {
  if (mark >= 8) return 3;
  if (mark >= 6) return 2;
  if (mark >= 4) return 1;
  return 0;
}
function starText(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}
function markerFeedback(clarity, smoothness, wpm, mark) {
  const strengths = [];
  const improvements = [];
  if (clarity >= 85) strengths.push("Pronunciation — most words were said clearly, including word endings.");
  else improvements.push("Pronunciation — say the ending sounds of every word clearly (e.g. say 'gift', not 'gif'), and say 'the' as /thee/ before a vowel sound.");
  if (smoothness >= 80) strengths.push("Fluency — you kept going smoothly without long stops.");
  else improvements.push("Fluency — when you meet a hard word, keep going instead of stopping. Sound confident and the fluency marks stay with you.");
  const pace = paceScore(wpm);
  if (pace >= 85) strengths.push("Pace and pausing — a steady, conversational pace with pauses at punctuation.");
  else if (wpm < 90) improvements.push("Pace and pausing — try to read a little faster, at the pace you use in a conversation, pausing briefly at full stops and commas.");
  else improvements.push("Pace and pausing — slow down a little. This is not a race; pause briefly at punctuation so the listener can follow.");
  if (mark >= 8) strengths.push("Intonation — your reading sounded lively and matched the story.");
  else improvements.push("Intonation — change your voice for questions, exclamations and different characters, and match your tone to the mood of the passage.");
  return { strengths, improvements };
}

function matchTranscript(passageWords, spokenWords) {
  // Sequential match: walk the passage in order, look ahead a few spoken
  // words for each passage word (tolerates "um", repeats, mis-hearings).
  const matched = new Array(passageWords.length).fill(false);
  let si = 0;
  for (let pi = 0; pi < passageWords.length; pi++) {
    const target = normWord(passageWords[pi]);
    if (!target) { matched[pi] = true; continue; }
    let found = -1;
    for (let k = si; k < Math.min(si + 6, spokenWords.length); k++) {
      if (normWord(spokenWords[k]) === target) { found = k; break; }
    }
    if (found >= 0) { matched[pi] = true; si = found + 1; }
  }
  return matched;
}

function renderBreakdown(matched) {
  const words = document.querySelectorAll("#passageText .w");
  words.forEach((el, i) => {
    el.classList.remove("w-ok", "w-bad", "w-miss", "w-stumble", "w-clickable");
    if (i < matched.length) el.classList.add(matched[i] ? "w-ok" : "w-bad");
  });
}

function showReadResult(res) {
  const el = $("readResult");
  const fb = markerFeedback(res.clarity, res.smoothness, res.wpm, res.mark);
  let html =
    '<h3>Your result — ' + esc(res.passageTitle) + "</h3>" +
    '<div class="stars">' + starText(res.stars) + "</div>" +
    '<div class="score-grid">' +
    '<div class="score-box"><div class="num">' + res.mark + '/10</div><div class="lbl">PSLE mark</div></div>' +
    '<div class="score-box"><div class="num">' + Math.round(res.wpm) + '</div><div class="lbl">words per minute</div></div>' +
    '<div class="score-box"><div class="num">' + Math.round(res.clarity) + '%</div><div class="lbl">clarity</div></div>' +
    '<div class="score-box"><div class="num">' + Math.round(res.smoothness) + '%</div><div class="lbl">smoothness</div></div>' +
    "</div>" +
    "<p><strong>What went well:</strong></p><ul>" +
    fb.strengths.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
    "<p><strong>To improve:</strong></p><ul>" +
    fb.improvements.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>";
  if (res.aiFeedback) {
    const a = res.aiFeedback;
    const providerName = AI_PROVIDER_NAMES[res.aiProvider] || "AI";
    html += '<div class="ai-box"><h4>🤖 AI feedback (' + esc(providerName) +
      ") — mark " + a.mark + '/10</h4>' +
      "<p><strong>What went well:</strong></p><ul>" +
      a.strengths.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
      "<p><strong>To improve:</strong></p><ul>" +
      a.improvements.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
      (a.nextSteps && a.nextSteps.length
        ? "<p><strong>What to work on next:</strong></p><ul>" +
          a.nextSteps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") +
      "</div>";
  } else if (res.aiError) {
    html += '<p class="muted small">AI feedback was not available (' + esc(res.aiError) +
      "). The local mark above still counts.</p>";
  }
  html +=
    '<p class="muted small">Volume is not measured by the app — ask a parent to check you are clear and steady, not too loud and not too soft. ' +
    "The mark follows the PSLE marking requirements saved in the Settings tab.</p>" +
    '<p class="muted small">Result saved to your progress.</p>' +
    '<p><button id="readGrammarBtn" class="btn primary" type="button">📖 Review grammar in this passage</button></p>';
  el.innerHTML = html;
  el.classList.remove("hidden");
  $("readGrammarBtn").addEventListener("click", () => openGrammar(state.currentPassage));
}

async function finishReading(res) {
  $("stopTestBtn").classList.add("hidden");
  $("startMicBtn").disabled = false;
  $("startTimedBtn").disabled = false;
  state.readMode = null;
  if (state.readTimer) { clearInterval(state.readTimer); state.readTimer = null; }
  $("testStatus").textContent = "";
  const p = state.currentPassage;
  // AI marking is on by default: ask the AI first, then save one session with both
  // marks. Any failure falls back to the local mark only.
  let aiFeedback = null;
  let aiProvider = null;
  let aiError = null;
  if (state.ai.keySaved) {
    $("testStatus").textContent = "Getting AI feedback…";
    try {
      const j = await fetchAiMark({
        passageText: p.text,
        passageTitle: p.num + " — " + p.title,
        recognisedText: res.transcript || "",
        stumbles: res.stumbles || [],
        wpm: Math.round(res.wpm),
        clarity: Math.round(res.clarity),
        smoothness: Math.round(res.smoothness),
        localMark: res.mark,
        markingRequirements: markingText(),
        history: kidHistorySummary(),
      });
      aiFeedback = j.ai;
      aiProvider = j.provider;
    } catch (err) {
      aiError = err.message || "AI marking failed";
    }
    $("testStatus").textContent = "";
  }
  const saved = await saveSession({
    kind: "reading",
    passageId: p.id,
    passageTitle: p.num + " — " + p.title,
    wpm: Math.round(res.wpm),
    clarity: Math.round(res.clarity),
    smoothness: Math.round(res.smoothness),
    pace: Math.round(res.pace),
    mark: res.mark,
    stars: res.stars,
    mode: res.mode,
    aiFeedback: aiFeedback,
    aiProvider: aiProvider,
    aiError: aiError,
  });
  if (saved) showReadResult(Object.assign({ passageTitle: p.num + " — " + p.title, aiFeedback, aiProvider, aiError }, res));
  // spaced repetition: a mark of 8 or more counts as a "correct" review
  updatePassageMastery(p.id, res.mark >= 8);
  saveMastery();
}

function setTestRunning(running, label) {
  $("startMicBtn").disabled = running;
  $("startTimedBtn").disabled = running;
  $("stopTestBtn").classList.toggle("hidden", !running);
  if (running) $("testStatus").textContent = label || "Reading…";
}

function startTimedRead() {
  if (!state.currentPassage) { alert("Choose a passage first."); return; }
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  stopSpeaking();
  state.readMode = "timed";
  state.readStart = Date.now();
  state.stumbles = new Set();
  setTestRunning(true, "Reading… tap “Finished reading” when you reach the end.");
  $("stopTestBtn").textContent = "✓ Finished reading";
  $("liveTranscript").classList.add("hidden");
  // click words to mark stumbles
  document.querySelectorAll("#passageText .w").forEach((el) => {
    el.classList.remove("w-ok", "w-bad", "w-miss", "w-stumble");
    el.classList.add("w-clickable");
  });
  state.readTimer = setInterval(() => {
    const s = Math.floor((Date.now() - state.readStart) / 1000);
    $("testStatus").textContent = "Reading… " + Math.floor(s / 60) + ":" +
      String(s % 60).padStart(2, "0") + " — tap “Finished reading” when you reach the end.";
  }, 500);
  $("passageText").onclick = (e) => {
    const w = e.target.closest(".w");
    if (!w || state.readMode !== "timed") return;
    w.classList.toggle("w-stumble");
  };
}

function finishTimedRead() {
  const p = state.currentPassage;
  const words = tokenize(p.text);
  const total = words.length;
  const stumbled = document.querySelectorAll("#passageText .w-stumble").length;
  const minutes = Math.max((Date.now() - state.readStart) / 60000, 0.05);
  const wpm = total / minutes;
  if (wpm > 250) {
    // Too fast to be a real read-aloud (a strong P6 pupil reads aloud
    // around 180-200 words a minute). Nothing is scored or saved.
    if (state.readTimer) { clearInterval(state.readTimer); state.readTimer = null; }
    state.readMode = null;
    $("passageText").onclick = null;
    document.querySelectorAll("#passageText .w").forEach((el) => el.classList.remove("w-clickable", "w-stumble"));
    setTestRunning(false);
    $("testStatus").textContent = "That was " + Math.round(wpm) + " words per minute — too fast to be a full read-aloud. Nothing was saved. Read the whole passage aloud, then tap “Finished reading”.";
    return;
  }
  const clarity = Math.max(0, (total - stumbled) / total * 100);
  const smoothness = stumbled === 0 ? 100 : Math.max(50, 100 - stumbled * 5);
  const matched = tokenize(p.text).map((_, i) => {
    const el = document.querySelectorAll("#passageText .w")[i];
    return !(el && el.classList.contains("w-stumble"));
  });
  renderBreakdown(matched);
  $("passageText").onclick = null;
  const { mark, pace } = computeMark(clarity, smoothness, wpm);
  const stumbleWords = Array.from(document.querySelectorAll("#passageText .w-stumble"))
    .map((el) => el.textContent);
  finishReading({ wpm, clarity, smoothness, pace, mark, stars: starsFor(mark), mode: "timed", stumbles: stumbleWords });
}

function startMicRead() {
  if (!state.currentPassage) { alert("Choose a passage first."); return; }
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("micNote").textContent = "This browser has no speech recognition, so use the timed read instead — it still gives a speed, clarity and smoothness score.";
    return;
  }
  stopSpeaking();
  state.readMode = "mic";
  state.readStart = Date.now();
  state.transcript = "";
  state.recogSegments = [];
  state.recogRestarts = 0;
  setTestRunning(true, "Listening… read the passage aloud now.");
  $("stopTestBtn").textContent = "■ Stop & score";
  $("liveTranscript").classList.remove("hidden");
  $("liveTranscript").textContent = "";
  document.querySelectorAll("#passageText .w").forEach((el) =>
    el.classList.remove("w-ok", "w-bad", "w-miss", "w-stumble", "w-clickable"));
  $("passageText").onclick = null;

  const rec = new SR();
  state.recognition = rec;
  rec.lang = "en-SG";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let lastFinalAt = Date.now();
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) {
          state.transcript += (state.transcript ? " " : "") + text;
          state.recogSegments.push({ text, at: Date.now() });
          lastFinalAt = Date.now();
        }
      } else {
        interim += r[0].transcript;
      }
    }
    $("liveTranscript").textContent = (state.transcript + " " + interim).trim();
    void lastFinalAt;
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("testStatus").textContent = "Microphone blocked — allow microphone access in Chrome and try again, or use the timed read.";
      stopMicTest(false);
    }
  };
  rec.onend = () => {
    // Chrome stops recognition after a pause; restart while the test runs.
    if (state.readMode === "mic" && state.recogRestarts < 5) {
      state.recogRestarts++;
      try { rec.start(); } catch (err) { /* ignore */ }
    }
  };
  try { rec.start(); } catch (err) {
    $("testStatus").textContent = "Could not start the microphone. Use the timed read instead.";
    setTestRunning(false);
  }
  state.readTimer = setInterval(() => {
    const s = Math.floor((Date.now() - state.readStart) / 1000);
    $("testStatus").textContent = "Listening… " + Math.floor(s / 60) + ":" +
      String(s % 60).padStart(2, "0") + " — read the passage aloud, then tap “Stop & score”.";
  }, 500);
}

function stopMicTest(score) {
  if (state.recognition) {
    try { state.recognition.onend = null; state.recognition.stop(); } catch (err) { /* ignore */ }
    state.recognition = null;
  }
  if (score !== false) finishMicRead();
  else setTestRunning(false);
}

function finishMicRead() {
  const p = state.currentPassage;
  const passageWords = tokenize(p.text);
  const spokenWords = tokenize(state.transcript);
  const minutes = Math.max((Date.now() - state.readStart) / 60000, 0.05);
  const matched = matchTranscript(passageWords, spokenWords);
  const correct = matched.filter(Boolean).length;
  const clarity = passageWords.length ? correct / passageWords.length * 100 : 0;
  const wpm = spokenWords.length / minutes;
  // smoothness: penalise long pauses between recognised chunks and restarts
  let pauses = 0;
  for (let i = 1; i < state.recogSegments.length; i++) {
    if (state.recogSegments[i].at - state.recogSegments[i - 1].at > 3000) pauses++;
  }
  const smoothness = Math.max(0, 100 - pauses * 15 - state.recogRestarts * 5);
  renderBreakdown(matched);
  const { mark, pace } = computeMark(clarity, smoothness, wpm);
  finishReading({ wpm, clarity, smoothness, pace, mark, stars: starsFor(mark), mode: "mic", transcript: state.transcript });
}

function initRead() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $("micNote").textContent = SR
    ? "Microphone scoring works best in Google Chrome. Allow microphone access when asked."
    : "This browser has no speech recognition — the timed read is available instead.";
  $("passageSelect").addEventListener("change", (e) => selectPassage(e.target.value));
  $("prevPassageBtn").addEventListener("click", () => stepPassage(-1));
  $("nextPassageBtn").addEventListener("click", () => stepPassage(1));
  $("modelReadBtn").addEventListener("click", playModelReading);
  $("stopSpeakBtn").addEventListener("click", () => { stopSpeaking(); $("modelStatus").textContent = ""; });
  $("startMicBtn").addEventListener("click", startMicRead);
  $("startTimedBtn").addEventListener("click", startTimedRead);
  $("stopTestBtn").addEventListener("click", () => {
    if (state.readMode === "mic") stopMicTest(true);
    else if (state.readMode === "timed") finishTimedRead();
  });
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
  initGrammar();
}
function stepPassage(d) {
  const i = state.passages.findIndex((p) => p.id === (state.currentPassage && state.currentPassage.id));
  const n = state.passages[(i + d + state.passages.length) % state.passages.length];
  if (n) selectPassage(n.id);
}

/* ---------------- Grammar review ---------------- */
const GRAMMAR_TYPES = {
  past: { label: "Past tense", color: "#2f6fed", bg: "#dbeafe" },
  present: { label: "Present tense", color: "#1c7a2e", bg: "#dcf5e3" },
  speech: { label: "Direct speech", color: "#b45309", bg: "#ffedd5" },
  connector: { label: "Connector", color: "#7c3aed", bg: "#ede9fe" },
  prep: { label: "Preposition", color: "#0f766e", bg: "#ccfbf1" },
  adj: { label: "Describing word", color: "#be185d", bg: "#fce7f3" },
  punct: { label: "Punctuation", color: "#b91c1c", bg: "#fee2e2" },
};
const grammar = { passage: null, highlights: [], rendered: [], hiddenTypes: new Set() };
const gquiz = { questions: [], idx: 0, correct: 0, answered: false, wrongTopics: [] };

const GRAMMAR_CONNECTORS = {
  "however": "shows the next idea is different from what came before — a surprise or a change of plan.",
  "before": "tells you something happened earlier than something else.",
  "finally": "shows this is the last thing in a list of events.",
  "nevertheless": "means 'even so' — something happened although you might not expect it.",
  "after": "tells you one thing happened later than another.",
  "then": "shows the next step in a list of events.",
  "soon": "means a short time later.",
  "suddenly": "shows something surprising happened all at once.",
  "meanwhile": "means 'at the same time' as something else.",
  "unfortunately": "shows something sad or unlucky happened.",
  "instead": "shows a different choice was made.",
  "later": "means 'after that'.",
  "while": "means 'at the same time as' something else.",
  "as soon as": "means 'right when' — one thing happened immediately after another.",
  "at first": "shows the order of events — what happened at the start.",
  "for example": "gives an example to explain an idea.",
};
const GRAMMAR_IRREGULAR = { woke: "wake", ran: "run", went: "go", came: "come", saw: "see", took: "take", gave: "give", made: "make", said: "say", told: "tell", found: "find", brought: "bring", began: "begin", felt: "feel", got: "get", had: "have", was: "be", were: "be", did: "do", spoke: "speak", thought: "think", knew: "know", wore: "wear", put: "put", sat: "sit", stood: "stand", ate: "eat", drank: "drink", slept: "sleep", broke: "break", chose: "choose", drove: "drive", flew: "fly", grew: "grow", kept: "keep", left: "leave", lost: "lose", met: "meet", paid: "pay", rode: "ride", sold: "sell", sent: "send", spent: "spend", swam: "swim", taught: "teach", threw: "throw", understood: "understand", won: "win", wrote: "write", heard: "hear", held: "hold", hung: "hang", hid: "hide", hit: "hit", cut: "cut", shut: "shut", set: "set", caught: "catch", drew: "draw", fell: "fall", forgot: "forget", led: "lead", lent: "lend", meant: "mean", shook: "shake", shot: "shoot", sang: "sing", sank: "sink", stole: "steal", stuck: "stick", struck: "strike", swept: "sweep", swung: "swing", tore: "tear", wept: "weep", rose: "rise", slid: "slide", sprang: "spring", withdrew: "withdraw", dreamt: "dream", leapt: "leap", smelt: "smell", spelt: "spell", ground: "grind", dealt: "deal", forbade: "forbid", crept: "creep", dug: "dig", fled: "flee", flung: "fling", rang: "ring", stunk: "stink", trod: "tread", wrung: "wring", spoilt: "spoil", fed: "feed", fought: "fight", forgave: "forgive", froze: "freeze", lit: "light", quit: "quit", spat: "spit", split: "split", stung: "sting", swore: "swear", wound: "wind", bade: "bid", dwelt: "dwell", foretold: "foretell" };
const GRAMMAR_ED_EXCLUDE = new Set(["bed", "red", "need", "indeed", "speed", "feed", "seed", "weed", "greed", "breed", "used", "dressed", "middle-aged", "excited", "tired", "worried", "surprised", "disappointed", "interested", "bored", "scared", "pleased", "delighted", "embarrassed", "confused", "amazed", "thrilled", "relieved", "satisfied", "annoyed", "frightened"]);
const GRAMMAR_PRESENT = new Set(["is", "are", "am", "has", "have", "do", "does", "want", "wants", "need", "needs", "like", "likes", "love", "loves", "think", "thinks", "know", "knows", "says"]);
const GRAMMAR_PREPS = new Set(["out of", "through", "between", "behind", "beside", "under", "over", "across", "along", "around", "towards", "inside", "outside", "beneath", "during", "before", "after", "near", "above", "below", "into", "in", "on", "at"]);

/* Basic annotations for custom passages (same rules as the
   pre-computed ones, without the describing-word list). */
function autoGrammar(text) {
  const highlights = [];
  const count = (t) => highlights.filter((h) => h.type === t).length;
  const add = (needle, type, note) => highlights.push({ text: needle, type, note });
  let m;
  // direct speech
  const quoteRe = /[“"]([^”"]+)[”"]/g;
  while ((m = quoteRe.exec(text)) && count("speech") < 4) {
    if (m[1].trim().length < 2) continue;
    add(m[0], "speech", "These are the exact words someone said. The speech marks show a person is talking, so you can hear their voice in the story.");
  }
  // word tokens with positions
  const tokens = [];
  const wordRe = /[A-Za-z][A-Za-z'\-]*/g;
  while ((m = wordRe.exec(text))) tokens.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  // connectors: multi-word phrases first, then single words
  const connHits = [];
  for (const phrase of ["as soon as", "at first", "for example"]) {
    const re = new RegExp("\\b" + phrase.replace(/ /g, "\\s+") + "\\b", "gi");
    let mm;
    while ((mm = re.exec(text))) connHits.push([mm.index, mm.index + mm[0].length, mm[0]]);
  }
  const multiSpans = connHits.map(([s, e]) => [s, e]);
  for (const t of tokens) {
    const lw = t.w.toLowerCase().replace(/'$/, "");
    if (GRAMMAR_CONNECTORS[lw] && !multiSpans.some(([s, e]) => s <= t.s && t.e <= e)) {
      connHits.push([t.s, t.e, t.w]);
    }
  }
  connHits.sort((a, b) => a[0] - b[0]);
  const seenConn = new Set();
  for (const [, , cand] of connHits) {
    if (count("connector") >= 3) break;
    const key = cand.toLowerCase();
    if (seenConn.has(key)) continue;
    seenConn.add(key);
    add(cand, "connector", "“" + cand + "” is a connector — a word that joins ideas. It " + GRAMMAR_CONNECTORS[key] + " Here it is used in: “" + cand + "”.");
  }
  // past-tense verbs
  const seenPast = new Set();
  for (const t of tokens) {
    if (count("past") >= 5) break;
    const lw = t.w.toLowerCase().replace(/'$/, "");
    if (seenPast.has(lw)) continue;
    let base = null;
    if (GRAMMAR_IRREGULAR[lw]) base = GRAMMAR_IRREGULAR[lw];
    else if (lw.length > 3 && lw.endsWith("ed") && !GRAMMAR_ED_EXCLUDE.has(lw)) {
      base = lw.endsWith("ied") ? lw.slice(0, -3) + "y" : lw.slice(0, -2);
    }
    if (!base) continue;
    seenPast.add(lw);
    add(t.w, "past", GRAMMAR_IRREGULAR[lw]
      ? "“" + t.w + "” is the past tense of “" + base + "” — it shows the action already happened. The writer uses the past tense because this story happened before."
      : "“" + t.w + "” is a past-tense verb (it ends in -ed) — it shows the action already happened. The writer uses the past tense because this story happened before.");
  }
  // present-tense verbs ("like"/"love" only after a pronoun or modal)
  const seenPres = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (count("present") >= 2) break;
    const lw = tokens[i].w.toLowerCase().replace(/'$/, "");
    if (!GRAMMAR_PRESENT.has(lw) || seenPres.has(lw)) continue;
    if (lw === "like" || lw === "love") {
      const prev = i > 0 ? tokens[i - 1].w.toLowerCase().replace(/'$/, "") : "";
      if (!["i", "you", "we", "they", "he", "she", "it", "might", "can", "could", "will", "would", "should", "do", "does", "did", "don't", "doesn't"].includes(prev)) continue;
    }
    seenPres.add(lw);
    add(tokens[i].w, "present", "“" + tokens[i].w + "” is in the present tense — it shows something happening right now, or something that is true. The writer uses it inside speech because the person is talking right now.");
  }
  // prepositions
  const seenPrep = new Set();
  for (const t of tokens) {
    if (count("prep") >= 3) break;
    const lw = t.w.toLowerCase().replace(/'$/, "");
    if (GRAMMAR_PREPS.has(lw) && !seenPrep.has(lw) && !seenConn.has(lw)) {
      seenPrep.add(lw);
      add(t.w, "prep", "“" + t.w + "” is a preposition — a small word that shows where or when something happened. Here it links the action to its place or time.");
    }
  }
  if (count("prep") < 3) {
    const om = /\bout of\b/i.exec(text);
    if (om) add(om[0], "prep", "“" + om[0] + "” is a preposition — a small word that shows where or when something happened. Here it links the action to its place or time.");
  }
  // punctuation: short clauses ending in ! or ?
  const punctRe = /[“"]?[^.!?"”]{1,80}[!?][”"]?/g;
  while ((m = punctRe.exec(text)) && count("punct") < 2) {
    const sent = m[0].trim();
    add(sent, "punct", sent.includes("!")
      ? "An exclamation mark (!) shows strong feeling — excitement, surprise or a shout. The writer uses it so you read these words with energy: “" + sent + "”"
      : "A question mark (?) shows someone is asking something. Your voice should go up a little at the end of the question: “" + sent + "”");
  }
  return { highlights };
}

/* Render the passage with highlights. When two highlights overlap, the
   shortest (most specific) one wins, so a present-tense word inside a
   speech quote still shows in its own colour. */
function renderGrammarPassage() {
  const text = grammar.passage.text;
  const claims = [];
  // Match whole words/phrases only. A plain indexOf also matches inside
  // other words ("is" in "his", "in" in "going", "on" in "soon"), which
  // splits words in half in the review. The lookarounds require a
  // non-letter (or the start/end of the text) on both sides, so quotes
  // and punctuation in a highlight still match.
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  grammar.highlights.forEach((h, hi) => {
    const re = new RegExp("(?<![A-Za-z])" + escRe(h.text).replace(/\s+/g, "\\s+") + "(?![A-Za-z])", "gi");
    let m;
    while ((m = re.exec(text))) {
      claims.push({ start: m.index, end: m.index + m[0].length, hi });
    }
  });
  const n = text.length;
  const owner = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -1, bestLen = Infinity;
    for (const c of claims) {
      if (c.start <= i && i < c.end) {
        const len = c.end - c.start;
        if (len < bestLen) { bestLen = len; best = c.hi; }
      }
    }
    owner[i] = best;
  }
  let html = "", i = 0;
  const rendered = new Set();
  while (i < n) {
    const o = owner[i];
    let j = i + 1;
    while (j < n && owner[j] === o) j++;
    const chunk = esc(text.slice(i, j));
    if (o >= 0 && !grammar.hiddenTypes.has(grammar.highlights[o].type)) {
      rendered.add(o);
      html += '<span class="gh gh-' + grammar.highlights[o].type + '" data-gi="' + o + '">' + chunk + "</span>";
    } else {
      html += chunk;
    }
    i = j;
  }
  grammar.rendered = [...rendered];
  $("grammarPassage").innerHTML = html;
}
function renderGrammarLegend() {
  const counts = {};
  grammar.rendered.forEach((i) => {
    const t = grammar.highlights[i].type;
    counts[t] = (counts[t] || 0) + 1;
  });
  $("grammarLegend").innerHTML = Object.keys(GRAMMAR_TYPES).filter((t) => counts[t]).map((t) => {
    const m = GRAMMAR_TYPES[t];
    const off = grammar.hiddenTypes.has(t);
    return '<button type="button" class="legend-chip' + (off ? " off" : "") + '" data-type="' + t +
      '" style="--chip-bg:' + m.bg + ";--chip-fg:" + m.color + '">' +
      m.label + " · " + counts[t] + "</button>";
  }).join("");
  $("grammarLegend").querySelectorAll(".legend-chip").forEach((b) => {
    b.addEventListener("click", () => {
      const t = b.dataset.type;
      if (grammar.hiddenTypes.has(t)) grammar.hiddenTypes.delete(t);
      else grammar.hiddenTypes.add(t);
      renderGrammarPassage();
      renderGrammarLegend();
    });
  });
}
function showGrammarExplain(gi) {
  const h = grammar.highlights[gi];
  const m = GRAMMAR_TYPES[h.type];
  const el = $("grammarExplain");
  el.innerHTML = '<div class="gtype" style="color:' + m.color + '">' + m.label + "</div>" +
    "<p>" + esc(h.note) + "</p>" +
    '<p class="muted small">Example from this passage: “' + esc(h.text) + "”</p>";
  el.classList.remove("hidden");
}
function openGrammar(passage) {
  if (!passage) { alert("Choose a passage first."); return; }
  grammar.passage = passage;
  grammar.hiddenTypes = new Set();
  const entry = state.grammar[passage.id];
  grammar.highlights = entry ? entry.highlights.slice() : autoGrammar(passage.text).highlights;
  $("grammarTitle").textContent = passage.num + " — " + passage.title;
  $("grammarCard").classList.remove("hidden");
  $("grammarQuizArea").classList.add("hidden");
  $("grammarQuizResult").classList.add("hidden");
  $("grammarExplain").classList.add("hidden");
  renderGrammarPassage();
  renderGrammarLegend();
  $("grammarCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
function buildGrammarQuiz(passage, highlights, renderedIdx) {
  const qs = [];
  const rendered = renderedIdx.map((i) => highlights[i]);
  const byType = (t) => rendered.filter((h) => h.type === t);
  const words = [];
  const seen = new Set();
  for (const w of tokenize(passage.text)) {
    const c = normWord(w);
    if (c.length >= 3 && /^[a-z']+$/.test(c) && !seen.has(c)) { seen.add(c); words.push(c); }
  }
  const distractWords = (correct, filter) =>
    shuffle(words.filter((w) => w !== correct && (!filter || filter(w)))).slice(0, 3);
  const wordQuestion = (h, q, topic, why) => {
    const word = h.text.split(/\s+/)[0];
    const others = distractWords(normWord(word), (w) => !/ed$/.test(w));
    if (others.length < 3) return;
    const choices = shuffle([word].concat(others));
    qs.push({ q, choices, answer: choices.indexOf(word), topic, why });
  };
  const pasts = byType("past");
  if (pasts.length) {
    const h = pasts[Math.floor(Math.random() * pasts.length)];
    wordQuestion(h, "Which word shows that the action already happened?", "past tense",
      "“" + h.text.split(/\s+/)[0] + "” is a past-tense verb — it shows the action already happened.");
  }
  const press = byType("present");
  if (press.length) {
    const h = press[Math.floor(Math.random() * press.length)];
    wordQuestion(h, "Which word shows something happening right now?", "present tense",
      "“" + h.text.split(/\s+/)[0] + "” is in the present tense — it shows something happening right now, or something that is true.");
  }
  const adjs = byType("adj");
  if (adjs.length) {
    const h = adjs[Math.floor(Math.random() * adjs.length)];
    wordQuestion(h, "Which of these is a describing word (adjective)?", "describing words",
      "“" + h.text.split(/\s+/)[0] + "” is a describing word — it tells you more about a person, place or thing.");
  }
  const conns = byType("connector");
  if (conns.length) {
    const h = conns[Math.floor(Math.random() * conns.length)];
    const em = h.note.match(/It ([^.]+\.)/);
    const right = em ? "It " + em[1] : h.note;
    const wrongs = ["It names a person or a place.", "It shows strong feeling, like a shout.", "It tells you where something is."];
    const choices = shuffle([right].concat(wrongs));
    qs.push({ q: "What does “" + h.text + "” do in this sentence?", choices,
      answer: choices.indexOf(right), topic: "connectors",
      why: "“" + h.text + "” is a connector — a word that joins ideas. " + right });
  }
  const speeches = byType("speech");
  if (speeches.length) {
    const h = speeches[Math.floor(Math.random() * speeches.length)];
    const short = h.text.length > 60 ? h.text.slice(0, 60) + "…" : h.text;
    const narr = splitSentences(passage.text)
      .filter((s) => !s.includes("“") && !s.includes('"') && s.length > 10)
      .slice(0, 3).map((s) => s.length > 60 ? s.slice(0, 60) + "…" : s);
    if (narr.length >= 3) {
      const choices = shuffle([short].concat(narr));
      qs.push({ q: "Which of these are the exact words that someone said?", choices,
        answer: choices.indexOf(short), topic: "direct speech",
        why: "The speech marks (“ ”) show that these are the exact words someone said." });
    }
  }
  const puncts = byType("punct");
  if (puncts.length) {
    const h = puncts[Math.floor(Math.random() * puncts.length)];
    const t = h.text;
    let right, wrongs, q;
    if (t.includes("!")) {
      right = "It shows strong feeling — excitement, surprise or a shout.";
      wrongs = ["It shows the sentence has finished quietly.", "It shows a list of things.", "It shows the words are a name."];
      q = "Why is there an exclamation mark (!) in “" + t + "”?";
    } else if (t.includes("?")) {
      right = "It shows someone is asking something.";
      wrongs = ["It shows the sentence has finished quietly.", "It shows a list of things.", "It shows the words are a name."];
      q = "Why is there a question mark (?) in “" + t + "”?";
    } else {
      right = "They separate the things in a list, so you can see each one clearly.";
      wrongs = ["They show strong feeling.", "They show someone is asking something.", "They join two sentences together."];
      q = "Why are there commas in “" + t + "”?";
    }
    const choices = shuffle([right].concat(wrongs));
    qs.push({ q, choices, answer: choices.indexOf(right), topic: "punctuation", why: right });
  }
  return shuffle(qs).slice(0, 4);
}
function startGrammarQuiz() {
  if (!grammar.passage) return;
  const qs = buildGrammarQuiz(grammar.passage, grammar.highlights, grammar.rendered);
  if (qs.length < 2) {
    $("grammarQuizResult").innerHTML = '<p class="muted">Not enough grammar points in this passage for a quiz — try another passage.</p>';
    $("grammarQuizResult").classList.remove("hidden");
    return;
  }
  gquiz.questions = qs; gquiz.idx = 0; gquiz.correct = 0; gquiz.wrongTopics = [];
  $("grammarQuizResult").classList.add("hidden");
  $("grammarQuizArea").classList.remove("hidden");
  showGrammarQuizQuestion();
}
function showGrammarQuizQuestion() {
  const q = gquiz.questions[gquiz.idx];
  gquiz.answered = false;
  $("grammarQuizProgress").textContent = "Question " + (gquiz.idx + 1) + " of " + gquiz.questions.length;
  $("grammarQuizQuestion").textContent = q.q;
  const box = $("grammarQuizChoices");
  box.innerHTML = "";
  q.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => answerGrammarQuiz(b, i === q.answer));
    box.appendChild(b);
  });
  $("grammarQuizNextBtn").classList.add("hidden");
  $("grammarQuizFeedback").textContent = "";
}
function answerGrammarQuiz(btn, ok) {
  if (gquiz.answered) return;
  gquiz.answered = true;
  const q = gquiz.questions[gquiz.idx];
  document.querySelectorAll("#grammarQuizChoices button").forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  if (ok) { gquiz.correct++; $("grammarQuizFeedback").textContent = "Correct! ★ " + q.why; }
  else { gquiz.wrongTopics.push(q.topic); $("grammarQuizFeedback").textContent = "Not quite. " + q.why; }
  $("grammarQuizNextBtn").classList.remove("hidden");
  $("grammarQuizNextBtn").focus();
}
async function nextGrammarQuiz() {
  gquiz.idx++;
  if (gquiz.idx >= gquiz.questions.length) {
    $("grammarQuizArea").classList.add("hidden");
    const total = gquiz.questions.length;
    const pct = total ? Math.round(gquiz.correct / total * 100) : 0;
    const el = $("grammarQuizResult");
    el.innerHTML = "<h3>Grammar quiz finished — " + gquiz.correct + "/" + total + "</h3>" +
      "<p>" + (pct === 100 ? "Perfect! You spotted every grammar point. ★" :
        pct >= 75 ? "Well done — nearly there!" : "Good try — tap the coloured words above to revise.") + "</p>" +
      (gquiz.wrongTopics.length ? "<p><strong>To revise:</strong> " + esc([...new Set(gquiz.wrongTopics)].join(", ")) + "</p>" : "") +
      '<p class="muted small">Result saved to your progress.</p>';
    el.classList.remove("hidden");
    const p = grammar.passage;
    await saveSession({ kind: "grammar", game: "Grammar Quiz", passageId: p.id,
      passageTitle: p.num + " — " + p.title, score: gquiz.correct, total, accuracy: pct,
      wrongTopics: [...new Set(gquiz.wrongTopics)] });
  } else {
    showGrammarQuizQuestion();
  }
}
function initGrammar() {
  $("grammarBtn").addEventListener("click", () => openGrammar(state.currentPassage));
  $("grammarCloseBtn").addEventListener("click", () => $("grammarCard").classList.add("hidden"));
  $("grammarQuizBtn").addEventListener("click", startGrammarQuiz);
  $("grammarQuizNextBtn").addEventListener("click", nextGrammarQuiz);
  $("grammarPassage").addEventListener("click", (e) => {
    const span = e.target.closest(".gh");
    if (!span) return;
    document.querySelectorAll("#grammarPassage .gh").forEach((x) => x.classList.remove("gh-active"));
    span.classList.add("gh-active");
    showGrammarExplain(parseInt(span.dataset.gi, 10));
  });
}

/* ---------------- Spaced repetition (no AI) ----------------
   Mastery is a plain record per word / passage, saved on disk:
   {streak, tested, lastTested, nextDue}. A correct answer moves the
   next review further away (1, 3, 7, 14, 30 days); a wrong answer
   resets the streak and makes the item due again today. */
const SR_INTERVALS = [1, 3, 7, 14, 30];
function masteryIntervalDays(streak) {
  return SR_INTERVALS[Math.min(Math.max(streak - 1, 0), SR_INTERVALS.length - 1)];
}
function addDaysKey(dateKey, days) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayKey(d);
}
function updateMasteryRecord(rec, correct, today) {
  rec = rec || { streak: 0, tested: 0, lastTested: null, nextDue: null };
  rec.tested = (rec.tested || 0) + 1;
  rec.lastTested = today;
  if (correct) {
    rec.streak = (rec.streak || 0) + 1;
    rec.nextDue = addDaysKey(today, masteryIntervalDays(rec.streak));
  } else {
    rec.streak = 0;
    rec.nextDue = today; // due again soon
  }
  return rec;
}
function wordKey(word) { return String(word).toLowerCase().trim(); }
function isDue(rec, today) {
  return !rec || !rec.nextDue || rec.nextDue <= (today || todayKey());
}
function isMasteredWord(rec) { return !!rec && (rec.streak || 0) >= 3; }
function isMasteredPassage(rec) { return !!rec && (rec.streak || 0) >= 2; }
function updateWordMastery(word, correct) {
  const k = wordKey(word);
  state.mastery.words[k] = updateMasteryRecord(state.mastery.words[k], correct, todayKey());
  renderMasteryLists();
}
function updatePassageMastery(passageId, correct) {
  state.mastery.passages[passageId] = updateMasteryRecord(state.mastery.passages[passageId], correct, todayKey());
  renderDueHints();
}
function isMasteredOral(rec) { return !!rec && (rec.streak || 0) >= 2; }
function updateOralMastery(topicId, correct) {
  if (!topicId) return;
  if (!state.mastery.oral) state.mastery.oral = {};
  state.mastery.oral[topicId] = updateMasteryRecord(state.mastery.oral[topicId], correct, todayKey());
}
async function loadMastery() {
  if (!state.currentProfileId) { state.mastery = { words: {}, passages: {}, oral: {} }; return; }
  const j = await apiGet("/api/mastery?profileId=" + state.currentProfileId);
  state.mastery = j.mastery || { words: {}, passages: {}, oral: {} };
  if (!state.mastery.words) state.mastery.words = {};
  if (!state.mastery.passages) state.mastery.passages = {};
  if (!state.mastery.oral) state.mastery.oral = {};
}
async function saveMastery() {
  if (!state.currentProfileId) return;
  try {
    await apiPost("/api/mastery", { profileId: state.currentProfileId, mastery: state.mastery });
  } catch (e) { /* mastery is a bonus; a failed save must not break the round */ }
}
/* Round building: mostly due / improving items, a few mastered ones
   mixed in as retention checks (2 in a 10-word round, 1 in a short one). */
function pickRoundWords(pool, n) {
  const today = todayKey();
  const due = [], kept = [];
  for (const w of pool) {
    const rec = state.mastery.words[wordKey(w.word)];
    if (isMasteredWord(rec) && !isDue(rec, today)) kept.push(w);
    else due.push(w);
  }
  const masteredSlots = n >= 8 ? 2 : 1;
  const duePart = shuffle(due).slice(0, Math.max(n - masteredSlots, 0));
  const keptPart = shuffle(kept).slice(0, n - duePart.length);
  const chosen = duePart.concat(keptPart);
  if (chosen.length < n) {
    const left = shuffle(due.filter((w) => !duePart.includes(w)));
    chosen.push(...left.slice(0, n - chosen.length));
  }
  return shuffle(chosen.slice(0, n));
}
/* Passages in the order a child should practise them: due for review
   first, then still improving, then ones never tried. */
function duePassages() {
  const today = todayKey();
  const dueNow = [], improving = [], fresh = [];
  for (const p of state.passages) {
    const rec = state.mastery.passages[p.id];
    if (!rec) { fresh.push(p); continue; }
    if (isDue(rec, today)) dueNow.push(p);
    else if (!isMasteredPassage(rec)) improving.push(p);
  }
  return dueNow.concat(improving, fresh);
}
function dueLabel(rec, today) {
  if (!rec || !rec.nextDue) return "not tried yet";
  if (rec.nextDue <= today) return "due now";
  const diff = Math.round((new Date(rec.nextDue + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  return diff === 1 ? "due tomorrow" : "due in " + diff + " days";
}
function masterySummary(rec, today) {
  return "streak " + (rec.streak || 0) + " · tested " + (rec.tested || 0) +
    " time" + ((rec.tested || 0) === 1 ? "" : "s") + " · " + dueLabel(rec, today);
}
function renderMasteryLists() {
  const el = $("masteryLists");
  if (!el) return;
  const today = todayKey();
  const entries = Object.entries(state.mastery.words);
  const mastered = entries.filter(([, r]) => isMasteredWord(r));
  const improving = entries.filter(([, r]) => !isMasteredWord(r));
  const list = (arr) => arr.length
    ? "<ul>" + arr.map(([k, r]) => "<li>" + esc(k) + " — " + masterySummary(r, today) + "</li>").join("") + "</ul>"
    : '<p class="muted">None yet — words you practise will appear here.</p>';
  const oralEntries = Object.entries(state.mastery.oral || {});
  const masteredO = oralEntries.filter(([, r]) => isMasteredOral(r));
  const improvingO = oralEntries.filter(([, r]) => !isMasteredOral(r));
  const oralList = (arr) => arr.length
    ? "<ul>" + arr.map(([id, r]) => "<li>" + esc(oralTopicTitle(id)) + " — " + masterySummary(r, today) + "</li>").join("") + "</ul>"
    : '<p class="muted">None yet — oral topics you practise will appear here.</p>';
  el.innerHTML = "<h3>Mastered</h3>" + list(mastered) + "<h3>Improving</h3>" + list(improving) +
    "<h3>Oral Partner — Mastered</h3>" + oralList(masteredO) +
    "<h3>Oral Partner — Improving</h3>" + oralList(improvingO);
}
function renderDueHints() {
  const next = duePassages();
  const html = next.length
    ? '<p class="muted small">Suggested next: ' + esc(next[0].num + " — " + next[0].title) +
      ' <button class="btn small" type="button" data-due-passage="' + esc(next[0].id) + '">Practise it</button></p>'
    : '<p class="muted small">All passages are up to date — nothing due for practice.</p>';
  for (const id of ["readDueHint", "typeDueHint"]) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = html;
    el.querySelectorAll("[data-due-passage]").forEach((b) => {
      b.addEventListener("click", () => {
        selectPassage(b.dataset.duePassage);
        if ($("racePassageSelect")) $("racePassageSelect").value = b.dataset.duePassage;
        if ($("rainPassageSelect")) $("rainPassageSelect").value = b.dataset.duePassage;
      });
    });
  }
}
function masteryCardHtml() {
  const today = todayKey();
  const wordEntries = Object.entries(state.mastery.words);
  const masteredW = wordEntries.filter(([, r]) => isMasteredWord(r));
  const improvingW = wordEntries.filter(([, r]) => !isMasteredWord(r));
  const passEntries = Object.entries(state.mastery.passages);
  const masteredP = passEntries.filter(([, r]) => isMasteredPassage(r));
  const improvingP = passEntries.filter(([, r]) => !isMasteredPassage(r));
  const wordList = (arr) => arr.length
    ? "<ul>" + arr.map(([k, r]) => "<li>" + esc(k) + " — " + masterySummary(r, today) + "</li>").join("") + "</ul>"
    : '<p class="muted">None yet.</p>';
  const passList = (arr) => arr.length
    ? "<ul>" + arr.map(([id, r]) => {
        const p = passageById(id);
        return "<li>" + esc(p ? p.num + " — " + p.title : id) + " — " + masterySummary(r, today) + "</li>";
      }).join("") + "</ul>"
    : '<p class="muted">None yet.</p>';
  const oralEntries = Object.entries(state.mastery.oral || {});
  const masteredO = oralEntries.filter(([, r]) => isMasteredOral(r));
  const improvingO = oralEntries.filter(([, r]) => !isMasteredOral(r));
  const oralList = (arr) => arr.length
    ? "<ul>" + arr.map(([id, r]) => "<li>" + esc(oralTopicTitle(id)) + " — " + masterySummary(r, today) + "</li>").join("") + "</ul>"
    : '<p class="muted">None yet.</p>';
  return '<div class="card"><h3>Mastery — words</h3>' +
    "<h4>Mastered</h4>" + wordList(masteredW) +
    "<h4>Improving</h4>" + wordList(improvingW) + "</div>" +
    '<div class="card"><h3>Mastery — reading passages</h3>' +
    "<h4>Mastered</h4>" + passList(masteredP) +
    "<h4>Improving</h4>" + passList(improvingP) + "</div>" +
    '<div class="card"><h3>Mastery — oral topics</h3>' +
    "<h4>Mastered</h4>" + oralList(masteredO) +
    "<h4>Improving</h4>" + oralList(improvingO) + "</div>";
}

/* ---------------- typing games ---------------- */
function initTypeTabs() {
  document.querySelectorAll(".game-tab").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".game-tab").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".game").forEach((g) => g.classList.add("hidden"));
      $("game-" + b.dataset.game).classList.remove("hidden");
    });
  });
}

/* --- Sentence Race --- */
const race = { sentences: [], idx: 0, start: 0, correctChars: 0, totalChars: 0, points: 0 };
function startRace() {
  const p = passageById($("racePassageSelect").value);
  if (!p) return;
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  race.sentences = splitSentences(p.text);
  race.idx = 0; race.start = Date.now();
  race.correctChars = 0; race.totalChars = 0; race.points = 0;
  $("raceArea").classList.remove("hidden");
  $("raceResult").classList.add("hidden");
  $("raceInput").value = "";
  $("raceFeedback").textContent = "";
  showRaceSentence();
  $("raceInput").focus();
}
function showRaceSentence() {
  const s = race.sentences[race.idx];
  $("raceSentence").textContent = s;
  $("raceProgress").textContent = "Sentence " + (race.idx + 1) + " of " + race.sentences.length;
  $("raceInput").value = "";
  $("raceInput").focus();
}
function raceCharScore(target, typed) {
  let ok = 0;
  const n = Math.max(target.length, typed.length);
  for (let i = 0; i < Math.min(target.length, typed.length); i++) {
    if (target[i] === typed[i]) ok++;
  }
  return { ok, n };
}
async function submitRace() {
  const target = race.sentences[race.idx];
  const typed = $("raceInput").value;
  if (!typed.trim()) return;
  const { ok, n } = raceCharScore(target, typed);
  race.correctChars += ok;
  race.totalChars += n;
  const acc = n ? ok / n : 0;
  race.points += Math.round(acc * 10);
  $("raceFeedback").textContent = acc >= 0.95 ? "Perfect!" :
    acc >= 0.8 ? "Good — " + Math.round(acc * 100) + "% of the letters right." :
    "Keep going — " + Math.round(acc * 100) + "% right. The sentence was: “" + target + "”";
  race.idx++;
  if (race.idx >= race.sentences.length) {
    const minutes = Math.max((Date.now() - race.start) / 60000, 0.05);
    const wpm = (race.correctChars / 5) / minutes;
    const accuracy = race.totalChars ? race.correctChars / race.totalChars * 100 : 0;
    $("raceArea").classList.add("hidden");
    const el = $("raceResult");
    el.innerHTML = "<h3>Race finished!</h3>" +
      '<div class="score-grid">' +
      '<div class="score-box"><div class="num">' + Math.round(wpm) + '</div><div class="lbl">words per minute</div></div>' +
      '<div class="score-box"><div class="num">' + Math.round(accuracy) + '%</div><div class="lbl">accuracy</div></div>' +
      '<div class="score-box"><div class="num">' + race.points + '</div><div class="lbl">points</div></div></div>' +
      '<p class="muted small">Result saved to your progress.</p>';
    el.classList.remove("hidden");
    const p = passageById($("racePassageSelect").value);
    await saveSession({ kind: "typing", game: "Sentence Race", passageTitle: p.num + " — " + p.title,
      wpm: Math.round(wpm), accuracy: Math.round(accuracy), points: race.points });
  } else {
    // Roll straight into the next sentence — no pause — until the whole passage is done.
    showRaceSentence();
  }
}

/* --- Word Rain --- */
/* Word Rain speed levels 1–6, slowest to fastest. fall = px dropped every
   100ms (a word falls the 320px board in ~30s at Level 1, ~10s at Level 6);
   spawn = ms between new words; max = most words on screen at once. */
const RAIN_LEVELS = [
  { fall: 1.0, spawn: 5000, max: 4 },
  { fall: 1.2, spawn: 4000, max: 5 },
  { fall: 1.5, spawn: 3000, max: 6 },
  { fall: 2.0, spawn: 2500, max: 6 },
  { fall: 2.5, spawn: 2000, max: 6 },
  { fall: 3.0, spawn: 1500, max: 7 },
];
function rainLevel() {
  let saved = 0;
  try { saved = parseInt(localStorage.getItem("talktupils_rain_level") || "0", 10) || 0; } catch (e) {}
  if (saved >= 1 && saved <= 6) return saved;
  const p = currentProfile();
  return p && p.level === "P4" ? 2 : 3;
}
const rain = { words: [], pool: [], timer: null, dropTimer: null, spawnTimer: null, timeLeft: 60, score: 0, caught: 0, missed: 0, active: false, fallStep: 1.5, spawnMs: 3000, maxOnScreen: 6 };
function startRain() {
  const p = passageById($("rainPassageSelect").value);
  if (!p) return;
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const seen = new Set();
  const words = [];
  for (const w of tokenize(p.text)) {
    const clean = normWord(w);
    if (clean.length >= 3 && /^[a-z']+$/.test(clean) && !seen.has(clean)) {
      seen.add(clean); words.push(clean);
    }
  }
  rain.pool = words; // full unique-word list for this passage (shuffle() copies, so this stays intact)
  rain.words = shuffle(words).slice(0, 30);
  rain.score = 0; rain.caught = 0; rain.missed = 0; rain.timeLeft = 60; rain.active = true;
  $("rainArea").classList.remove("hidden");
  $("rainResult").classList.add("hidden");
  $("rainBoard").innerHTML = "";
  $("rainInput").value = "";
  $("rainScore").textContent = "Score: 0";
  $("rainTime").textContent = "60s left";
  $("rainInput").focus();
  const lvl = RAIN_LEVELS[rainLevel() - 1];
  rain.fallStep = lvl.fall; rain.spawnMs = lvl.spawn; rain.maxOnScreen = lvl.max;
  $("rainLevelSelect").value = String(rainLevel());
  let spawnIdx = 0;
  // Words drop progressively, one at a time, at the chosen level's speed.
  rain.spawnTimer = setInterval(() => {
    if (!rain.active) return;
    if (spawnIdx >= rain.words.length) {
      // Batch used up (fast levels can run through 30 words before the 60s
      // are over) — reshuffle the pool and keep going, so words keep
      // appearing right to the end of the game.
      rain.words = shuffle(rain.pool).slice(0, 30);
      spawnIdx = 0;
    }
    if (document.querySelectorAll(".rain-word").length >= rain.maxOnScreen) return;
    if (spawnRainWord(rain.words[spawnIdx])) spawnIdx++;
  }, rain.spawnMs);
  rain.dropTimer = setInterval(() => {
    document.querySelectorAll(".rain-word").forEach((el) => {
      const top = parseFloat(el.dataset.top || 0) + rain.fallStep;
      el.dataset.top = top;
      el.style.top = top + "px";
      if (top > 300) { el.remove(); rain.missed++; }
    });
  }, 100);
  rain.timer = setInterval(() => {
    rain.timeLeft--;
    $("rainTime").textContent = rain.timeLeft + "s left";
    if (rain.timeLeft <= 0) endRain();
  }, 1000);
}
function spawnRainWord(word) {
  const board = $("rainBoard");
  const el = document.createElement("div");
  el.className = "rain-word";
  el.textContent = word;
  el.dataset.word = word;
  el.dataset.top = 0;
  el.style.top = "0px";
  board.appendChild(el);
  const w = el.offsetWidth || 80;
  const boardW = board.clientWidth || 600;
  // Find a spot near the top that does not overlap a word already falling
  // there, so words never pile up on top of each other.
  for (let tries = 0; tries < 8; tries++) {
    const left = Math.floor(Math.random() * Math.max(boardW - w - 8, 8));
    const clash = Array.from(document.querySelectorAll(".rain-word")).some((o) => {
      if (o === el) return false;
      if (parseFloat(o.dataset.top || 0) > 90) return false;
      const ol = parseFloat(o.style.left || 0);
      const ow = o.offsetWidth || 80;
      return left < ol + ow + 8 && ol < left + w + 8;
    });
    if (!clash) { el.style.left = left + "px"; return true; }
  }
  el.remove();
  return false;
}
function rainSubmit() {
  const val = normWord($("rainInput").value.trim());
  $("rainInput").value = "";
  if (!val) return;
  const el = document.querySelector('.rain-word[data-word="' + CSS.escape(val) + '"]');
  if (el) {
    el.remove();
    rain.caught++;
    rain.score += 10;
    $("rainScore").textContent = "Score: " + rain.score;
  }
}
async function endRain() {
  if (!rain.active) return;
  rain.active = false;
  clearInterval(rain.timer);
  clearInterval(rain.dropTimer);
  clearInterval(rain.spawnTimer);
  document.querySelectorAll(".rain-word").forEach((el) => el.remove());
  $("rainArea").classList.add("hidden");
  const total = rain.caught + rain.missed;
  const accuracy = total ? rain.caught / total * 100 : 0;
  const minutes = Math.max((60 - rain.timeLeft) / 60, 0.05);
  const wpm = rain.caught / minutes;
  const el = $("rainResult");
  el.innerHTML = "<h3>Word Rain finished!</h3>" +
    '<div class="score-grid">' +
    '<div class="score-box"><div class="num">' + rain.score + '</div><div class="lbl">points</div></div>' +
    '<div class="score-box"><div class="num">' + rain.caught + '</div><div class="lbl">words caught</div></div>' +
    '<div class="score-box"><div class="num">' + rain.missed + '</div><div class="lbl">words missed</div></div>' +
    '<div class="score-box"><div class="num">' + Math.round(accuracy) + '%</div><div class="lbl">accuracy</div></div>' +
    '<div class="score-box"><div class="num">' + Math.round(wpm) + '</div><div class="lbl">words per minute</div></div></div>' +
    '<p class="muted small">Result saved to your progress.</p>';
  el.classList.remove("hidden");
  const p = passageById($("rainPassageSelect").value);
  await saveSession({ kind: "typing", game: "Word Rain", passageTitle: p.num + " — " + p.title,
    score: rain.score, caught: rain.caught, missed: rain.missed, accuracy: Math.round(accuracy), wpm: Math.round(wpm) });
}

/* --- Listen & Spell --- */
const spell = { words: [], idx: 0, correct: 0, wrong: [], unit: 0, total: 0, speakCount: 0 };
function unitWords(unit) {
  if (unit === "my") return state.vocab.filter((w) => w.unit === "my");
  return state.vocab.filter((w) => unit === 0 || w.unit === unit);
}
/* The value of a unit <select>: "my" for the custom list, else a number. */
function selectedUnit(sel) {
  return sel.value === "my" ? "my" : parseInt(sel.value, 10);
}
function unitLabel(u) {
  if (u === 0) return "All units";
  if (u === "my") return "My words";
  return "Unit " + u + " — " + unitName(u);
}
async function speakWordThrice(word) {
  const token = ++state.speakToken;
  for (let i = 0; i < 3; i++) {
    if (token !== state.speakToken) return;
    await speakText(word, { rate: 0.8 });
    if (token !== state.speakToken) return;
    await new Promise((r) => setTimeout(r, 450));
  }
}
function spellBlanks(word) {
  return word.split(" ").map((w) =>
    '<span class="blank-word">' + "_ ".repeat(w.length).trim() + "</span>").join("");
}
function showSpellWord() {
  const entry = spell.words[spell.idx];
  spell.answered = false;
  $("spellProgress").textContent = "Word " + (spell.idx + 1) + " of " + spell.total;
  $("spellClue").textContent = "Clue (meaning): " + entry.meaning;
  $("spellBlanks").innerHTML = spellBlanks(entry.word);
  $("spellInput").value = "";
  $("spellFeedback").textContent = "";
  $("spellNextBtn").classList.add("hidden");
  $("spellCheckBtn").classList.remove("hidden");
  $("spellInput").focus();
  speakWordThrice(entry.word);
}
function startSpell() {
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const unit = selectedUnit($("spellUnitSelect"));
  const count = $("spellCountSelect").value;
  const pool = unitWords(unit);
  let words = pickRoundWords(pool, count === "all" ? pool.length : parseInt(count, 10));
  if (!words.length) { alert("No words in this unit."); return; }
  spell.words = words;
  spell.idx = 0;
  spell.correct = 0;
  spell.wrong = [];
  spell.unit = unit;
  spell.total = words.length;
  spell.answered = false;
  $("spellArea").classList.remove("hidden");
  $("spellResult").classList.add("hidden");
  showSpellWord();
}
function spellNorm(s) {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}
function checkSpell() {
  if (spell.answered) return;
  spell.answered = true;
  const entry = spell.words[spell.idx];
  const typed = spellNorm($("spellInput").value);
  const ok = typed === spellNorm(entry.word);
  updateWordMastery(entry.word, ok);
  saveMastery();
  if (ok) {
    spell.correct++;
    $("spellFeedback").textContent = "Correct — exactly right! ★";
    $("spellFeedback").style.color = "#1c7a2e";
  } else {
    spell.wrong.push(entry.word);
    $("spellFeedback").textContent = "Not quite — the spelling was “" + entry.word + "”.";
    $("spellFeedback").style.color = "#c01f16";
    $("spellBlanks").innerHTML = esc(entry.word);
  }
  $("spellCheckBtn").classList.add("hidden");
  $("spellNextBtn").classList.remove("hidden");
  $("spellNextBtn").focus();
}
async function nextSpell() {
  spell.idx++;
  if (spell.idx >= spell.total) {
    stopSpeaking();
    $("spellArea").classList.add("hidden");
    const acc = spell.total ? spell.correct / spell.total * 100 : 0;
    const label = unitLabel(spell.unit);
    const el = $("spellResult");
    el.innerHTML = "<h3>Listen &amp; Spell finished — " + esc(label) + "</h3>" +
      '<div class="score-grid">' +
      '<div class="score-box"><div class="num">' + spell.correct + "/" + spell.total + '</div><div class="lbl">correct</div></div>' +
      '<div class="score-box"><div class="num">' + Math.round(acc) + '%</div><div class="lbl">accuracy</div></div></div>' +
      (spell.wrong.length
        ? "<p><strong>Words to practise again:</strong> " + spell.wrong.map(esc).join(", ") + "</p>"
        : "<p><strong>Perfect — every spelling right!</strong></p>") +
      '<p class="muted small">Result saved to your progress.</p>';
    el.classList.remove("hidden");
    await saveSession({ kind: "spell", game: "Listen & Spell", unit: label,
      score: spell.correct, total: spell.total, accuracy: Math.round(acc),
      wrongWords: spell.wrong });
  } else {
    showSpellWord();
  }
}
function initType() {
  initTypeTabs();
  $("raceStartBtn").addEventListener("click", startRace);
  $("raceInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitRace(); }
  });
  $("rainStartBtn").addEventListener("click", startRain);
  $("rainInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") rainSubmit();
  });
  $("rainLevelSelect").value = String(rainLevel());
  $("rainLevelSelect").addEventListener("change", () => {
    try { localStorage.setItem("talktupils_rain_level", $("rainLevelSelect").value); } catch (e) {}
  });
  $("spellStartBtn").addEventListener("click", startSpell);
  $("spellHearBtn").addEventListener("click", () => {
    const entry = spell.words[spell.idx];
    if (entry) speakWordThrice(entry.word);
  });
  $("spellCheckBtn").addEventListener("click", checkSpell);
  $("spellInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkSpell();
  });
  $("spellNextBtn").addEventListener("click", nextSpell);
}

/* ---------------- Words ---------------- */
const study = { hideMeanings: false };
function unitName(u) {
  if (u === "my") return "My words";
  const names = { 1: "Coolie Boy", 2: "Amazing Friends", 3: "Ten", 4: "The Promise",
    5: "A Game of Emails", 6: "Martial Arts", 7: "Dogs with Jobs",
    8: "Making Every Drop Count", 9: "Urban Wildlife" };
  return names[u] || ("Unit " + u);
}
function fillUnitSelects() {
  const units = [...new Set(state.vocab.map((w) => w.unit).filter((u) => typeof u === "number"))].sort((a, b) => a - b);
  const unitOptions = units.map((u) => ({ value: String(u), text: "Unit " + u + " — " + unitName(u) }));
  unitOptions.push({ value: "my", text: "My words" });
  for (const sel of [$("studyUnitSelect"), $("quizUnitSelect"), $("spellUnitSelect")]) {
    const keep = sel.value;
    sel.innerHTML = "";
    for (const o of unitOptions) {
      const el = document.createElement("option");
      el.value = o.value;
      el.textContent = o.text;
      sel.appendChild(el);
    }
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }
}
function renderStudy() {
  const unit = selectedUnit($("studyUnitSelect"));
  const q = $("studySearch").value.trim().toLowerCase();
  const list = unitWords(unit).filter((w) =>
    !q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
  $("studyCount").textContent = list.length + " word" + (list.length === 1 ? "" : "s");
  const el = $("wordList");
  el.innerHTML = list.map((w) =>
    '<div class="word-row"><span class="w">' + esc(w.word) + '</span>' +
    '<span class="m' + (study.hideMeanings ? " hidden-meaning" : "") + '">' +
    (study.hideMeanings ? "Tap to reveal the meaning" : esc(w.meaning)) + "</span>" +
    '<span class="tag">' + esc(w.category) + "</span>" +
    (w.custom ? '<button class="btn small danger" data-delword="' + esc(w.id) + '">Delete</button>' : "") +
    "</div>").join("") ||
    '<p class="muted">No words match.</p>';
  el.querySelectorAll("[data-delword]").forEach((b) => {
    b.addEventListener("click", () => deleteCustomVocab(b.dataset.delword));
  });
  el.querySelectorAll(".hidden-meaning").forEach((m) => {
    m.addEventListener("click", () => {
      const row = m.closest(".word-row");
      const idx = [...el.children].indexOf(row);
      m.textContent = list[idx].meaning;
      m.classList.remove("hidden-meaning");
    });
  });
}

/* --- Custom vocabulary (added by the pupil) --- */
function mergeCustomVocab() {
  state.vocab = state.vocab.filter((w) => !w.custom);
  for (const c of state.customVocab) {
    state.vocab.push({ word: c.word, meaning: c.meaning, unit: c.unit,
      category: c.category, unitName: unitName(c.unit), custom: true, id: c.id });
  }
}
async function deleteCustomVocab(id) {
  const entry = state.customVocab.find((c) => c.id === id);
  if (entry && !confirm('Delete the word "' + entry.word + '"?')) return;
  await apiDelete("/api/custom-vocab/" + encodeURIComponent(id));
  state.customVocab = state.customVocab.filter((c) => c.id !== id);
  mergeCustomVocab();
  fillUnitSelects();
  renderStudy();
  renderCustomVocabList();
}
function renderCustomVocabList() {
  const el = $("customVocabList");
  if (!el) return;
  el.innerHTML = state.customVocab.length
    ? state.customVocab.map((c) =>
        '<div class="word-row"><span class="w">' + esc(c.word) + "</span>" +
        '<span class="m">' + esc(c.meaning) + "</span>" +
        '<span class="tag">' + esc(unitLabel(c.unit)) + " · " + esc(c.category) + "</span>" +
        '<button class="btn small danger" data-delword="' + esc(c.id) + '">Delete</button></div>').join("")
    : '<p class="muted">No words added yet.</p>';
  el.querySelectorAll("[data-delword]").forEach((b) => {
    b.addEventListener("click", () => deleteCustomVocab(b.dataset.delword));
  });
}

/* --- Meaning quiz --- */
const quiz = { questions: [], idx: 0, correct: 0, unit: 0, total: 0, answered: false };
function makeQuizQuestions(unit, count) {
  const pool = unitWords(unit);
  const chosen = pickRoundWords(pool, count === "all" ? pool.length : parseInt(count, 10));
  return chosen.map((w) => {
    const others = shuffle(state.vocab.filter((x) => x.word !== w.word &&
      (x.unit === w.unit || unit === 0))).slice(0, 3);
    const fillers = others.length < 3
      ? others.concat(shuffle(state.vocab.filter((x) => x.word !== w.word &&
          !others.some((o) => o.word === x.word))).slice(0, 3 - others.length))
      : others;
    const choices = shuffle([w].concat(fillers));
    return { word: w.word, answer: w.meaning, choices: choices.map((c) => c.meaning) };
  });
}
function startQuiz() {
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const unit = selectedUnit($("quizUnitSelect"));
  const count = $("quizCountSelect").value;
  quiz.questions = makeQuizQuestions(unit, count);
  if (!quiz.questions.length) { alert("No words in this unit."); return; }
  quiz.idx = 0; quiz.correct = 0; quiz.unit = unit; quiz.total = quiz.questions.length;
  $("quizArea").classList.remove("hidden");
  $("quizResult").classList.add("hidden");
  showQuizQuestion();
}
function showQuizQuestion() {
  const q = quiz.questions[quiz.idx];
  quiz.answered = false;
  $("quizProgress").textContent = "Question " + (quiz.idx + 1) + " of " + quiz.total;
  $("quizQuestion").textContent = 'What does "' + q.word + '" mean?';
  const box = $("quizChoices");
  box.innerHTML = "";
  q.choices.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => answerQuiz(b, c === q.answer));
    box.appendChild(b);
  });
  $("quizNextBtn").classList.add("hidden");
  $("quizFeedback").textContent = "";
}
function answerQuiz(btn, ok) {
  if (quiz.answered) return;
  quiz.answered = true;
  const q = quiz.questions[quiz.idx];
  document.querySelectorAll("#quizChoices button").forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
  });
  if (ok) { quiz.correct++; $("quizFeedback").textContent = "Correct! ★"; }
  else $("quizFeedback").textContent = 'Not quite — "' + q.word + '" means: ' + q.answer;
  updateWordMastery(q.word, ok);
  saveMastery();
  $("quizNextBtn").classList.remove("hidden");
  $("quizNextBtn").focus();
}
async function nextQuiz() {
  quiz.idx++;
  if (quiz.idx >= quiz.total) {
    $("quizArea").classList.add("hidden");
    const pct = quiz.total ? Math.round(quiz.correct / quiz.total * 100) : 0;
    const label = unitLabel(quiz.unit);
    const el = $("quizResult");
    el.innerHTML = "<h3>Quiz finished — " + esc(label) + "</h3>" +
      '<div class="score-grid">' +
      '<div class="score-box"><div class="num">' + quiz.correct + "/" + quiz.total + '</div><div class="lbl">correct</div></div>' +
      '<div class="score-box"><div class="num">' + pct + '%</div><div class="lbl">score</div></div></div>' +
      '<p class="muted small">Result saved to your progress.</p>';
    el.classList.remove("hidden");
    await saveSession({ kind: "vocab", game: "Meaning Quiz", unit: label,
      score: quiz.correct, total: quiz.total, accuracy: pct });
  } else {
    showQuizQuestion();
  }
}
function initWords() {
  fillUnitSelects();
  $("studyUnitSelect").addEventListener("change", renderStudy);
  $("studySearch").addEventListener("input", renderStudy);
  $("hideMeaningsBtn").addEventListener("click", () => {
    study.hideMeanings = !study.hideMeanings;
    $("hideMeaningsBtn").textContent = study.hideMeanings ? "Show meanings" : "Hide meanings (self-test)";
    renderStudy();
  });
  $("quizStartBtn").addEventListener("click", startQuiz);
  $("quizNextBtn").addEventListener("click", nextQuiz);
  renderStudy();
  renderCustomVocabList();
  renderMasteryLists();
}

/* ---------------- Oral Partner ----------------
   PSLE Stimulus-Based Conversation practice. The examiner asks one
   question at a time (spoken + text), the child answers by speaking or
   typing, and the review shows "You said" next to "A stronger version"
   with the gaps in plain words. Mock = 3 questions, mark out of 25.
   Answer audio is recorded on this laptop only (MediaRecorder) and is
   never sent anywhere — not even to the AI. */
const oral = {
  mode: "mock",       // mock | practice | drill | retry
  topic: null,        // the topic object for this round
  questions: [],      // [{q, type, model, topicId, topicTitle, image}]
  idx: 0,
  answers: [],        // finished answer records for this round
  sessionKey: "",
  prepTimer: null,
  prepLeft: 0,
  rec: null,          // SpeechRecognition for the current answer
  recogRestarts: 0,
  transcript: "",
  pendingTranscript: "",  // first part of an answer, before a follow-up
  recorder: null,     // {rec, chunks, stream} while recording audio
  answering: false,   // mic is listening now
  followUpAsked: false,
  currentQ: null,
  aiSbcMarks: [],     // per-answer AI mark25, for the session AI mark
};

const ORAL_TYPE_LABELS = {
  picture: "About the picture",
  experience: "Your experience",
  opinion: "Your opinion",
  evaluative: "What you think",
};
const ORAL_FOLLOWUPS = [
  "Can you tell me more about that?",
  "Why do you think so?",
  "Can you give me an example?",
];
const ORAL_REASON_RE = /\b(because|so that|that'?s why|that is why|since)\b/i;
const ORAL_EXAMPLE_RE = /\b(for example|for instance|once|when i|one day|last (week|month|year|time)|i remember|for one thing)\b/i;
const ORAL_CLOSING_RE = /\b(in conclusion|overall|in short|that'?s why|that is why|all in all|to sum up|in a nutshell)\b/i;
const ORAL_DETAIL_RE = /\b(wearing|holding|standing|sitting|behind|next to|in front of|on the left|on the right|in the middle)\b/i;
const ORAL_VAGUE = ["good", "fun", "nice"];
const ORAL_PRECISE = ["exhausted", "delighted", "thrilled", "challenging", "rewarding",
  "memorable", "crowded", "peaceful", "exciting", "enjoyable", "tiring",
  "fascinating", "wonderful", "amazing", "important", "helpful", "brave",
  "patient", "kind-hearted", "breathtaking"];

function allOralTopics() {
  const list = [];
  if (state.sbc && state.sbc.topics) {
    for (const t of state.sbc.topics) {
      list.push({ id: t.id, title: t.title, keywords: t.keywords || [],
        relatedTopics: t.relatedTopics || [], image: t.image ? SBC_PHOTO_BASE + t.image : "",
        questions: t.questions, custom: false });
    }
  }
  for (const t of state.customTopics) {
    list.push({ id: t.id, title: t.title, keywords: t.keywords || [],
      relatedTopics: [], image: t.image || "",
      questions: t.questions, custom: true });
  }
  return list;
}
function oralTopicById(id) {
  return allOralTopics().find((t) => t.id === id) || null;
}
function oralTopicTitle(id) {
  const t = oralTopicById(id);
  return t ? t.title : id;
}

function renderOralTopics() {
  const grid = $("oralTopicGrid");
  if (!grid) return;
  const today = todayKey();
  const topics = allOralTopics();
  if (!topics.length) {
    grid.innerHTML = '<p class="muted">Loading topics…</p>';
    return;
  }
  grid.innerHTML = topics.map((t) => {
    const rec = (state.mastery.oral || {})[t.id];
    const due = isDue(rec, today) && rec;
    const mastered = isMasteredOral(rec);
    const img = t.image
      ? '<img src="' + esc(t.image) + '" alt="" loading="lazy" onerror="tpImgFallback(this)">'
      : '<div style="height:130px;background:#eef2f8;display:flex;align-items:center;justify-content:center;color:#667085">No picture</div>';
    return '<button type="button" class="topic-card" data-topic="' + esc(t.id) + '">' + img +
      '<span class="tc-body"><span class="tc-title">' + esc(t.title) + "</span>" +
      (t.relatedTopics.length ? '<span class="tc-tags">' + esc(t.relatedTopics.slice(0, 3).join(" · ")) + "</span>" : "") +
      (t.custom ? '<span class="tc-tags">Your picture</span>' : "") +
      (due ? '<span class="tc-due">Due for practice</span>'
        : mastered ? '<span class="tc-tags">★ Mastered</span>' : "") +
      "</span></button>";
  }).join("");
  grid.querySelectorAll("[data-topic]").forEach((b) => {
    b.addEventListener("click", () => {
      const topic = oralTopicById(b.dataset.topic);
      if (topic) startOralTopic(topic, oral.mode === "drill" ? "mock" : oral.mode);
    });
  });
  renderOralDueHint();
}
function renderOralDueHint() {
  const el = $("oralDueHint");
  if (!el) return;
  const today = todayKey();
  const topics = allOralTopics();
  const due = topics.filter((t) => {
    const rec = (state.mastery.oral || {})[t.id];
    return rec && isDue(rec, today);
  });
  const next = due[0] || topics.find((t) => !(state.mastery.oral || {})[t.id]);
  if (!next) { el.textContent = ""; return; }
  el.innerHTML = "Suggested next: " + esc(next.title) +
    ' <button class="btn small" type="button" id="oralDueBtn">Practise it</button>';
  $("oralDueBtn").addEventListener("click", () => startOralTopic(next, oral.mode === "drill" ? "mock" : oral.mode));
}

/* Question picking: mock = picture + one experience + one opinion;
   practice = all 5; drill = 5 of one type across random topics. */
function pickMockQuestions(topic) {
  const qs = topic.questions.slice();
  const byType = (t) => qs.find((q) => q.type === t);
  const picked = [];
  const take = (q) => { if (q && !picked.includes(q)) picked.push(q); };
  take(byType("picture"));
  take(byType("experience"));
  take(byType("opinion"));
  take(byType("evaluative"));
  for (const q of qs) { if (picked.length >= 3) break; take(q); }
  return picked.slice(0, 3).map((q) => Object.assign({}, q, {
    topicId: topic.id, topicTitle: topic.title, image: topic.image }));
}
function pickPracticeQuestions(topic) {
  return topic.questions.map((q) => Object.assign({}, q, {
    topicId: topic.id, topicTitle: topic.title, image: topic.image }));
}
function pickDrillQuestions(type) {
  const topics = shuffle(allOralTopics().filter((t) => t.questions.some((q) => q.type === type)));
  const out = [];
  for (const t of topics) {
    if (out.length >= 5) break;
    const q = t.questions.find((x) => x.type === type);
    if (q) out.push(Object.assign({}, q, { topicId: t.id, topicTitle: t.title, image: t.image }));
  }
  return out;
}

function oralModeLabel() {
  if (oral.mode === "mock") return "Mock exam";
  if (oral.mode === "practice") return "One-topic practice";
  if (oral.mode === "drill") return "One question type";
  return "Try again";
}

function startOralTopic(topic, mode) {
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  if (!topic || !topic.questions || !topic.questions.length) { alert("This topic has no questions."); return; }
  oral.mode = mode;
  oral.topic = topic;
  oral.questions = mode === "mock" ? pickMockQuestions(topic) : pickPracticeQuestions(topic);
  oral.answers = [];
  oral.aiSbcMarks = [];
  oral.sessionKey = "oral-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  $("oralReviewCard").classList.add("hidden");
  $("oralChatCard").classList.add("hidden");
  showOralPrep();
}
function startOralDrill() {
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const type = $("oralDrillType").value;
  const questions = pickDrillQuestions(type);
  if (questions.length < 2) { alert("Not enough " + (ORAL_TYPE_LABELS[type] || type) + " questions yet."); return; }
  oral.mode = "drill";
  oral.topic = null;
  oral.questions = questions;
  oral.answers = [];
  oral.aiSbcMarks = [];
  oral.sessionKey = "oral-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  $("oralReviewCard").classList.add("hidden");
  $("oralPrepCard").classList.add("hidden");
  beginOralConversation();
}
function retryOralQuestion(answer) {
  if (!currentProfile()) { alert("Add a pupil profile first (top right)."); return; }
  const topic = oralTopicById(answer.topicId);
  oral.mode = "retry";
  oral.topic = topic;
  oral.questions = [Object.assign({}, {
    q: answer.q, type: answer.type, model: answer.model || "",
    topicId: answer.topicId, topicTitle: answer.topicTitle, image: topic ? topic.image : "" })];
  oral.answers = [];
  oral.aiSbcMarks = [];
  oral.sessionKey = "oral-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  $("oralReviewCard").classList.add("hidden");
  $("oralPrepCard").classList.add("hidden");
  beginOralConversation();
}

/* ---- preparation ---- */
function showOralPrep() {
  const topic = oral.topic;
  $("oralPrepTitle").textContent = topic.title + " — " + oralModeLabel();
  const img = $("oralPrepImg");
  if (topic.image) { img.onerror = function () { tpImgFallback(img); }; img.src = topic.image; img.classList.remove("hidden"); }
  else img.classList.add("hidden");
  $("oralPrepKeywords").textContent = topic.keywords.length
    ? "Words that may help: " + topic.keywords.join(", ") : "";
  $("oralPrepHints").innerHTML = [
    "What is happening in the picture? Who is there, and what are they doing?",
    "A time when you did something like this yourself.",
    "One good thing about it — and one problem.",
  ].map((h) => "<li>" + esc(h) + "</li>").join("");
  renderOralPhrases();
  $("oralPrepCard").classList.remove("hidden");
  $("oralPrepCard").scrollIntoView({ behavior: "smooth", block: "start" });
  startOralPrepTimer();
}
function renderOralPhrases() {
  const s = (state.sbc && state.sbc.starters) || {};
  const groups = [
    ["Answer in PEEL", s.peel || []],
    ["Describe the picture", s.describe || []],
    ["Start your answer", s.answer || []],
    ["Give your ideas", s.ideas || []],
    ["Give your opinion", s.opinion || []],
    ["Tell about a time", s.experience || []],
    ["Finish your answer", s.conclude || []],
  ];
  $("oralPhrasesList").innerHTML = groups.filter(([, items]) => items.length).map(([label, items]) =>
    "<h4>" + esc(label) + "</h4><ul>" + items.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>").join("");
}
function startOralPrepTimer() {
  if (oral.prepTimer) clearInterval(oral.prepTimer);
  oral.prepLeft = state.oralSettings.prepSeconds || 120;
  const el = $("oralPrepTimer");
  const tick = () => {
    const m = Math.floor(oral.prepLeft / 60);
    const s = oral.prepLeft % 60;
    el.textContent = "⏱ " + m + ":" + String(s).padStart(2, "0");
    el.classList.toggle("low", oral.prepLeft <= 30);
    if (oral.prepLeft <= 0) {
      clearInterval(oral.prepTimer);
      oral.prepTimer = null;
      el.textContent = "⏱ Time's up — start when you are ready.";
    } else {
      oral.prepLeft--;
    }
  };
  tick();
  oral.prepTimer = setInterval(tick, 1000);
}
function stopOralPrepTimer() {
  if (oral.prepTimer) { clearInterval(oral.prepTimer); oral.prepTimer = null; }
}

/* ---- conversation ---- */
function beginOralConversation() {
  stopOralPrepTimer();
  stopSpeaking();
  $("oralPrepCard").classList.add("hidden");
  $("oralReviewCard").classList.add("hidden");
  $("oralChatCard").classList.remove("hidden");
  $("oralChatTitle").textContent = oral.topic ? oral.topic.title : "One question type — " + (ORAL_TYPE_LABELS[$("oralDrillType").value] || "");
  $("oralChatMode").textContent = "· " + oralModeLabel();
  $("oralThread").innerHTML = "";
  oral.idx = 0;
  $("oralChatCard").scrollIntoView({ behavior: "smooth", block: "start" });
  askOralQuestion();
}
function oralChatMsg(who, text, cls) {
  const thread = $("oralThread");
  const div = document.createElement("div");
  div.className = "chat-msg " + cls;
  div.innerHTML = '<span class="who">' + esc(who) + "</span>" + esc(text);
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return div;
}
async function askOralQuestion() {
  const q = oral.questions[oral.idx];
  oral.currentQ = q;
  oral.followUpAsked = false;
  oral.pendingTranscript = "";
  oral.transcript = "";
  const img = $("oralChatImg");
  if (q.image) { img.onerror = function () { tpImgFallback(img); }; img.src = q.image; img.classList.remove("hidden"); }
  else img.classList.add("hidden");
  $("oralTypedInput").value = "";
  $("oralLiveTranscript").textContent = "";
  $("oralLiveTranscript").classList.add("hidden");
  $("oralListenStatus").textContent = "";
  $("oralDoneBtn").classList.remove("hidden");
  $("oralMicBtn").disabled = false;
  $("oralStopMicBtn").classList.add("hidden");
  $("oralMicBtn").textContent = "🎤 Answer by speaking";
  oralChatMsg("Examiner", q.q, "examiner");
  await speakText(q.q, { rate: 0.9 });
  $("oralListenStatus").textContent = "Your turn — speak or type your answer, then tap “Done”.";
  $("oralTypedInput").focus();
}
async function askOralFollowup(text) {
  oralChatMsg("Examiner", text, "examiner followup");
  await speakText(text, { rate: 0.9 });
  $("oralListenStatus").textContent = "Your turn — add more, then tap “Done”.";
}

/* Audio recording: MediaRecorder on this laptop only. If it cannot
   start (no mic permission, no MediaRecorder), answering still works. */
async function oralStartRecording() {
  if (!state.oralSettings.saveAudio) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(500);
    oral.recorder = { rec, chunks, stream };
  } catch (err) { oral.recorder = null; }
}
function oralStopRecording() {
  return new Promise((resolve) => {
    const r = oral.recorder;
    oral.recorder = null;
    if (!r) { resolve(null); return; }
    let done = false;
    const finish = (blob) => { if (!done) { done = true; resolve(blob); } };
    r.rec.onstop = () => {
      try { r.stream.getTracks().forEach((t) => t.stop()); } catch (err) { /* ignore */ }
      finish(r.chunks.length ? new Blob(r.chunks, { type: r.rec.mimeType || "audio/webm" }) : null);
    };
    try { r.rec.stop(); } catch (err) { finish(null); }
    setTimeout(() => finish(null), 3000);
  });
}
async function uploadOralAudio(blob, qnum) {
  if (guestMode) return URL.createObjectURL(blob); // guest: audio stays in this browser only
  const uid = await sbUserId();
  const ext = (blob.type || "audio/webm").indexOf("mp4") >= 0 ? "mp4" : "webm";
  const path = uid + "/" + state.currentProfileId + "/" + Date.now() + "-q" + qnum + "." + ext;
  const { error } = await sbClient.storage.from("audio").upload(path, blob, {
    contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw new Error(error.message);
  return sbClient.storage.from("audio").getPublicUrl(path).data.publicUrl;
}

function oralMicStart() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("oralListenStatus").textContent = "This browser has no speech recognition — type your answer instead.";
    return;
  }
  stopSpeaking();
  oral.answering = true;
  oral.transcript = "";
  oral.recogRestarts = 0;
  $("oralMicBtn").disabled = true;
  $("oralStopMicBtn").classList.remove("hidden");
  $("oralLiveTranscript").classList.remove("hidden");
  $("oralLiveTranscript").textContent = "";
  $("oralListenStatus").textContent = "Listening… speak your answer, then tap “Stop speaking”.";
  oralStartRecording();
  const rec = new SR();
  oral.rec = rec;
  rec.lang = "en-SG";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) oral.transcript += (oral.transcript ? " " : "") + text;
      } else {
        interim += r[0].transcript;
      }
    }
    $("oralLiveTranscript").textContent = (oral.transcript + " " + interim).trim();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("oralListenStatus").textContent = "Microphone blocked — allow microphone access in Chrome and try again, or type your answer.";
      oralMicStop(false);
    }
  };
  rec.onend = () => {
    if (oral.answering && oral.recogRestarts < 5) {
      oral.recogRestarts++;
      try { rec.start(); } catch (err) { /* ignore */ }
    }
  };
  try { rec.start(); } catch (err) {
    $("oralListenStatus").textContent = "Could not start the microphone. Type your answer instead.";
    oralMicStop(false);
  }
}
function oralMicStop(showDone) {
  oral.answering = false;
  if (oral.rec) {
    try { oral.rec.onend = null; oral.rec.stop(); } catch (err) { /* ignore */ }
    oral.rec = null;
  }
  $("oralMicBtn").disabled = false;
  $("oralMicBtn").textContent = "🎤 Answer by speaking";
  $("oralStopMicBtn").classList.add("hidden");
  if (showDone !== false) $("oralListenStatus").textContent = "Tap “Done” when your answer is finished.";
}

/* ---- scoring, gaps and the stronger version (offline) ---- */
function oralKeywordsHit(transcript, topic) {
  const words = new Set(tokenize(transcript.toLowerCase()).map(normWord));
  const keys = (topic && topic.keywords) || (oral.topic && oral.topic.keywords) || [];
  return keys.filter((k) => words.has(normWord(k))).length;
}
function scoreOralAnswer(q, transcript, topic) {
  const words = wordCount(transcript);
  const kw = oralKeywordsHit(transcript, topic);
  const hasReason = ORAL_REASON_RE.test(transcript);
  const hasExample = ORAL_EXAMPLE_RE.test(transcript);
  const hasClosing = ORAL_CLOSING_RE.test(transcript) || ORAL_DETAIL_RE.test(transcript);
  let score = 0;
  if (words >= 40) score += 1;
  else if (words >= 20) score += 0.5;
  if (kw >= 1) score += 1;
  if (hasReason) score += 1;
  if (hasExample) score += 1;
  if (hasClosing) score += 1;
  score = Math.min(5, Math.round(score * 2) / 2);
  return { score, words, kw, hasReason, hasExample, hasClosing };
}
function oralPreciseWord(model, transcript) {
  if (!model) return null;
  const low = transcript.toLowerCase();
  for (const w of ORAL_PRECISE) {
    if (model.toLowerCase().includes(w) && !low.includes(w)) return w;
  }
  return null;
}
function gapsForAnswer(q, transcript, topic, scored) {
  const gaps = [];
  const low = transcript.toLowerCase();
  if (scored.words < 20) {
    gaps.push("Your answer was " + scored.words + " words. A strong answer is usually 3–5 sentences (about 40–80 words).");
  }
  if (!scored.hasReason) {
    gaps.push("You said what you think, but didn't say why. Add a reason with “because”.");
  }
  if (q.type !== "picture" && !scored.hasExample) {
    if (q.type === "experience") {
      gaps.push("This question asks for a time when you did it. Tell a short story — what happened first, then what happened next.");
    } else {
      gaps.push("You gave an opinion but no example. Add “For example, once…”");
    }
  }
  for (const v of ORAL_VAGUE) {
    if (new RegExp("\\b" + v + "\\b").test(low)) {
      const better = oralPreciseWord(q.model, transcript);
      gaps.push(better
        ? "You said “" + v + "” — try a stronger, more exact word like “" + better + "”."
        : "You said “" + v + "” — try a stronger, more exact word (for example, “enjoyable” instead of “fun”).");
      break;
    }
  }
  if (scored.kw === 0 && scored.words >= 10) {
    gaps.push("The question asked about “" + (q.topicTitle || "this picture") + "”, but your answer did not mention it. Stay on the topic.");
  }
  if (!scored.hasClosing && scored.words >= 30) {
    gaps.push("End with a closing line, for example “In conclusion, …”.");
  }
  return gaps.slice(0, 3);
}
function praiseForAnswer(q, transcript, topic, scored) {
  const praise = [];
  if (scored.words >= 40) praise.push("A good length — you said enough to answer properly.");
  if (scored.kw >= 1) praise.push("You used the topic words well.");
  if (scored.hasReason) praise.push("You gave a clear reason with “because”.");
  if (scored.hasExample) praise.push("Your example made the answer real.");
  if (scored.hasClosing) praise.push("You finished with a clear closing line.");
  const precise = ORAL_PRECISE.find((w) => new RegExp("\\b" + w + "\\b").test(transcript.toLowerCase()));
  if (precise) praise.push("You used a strong word — “" + precise + "”.");
  if (!praise.length) praise.push("You answered the question — a good start.");
  return praise.slice(0, 2);
}
/* The stronger version: the pack's model answer when there is one
   (learn the ideas, do not memorise it); otherwise a template built
   from the child's own words, re-ordered with connectors and a closing. */
function offlineRefined(q, transcript) {
  if (q.model && q.model.trim()) {
    return { refined: q.model.trim(),
      note: "This is the strong answer from the Oral Pack. Learn its ideas and words — do not memorise it word for word." };
  }
  const sents = splitSentences(transcript);
  if (!sents.length) return { refined: "", note: "" };
  const parts = sents.slice();
  if (parts.length >= 2 && !/^(first|firstly|second|also|moreover|however|for example)/i.test(parts[1])) {
    parts[1] = "Firstly, " + parts[1].charAt(0).toLowerCase() + parts[1].slice(1);
  }
  if (!ORAL_CLOSING_RE.test(transcript)) {
    const first = parts[0].replace(/[.!?]+$/, "");
    parts.push("In conclusion, " + first.charAt(0).toLowerCase() + first.slice(1) + ".");
  }
  return { refined: parts.join(" "),
    note: "A stronger version, built from your own words — the ideas are yours, put in the 4-part order: answer, reasons, example, closing line." };
}

async function fetchAiOral(payload) {
  const provider = "gemini";
  const model = (state.ai.model || "").trim() || AI_DEFAULT_MODELS[provider];
  const j = await callAiFunction({ action: "oral", provider, model, payload });
  if (!j.ok) throw new Error(j.error || "AI oral feedback failed");
  return j;
}

/* ---- finishing one answer ---- */
async function finishOralAnswer() {
  if (oral.answering) oralMicStop(false);
  const typed = $("oralTypedInput").value.trim();
  let text = (oral.transcript || "").trim();
  if (typed) text = text ? text + " " + typed : typed;
  if (!text) { alert("Say or type your answer first."); return; }
  const fullText = oral.pendingTranscript ? oral.pendingTranscript + " " + text : text;
  const q = oral.currentQ;
  const topic = oralTopicById(q.topicId) || oral.topic;
  // Save the recording first (best effort — a failed upload never blocks the answer).
  const blob = await oralStopRecording();
  let audioFile = null;
  if (blob) {
    try { audioFile = await uploadOralAudio(blob, oral.idx + 1); }
    catch (err) { /* audio stays unrecorded; the transcript still counts */ }
  }
  // Practice mode: one gentle follow-up when the answer is too short or
  // has none of the topic words. Mock mode stays silent like a real exam.
  if (oral.mode === "practice" && !oral.followUpAsked) {
    const words = wordCount(fullText);
    const kw = oralKeywordsHit(fullText, topic);
    if (words < 15 || kw === 0) {
      oral.followUpAsked = true;
      oral.pendingTranscript = fullText;
      oral.transcript = "";
      $("oralTypedInput").value = "";
      $("oralLiveTranscript").textContent = "";
      const fu = ORAL_FOLLOWUPS[Math.floor(Math.random() * ORAL_FOLLOWUPS.length)];
      await askOralFollowup(fu);
      return;
    }
  }
  oralChatMsg("You", fullText, "child");
  $("oralListenStatus").textContent = "Checking your answer…";
  $("oralDoneBtn").disabled = true;
  const scored = scoreOralAnswer(q, fullText, topic);
  const off = offlineRefined(q, fullText);
  const record = {
    q: q.q, type: q.type, model: q.model || "", topicId: q.topicId,
    topicTitle: q.topicTitle, transcript: fullText, words: scored.words,
    score: scored.score, refined: off.refined, refinedNote: off.note,
    gaps: gapsForAnswer(q, fullText, topic, scored),
    praise: praiseForAnswer(q, fullText, topic, scored),
    audioFile: audioFile, attempts: oral.pendingTranscript ? 2 : 1,
  };
  // AI feedback is on by default (same key as AI marking; text only, never audio).
  if (state.ai.keySaved) {
    try {
      const j = await fetchAiOral({
        question: q.q, qtype: q.type, topicTitle: q.topicTitle,
        transcript: fullText, modelAnswer: q.model || "",
        history: kidHistorySummary(),
      });
      record.aiFeedback = j.ai;
      record.aiProvider = j.provider;
      if (typeof j.ai.mark25 === "number") oral.aiSbcMarks.push(j.ai.mark25);
    } catch (err) {
      record.aiError = err.message || "AI feedback failed";
    }
  }
  oral.answers.push(record);
  oral.pendingTranscript = "";
  $("oralDoneBtn").disabled = false;
  oral.idx++;
  if (oral.idx >= oral.questions.length) finishOral();
  else askOralQuestion();
}

/* ---- finishing the round ---- */
function oralSbcMark() {
  const total = oral.answers.reduce((s, a) => s + (a.score || 0), 0);
  const n = oral.answers.length;
  if (n === 0) return 0;
  if (n === 3) return Math.round(total / 15 * 25);
  if (n === 1) return Math.round(total / 5 * 25);
  return Math.round(total); // 5 questions = 25 already
}
async function finishOral() {
  $("oralChatCard").classList.add("hidden");
  stopSpeaking();
  const sbcMark = oralSbcMark();
  const aiMark = oral.aiSbcMarks.length
    ? Math.round(oral.aiSbcMarks.reduce((a, b) => a + b, 0) / oral.aiSbcMarks.length) : null;
  const mode = oral.mode;
  const topicId = oral.topic ? oral.topic.id : null;
  const topicTitle = oral.topic ? oral.topic.title
    : "One question type — " + (ORAL_TYPE_LABELS[$("oralDrillType").value] || "");
  const saved = await saveSession({
    kind: "oral", mode, topicId, topicTitle, sbcMark, aiSbcMark,
    answers: oral.answers,
  });
  // Spaced repetition: a mock mark of 15+ (or a per-answer average of 3.5+)
  // counts as a correct review for the topic(s) practised.
  if (mode === "drill") {
    const byTopic = {};
    for (const a of oral.answers) {
      byTopic[a.topicId] = byTopic[a.topicId] || [];
      byTopic[a.topicId].push(a.score);
    }
    for (const [tid, scores] of Object.entries(byTopic)) {
      updateOralMastery(tid, scores.reduce((x, y) => x + y, 0) / scores.length >= 3.5);
    }
  } else if (topicId) {
    updateOralMastery(topicId, mode === "retry"
      ? (oral.answers[0] && oral.answers[0].score >= 3.5)
      : sbcMark >= 15);
  }
  saveMastery();
  renderOralReview({ topicTitle, mode, sbcMark, aiSbcMark, answers: oral.answers, saved: !!saved });
  renderOralTopics();
}
function renderOralReview(round) {
  $("oralReviewTitle").textContent = round.topicTitle + " — " + oralModeLabel();
  const stars = round.sbcMark >= 20 ? 3 : round.sbcMark >= 15 ? 2 : round.sbcMark >= 10 ? 1 : 0;
  $("oralReviewSummary").innerHTML =
    '<div class="stars">' + starText(stars) + "</div>" +
    '<div class="score-grid">' +
    '<div class="score-box"><div class="num">' + round.sbcMark + '/25</div><div class="lbl">SBC mark</div></div>' +
    (round.aiSbcMark != null
      ? '<div class="score-box"><div class="num">' + round.aiSbcMark + '/25</div><div class="lbl">AI SBC mark</div></div>' : "") +
    "</div>" +
    '<p class="muted small">The SBC mark is out of 25, like the real PSLE oral. Fluency — how it sounded — cannot be judged from the written transcript, so listen back to your recording and ask a parent to check your pace and pronunciation.</p>';
  $("oralReviewList").innerHTML = round.answers.map((a, i) => {
    const ai = a.aiFeedback;
    return '<div class="review-item"><h3>Question ' + (i + 1) + " — " + esc(ORAL_TYPE_LABELS[a.type] || a.type) + "</h3>" +
      "<p><strong>Examiner:</strong> " + esc(a.q) + "</p>" +
      '<div class="score-grid"><div class="score-box"><div class="num">' + a.score + '/5</div><div class="lbl">answer score</div></div>' +
      (ai && typeof ai.mark25 === "number"
        ? '<div class="score-box"><div class="num">' + ai.mark25 + '/25</div><div class="lbl">AI mark (this answer)</div></div>' : "") +
      "</div>" +
      (a.audioFile ? '<audio class="answer-audio" controls src="' + esc(a.audioFile) + '"></audio>' : "") +
      '<div class="vs-grid">' +
      '<div class="vs-box you"><span class="vs-label">YOU SAID (' + a.words + ' words' + (a.attempts > 1 ? ", after a follow-up" : "") + ')</span>' + esc(a.transcript) + "</div>" +
      '<div class="vs-box stronger"><span class="vs-label">A STRONGER VERSION</span>' + esc(a.refined || "—") + "</div>" +
      "</div>" +
      (a.refinedNote ? '<p class="muted small">' + esc(a.refinedNote) + "</p>" : "") +
      "<h4>What went well</h4><ul class=\"praise-list\">" +
      a.praise.map((p) => "<li>★ " + esc(p) + "</li>").join("") + "</ul>" +
      (a.gaps.length
        ? "<h4>Try this next time</h4><ul class=\"gap-list\">" +
          a.gaps.map((g) => "<li>" + esc(g) + "</li>").join("") + "</ul>"
        : "<p><strong>No gaps — well done!</strong></p>") +
      (ai
        ? '<div class="ai-box"><h4>🤖 AI feedback (' + esc(AI_PROVIDER_NAMES[a.aiProvider] || "AI") + ")</h4>" +
          "<p><strong>What went well:</strong></p><ul>" +
          ai.strengths.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
          "<p><strong>Try this next time:</strong></p><ul>" +
          ai.gaps.map((g) => "<li>" + esc(g) + "</li>").join("") + "</ul>" +
          (ai.nextSteps && ai.nextSteps.length
            ? "<p><strong>What to work on next:</strong></p><ul>" +
              ai.nextSteps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") +
          "<p class=\"small\">Relevance " + ai.relevance + "/5 · Elaboration " + ai.elaboration +
          "/5 · Vocabulary " + ai.vocabulary + "/5 · Grammar " + ai.grammar + "/5</p>" +
          "<p class=\"small\">AI refined version: “" + esc(ai.refined) + "”</p></div>"
        : a.aiError
          ? '<p class="muted small">AI feedback was not available (' + esc(a.aiError) + "). The offline feedback above still counts.</p>"
          : "") +
      '<p><button type="button" class="btn small" data-retry="' + i + '">↻ Try this question again</button></p>' +
      "</div>";
  }).join("");
  $("oralReviewList").querySelectorAll("[data-retry]").forEach((b) => {
    b.addEventListener("click", () => retryOralQuestion(round.answers[parseInt(b.dataset.retry, 10)]));
  });
  $("oralReviewCard").classList.remove("hidden");
  $("oralReviewCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---- Settings tab: Oral Partner settings + picture topics ---- */
function renderOralSettings() {
  const s = state.oralSettings || { prepSeconds: 120, saveAudio: true };
  $("oralPrepSeconds").value = String(s.prepSeconds || 120);
  $("oralSaveAudio").checked = !!s.saveAudio;
}
async function saveOralSettings() {
  const prep = parseInt($("oralPrepSeconds").value, 10) || 120;
  const saveAudio = $("oralSaveAudio").checked;
  $("oralSettingsStatus").textContent = "Saving…";
  try {
    const j = await apiPost("/api/settings", { oralPrepSeconds: prep, oralSaveAudio: saveAudio });
    state.oralSettings = {
      prepSeconds: j.settings.oralPrepSeconds || 120,
      saveAudio: j.settings.oralSaveAudio !== false,
    };
    $("oralSettingsStatus").textContent = "Saved.";
  } catch (err) {
    $("oralSettingsStatus").textContent = "Could not save: " + err.message;
  }
}
async function loadOralData() {
  try {
    const [sbc, customs, settings] = await Promise.all([
      fetch("content/sbc_topics.json").then((r) => r.json()),
      apiGet("/api/custom-topics"),
      apiGet("/api/settings"),
    ]);
    state.sbc = sbc;
    state.customTopics = customs.customTopics || [];
    if (settings.settings) {
      state.oralSettings = {
        prepSeconds: settings.settings.oralPrepSeconds || 120,
        saveAudio: settings.settings.oralSaveAudio !== false,
      };
    }
  } catch (err) {
    // Oral Partner is a bonus; the rest of the app must still load.
    state.sbc = null;
  }
  renderOralTopics();
  renderOralSettings();
}
function initOral() {
  document.querySelectorAll(".mode-tab").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-tab").forEach((x) => x.classList.toggle("active", x === b));
      oral.mode = b.dataset.mode;
      $("oralDrillPicker").classList.toggle("hidden", oral.mode !== "drill");
      $("oralSurpriseBtn").classList.toggle("hidden", oral.mode === "drill");
      $("oralTopicGrid").classList.toggle("hidden", oral.mode === "drill");
    });
  });
  $("oralSurpriseBtn").addEventListener("click", () => {
    const topics = allOralTopics();
    if (!topics.length) return;
    const today = todayKey();
    const due = topics.filter((t) => {
      const rec = (state.mastery.oral || {})[t.id];
      return rec && isDue(rec, today);
    });
    const pool = due.length ? due : topics;
    startOralTopic(pool[Math.floor(Math.random() * pool.length)], oral.mode);
  });
  $("oralDrillStartBtn").addEventListener("click", startOralDrill);
  $("oralStartBtn").addEventListener("click", beginOralConversation);
  $("oralPrepCancelBtn").addEventListener("click", () => {
    stopOralPrepTimer();
    $("oralPrepCard").classList.add("hidden");
  });
  $("oralMicBtn").addEventListener("click", oralMicStart);
  $("oralStopMicBtn").addEventListener("click", () => oralMicStop(true));
  $("oralRepeatBtn").addEventListener("click", () => {
    if (oral.currentQ) speakText(oral.currentQ.q, { rate: 0.9 });
  });
  $("oralDoneBtn").addEventListener("click", finishOralAnswer);
  $("oralTypedInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finishOralAnswer();
  });
  $("oralAgainBtn").addEventListener("click", () => {
    $("oralReviewCard").classList.add("hidden");
    $("oralChatCard").classList.add("hidden");
    document.querySelector('#tabs button[data-tab="oral"]').click();
  });
  $("oralFinishBtn").addEventListener("click", () => {
    document.querySelector('#tabs button[data-tab="progress"]').click();
  });
  $("saveOralSettingsBtn").addEventListener("click", saveOralSettings);
}

/* ---------------- Progress ---------------- */
function computeStreak(sessions) {
  const days = new Set(sessions.map((s) => todayKey(new Date(s.createdAt))));
  let streak = 0;
  const d = new Date();
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(todayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function weekStart(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function renderProgress() {
  const p = currentProfile();
  if (!p) {
    $("progressContent").innerHTML = '<p class="muted">Add a pupil profile first.</p>';
    return;
  }
  const s = state.sessions;
  const reading = s.filter((x) => x.kind === "reading");
  const typing = s.filter((x) => x.kind === "typing");
  const vocab = s.filter((x) => x.kind === "vocab");
  const spellS = s.filter((x) => x.kind === "spell");
  const grammarS = s.filter((x) => x.kind === "grammar");
  const oralS = s.filter((x) => x.kind === "oral");
  const bestMark = reading.length ? Math.max(...reading.map((x) => x.mark || 0)) : 0;
  const bestWpm = typing.length ? Math.max(...typing.map((x) => x.wpm || 0)) : 0;
  const bestQuiz = vocab.length ? Math.max(...vocab.map((x) => x.accuracy || 0)) : 0;
  const bestSpell = spellS.length ? Math.max(...spellS.map((x) => x.accuracy || 0)) : 0;
  const bestGrammar = grammarS.length ? Math.max(...grammarS.map((x) => x.accuracy || 0)) : 0;
  const bestSbc = oralS.length ? Math.max(...oralS.map((x) => x.sbcMark || 0)) : 0;
  const streak = computeStreak(s);
  const awards = [
    { name: "3-Star Reader", desc: "PSLE mark 8 or more", earned: bestMark >= 8 },
    { name: "Bookworm", desc: "10 reading sessions", earned: reading.length >= 10 },
    { name: "7-Day Streak", desc: "Practised 7 days in a row", earned: streak >= 7 },
    { name: "Typing Ace", desc: "40 words per minute in a typing game", earned: bestWpm >= 40 },
    { name: "Perfect Quiz", desc: "100% in a meaning quiz", earned: bestQuiz >= 100 },
    { name: "Spelling Star", desc: "90% or more in Listen & Spell", earned: bestSpell >= 90 },
    { name: "Grammar Star", desc: "100% in a grammar quiz", earned: bestGrammar >= 100 },
    { name: "Oral Star", desc: "SBC mark 20 or more in Oral Partner", earned: bestSbc >= 20 },
  ];
  // weekly report (Mon–Sun of this week)
  const ws = weekStart(new Date());
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekRows = dayNames.map((name, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    const key = todayKey(d);
    const daySessions = s.filter((x) => todayKey(new Date(x.createdAt)) === key);
    const dayMarks = daySessions.filter((x) => x.kind === "reading").map((x) => x.mark);
    const best = dayMarks.length ? Math.max(...dayMarks) : null;
    return { name, n: daySessions.length, best };
  });
  const weekMax = Math.max(1, ...weekRows.map((r) => r.n));
  // monthly report (weeks of this month, Monday-start)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthWeeks = [];
  let wStart = weekStart(monthStart);
  while (wStart.getMonth() <= now.getMonth() || wStart <= now) {
    if (wStart > now) break;
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const n = s.filter((x) => {
      const t = new Date(x.createdAt);
      return t >= wStart && t < wEnd;
    }).length;
    const label = wStart.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
      " – " + new Date(wEnd.getTime() - 86400000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    monthWeeks.push({ label, n });
    wStart = wEnd;
    if (monthWeeks.length > 6) break;
  }
  const monthMax = Math.max(1, ...monthWeeks.map((r) => r.n));
  const monthName = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  $("progressContent").innerHTML =
    '<div class="card"><h3>' + esc(p.name) + " (" + esc(p.level) + ") — at a glance</h3>" +
    '<div class="score-grid">' +
    '<div class="score-box"><div class="num">' + s.length + '</div><div class="lbl">practice sessions</div></div>' +
    '<div class="score-box"><div class="num">' + streak + '</div><div class="lbl">day streak</div></div>' +
    '<div class="score-box"><div class="num">' + (bestMark || "—") + (bestMark ? "/10" : "") + '</div><div class="lbl">best PSLE mark</div></div>' +
    '<div class="score-box"><div class="num">' + (bestWpm || "—") + '</div><div class="lbl">best typing WPM</div></div>' +
    '<div class="score-box"><div class="num">' + (bestQuiz ? bestQuiz + "%" : "—") + '</div><div class="lbl">best quiz score</div></div>' +
    '<div class="score-box"><div class="num">' + (bestSpell ? bestSpell + "%" : "—") + '</div><div class="lbl">best spelling score</div></div>' +
    '<div class="score-box"><div class="num">' + (bestSbc ? bestSbc + "/25" : "—") + '</div><div class="lbl">best SBC mark</div></div>' +
    "</div></div>" +
    '<div class="card"><h3>🤖 AI ideas to improve</h3>' +
    '<p class="muted">The AI reads all your results so far — reading, typing, words and Oral Partner — and suggests what to practise next.</p>' +
    '<div class="row"><button id="aiIdeasBtn" class="btn primary">Get AI ideas</button><span id="aiIdeasStatus" class="muted"></span></div>' +
    '<div id="aiIdeasResult"></div></div>' +
    '<div class="card"><h3>Awards</h3>' +
    awards.map((a) => '<span class="badge' + (a.earned ? "" : " locked") + '">' +
      (a.earned ? "★ " : "☆ ") + esc(a.name) + " — " + esc(a.desc) + "</span>").join("") + "</div>" +
    '<div class="card"><h3>This week (per day)</h3>' +
    weekRows.map((r) => '<div class="bar-row"><span class="bar-label">' + r.name + '</span>' +
      '<div class="bar" style="width:' + Math.round(r.n / weekMax * 180) + 'px"></div>' +
      '<span class="bar-num">' + r.n + " session" + (r.n === 1 ? "" : "s") +
      (r.best !== null ? " · best mark " + r.best + "/10" : "") + "</span></div>").join("") + "</div>" +
    '<div class="card"><h3>' + esc(monthName) + ' (per week)</h3>' +
    monthWeeks.map((r) => '<div class="bar-row"><span class="bar-label" style="width:130px">' + esc(r.label) + '</span>' +
      '<div class="bar" style="width:' + Math.round(r.n / monthMax * 180) + 'px"></div>' +
      '<span class="bar-num">' + r.n + " session" + (r.n === 1 ? "" : "s") + "</span></div>").join("") + "</div>" +
    masteryCardHtml() +
    '<div class="card"><h3>History</h3>' +
    (s.length ? '<table class="history"><tr><th>Date</th><th>What</th><th>Result</th></tr>' +
      s.slice(0, 50).map((x) => "<tr><td>" + fmtDate(x.createdAt) + "</td><td>" +
        esc(sessionLabel(x)) + "</td><td>" + esc(sessionResult(x)) + "</td></tr>").join("") + "</table>"
      : '<p class="muted">No sessions yet. Practise on the Read, Type or Words tabs and the results will appear here.</p>') +
    "</div>";
  const ideasBtn = $("aiIdeasBtn");
  if (ideasBtn) ideasBtn.addEventListener("click", getAiIdeas);
}
function sessionLabel(x) {
  if (x.kind === "reading") return "Reading — " + (x.passageTitle || "");
  if (x.kind === "typing") return (x.game || "Typing") + (x.passageTitle ? " — " + x.passageTitle : "");
  if (x.kind === "vocab") return "Meaning quiz — " + (x.unit || "");
  if (x.kind === "spell") return "Listen & Spell — " + (x.unit || "");
  if (x.kind === "grammar") return "Grammar quiz — " + (x.passageTitle || "");
  if (x.kind === "oral") return "Oral Partner — " + (x.topicTitle || "") + " (" + (x.mode || "mock") + ")";
  return x.kind || "Practice";
}
function sessionResult(x) {
  if (x.kind === "reading") return "Mark " + (x.mark || "—") + "/10 · " + (x.wpm || "—") + " wpm · " + (x.stars || 0) + "★" + (x.aiFeedback ? " · AI " + x.aiFeedback.mark + "/10" : "");
  if (x.kind === "typing") return "WPM " + (x.wpm != null ? x.wpm : "—") + " · " + (x.accuracy != null ? x.accuracy + "%" : "") + (x.points != null ? " · " + x.points + " pts" : "") + (x.score != null && x.wpm == null ? "Score " + x.score : "");
  if (x.kind === "vocab") return (x.score || 0) + "/" + (x.total || 0) + " · " + (x.accuracy || 0) + "%";
  if (x.kind === "spell") return (x.score || 0) + "/" + (x.total || 0) + " · " + (x.accuracy || 0) + "%";
  if (x.kind === "grammar") return (x.score || 0) + "/" + (x.total || 0) + " · " + (x.accuracy || 0) + "%";
  if (x.kind === "oral") return "SBC mark " + (x.sbcMark != null ? x.sbcMark : "—") + "/25" +
    (x.answers ? " · " + x.answers.map((a) => (a.score != null ? a.score : "—") + "/5").join(", ") : "") +
    (x.aiSbcMark != null ? " · AI " + x.aiSbcMark + "/25" : "");
  return "";
}

/* ---------------- Settings ---------------- */
function markingText() {
  return state.settings.markingRequirements || state.markingDefault;
}
function renderSettings() {
  $("markingEditor").value = markingText();
  $("markingDisplay").textContent = markingText();
  renderOralSettings();
  renderPasswordCard();
}
async function saveMarking() {
  const text = $("markingEditor").value;
  await apiPost("/api/settings/marking", { markingRequirements: text });
  state.settings.markingRequirements = text;
  $("markingDisplay").textContent = text;
  $("markingStatus").textContent = "Saved.";
}

/* ---------------- AI marking (on by default) ---------------- */
/* The API key lives on the server as a Supabase secret (Edge Function
   "ai-mark") and is never sent to, or shown on, this page. AI marking
   runs after reading and oral tests whenever the server key is set.
   No pupil data is kept in browser storage. */
const AI_DEFAULT_MODELS = { gemini: "gemini-3.8-flash" };
const AI_PROVIDER_NAMES = { gemini: "Gemini" };

async function callAiFunction(body) {
  // One call to the Supabase Edge Function "ai-mark". The function holds
  // the API keys as server secrets; the browser never sees them.
  const { data, error } = await sbClient.functions.invoke("ai-mark", { body });
  if (error) {
    const m = error.message || "AI service failed";
    if (/non-2xx/i.test(m)) {
      throw new Error("The AI service did not answer — the Edge Function may need redeploying in Supabase (Edge Functions → ai-mark → Deploy).");
    }
    throw new Error(m);
  }
  return data;
}

/* A short text summary of this pupil's progress so far, sent with AI
   calls so the feedback builds on what the pupil has already done —
   not just this one test. Compact on purpose: the AI prompt stays
   small and cheap. Works for signed-in pupils and guest trials alike
   (both keep their sessions in state). */
function kidHistorySummary() {
  const s = state.sessions || [];
  const p = currentProfile();
  const lines = [];
  if (p) lines.push("Pupil: " + p.name + " (" + p.level + ").");
  const reading = s.filter((x) => x.kind === "reading");
  if (reading.length) {
    const recent = reading.slice(0, 8);
    const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length));
    lines.push("Reading (latest " + recent.length + " of " + reading.length + "): " +
      recent.map((x) => (x.passageTitle || "passage") + " " + (x.mark != null ? x.mark : "—") + "/10, " + (x.wpm || "—") + " wpm, clarity " + (x.clarity != null ? x.clarity : "—") + "%, smoothness " + (x.smoothness != null ? x.smoothness : "—") + "%").join(" | "));
    lines.push("Reading averages: mark " + avg(recent.map((x) => x.mark || 0)) + "/10, " +
      avg(recent.map((x) => x.wpm || 0)) + " wpm, clarity " + avg(recent.map((x) => x.clarity || 0)) +
      "%, smoothness " + avg(recent.map((x) => x.smoothness || 0)) + "%.");
  } else {
    lines.push("No reading sessions yet.");
  }
  const oral = s.filter((x) => x.kind === "oral");
  if (oral.length) {
    lines.push("Oral Partner (latest " + Math.min(3, oral.length) + "): " +
      oral.slice(0, 3).map((x) => (x.topicTitle || "topic") + " " + (x.sbcMark != null ? x.sbcMark : "—") + "/25").join(" | "));
  } else {
    lines.push("No Oral Partner sessions yet.");
  }
  const typing = s.filter((x) => x.kind === "typing");
  if (typing.length) {
    const t = typing[0];
    lines.push("Typing: latest " + (t.game || "game") + " " + (t.wpm != null ? t.wpm + " wpm" : "") +
      (t.accuracy != null ? ", " + t.accuracy + "% accuracy" : "") +
      "; best typing " + Math.max.apply(null, typing.map((x) => x.wpm || 0)) + " wpm.");
  }
  const wordEntries = Object.keys(state.mastery.words || {});
  const masteredW = wordEntries.filter((k) => isMasteredWord(state.mastery.words[k])).length;
  const improvingW = wordEntries.filter((k) => !isMasteredWord(state.mastery.words[k])).slice(0, 5);
  lines.push("Vocabulary: " + masteredW + " words mastered, " + (wordEntries.length - masteredW) +
    " still improving" + (improvingW.length ? " (e.g. " + improvingW.join(", ") + ")" : "") + ".");
  return lines.join("\n");
}

async function fetchAiMark(payload) {
  const provider = "gemini";
  const model = (state.ai.model || "").trim() || AI_DEFAULT_MODELS[provider];
  const j = await callAiFunction({ action: "mark", provider, model, payload });
  if (!j.ok) throw new Error(j.error || "AI marking failed");
  return j; // {ai: {mark, strengths, improvements, nextSteps}, provider}
}

/* Ask the AI for a practice plan from the pupil's whole history. */
async function fetchAiPlan() {
  const provider = "gemini";
  const model = (state.ai.model || "").trim() || AI_DEFAULT_MODELS[provider];
  const j = await callAiFunction({ action: "plan", provider, model, payload: { history: kidHistorySummary() } });
  if (!j.ok) throw new Error(j.error || "AI ideas failed");
  return j; // {ai: {title, focus: [{area, activity}], encourage}, provider}
}
async function getAiIdeas() {
  const btn = $("aiIdeasBtn"), status = $("aiIdeasStatus"), out = $("aiIdeasResult");
  if (!btn || !status || !out) return;
  if (guestMode) {
    status.textContent = "AI ideas need your own account — sign up to use them. Guest trials use the local mark only.";
    return;
  }
  if (!state.ai.keySaved) {
    status.textContent = "AI ideas need the server key — add GEMINI_API_KEY in Supabase → Edge Functions → Secrets.";
    return;
  }
  btn.disabled = true;
  status.textContent = "Reading your progress…";
  try {
    const j = await fetchAiPlan();
    const a = j.ai || {};
    out.innerHTML = "<p><strong>" + esc(a.title || "Your practice plan") + "</strong></p>" +
      (a.focus || []).map((f) => "<p><strong>" + esc(f.area) + ":</strong> " + esc(f.activity) + "</p>").join("") +
      (a.encourage ? '<p class="muted">' + esc(a.encourage) + "</p>" : "");
    status.textContent = "";
  } catch (err) {
    status.textContent = "AI ideas were not available (" + (err.message || "AI failed") + ").";
  }
  btn.disabled = false;
}
/* ---------------- Add from file (PDF / photo / pasted text) ---------------- */
// A parent uploads a PDF or a photo of a page (or pastes text), the AI
// reads it and organises it into reading passages + new words, the parent
// checks the list, then saves the ticked items. PDFs are read in the
// browser with pdf.js (free, no AI needed); photos are read by Gemini
// vision through the Edge Function; organising always uses the AI, so
// this needs a signed-in pupil and the server key, like AI marking.
let importPreviewData = null;

function importSetStatus(msg) { if ($("importStatus")) $("importStatus").textContent = msg; }

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error("The PDF reader did not load — check the internet connection and try again.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = Math.min(pdf.numPages, 20);
  const chunks = [];
  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    chunks.push(tc.items.map((it) => it.str).join(" "));
  }
  return chunks.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Could not read that photo."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

async function importOrganise() {
  if (guestMode) { importSetStatus("This needs your own account — sign up to use it. Guest trials use the local mark only."); return; }
  const file = $("importFile").files[0];
  const pasted = $("importText").value.trim();
  if (!file && !pasted) { importSetStatus("Choose a PDF or photo, or paste some text first."); return; }
  const btn = $("importOrganiseBtn");
  btn.disabled = true;
  $("importSaveBtn").disabled = true;
  $("importSaveStatus").textContent = "";
  try {
    const provider = "gemini";
    const model = (state.ai.model || "").trim() || AI_DEFAULT_MODELS[provider];
    let text = "";
    const isPdf = file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
    if (isPdf) {
      importSetStatus("Reading the PDF in your browser…");
      text = await extractPdfText(file);
    } else if (file) {
      importSetStatus("Reading the photo with the AI…");
      const dataUrl = await downscaleImage(file);
      const r = await callAiFunction({ action: "extract", provider, model, image: dataUrl });
      if (!r.ok) throw new Error(r.error || "Could not read the photo.");
      text = (r.text || "").trim();
    } else {
      text = pasted;
    }
    if (!text || text.length < 20) { importSetStatus("I could not find enough text in that. Try a clearer photo or paste the text."); return; }
    importSetStatus("Organising it into passages and words… (" + text.length + " characters read)");
    const r = await callAiFunction({ action: "organise", provider, model, payload: { text } });
    if (!r.ok) throw new Error(r.error || "Organising failed.");
    importPreviewData = r.organised;
    renderImportPreview();
    const np = (r.organised.passages || []).length, nv = (r.organised.vocabulary || []).length;
    importSetStatus("Found " + np + " passage" + (np === 1 ? "" : "s") + " and " + nv + " word" + (nv === 1 ? "" : "s") + ". Tick what to keep, edit anything, then save.");
  } catch (err) {
    importSetStatus("Could not do that: " + (err.message || "AI failed") + ".");
  } finally {
    btn.disabled = false;
  }
}

function renderImportPreview() {
  const box = $("importPreview");
  const d = importPreviewData;
  if (!d) { box.innerHTML = ""; return; }
  let html = "";
  (d.passages || []).forEach((pg, i) => {
    html += '<div class="import-item"><label class="check"><input type="checkbox" class="import-p-check" data-i="' + i + '" checked> Keep this passage</label>'
      + '<div class="row"><input class="import-p-title" data-i="' + i + '" type="text" maxlength="80" value="' + esc(pg.title || "") + '">'
      + '<select class="import-p-level" data-i="' + i + '">' + ["P4", "P5", "P6"].map((l) => "<option" + (pg.level === l ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>"
      + '<textarea class="import-p-text" data-i="' + i + '" rows="5">' + esc(pg.text || "") + "</textarea></div>";
  });
  (d.vocabulary || []).forEach((v, i) => {
    html += '<div class="import-item import-vocab"><label class="check"><input type="checkbox" class="import-v-check" data-i="' + i + '" checked> Keep</label>'
      + '<input class="import-v-word" data-i="' + i + '" type="text" maxlength="80" value="' + esc(v.word || "") + '">'
      + '<input class="import-v-meaning" data-i="' + i + '" type="text" maxlength="150" value="' + esc(v.meaning || "") + '"></div>';
  });
  box.innerHTML = html || '<p class="muted">Nothing to save from that file.</p>';
  $("importSaveBtn").disabled = !((d.passages && d.passages.length) || (d.vocabulary && d.vocabulary.length));
}

async function importSave() {
  const d = importPreviewData;
  if (!d) return;
  const btn = $("importSaveBtn");
  btn.disabled = true;
  let savedP = 0, savedV = 0;
  try {
    for (const el of document.querySelectorAll(".import-p-check:checked")) {
      const i = el.dataset.i;
      const title = (document.querySelector('.import-p-title[data-i="' + i + '"]').value || "").trim();
      const text = (document.querySelector('.import-p-text[data-i="' + i + '"]').value || "").trim();
      if (!title || !text) continue;
      const j = await apiPost("/api/custom-passages", { title, text });
      state.customPassages = j.customPassages;
      savedP++;
    }
    for (const el of document.querySelectorAll(".import-v-check:checked")) {
      const i = el.dataset.i;
      const word = (document.querySelector('.import-v-word[data-i="' + i + '"]').value || "").trim();
      const meaning = (document.querySelector('.import-v-meaning[data-i="' + i + '"]').value || "").trim();
      if (!word || !meaning) continue;
      const j = await apiPost("/api/custom-vocab", { word, meaning, unit: "My words", category: "words & phrases" });
      state.customVocab = j.customVocab;
      savedV++;
    }
    mergeCustomVocab(); fillUnitSelects(); renderStudy(); renderCustomVocabList();
    buildPassageList();
    fillPassageSelect($("passageSelect"), state.passages);
    fillPassageSelect($("racePassageSelect"), state.passages);
    fillPassageSelect($("rainPassageSelect"), state.passages);
    $("importSaveStatus").textContent = "Saved " + savedP + " passage" + (savedP === 1 ? "" : "s") + " and " + savedV + " word" + (savedV === 1 ? "" : "s") + ". They are in Read, Typing and Words now.";
    importPreviewData = null;
    $("importPreview").innerHTML = "";
    $("importFile").value = "";
    $("importFileName").textContent = "";
    $("importText").value = "";
  } catch (err) {
    $("importSaveStatus").textContent = "Save failed: " + (err.message || "error") + ".";
  } finally {
    btn.disabled = false;
  }
}

function initSettings() {
  $("saveMarkingBtn").addEventListener("click", saveMarking);
  $("resetMarkingBtn").addEventListener("click", () => {
    if (!confirm("Reset the marking requirements to the PSLE Oral Pack text?")) return;
    $("markingEditor").value = state.markingDefault;
  });
  if ($("importOrganiseBtn")) {
    $("importOrganiseBtn").addEventListener("click", importOrganise);
    $("importSaveBtn").addEventListener("click", importSave);
    $("importFile").addEventListener("change", () => {
      const f = $("importFile").files[0];
      $("importFileName").textContent = f ? f.name : "";
    });
  }
  $("savePasswordBtn").addEventListener("click", savePassword);
  $("saveSecretWordBtn").addEventListener("click", saveSecretWord);
}

/* ---------------- backup / restore ---------------- */
async function exportAllData() {
  if (guestMode) {
    const store = guestStore() || guestNewStore("P6");
    const masteryRows = [];
    for (const pid of Object.keys(store.mastery || {})) {
      for (const type of ["words", "passages", "oral"]) {
        for (const key of Object.keys((store.mastery[pid] || {})[type] || {})) {
          const rec = store.mastery[pid][type][key] || {};
          masteryRows.push({ profile_id: pid, item_type: type, item_key: key, streak: rec.streak || 0, tested: rec.tested || 0, last_tested: rec.lastTested || null, next_due: rec.nextDue || null });
        }
      }
    }
    return { app: "TalkPupils", version: 1, exportedAt: new Date().toISOString(),
      profiles: store.profiles.map((p) => Object.assign({}, p, { parent_id: "guest" })),
      sessions: store.sessions,
      mastery: masteryRows,
      customVocab: store.customVocab.map((r) => Object.assign({}, r, { parent_id: "guest" })),
      customPassages: store.customPassages.map((r) => Object.assign({}, r, { parent_id: "guest" })),
      customTopics: store.customTopics.map((r) => Object.assign({}, r, { parent_id: "guest" })),
      settings: [Object.assign({}, store.settings, { parent_id: "guest" })] };
  }
  const uid = await sbUserId();
  const { data: profiles } = await sbClient.from("profiles").select("*").eq("parent_id", uid);
  const pids = (profiles || []).map((p) => p.id);
  const out = { app: "TalkPupils", version: 1, exportedAt: new Date().toISOString(),
    profiles: profiles || [], sessions: [], mastery: [] };
  if (pids.length) {
    const s = await sbClient.from("sessions").select("*").in("profile_id", pids);
    const m = await sbClient.from("mastery").select("*").in("profile_id", pids);
    out.sessions = s.data || [];
    out.mastery = m.data || [];
  }
  const cv = await sbClient.from("custom_vocab").select("*").eq("parent_id", uid);
  const cp = await sbClient.from("custom_passages").select("*").eq("parent_id", uid);
  const ct = await sbClient.from("custom_topics").select("*").eq("parent_id", uid);
  const st = await sbClient.from("settings").select("*").eq("parent_id", uid);
  out.customVocab = cv.data || [];
  out.customPassages = cp.data || [];
  out.customTopics = ct.data || [];
  out.settings = st.data || [];
  return out;
}
async function importAllData(data) {
  if (guestMode) {
    if (!data || data.app !== "TalkPupils") throw new Error("This does not look like a TalkPupils backup.");
    const store = guestNewStore("P6");
    store.profiles = (data.profiles || []).map((r) => ({ id: r.id, name: r.name, level: r.level, created_at: r.created_at }));
    store.sessions = (data.sessions || []).map((r) => ({ id: r.id, profile_id: r.profile_id, kind: r.kind, created_at: r.created_at, details: r.details || {} }));
    store.mastery = {};
    for (const r of data.mastery || []) {
      if (!store.mastery[r.profile_id]) store.mastery[r.profile_id] = { words: {}, passages: {}, oral: {} };
      if (store.mastery[r.profile_id][r.item_type]) {
        store.mastery[r.profile_id][r.item_type][r.item_key] = { streak: r.streak || 0, tested: r.tested || 0, lastTested: r.last_tested || null, nextDue: r.next_due || null };
      }
    }
    store.customVocab = (data.customVocab || []).map((r) => ({ id: r.id, word: r.word, meaning: r.meaning, unit: r.unit, category: r.category, created_at: r.created_at }));
    store.customPassages = (data.customPassages || []).map((r) => ({ id: r.id, title: r.title, text: r.text, created_at: r.created_at }));
    store.customTopics = (data.customTopics || []).map((r) => ({ id: r.id, title: r.title, image: r.image || "", image_file: r.image_file || "", linked_topic_id: r.linked_topic_id || "", keywords: r.keywords || [], questions: r.questions || [], created_at: r.created_at }));
    const st = (data.settings || [])[0];
    if (st) store.settings = { marking_requirements: (st.marking_requirements != null ? st.marking_requirements : null), oral_prep_seconds: st.oral_prep_seconds || 120, oral_save_audio: st.oral_save_audio !== false };
    if (!store.profiles.length) store.profiles = guestNewStore("P6").profiles;
    guestSave(store);
    return;
  }
  const uid = await sbUserId();
  if (!data || data.app !== "TalkPupils") throw new Error("This does not look like a TalkPupils backup.");
  const { data: existing } = await sbClient.from("profiles").select("id").eq("parent_id", uid);
  const pids = (existing || []).map((p) => p.id);
  if (pids.length) {
    await sbClient.from("sessions").delete().in("profile_id", pids);
    await sbClient.from("mastery").delete().in("profile_id", pids);
  }
  await sbClient.from("custom_vocab").delete().eq("parent_id", uid);
  await sbClient.from("custom_passages").delete().eq("parent_id", uid);
  await sbClient.from("custom_topics").delete().eq("parent_id", uid);
  await sbClient.from("settings").delete().eq("parent_id", uid);
  await sbClient.from("profiles").delete().eq("parent_id", uid);
  const stamp = (rows) => (rows || []).map((r) => Object.assign({}, r, { parent_id: uid }));
  const put = async (table, rows) => {
    if (rows && rows.length) {
      const { error } = await sbClient.from(table).insert(rows);
      if (error) throw new Error(table + ": " + error.message);
    }
  };
  await put("profiles", stamp(data.profiles));
  await put("sessions", data.sessions);
  await put("mastery", data.mastery);
  await put("custom_vocab", stamp(data.customVocab));
  await put("custom_passages", stamp(data.customPassages));
  await put("custom_topics", stamp(data.customTopics));
  await put("settings", stamp(data.settings));
}
function initBackup() {
  $("backupLink").addEventListener("click", async (e) => {
    e.preventDefault();
    $("restoreStatus").textContent = "Preparing backup…";
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "talkpupils-backup-" + todayKey() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      $("restoreStatus").textContent = guestMode
        ? "Backup downloaded. (Answer audio is not in this file — it stays in this browser.)"
        : "Backup downloaded. (Pictures and answer audio are stored in Supabase and are not in this file.)";
    } catch (err) {
      $("restoreStatus").textContent = "Backup failed: " + err.message;
    }
  });
  $("restoreInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await importAllData(data);
      $("restoreStatus").textContent = "Restored. Reloading…";
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      $("restoreStatus").textContent = "Restore failed: " + err.message;
    }
    e.target.value = "";
  });
}

/* ---------------- profiles (top bar) ---------------- */
/* A signed-in pupil has exactly one profile — their own — so the
   top bar only shows it. Pupils are not added from here; each pupil
   signs up with their own name and password. */
function initProfiles() {
  $("profileSelect").addEventListener("change", async (e) => {
    state.currentProfileId = e.target.value;
    await loadSessions();
    await loadMastery();
    renderMasteryLists();
    renderDueHints();
    renderOralTopics();
    if ($("tab-progress").classList.contains("active")) renderProgress();
  });
}

/* ---------------- init ---------------- */
async function init() {
  initTabs();
  initProfiles();
  initRead();
  initType();
  initWords();
  initOral();
  initSettings();
  initBackup();
  try {
    const [oracle, builtin, vocab, marking, grammarData, customVocab] = await Promise.all([
      fetch("content/oracle_passages.json").then((r) => r.json()),
      fetch("content/built_in_passages.json").then((r) => r.json()),
      fetch("content/vocab.json").then((r) => r.json()),
      fetch("content/marking_requirements.txt").then((r) => r.text()),
      fetch("content/grammar.json").then((r) => r.json()),
      apiGet("/api/custom-vocab"),
    ]);
    state.oracle = oracle;
    state.builtin = builtin;
    state.vocab = vocab;
    state.grammar = grammarData;
    state.customVocab = customVocab.customVocab || [];
    state.markingDefault = marking.trim();
    // vocab entries are {word, unit, category, meaning}; add unit names
    state.vocab.forEach((w) => { w.unitName = unitName(w.unit); });
    mergeCustomVocab();
    fillUnitSelects();
    renderStudy();
    renderCustomVocabList();
    renderMasteryLists();
    const [settings, customs, aiCfg] = await Promise.all([
      apiGet("/api/settings/marking"),
      apiGet("/api/custom-passages"),
      apiGet("/api/ai-config"),
    ]);
    if (settings.markingRequirements != null) {
      state.settings.markingRequirements = settings.markingRequirements;
    }
    if (aiCfg.config) state.ai = aiCfg.config;
    state.customPassages = customs.customPassages;
    buildPassageList();
    fillPassageSelect($("passageSelect"), state.passages);
    fillPassageSelect($("racePassageSelect"), state.passages);
    fillPassageSelect($("rainPassageSelect"), state.passages);
    selectPassage(state.passages[0] ? state.passages[0].id : null);
    renderSettings();
    await loadOralData();
    await loadProfiles();
    await loadSessions();
    await loadMastery();
    renderMasteryLists();
    renderDueHints();
    renderOralTopics();
  } catch (err) {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      '<div class="card" style="border-color:#e5a09a;background:#fdecea">Could not load the app data: ' +
      esc(err.message) + ". Check your internet connection and that you are signed in.</div>");
  }
}
/* Move a guest trial into the pupil's own account, once, on sign-in.
   Only the trial profile with this pupil's name and level moves
   across — a trial made by another pupil stays in this browser
   until that pupil signs in. The built-in "Guest pupil" demo
   profile never moves. The profile's sessions, spaced-repetition
   progress, added words, passages and picture topics move with it,
   and the trial's marking requirements and Oral Partner settings
   carry over too (only if the pupil has no settings saved yet).
   The trial copy is cleared only after the move succeeds, so a
   failed move can be tried again on the next sign-in. If a profile
   with the same name and level already exists in the account, it
   is reused instead of adding a second one. Returns the moved
   profile names, or null when there was nothing to move. */
async function migrateGuestToKid(kidName, kidLevel) {
  const store = guestStore();
  if (!store || !store.profiles || !store.profiles.length) return null;
  const uid = await sbUserId();
  const named = store.profiles.filter((p) => p.name !== "Guest pupil" && String(p.id).indexOf("guest-") !== 0);
  if (!named.length) { guestClear(); return null; }
  const moving = named.filter((p) =>
    String(p.name).toLowerCase() === String(kidName || "").toLowerCase() &&
    String(p.level) === String(kidLevel || ""));
  if (!moving.length) return null; // another pupil's trial — leave it here
  const { data: existing } = await sbClient.from("profiles").select("id, name, level").eq("parent_id", uid);
  const idMap = {};
  const movedNames = [];
  for (const p of moving) {
    const hit = (existing || []).find((e) => e.name === p.name && e.level === p.level);
    if (hit) { idMap[p.id] = hit.id; continue; }
    const { data, error } = await sbClient.from("profiles")
      .insert({ parent_id: uid, name: String(p.name).slice(0, 60), level: String(p.level).slice(0, 10) })
      .select().single();
    if (error) throw new Error(error.message);
    idMap[p.id] = data.id;
    movedNames.push(p.name + " (" + p.level + ")");
  }
  const sessRows = (store.sessions || [])
    .filter((s) => idMap[s.profile_id])
    .map((s) => ({ profile_id: idMap[s.profile_id], kind: s.kind, details: s.details || {}, created_at: s.created_at }));
  if (sessRows.length) {
    const { error } = await sbClient.from("sessions").insert(sessRows);
    if (error) throw new Error(error.message);
  }
  for (const oldId of Object.keys(idMap)) {
    const m = (store.mastery || {})[oldId];
    if (!m) continue;
    const mrows = [];
    for (const type of ["words", "passages", "oral"]) {
      for (const key of Object.keys(m[type] || {})) {
        const rec = m[type][key] || {};
        mrows.push({ profile_id: idMap[oldId], item_type: type, item_key: key,
          streak: rec.streak || 0, tested: rec.tested || 0,
          last_tested: rec.lastTested || null, next_due: rec.nextDue || null });
      }
    }
    if (mrows.length) {
      const { error } = await sbClient.from("mastery").insert(mrows);
      if (error) throw new Error(error.message);
    }
  }
  for (const v of store.customVocab || []) {
    const { error } = await sbClient.from("custom_vocab")
      .insert({ parent_id: uid, word: String(v.word).slice(0, 80), meaning: String(v.meaning).slice(0, 160), unit: String(v.unit), category: v.category || "words & phrases" });
    if (error) throw new Error(error.message);
  }
  for (const p of store.customPassages || []) {
    const { error } = await sbClient.from("custom_passages")
      .insert({ parent_id: uid, title: String(p.title).slice(0, 80), text: String(p.text).slice(0, 3000) });
    if (error) throw new Error(error.message);
  }
  for (const t of store.customTopics || []) {
    const { error } = await sbClient.from("custom_topics")
      .insert({ parent_id: uid, title: String(t.title).slice(0, 80), image: String(t.image || ""), image_file: String(t.image_file || t.image || ""), linked_topic_id: String(t.linked_topic_id || "").slice(0, 20), keywords: t.keywords || [], questions: t.questions || [] });
    if (error) throw new Error(error.message);
  }
  if (store.settings) {
    const { data: own } = await sbClient.from("settings").select("parent_id").eq("parent_id", uid).maybeSingle();
    if (!own) {
      const patch = { parent_id: uid };
      if (store.settings.marking_requirements) patch.marking_requirements = String(store.settings.marking_requirements).slice(0, 8000);
      if (store.settings.oral_prep_seconds) patch.oral_prep_seconds = Math.max(30, Math.min(600, parseInt(store.settings.oral_prep_seconds, 10) || 120));
      if (typeof store.settings.oral_save_audio === "boolean") patch.oral_save_audio = store.settings.oral_save_audio;
      const { error } = await sbClient.from("settings").upsert(patch, { onConflict: "parent_id" });
      if (error) throw new Error(error.message);
    }
  }
  // Take only this pupil's moved trial data out of the guest store.
  // Anything left (another pupil's trial, and the shared added
  // words/passages/topics) stays here for their sign-in.
  const movedIds = Object.keys(idMap);
  store.profiles = (store.profiles || []).filter((p) => movedIds.indexOf(p.id) < 0);
  store.sessions = (store.sessions || []).filter((s) => movedIds.indexOf(s.profile_id) < 0);
  for (const id of movedIds) delete (store.mastery || {})[id];
  const namedLeft = (store.profiles || []).some((p) => p.name !== "Guest pupil" && String(p.id).indexOf("guest-") !== 0);
  if (!namedLeft) guestClear();
  else guestSave(store);
  return movedNames;
}

/* ---------------- auth (pupil sign-in) ---------------- */
/* Pupils sign in with a name + password — no email. The name maps to
   a made-up Supabase email (kid-<name>@talktupils.local) that only
   the app ever uses; nothing is ever sent to it. That is why sign-up
   only works with "Confirm email" turned off in Supabase: with it
   on, the confirmation would go to an address nobody reads. */
const KID_EMAIL_DOMAIN = "talktupils.local";
function kidNameToEmail(name) {
  const clean = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? "kid-" + clean + "@" + KID_EMAIL_DOMAIN : "";
}
function kidNameFromEmail(email) {
  const m = String(email || "").match(/^kid-([a-z0-9]+)@/);
  return m ? m[1] : "";
}
function plainAuthError(err, mode) {
  const m = String((err && err.message) || err || "");
  if (/already registered|already exists/i.test(m)) return "That name is already taken — try adding a number, e.g. Zeen2.";
  if (/at least 6 characters|password.*short/i.test(m)) return "Use a password with at least 6 characters.";
  if (/email not confirmed/i.test(m)) return "Your account is not switched on yet. Ask a parent to turn off “Confirm email” in Supabase (Authentication → Providers → Email), then sign up again.";
  if (/invalid login credentials/i.test(m)) return "That name and password don't match — check them, or tap Sign up if you don't have an account yet.";
  if (/rate limit|too many/i.test(m)) return "Too many sign-ups just now — wait a little while and try again.";
  if (/not authorized/i.test(m)) return "Supabase can't send emails to this account. Ask a parent to turn off “Confirm email” in Supabase (Authentication → Providers → Email), then sign up again.";
  return "Could not sign in: " + m;
}
async function doAuth(mode) {
  const name = $("authName").value.trim();
  const level = $("authLevel").value || "P6";
  const password = $("authPassword").value;
  if (!name || !password) { $("authStatus").textContent = "Type your name and password first."; return; }
  const email = kidNameToEmail(name);
  if (!email) { $("authStatus").textContent = "Use a name with letters or numbers."; return; }
  if (!sbClient) { $("authStatus").textContent = "Sign-in is unavailable right now — the sign-in library did not load. Check your connection and reload, or try as a guest below."; return; }
  $("authStatus").textContent = mode === "signup" ? "Creating your account…" : "Signing in…";
  try {
    let res;
    if (mode === "signup") {
      // The secret word is how a pupil resets a forgotten password
      // (there is no email to send a link to). Only the pupil and
      // their parent should know it.
      const recoveryWord = $("authRecoveryWord").value.trim().toLowerCase();
      if (!recoveryWord) { $("authStatus").textContent = "Pick a secret word too — it lets you reset your password if you forget it. Only you and your parent should know it."; return; }
      res = await sbClient.auth.signUp({ email: email, password: password,
        options: { data: { kid_name: name.slice(0, 60), level: level, recovery_word: recoveryWord.slice(0, 40) } } });
      if (res.error) throw res.error;
      if (!res.data.session) {
        // Email confirmation is still on: the confirmation would go
        // to the made-up address, so it can never arrive. The parent
        // must turn "Confirm email" off in Supabase first.
        $("authStatus").textContent = "That didn't sign you in. Ask a parent to turn off “Confirm email” in Supabase (Authentication → Providers → Email), then sign up again.";
        return;
      }
    } else {
      res = await sbClient.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
    }
    state.parentId = res.data.session.user.id;
    location.reload();
  } catch (err) {
    $("authStatus").textContent = plainAuthError(err, mode);
  }
}
/* Forgot password: the pupil is not signed in, so the reset goes
   through the "auth-reset" Edge Function, which checks the name +
   level + secret word and sets the new password. No email is ever
   sent — pupil accounts have no real email address. */
async function doResetPassword() {
  const name = $("authName").value.trim();
  const level = $("authLevel").value || "P6";
  const word = $("resetWord").value.trim();
  const next = $("resetPassword").value;
  const next2 = $("resetPassword2").value;
  if (!name) { $("resetStatus").textContent = "Type your name above first."; return; }
  if (!word) { $("resetStatus").textContent = "Type your secret word."; return; }
  if (next.length < 6) { $("resetStatus").textContent = "Use a new password with at least 6 characters."; return; }
  if (next !== next2) { $("resetStatus").textContent = "The two new passwords don't match."; return; }
  if (!sbClient) { $("resetStatus").textContent = "Reset is unavailable right now — check your connection and reload."; return; }
  $("resetStatus").textContent = "Resetting…";
  try {
    const { data, error } = await sbClient.functions.invoke("auth-reset", {
      body: { name, level, recoveryWord: word, newPassword: next },
    });
    if (error) throw new Error(error.message || "Reset failed");
    if (!data || !data.ok) throw new Error((data && data.error) || "Reset failed");
    $("resetStatus").textContent = "Password changed — sign in above with your new password.";
    $("resetWord").value = "";
    $("resetPassword").value = "";
    $("resetPassword2").value = "";
    $("authPassword").value = "";
  } catch (err) {
    $("resetStatus").textContent = "Could not reset: " + (err.message || "try again in a moment");
  }
}
/* Change password / set the secret word, for a signed-in pupil. */
async function savePassword() {
  const next = $("newPassword").value;
  const next2 = $("newPassword2").value;
  if (next.length < 6) { $("passwordStatus").textContent = "Use a password with at least 6 characters."; return; }
  if (next !== next2) { $("passwordStatus").textContent = "The two passwords don't match."; return; }
  $("passwordStatus").textContent = "Saving…";
  try {
    const { error } = await sbClient.auth.updateUser({ password: next });
    if (error) throw error;
    $("passwordStatus").textContent = "Password changed.";
    $("newPassword").value = "";
    $("newPassword2").value = "";
  } catch (err) {
    $("passwordStatus").textContent = "Could not save: " + (err.message || "try again");
  }
}
async function saveSecretWord() {
  const word = $("secretWord").value.trim().toLowerCase();
  if (!word) { $("secretWordStatus").textContent = "Type a secret word first."; return; }
  $("secretWordStatus").textContent = "Saving…";
  try {
    const { error } = await sbClient.auth.updateUser({ data: { recovery_word: word.slice(0, 40) } });
    if (error) throw error;
    $("secretWordStatus").textContent = "Secret word saved.";
    $("secretWord").value = "";
    renderPasswordCard();
  } catch (err) {
    $("secretWordStatus").textContent = "Could not save: " + (err.message || "try again");
  }
}
async function renderPasswordCard() {
  const card = $("passwordCard");
  if (!card) return;
  if (guestMode) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  try {
    const { data } = await sbClient.auth.getUser();
    const meta = (data && data.user && data.user.user_metadata) || {};
    $("secretWordNote").textContent = meta.recovery_word
      ? "A secret word is set — it lets you reset your password from the sign-in page if you forget it."
      : "No secret word set yet — set one above so you can reset your password if you forget it.";
  } catch (err) { /* the note stays as-is */ }
}
/* Delete answer recordings older than 7 days (runs when the pupil signs in). */
async function cleanupOldAudio() {
  try {
    const uid = state.parentId;
    if (!uid) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const { data: profiles } = await sbClient.from("profiles").select("id").eq("parent_id", uid);
    for (const p of profiles || []) {
      const { data: files } = await sbClient.storage.from("audio").list(uid + "/" + p.id, { limit: 100 });
      const old = (files || []).filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
        .map((f) => uid + "/" + p.id + "/" + f.name);
      if (old.length) await sbClient.storage.from("audio").remove(old);
    }
  } catch (err) { /* clean-up is a bonus; it must never block the app */ }
}
/* ---------------- guest mode: enter / leave ---------------- */
async function enterGuest(level) {
  let store = guestStore();
  if (!store || !store.profiles.length) {
    store = guestNewStore(level);
    guestSave(store);
  }
  guestMode = true;
  const profile = store.profiles[0];
  $("authCard").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("guestBanner").classList.remove("hidden");
  $("guestLevelLabel").textContent = profile.level;
  $("authSignOutBtn").classList.add("hidden");
  $("authNameDisplay").textContent = "Guest — " + profile.level;
  $("siteFooter").textContent = "Trying as a guest — results stay only in this browser. Sign up with your name to save your progress; a trial under your name moves into your account when you sign in.";
  $("backupNote").textContent = "You are trying as a guest — your results live only in this browser. Download a backup file to keep a copy, or restore one.";
  $("oralAudioNote").textContent = "Speak your answer, then tap “Done”. If the microphone is not available, type instead. Your voice stays only in this browser for this trial — it is not saved online.";
  $("oralSettingsNote").textContent = "In this guest trial, answer audio stays only in this browser so you can listen back during the trial. Written answers and scores are kept in this browser too.";
  await init();
}
function exitGuest() {
  // Go to the sign-in page WITHOUT deleting the trial: when the pupil
  // signs in, the trial profile with their name moves into their
  // account (see migrateGuestToKid). A flag stops the guest trial
  // resuming itself on the reload that follows.
  try { sessionStorage.setItem("talktupils_exit_guest", "1"); } catch (err) { /* ignore */ }
  location.reload();
}
/* First sign-in for this pupil: make sure they have exactly one
   profile — their own — created from the name and level saved at
   sign-up (or from the account name as a fallback). */
async function ensureKidProfile() {
  const j = await apiGet("/api/profiles");
  if (j.profiles && j.profiles.length) return j.profiles;
  const { data } = await sbClient.auth.getUser();
  const meta = (data && data.user && data.user.user_metadata) || {};
  const name = String(meta.kid_name || kidNameFromEmail(data && data.user ? data.user.email : "") || "Pupil").slice(0, 60);
  const level = String(meta.level || "P6").slice(0, 10);
  const created = await apiPost("/api/profiles", { name, level });
  return created.profiles;
}
async function initAuth() {
  $("authSignUpBtn").addEventListener("click", () => doAuth("signup"));
  $("authSignInBtn").addEventListener("click", () => doAuth("signin"));
  $("forgotBtn").addEventListener("click", () => { $("resetBox").classList.toggle("hidden"); $("resetStatus").textContent = ""; });
  $("resetBtn").addEventListener("click", doResetPassword);
  $("authSignOutBtn").addEventListener("click", async () => { if (sbClient) await sbClient.auth.signOut(); location.reload(); });
  $("guestP6Btn").addEventListener("click", () => enterGuest("P6"));
  $("guestP4Btn").addEventListener("click", () => enterGuest("P4"));
  $("exitGuestBtn").addEventListener("click", exitGuest);
  const guestParam = (new URLSearchParams(location.search).get("guest") || "").toUpperCase();
  if (guestParam === "P6" || guestParam === "P4") {
    // Direct link (?guest=P6) skips the sign-in page entirely.
    await enterGuest(guestParam);
    return;
  }
  if (!sbClient) {
    // The sign-in library did not load (e.g. its CDN was unreachable).
    // Guest mode still works — it needs no Supabase at all.
    $("authStatus").textContent = "Sign-in is unavailable right now — the sign-in library did not load. Check your connection and reload, or try as a guest below.";
    $("authCard").classList.remove("hidden");
    $("appShell").classList.add("hidden");
    return;
  }
  const { data } = await sbClient.auth.getSession();
  if (data && data.session) {
    state.parentId = data.session.user.id;
    const meta = data.session.user.user_metadata || {};
    const kidName = String(meta.kid_name || kidNameFromEmail(data.session.user.email) || "");
    const kidLevel = String(meta.level || "P6");
    // A guest trial with this pupil's name moves into their account
    // now. A failed move never blocks sign-in — the trial is kept
    // and the move is tried again on the next sign-in.
    let moved = null;
    let moveError = "";
    try { moved = await migrateGuestToKid(kidName, kidLevel); }
    catch (err) { moveError = (err && err.message) || "move failed"; }
    // Make sure the pupil has their own profile before the app loads.
    let profiles = [];
    try { profiles = await ensureKidProfile(); }
    catch (err) { moveError = moveError || ((err && err.message) || "profile failed"); }
    $("authCard").classList.add("hidden");
    $("appShell").classList.remove("hidden");
    $("authSignOutBtn").classList.remove("hidden");
    const me = (profiles && profiles[0]) || null;
    $("authNameDisplay").textContent = me ? me.name + " (" + me.level + ")" : kidName;
    await init();
    cleanupOldAudio();
    if (moved && moved.length) {
      document.querySelector("main").insertAdjacentHTML("afterbegin",
        '<div class="card" style="border-color:#9dc89d;background:#eef7ee">Your guest trial moved into your account: ' +
        esc(moved.join(", ")) + ". Those results are now saved online.</div>");
    } else if (moveError) {
      document.querySelector("main").insertAdjacentHTML("afterbegin",
        '<div class="card" style="border-color:#e5a09a;background:#fdecea">Your guest trial could not be moved into your account this time (' +
        esc(moveError) + '). It is still in this browser — sign out and sign in again to try the move once more.</div>');
    }
    return;
  }
  // No session: show the sign-in page — unless the guest trial is
  // resuming (skipped when exitGuest sent the pupil here to sign in).
  let exitGuestFlag = null;
  try {
    exitGuestFlag = sessionStorage.getItem("talktupils_exit_guest");
    sessionStorage.removeItem("talktupils_exit_guest");
  } catch (err) { /* ignore */ }
  if (!exitGuestFlag) {
    const store = guestStore();
    if (store && store.profiles.length) {
      // Resume the guest trial without touching Supabase at all.
      await enterGuest(store.profiles[0].level || "P6");
      return;
    }
  }
  $("authCard").classList.remove("hidden");
  $("appShell").classList.add("hidden");
}
document.addEventListener("DOMContentLoaded", initAuth);
