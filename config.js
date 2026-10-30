/**
 * InterviewAI Configuration
 * ─────────────────────────
 * InterviewAI needs a Google Gemini API key: every interview question is
 * written by Gemini, and answers are graded by Gemini plus its embedding
 * model. Add the key inside the app (top bar → "Add Gemini key").
 * The key is stored only in this browser (localStorage).
 *
 * You can also hard-code a key below (do not commit it to GitHub).
 * Get a free key at https://aistudio.google.com/app/apikey
 */

const HARDCODED_GEMINI_KEY = ""; // optional

// Text models tried in order. If Google retires one (or a key has no access
// to it), the next one is used automatically. Checked against Google's
// deprecation list, October 2026.
// Tried in this order. On the free tier each model has its own daily quota
// (gemini-3.8-flash allows only about 20 requests a day), so when one runs
// out the app moves to the next for the rest of the day.
window.GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'];

// Embedding models (for semantic similarity when grading), tried in order
window.EMBED_MODELS = ['gemini-embedding-2', 'gemini-embedding-001'];

window.AISettings = {
  _get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  _set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },

  get apiKey() { return this._get('iai_gemini_key') || HARDCODED_GEMINI_KEY; },
  set apiKey(v) { this._set('iai_gemini_key', (v || '').trim()); },

  get model() { return this._get('iai_gemini_model') || window.GEMINI_MODELS[0]; },
  set model(v) { this._set('iai_gemini_model', v); },
};

// Read-only flags used across the app (always reflect the current settings)
Object.defineProperty(window, 'GEMINI_API_KEY', { get: () => window.AISettings.apiKey });
Object.defineProperty(window, 'GEMINI_MODEL',   { get: () => window.AISettings.model });
Object.defineProperty(window, 'DEMO_MODE',      { get: () => !window.AISettings.apiKey });
