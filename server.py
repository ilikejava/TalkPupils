#!/usr/bin/env python3
"""English Oral and Typing Practice — local server.

Serves the practice app on the laptop and saves ALL pupil data as JSON
files in the data/ folder next to this script. No data is ever stored in
the browser (no localStorage, cookies or IndexedDB are used by the app).

Run:  python3 server.py        (or double-click start.bat on Windows)
Then open the printed http://localhost:PORT address in Google Chrome.

Python 3 standard library only — no pip packages needed.
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
# Parent-added pictures and recorded answer audio live here.
STIMULI_DIR = os.path.join(DATA_DIR, "stimuli")
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
os.makedirs(STIMULI_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Answer recordings are kept for 7 days only, then deleted automatically
# to keep storage small (the future website runs on Supabase's 1 GB
# free storage). Only the voice recording files are deleted — the
# written answers (transcripts) and scores in sessions.json are kept.
AUDIO_KEEP_SECONDS = 7 * 24 * 3600


def _cleanup_old_audio():
    """Delete recorded answer audio files older than 7 days from
    data/audio/ only. Returns how many files were removed."""
    now = time.time()
    try:
        names = os.listdir(AUDIO_DIR)
    except OSError:
        return 0
    removed = 0
    for name in names:
        path = os.path.join(AUDIO_DIR, name)
        try:
            if not os.path.isfile(path):
                continue
            if now - os.path.getmtime(path) > AUDIO_KEEP_SECONDS:
                os.remove(path)
                removed += 1
        except OSError:
            continue
    return removed

FILES = {
    "profiles": "profiles.json",          # [{id, name, level, createdAt}]
    "sessions": "sessions.json",          # [{id, profileId, kind, ...}]
    "custom_passages": "custom_passages.json",  # [{id, title, text, createdAt}]
    "custom_vocab": "custom_vocab.json",  # [{id, word, meaning, unit, category, createdAt}]
    "mastery": "mastery.json",            # {profileId: {words: {key: rec}, passages: {id: rec}}}
    "settings": "settings.json",          # {markingRequirements, oralPrepSeconds, oralSaveAudio}
    "ai_config": "ai_config.json",        # {provider, model, enabled, apiKey} — parent's own AI key, laptop only
    "custom_topics": "custom_topics.json",  # parent-added oral topics [{id, title, imageFile, questions, ...}]
}

DEFAULT_SETTINGS = {"markingRequirements": None}
DEFAULT_AI_CONFIG = {"provider": "openai", "model": "", "enabled": False, "apiKey": ""}
# Cheap models, good enough for marking a short read-aloud.
AI_DEFAULT_MODELS = {"openai": "gpt-5.4-mini", "anthropic": "claude-3-5-haiku-20241022"}
AI_TIMEOUT = 30  # seconds for one provider call

_lock = threading.Lock()


def _path(name):
    return os.path.join(DATA_DIR, FILES[name])


def _read(name):
    p = _path(name)
    if not os.path.exists(p):
        if name == "settings":
            return dict(DEFAULT_SETTINGS)
        if name == "mastery":
            return {}
        if name == "ai_config":
            return dict(DEFAULT_AI_CONFIG)
        return []
    with open(p, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            if name == "settings":
                return dict(DEFAULT_SETTINGS)
            if name == "mastery":
                return {}
            if name == "ai_config":
                return dict(DEFAULT_AI_CONFIG)
            return []
    if name == "ai_config" and not isinstance(data, dict):
        return dict(DEFAULT_AI_CONFIG)
    return data


def _write(name, data):
    """Atomic write: temp file + rename, under a lock."""
    p = _path(name)
    tmp = p + ".tmp.%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def _new_id():
    return uuid.uuid4().hex[:12]


# ---- optional AI marking (parent's own API key) -----------------------
# The key lives only in data/ai_config.json on this laptop. It is never
# returned to the browser in full (only the last 4 characters), never
# logged, and never included in backup downloads. The server proxies the
# call so the key never leaves the laptop except to the chosen provider.
# No audio is ever sent — Oral Partner records answer audio on the laptop,
# but that audio is never sent to any provider, only the answer text.

def _ai_config():
    cfg = _read("ai_config")
    provider = cfg.get("provider") if cfg.get("provider") in ("openai", "anthropic") else "openai"
    model = (cfg.get("model") or "").strip() or AI_DEFAULT_MODELS[provider]
    return {
        "provider": provider,
        "model": model,
        "enabled": bool(cfg.get("enabled")),
        "apiKey": cfg.get("apiKey") or "",
        # Test-only override: a base URL (e.g. a local stub) instead of the
        # provider's real API. Only settable by editing ai_config.json by
        # hand; the UI never sets it.
        "apiBase": (cfg.get("apiBase") or "").strip(),
    }


def _ai_public(cfg):
    key = cfg.get("apiKey") or ""
    return {
        "provider": cfg["provider"],
        "model": cfg["model"],
        "enabled": cfg["enabled"],
        "keySaved": bool(key),
        "keyLast4": key[-4:] if key else "",
    }


def _ai_mark_prompt(d):
    parts = [
        "You are marking a primary school pupil's English read-aloud (PSLE oral, Singapore).",
        "Passage the pupil read:",
        (d.get("passageText") or "")[:3000],
    ]
    if d.get("recognisedText"):
        parts.append("What the microphone heard the pupil say "
                     "(speech recognition, so some words may be mis-heard):")
        parts.append((d.get("recognisedText") or "")[:2000])
    stumbles = d.get("stumbles") or []
    if stumbles:
        parts.append("Words the pupil stumbled on: " + ", ".join(str(w) for w in stumbles[:30]))
    parts.append("Speed: %s words per minute. Clarity: %s%%. Smoothness: %s%%. "
                 "Local mark: %s/10." % (d.get("wpm"), d.get("clarity"),
                                         d.get("smoothness"), d.get("localMark")))
    if d.get("markingRequirements"):
        parts.append("Marking requirements:")
        parts.append((d.get("markingRequirements") or "")[:4000])
    parts.append('Reply with JSON only, exactly this shape: '
                 '{"mark": <number 1-10>, "strengths": ["...", "..."], '
                 '"improvements": ["...", "..."]}. Give exactly 2 strengths and '
                 '2 improvements, in simple words a primary school pupil can understand.')
    return "\n\n".join(parts)


def _call_ai_provider(cfg, user_text, system_text=None, test=False):
    """One call to the chosen provider. Returns the reply text.
    Raises ValueError with a short plain message on any failure."""
    provider = cfg["provider"]
    key = cfg["apiKey"]
    if provider == "openai":
        url = (cfg["apiBase"] or "https://api.openai.com").rstrip("/") + "/v1/chat/completions"
        payload = {
            "model": cfg["model"],
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": system_text or "You are a kind primary school English teacher."},
                {"role": "user", "content": user_text},
            ],
        }
        if not test:
            payload["response_format"] = {"type": "json_object"}
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    else:  # anthropic
        url = (cfg["apiBase"] or "https://api.anthropic.com").rstrip("/") + "/v1/messages"
        payload = {
            "model": cfg["model"],
            "max_tokens": 800,
            "temperature": 0.3,
            "messages": [{"role": "user", "content": user_text}],
        }
        if system_text:
            payload["system"] = system_text
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01",
                   "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8"))
            err = detail.get("error") or {}
            msg = err.get("message") or err.get("type") or ("provider returned HTTP %d" % e.code)
        except Exception:
            msg = "provider returned HTTP %d" % e.code
        if e.code in (401, 403):
            msg = "the API key was rejected — check the key and try again"
        raise ValueError(msg)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ValueError("could not reach the AI provider — check the internet connection")
    if provider == "openai":
        try:
            text = raw["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ValueError("unexpected reply from the AI provider")
    else:
        try:
            text = "".join(b.get("text", "") for b in raw.get("content", [])
                           if b.get("type") == "text")
        except (AttributeError, TypeError):
            raise ValueError("unexpected reply from the AI provider")
    return text


def _parse_ai_mark(text):
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("the AI reply was not in the expected format")
    try:
        data = json.loads(text[start:end + 1])
    except ValueError:
        raise ValueError("the AI reply was not in the expected format")
    mark = data.get("mark")
    strengths = data.get("strengths")
    improvements = data.get("improvements")
    if (not isinstance(mark, (int, float)) or not isinstance(strengths, list)
            or not isinstance(improvements, list) or not strengths or not improvements):
        raise ValueError("the AI reply was missing the mark or feedback")
    return {
        "mark": max(1, min(10, int(round(mark)))),
        "strengths": [str(s)[:300] for s in strengths[:2]],
        "improvements": [str(s)[:300] for s in improvements[:2]],
    }


def _ai_oral_prompt(d):
    """Prompt for Oral Partner feedback: a refined answer in the child's
    own voice, gaps in plain words, and a 1–5 score for each of the four
    PSLE SBC areas plus an overall mark out of 25."""
    parts = [
        "You are a kind primary school English teacher marking a PSLE oral "
        "Stimulus-Based Conversation (SBC) answer, Singapore.",
        "Topic: " + (d.get("topicTitle") or ""),
        "Examiner's question (" + (d.get("qtype") or "question") + "):",
        (d.get("question") or "")[:1000],
        "The pupil's answer (transcribed from speech, so some words may be mis-heard):",
        (d.get("transcript") or "")[:2000],
    ]
    if d.get("modelAnswer"):
        parts.append("A strong model answer for this question (from the practice pack — "
                     "the pupil must NOT memorise it, just learn the ideas and vocabulary):")
        parts.append((d.get("modelAnswer") or "")[:2500])
    parts.append(
        'Reply with JSON only, exactly this shape: '
        '{"refined": "<a stronger version of the SAME answer, in the pupil\'s own voice, '
        'keeping the pupil\'s own ideas and experience but complete: direct answer, '
        'reasons with because/so, a personal example if the question asks for one, '
        'and a closing line. 3-5 sentences, simple words>", '
        '"strengths": ["...", "..."], "gaps": ["...", "..."], '
        '"relevance": <1-5>, "elaboration": <1-5>, "vocabulary": <1-5>, '
        '"grammar": <1-5>, "mark25": <0-25>}. '
        'Give exactly 2 strengths and 1-3 gaps, in simple words a primary school pupil '
        'can understand. Gaps must name what is missing (too short, no reason, no '
        'example, no personal experience, vague word with a better word, off-topic). '
        'mark25 is the overall SBC mark out of 25 for this one answer scaled to a '
        'full 3-question mock (a good single answer is about 17-21).')
    return "\n\n".join(parts)


def _parse_ai_oral(text):
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("the AI reply was not in the expected format")
    try:
        data = json.loads(text[start:end + 1])
    except ValueError:
        raise ValueError("the AI reply was not in the expected format")
    refined = data.get("refined")
    strengths = data.get("strengths")
    gaps = data.get("gaps")
    if (not isinstance(refined, str) or not refined.strip()
            or not isinstance(strengths, list) or not strengths
            or not isinstance(gaps, list)):
        raise ValueError("the AI reply was missing the refined answer or feedback")

    def _score(v):
        try:
            return max(1, min(5, int(round(float(v)))))
        except (TypeError, ValueError):
            return 3

    try:
        mark25 = max(0, min(25, int(round(float(data.get("mark25"))))))
    except (TypeError, ValueError):
        mark25 = None
    return {
        "refined": refined.strip()[:2000],
        "strengths": [str(s)[:300] for s in strengths[:2]],
        "gaps": [str(g)[:300] for g in gaps[:3]],
        "relevance": _score(data.get("relevance")),
        "elaboration": _score(data.get("elaboration")),
        "vocabulary": _score(data.get("vocabulary")),
        "grammar": _score(data.get("grammar")),
        "mark25": mark25,
    }


def _parse_multipart(body, content_type):
    """Minimal multipart/form-data parser (stdlib only). Returns
    {"fields": {name: str}, "files": {name: (filename, bytes)}} or None."""
    m = re.search(r"boundary=([^;]+)", content_type or "")
    if not m:
        return None
    boundary = m.group(1).strip().strip('"').encode("utf-8")
    parts = body.split(b"--" + boundary)
    out = {"fields": {}, "files": {}}
    for part in parts:
        if not part or part in (b"--\r\n", b"--", b"\r\n"):
            continue
        head, sep, content = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        if content.endswith(b"\r\n"):
            content = content[:-2]
        if content.endswith(b"--"):
            content = content[:-2]
        disp = re.search(rb'Content-Disposition:\s*form-data;\s*name="([^"]+)"'
                         rb'(?:;\s*filename="([^"]*)")?', head, re.IGNORECASE)
        if not disp:
            continue
        name = disp.group(1).decode("utf-8", "replace")
        filename = disp.group(2).decode("utf-8", "replace") if disp.group(2) else None
        if filename:
            out["files"][name] = (filename, content)
        else:
            out["fields"][name] = content.decode("utf-8", "replace")
    return out


class Handler(SimpleHTTPRequestHandler):
    # ---- plumbing -----------------------------------------------------
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        self._send_json({"ok": False, "error": message}, status=status)

    def _read_json_body(self, limit=1_000_000):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > limit:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    # ---- routing ------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/backup":
            return self._api_backup()
        if parsed.path.startswith("/api/"):
            return self._api_get(parsed)
        # static files: only the app's own files, no directory listing
        if parsed.path in ("/", "/index.html"):
            self.path = "/index.html"
        # Playing back a recording also sweeps away recordings older
        # than 7 days, so they do not linger if the server runs long.
        if parsed.path.startswith("/data/audio/"):
            _cleanup_old_audio()
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            # Raw-body endpoints (not JSON): picture upload (multipart) and
            # answer-audio upload (binary). They bypass the 1 MB JSON limit.
            if parsed.path in ("/api/upload-stimulus", "/api/audio"):
                return self._api_post_raw(parsed)
            return self._api_post(parsed)
        self._send_error_json(404, "not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self._api_delete(parsed)
        self._send_error_json(404, "not found")

    # silence directory listings
    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    # ---- API: GET -----------------------------------------------------
    def _api_get(self, parsed):
        qs = parse_qs(parsed.query)
        with _lock:
            if parsed.path == "/api/profiles":
                return self._send_json({"ok": True, "profiles": _read("profiles")})
            if parsed.path == "/api/sessions":
                sessions = _read("sessions")
                pid = qs.get("profileId", [None])[0]
                if pid:
                    sessions = [s for s in sessions if s.get("profileId") == pid]
                sessions = sorted(sessions, key=lambda s: s.get("createdAt", ""), reverse=True)
                return self._send_json({"ok": True, "sessions": sessions})
            if parsed.path == "/api/custom-passages":
                passages = sorted(_read("custom_passages"),
                                  key=lambda p: p.get("createdAt", ""), reverse=True)
                return self._send_json({"ok": True, "passages": passages,
                                        "customPassages": passages})
            if parsed.path == "/api/custom-vocab":
                words = sorted(_read("custom_vocab"),
                               key=lambda w: w.get("createdAt", ""), reverse=True)
                return self._send_json({"ok": True, "customVocab": words})
            if parsed.path == "/api/mastery":
                pid = qs.get("profileId", [None])[0]
                all_mastery = _read("mastery")
                rec = all_mastery.get(pid) if pid else None
                if not isinstance(rec, dict):
                    rec = {"words": {}, "passages": {}}
                return self._send_json({"ok": True, "mastery": rec})
            if parsed.path == "/api/settings":
                settings = _read("settings")
                if not isinstance(settings, dict):
                    settings = dict(DEFAULT_SETTINGS)
                return self._send_json({"ok": True, "settings": settings})
            if parsed.path == "/api/custom-topics":
                topics = _read("custom_topics")
                topics = sorted(topics, key=lambda t: t.get("createdAt", ""), reverse=True)
                return self._send_json({"ok": True, "customTopics": topics})
            if parsed.path == "/api/settings/marking":
                return self._send_json({"ok": True,
                                        "markingRequirements": _read("settings").get("markingRequirements")})
            if parsed.path == "/api/ai-config":
                # Never the key itself — only whether one is saved and its last 4 chars.
                return self._send_json({"ok": True, "config": _ai_public(_ai_config())})
        self._send_error_json(404, "unknown api")

    # ---- API: POST ----------------------------------------------------
    def _api_post(self, parsed):
        body = self._read_json_body()
        if body is None and parsed.path != "/api/restore":
            return self._send_error_json(400, "invalid json body")
        with _lock:
            if parsed.path == "/api/profiles":
                name = (body.get("name") or "").strip()
                level = (body.get("level") or "").strip() or "P5"
                if not name:
                    return self._send_error_json(400, "name is required")
                profiles = _read("profiles")
                profile = {"id": _new_id(), "name": name[:60], "level": level[:10],
                           "createdAt": _now_iso()}
                profiles.append(profile)
                _write("profiles", profiles)
                return self._send_json({"ok": True, "profile": profile, "profiles": profiles})

            if parsed.path == "/api/sessions":
                pid = body.get("profileId")
                kind = body.get("kind")
                if not pid or not kind:
                    return self._send_error_json(400, "profileId and kind are required")
                profiles = _read("profiles")
                if not any(p["id"] == pid for p in profiles):
                    return self._send_error_json(400, "unknown profile")
                sessions = _read("sessions")
                session = dict(body)
                session["id"] = _new_id()
                session["createdAt"] = _now_iso()
                sessions.append(session)
                _write("sessions", sessions)
                return self._send_json({"ok": True, "session": session})

            if parsed.path == "/api/custom-passages":
                title = (body.get("title") or "").strip()
                text = (body.get("text") or "").strip()
                if not title or len(text) < 20:
                    return self._send_error_json(400, "title and passage text (20+ chars) are required")
                passages = _read("custom_passages")
                passage = {"id": _new_id(), "title": title[:80], "text": text[:3000],
                           "createdAt": _now_iso()}
                passages.append(passage)
                _write("custom_passages", passages)
                return self._send_json({"ok": True, "passage": passage,
                                        "customPassages": sorted(passages, key=lambda p: p.get("createdAt", ""), reverse=True)})

            if parsed.path == "/api/custom-vocab":
                word = (body.get("word") or "").strip()
                meaning = (body.get("meaning") or "").strip()
                unit = body.get("unit")
                category = (body.get("category") or "").strip()
                valid_categories = {"phrasal verbs", "phrases with adverbs",
                                    "collocations", "words & phrases"}
                if not word or not meaning:
                    return self._send_error_json(400, "word and meaning are required")
                if not (isinstance(unit, int) and 1 <= unit <= 9 or unit == "my"):
                    return self._send_error_json(400, "unit must be 1-9 or 'my'")
                if category not in valid_categories:
                    return self._send_error_json(400, "unknown category")
                words = _read("custom_vocab")
                entry = {"id": _new_id(), "word": word[:80], "meaning": meaning[:160],
                         "unit": unit, "category": category, "createdAt": _now_iso()}
                words.append(entry)
                _write("custom_vocab", words)
                return self._send_json({"ok": True, "entry": entry,
                                        "customVocab": sorted(words, key=lambda w: w.get("createdAt", ""), reverse=True)})

            if parsed.path == "/api/mastery":
                pid = body.get("profileId")
                mastery = body.get("mastery")
                if not pid or not isinstance(mastery, dict):
                    return self._send_error_json(400, "profileId and mastery are required")
                profiles = _read("profiles")
                if not any(p["id"] == pid for p in profiles):
                    return self._send_error_json(400, "unknown profile")
                words = mastery.get("words") if isinstance(mastery.get("words"), dict) else {}
                passages = mastery.get("passages") if isinstance(mastery.get("passages"), dict) else {}
                oral = mastery.get("oral") if isinstance(mastery.get("oral"), dict) else {}
                all_mastery = _read("mastery")
                all_mastery[pid] = {"words": words, "passages": passages, "oral": oral}
                _write("mastery", all_mastery)
                return self._send_json({"ok": True, "mastery": all_mastery[pid]})

            if parsed.path == "/api/settings/marking":
                settings = _read("settings")
                settings["markingRequirements"] = (body.get("markingRequirements") or "")[:8000]
                _write("settings", settings)
                return self._send_json({"ok": True, "settings": settings,
                                        "markingRequirements": settings["markingRequirements"]})

            if parsed.path == "/api/settings":
                settings = _read("settings")
                if not isinstance(settings, dict):
                    settings = dict(DEFAULT_SETTINGS)
                if "markingRequirements" in body:
                    settings["markingRequirements"] = (body.get("markingRequirements") or "")[:8000]
                if "oralPrepSeconds" in body:
                    try:
                        settings["oralPrepSeconds"] = max(30, min(600, int(body["oralPrepSeconds"])))
                    except (TypeError, ValueError):
                        pass
                if isinstance(body.get("oralSaveAudio"), bool):
                    settings["oralSaveAudio"] = body["oralSaveAudio"]
                _write("settings", settings)
                return self._send_json({"ok": True, "settings": settings})

            if parsed.path == "/api/custom-topics":
                title = (body.get("title") or "").strip()
                questions = body.get("questions")
                if not title:
                    return self._send_error_json(400, "a title is required")
                if not isinstance(questions, list) or not 1 <= len(questions) <= 5:
                    return self._send_error_json(400, "1 to 5 questions are required")
                clean_qs = []
                for q in questions:
                    if not isinstance(q, dict) or not (q.get("q") or "").strip():
                        return self._send_error_json(400, "every question needs its text")
                    qtype = q.get("type") if q.get("type") in (
                        "picture", "experience", "opinion", "evaluative") else "opinion"
                    clean_qs.append({"q": q["q"].strip()[:500], "type": qtype,
                                     "model": (q.get("model") or "").strip()[:2500]})
                image_file = (body.get("imageFile") or "").strip()
                if image_file and not re.match(r"^data/stimuli/[A-Za-z0-9_.-]+\.(jpg|jpeg|png)$", image_file):
                    return self._send_error_json(400, "unknown picture file")
                keywords = [str(k).strip().lower()[:40] for k in (body.get("keywords") or [])
                            if str(k).strip()][:12]
                topics = _read("custom_topics")
                topic = {"id": "custom-" + _new_id(), "title": title[:80],
                         "image": image_file,
                         "linkedTopicId": (body.get("linkedTopicId") or "").strip()[:20],
                         "keywords": keywords, "questions": clean_qs,
                         "createdAt": _now_iso()}
                topics.append(topic)
                _write("custom_topics", topics)
                return self._send_json({"ok": True, "topic": topic,
                                        "customTopics": sorted(topics, key=lambda t: t.get("createdAt", ""), reverse=True)})

            if parsed.path == "/api/ai-oral":
                cfg = _ai_config()
                if not cfg["enabled"]:
                    return self._send_error_json(400, "AI marking is switched off")
                if not cfg["apiKey"]:
                    return self._send_error_json(400, "no API key saved yet")
                if not (body.get("transcript") or "").strip():
                    return self._send_error_json(400, "no answer to mark")
                try:
                    text = _call_ai_provider(cfg, _ai_oral_prompt(body))
                    ai = _parse_ai_oral(text)
                except ValueError as e:
                    return self._send_error_json(400, str(e))
                return self._send_json({"ok": True, "ai": ai, "provider": cfg["provider"]})

            if parsed.path == "/api/ai-config":
                cfg = _read("ai_config")
                if not isinstance(cfg, dict):
                    cfg = dict(DEFAULT_AI_CONFIG)
                provider = body.get("provider")
                if provider in ("openai", "anthropic"):
                    cfg["provider"] = provider
                if isinstance(body.get("model"), str):
                    cfg["model"] = body.get("model", "").strip()[:80]
                if isinstance(body.get("enabled"), bool):
                    cfg["enabled"] = body["enabled"]
                if body.get("clearKey"):
                    cfg["apiKey"] = ""
                elif isinstance(body.get("apiKey"), str) and body.get("apiKey").strip():
                    cfg["apiKey"] = body["apiKey"].strip()[:300]
                _write("ai_config", cfg)
                return self._send_json({"ok": True, "config": _ai_public(_ai_config())})

            if parsed.path == "/api/ai-test":
                cfg = _ai_config()
                if not cfg["apiKey"]:
                    return self._send_error_json(400, "no API key saved yet — paste a key and save it first")
                try:
                    reply = _call_ai_provider(
                        cfg, "Reply with exactly this word: OK",
                        system_text="Reply with exactly the word OK and nothing else.",
                        test=True)
                except ValueError as e:
                    return self._send_error_json(400, str(e))
                return self._send_json({"ok": True, "reply": reply.strip()[:50]})

            if parsed.path == "/api/ai-mark":
                cfg = _ai_config()
                if not cfg["enabled"]:
                    return self._send_error_json(400, "AI marking is switched off")
                if not cfg["apiKey"]:
                    return self._send_error_json(400, "no API key saved yet")
                try:
                    text = _call_ai_provider(cfg, _ai_mark_prompt(body))
                    ai = _parse_ai_mark(text)
                except ValueError as e:
                    return self._send_error_json(400, str(e))
                return self._send_json({"ok": True, "ai": ai, "provider": cfg["provider"]})

            if parsed.path == "/api/restore":
                if not isinstance(body, dict):
                    return self._send_error_json(400, "invalid backup file")
                for name in ("profiles", "sessions", "custom_passages", "custom_vocab",
                             "custom_topics"):
                    if name in body and isinstance(body[name], list):
                        _write(name, body[name])
                if "mastery" in body and isinstance(body["mastery"], dict):
                    _write("mastery", body["mastery"])
                if "settings" in body and isinstance(body["settings"], dict):
                    _write("settings", body["settings"])
                return self._send_json({"ok": True})
        self._send_error_json(404, "unknown api")

    # ---- API: POST (raw bodies — picture and audio uploads) -----------
    def _api_post_raw(self, parsed):
        length = int(self.headers.get("Content-Length") or 0)
        if parsed.path == "/api/upload-stimulus":
            # multipart/form-data, one file field named "file". Max 6 MB.
            if length <= 0 or length > 6_000_000:
                return self._send_error_json(400, "picture must be under 6 MB")
            raw = self.rfile.read(length)
            data = _parse_multipart(raw, self.headers.get("Content-Type") or "")
            if not data or "file" not in data["files"]:
                return self._send_error_json(400, "no picture file in the upload")
            filename, content = data["files"]["file"]
            ext = os.path.splitext(filename)[1].lower()
            if ext not in (".jpg", ".jpeg", ".png") or not content:
                return self._send_error_json(400, "picture must be a JPG or PNG file")
            if ext == ".jpeg":
                ext = ".jpg"
            with _lock:
                fid = _new_id()
                rel = "data/stimuli/%s%s" % (fid, ext)
                with open(os.path.join(BASE_DIR, rel), "wb") as f:
                    f.write(content)
            return self._send_json({"ok": True, "file": rel, "name": filename})
        if parsed.path == "/api/audio":
            # Binary body: the child's recorded answer. Max 10 MB.
            # Headers: X-Audio-Key (session key), X-Audio-Q (question number).
            if length <= 0 or length > 10_000_000:
                return self._send_error_json(400, "recording is too large")
            key = (self.headers.get("X-Audio-Key") or "").strip()
            q = (self.headers.get("X-Audio-Q") or "").strip()
            ctype = (self.headers.get("Content-Type") or "").lower()
            if not re.match(r"^[A-Za-z0-9][A-Za-z0-9-]{0,40}$", key):
                return self._send_error_json(400, "missing recording id")
            if not q.isdigit() or not 1 <= int(q) <= 20:
                return self._send_error_json(400, "missing question number")
            if "audio" not in ctype and "video" not in ctype and "application/octet-stream" not in ctype:
                return self._send_error_json(400, "not an audio recording")
            raw = self.rfile.read(length)
            with _lock:
                rel = "data/audio/%s-q%s.webm" % (key, q)
                with open(os.path.join(BASE_DIR, rel), "wb") as f:
                    f.write(raw)
                # A new recording also sweeps away recordings older than
                # 7 days, so old audio does not linger.
                _cleanup_old_audio()
            return self._send_json({"ok": True, "file": rel})
        self._send_error_json(404, "unknown api")

    # ---- API: DELETE --------------------------------------------------
    def _api_delete(self, parsed):
        qs = parse_qs(parsed.query)
        # id may come as /api/<thing>/<id> or as ?id=
        parts = [p for p in parsed.path.split("/") if p]
        path_id = parts[2] if len(parts) > 2 and parts[0] == "api" else None
        with _lock:
            if parsed.path == "/api/profiles" or parsed.path.startswith("/api/profiles/"):
                pid = path_id or qs.get("id", [None])[0]
                profiles = [p for p in _read("profiles") if p["id"] != pid]
                _write("profiles", profiles)
                sessions = [s for s in _read("sessions") if s.get("profileId") != pid]
                _write("sessions", sessions)
                all_mastery = _read("mastery")
                if pid in all_mastery:
                    del all_mastery[pid]
                    _write("mastery", all_mastery)
                return self._send_json({"ok": True})
            if parsed.path == "/api/sessions" or parsed.path.startswith("/api/sessions/"):
                sid = path_id or qs.get("id", [None])[0]
                sessions = [s for s in _read("sessions") if s["id"] != sid]
                _write("sessions", sessions)
                return self._send_json({"ok": True})
            if parsed.path == "/api/custom-passages" or parsed.path.startswith("/api/custom-passages/"):
                pid = path_id or qs.get("id", [None])[0]
                passages = [p for p in _read("custom_passages") if p["id"] != pid]
                _write("custom_passages", passages)
                return self._send_json({"ok": True})
            if parsed.path == "/api/custom-vocab" or parsed.path.startswith("/api/custom-vocab/"):
                wid = path_id or qs.get("id", [None])[0]
                words = [w for w in _read("custom_vocab") if w["id"] != wid]
                _write("custom_vocab", words)
                return self._send_json({"ok": True})
            if parsed.path == "/api/custom-topics" or parsed.path.startswith("/api/custom-topics/"):
                tid = path_id or qs.get("id", [None])[0]
                topics = _read("custom_topics")
                gone = [t for t in topics if t["id"] == tid]
                topics = [t for t in topics if t["id"] != tid]
                _write("custom_topics", topics)
                # Delete the topic's picture file too, if it was uploaded.
                for t in gone:
                    img = t.get("image") or ""
                    if re.match(r"^data/stimuli/[A-Za-z0-9_.-]+\.(jpg|png)$", img):
                        try:
                            os.remove(os.path.join(BASE_DIR, img))
                        except OSError:
                            pass
                return self._send_json({"ok": True})
        self._send_error_json(404, "unknown api")

    def _api_backup(self):
        with _lock:
            data = {
                "app": "English Oral and Typing Practice (standalone laptop app)",
                "exportedAt": _now_iso(),
                "profiles": _read("profiles"),
                "sessions": _read("sessions"),
                "custom_passages": _read("custom_passages"),
                "custom_vocab": _read("custom_vocab"),
                "custom_topics": _read("custom_topics"),
                "mastery": _read("mastery"),
                "settings": _read("settings"),
                # NOTE: ai_config (the parent's API key) is deliberately NOT
                # included in backups. A backup file can be shared or copied
                # without the key ever leaving this laptop.
                # Pictures (data/stimuli/) and recorded answer audio
                # (data/audio/) are files, not JSON, so they are not in this
                # backup either — copy the whole app folder to back them up.
            }
        body = json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="practice-backup.json"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run(port_start=8080, port_end=8090):
    for port in range(port_start, port_end + 1):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        except OSError:
            continue
        print("=" * 60)
        print("English Oral and Typing Practice is running!")
        print("Open this address in Google Chrome:")
        print("    http://localhost:%d" % port)
        print("Press Ctrl+C to stop. All pupil data is saved in:")
        print("    %s" % DATA_DIR)
        print("=" * 60)
        # Delete answer recordings older than 7 days on startup.
        removed = _cleanup_old_audio()
        if removed:
            print("Deleted %d answer recording(s) older than 7 days." % removed)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
        return
    print("Could not find a free port between %d and %d." % (port_start, port_end))
    sys.exit(1)


if __name__ == "__main__":
    run()
