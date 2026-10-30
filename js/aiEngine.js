/**
 * InterviewAI – AI Engine
 * ─────────────────────────────────────────────────────────────────
 * Every interview question is written live by Google Gemini – there is no
 * question bank. Each answer is graded by an ensemble of two models:
 *
 *   1. Embedding model  – Gemini sentence embeddings (gemini-embedding-2)
 *                         measure how close each sentence of the answer is to
 *                         each key concept and to the model answer, so a
 *                         correct idea in different words still earns credit.
 *   2. LLM judge        – Gemini grades the answer against the rubric it
 *                         wrote with the question, seeing the embedding
 *                         measurements as evidence.
 *
 * The two scores are fused with fixed weights; how closely they agree sets
 * the confidence shown to the candidate.
 *
 * Functions:
 *   analyzeResume(text)   → candidate profile
 *   generateQuestion(ctx) → next question + its grading rubric (Gemini)
 *   evaluateAnswer(ctx)   → verdict, scores, explanation (ensemble)
 *   generateReport(ctx)   → final scorecard, study plan, role matches
 */

const AIEngine = {

  // Fusion weights: how much each model contributes to a dimension score
  FUSION: { judge: 0.6, ml: 0.4 },

  // Neutral sentence used to calibrate embedding similarities
  CONTROL_SENTENCE: 'I usually watch football with my friends on Sunday evenings.',

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  _status(msg) { if (typeof this.onStatus === 'function') this.onStatus(msg); },

  // Grading progress for the interface: 'meaning' → 'judge' → 'combine'
  _stage(name) { if (typeof this.onStage === 'function') this.onStage(name); },

  // Seconds to wait from a Gemini 429 error ("retryDelay": "13s"), if given
  _retryDelay(errJson, attempt) {
    const details = errJson?.error?.details || [];
    for (const d of details) {
      if (d.retryDelay) {
        const sec = parseFloat(String(d.retryDelay));
        if (!isNaN(sec)) return Math.min(30, sec) * 1000;
      }
    }
    return Math.min(20000, 2000 * Math.pow(2, attempt));
  },

  async _fetchJSON(url, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': window.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, ok: res.ok, json };
    } catch (err) {
      if (err.name === 'AbortError') return { status: 0, ok: false, json: { error: { message: 'Gemini did not respond in time' } } };
      return { status: 0, ok: false, json: { error: { message: 'Network error – check your internet connection' } } };
    } finally {
      clearTimeout(timer);
    }
  },

  _isModelUnavailable(status, message) {
    return status === 404 || (status === 403 && /not (found|available|supported)|no longer|deprecated|access/i.test(message || '')) ||
      /is not found|not supported for generateContent|no longer available/i.test(message || '');
  },

  // ─── Gemini text generation (with model fallback and retries) ─────
  async _callGemini(prompt, { temperature = 0.4, maxTokens = 8192, timeoutMs = 60000 } = {}) {
    if (window.DEMO_MODE) throw new Error('A Gemini API key is required. Add one in AI settings.');

    const all = [window.GEMINI_MODEL, ...window.GEMINI_MODELS.filter(m => m !== window.GEMINI_MODEL)];
    const spent = this._spentModels();
    const fresh = all.filter(m => !spent.includes(m));
    const models = fresh.length ? fresh : all;
    let minuteSwitch = false;
    let lastError = null;

    for (const model of models) {
      let useThinking = true;
      for (let attempt = 0; attempt < 3; attempt++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const generationConfig = { temperature, topP: 0.95, maxOutputTokens: maxTokens, responseMimeType: 'application/json' };
        // Gemini 3.x "thinks" at medium level by default, which adds many seconds.
        // These tasks are short structured writing, so low thinking is enough.
        const thinking = useThinking ? this._thinkingConfig(model) : null;
        if (thinking) generationConfig.thinkingConfig = thinking;
        const { status, ok, json } = await this._fetchJSON(url, {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }, timeoutMs);
        if (!ok && status === 400 && thinking && /thinking/i.test(json?.error?.message || '')) {
          useThinking = false; attempt--; continue;               // model rejected the setting: send without it
        }

        if (ok) {
          const cand = json?.candidates?.[0];
          const text = cand?.content?.parts?.map(p => p.text || '').join('') || '';
          if (!text) {
            lastError = new Error(cand?.finishReason === 'SAFETY' ? 'Gemini declined to answer this request' : 'Gemini returned an empty response');
            continue;
          }
          if (model !== window.GEMINI_MODEL && !minuteSwitch) window.AISettings.model = model;   // remember the model that works (not for a one-minute limit)
          this.lastModel = model;
          this.lastAIError = null;
          return text;
        }

        const message = json?.error?.message || `Gemini error ${status}`;
        lastError = new Error(message);
        if (this._isModelUnavailable(status, message)) break;                 // try the next model
        if (status === 429) {
          const next = models[models.indexOf(model) + 1];
          if (this._isDailyQuota(json)) {
            // Today's free quota for this model is used up: switch for the rest of the day
            this._markSpent(model);
            if (next) { this._status(`Daily free limit reached on ${model} – switching to ${next}`); break; }
            lastError = new Error('The free Gemini quota for today is used up on every model. It resets at midnight US Pacific time (about 12:30 pm IST), or you can enable billing on your key.');
            this.lastAIError = lastError.message;
            throw lastError;
          }
          // Per-minute limit: another model has its own allowance, so switch instead of waiting
          if (next) { this._status(`Gemini is rate-limiting ${model} – trying ${next}`); minuteSwitch = true; break; }
        }
        if (status === 429 || status === 500 || status === 503 || status === 0) {
          if (attempt < 2) {
            const wait = this._retryDelay(json, attempt);
            this._status(status === 429 ? `Gemini rate limit reached – retrying in ${Math.round(wait / 1000)} s` : 'Gemini is busy – retrying…');
            await this._sleep(wait);
            continue;
          }
        }
        // invalid key, bad request, quota exhausted: no point trying other models
        if (status === 400 || status === 401 || status === 403) {
          if (/api key/i.test(message)) lastError = new Error('The Gemini API key was rejected. Check it in AI settings.');
          this.lastAIError = lastError.message;
          throw lastError;
        }
        break;
      }
    }
    this.lastAIError = lastError?.message || 'Gemini request failed';
    throw lastError || new Error('Gemini request failed');
  },

  // Free-tier daily quotas reset at midnight Pacific time
  _quotaDay() {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch { return new Date().toISOString().slice(0, 10); }
  },

  _spentModels() {
    try {
      const v = JSON.parse(localStorage.getItem('iai_spent_models') || '{}');
      return v.day === this._quotaDay() && Array.isArray(v.models) ? v.models : [];
    } catch { return []; }
  },

  _markSpent(model) {
    const models = [...new Set([...this._spentModels(), model])];
    try { localStorage.setItem('iai_spent_models', JSON.stringify({ day: this._quotaDay(), models })); } catch {}
  },

  _isDailyQuota(json) {
    const text = JSON.stringify(json?.error || {});
    return /PerDay|per day|daily/i.test(text);
  },

  _thinkingConfig(model) {
    if (/^gemini-3\.\d+-flash$/.test(model)) return { thinkingLevel: 'low' };
    if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
    return null;
  },

  // Used by the settings panel
  async testConnection() {
    const text = await this._callGemini('Reply with this JSON only: {"ok": true}', { temperature: 0, maxTokens: 256, timeoutMs: 25000 });
    const parsed = this._parseJSON(text);
    if (!parsed) throw new Error('Unexpected response from Gemini');
    let embedNote = '';
    try { embedNote = (await this.embed(['test sentence'])) ? ` + ${this.lastEmbedModel}` : ''; } catch {}
    return window.GEMINI_MODEL + embedNote;
  },

  // ─── Gemini sentence embeddings ───────────────────────────────────
  _embCache: new Map(),

  async embed(texts) {
    if (window.DEMO_MODE || !texts.length) return null;
    const missing = [...new Set(texts.filter(t => !this._embCache.has(t)))];
    for (const model of window.EMBED_MODELS) {
      if (!missing.length) break;
      let failed = false;
      for (let i = 0; i < missing.length && !failed; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const requests = chunk.map(t => model === 'gemini-embedding-2'
          ? { model: `models/${model}`, content: { parts: [{ text: `task: sentence similarity | query: ${t}` }] }, outputDimensionality: 768 }
          : { model: `models/${model}`, content: { parts: [{ text: t }] }, taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: 768 });
        let res = await this._fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, { requests }, 30000);
        if (res.status === 429) { await this._sleep(this._retryDelay(res.json, 0)); res = await this._fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, { requests }, 30000); }
        const vectors = res.ok ? (res.json?.embeddings || []).map(e => e.values) : null;
        if (!vectors || vectors.length !== chunk.length) { failed = true; break; }
        chunk.forEach((t, k) => this._embCache.set(t, vectors[k]));
        this.lastEmbedModel = model;
      }
      if (!failed) missing.length = 0;
    }
    if (texts.some(t => !this._embCache.has(t))) return null;
    return texts.map(t => this._embCache.get(t));
  },

  _cos(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  },

  // ─── Parse JSON from AI response ─────────────────────────────────
  _parseJSON(text) {
    if (!text) return null;
    try { return JSON.parse(text.trim()); } catch {}
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    return null;
  },

  // ─────────────────────────────────────────────────────────────────
  // 1. ANALYZE RESUME
  // ─────────────────────────────────────────────────────────────────
  async analyzeResume(rawText) {
    const prompt = `You are an expert resume parser. Analyze this resume text and return ONLY valid JSON with this exact schema. Extract ALL information; do not invent anything that is not in the text.

RESUME TEXT:
${rawText.substring(0, 8000)}

JSON schema:
{
  "name": "Full Name",
  "email": "",
  "phone": "",
  "education": [{"degree": "", "field": "", "institution": "", "year": ""}],
  "skills": ["skill1", "skill2"],
  "programming_languages": ["Python", "Java"],
  "frameworks": ["React", "Django"],
  "tools": ["Git", "Docker"],
  "projects": [{"name": "", "description": "", "technologies": []}],
  "experience": [{"role": "", "company": "", "duration": "", "description": ""}],
  "certifications": ["cert1"],
  "achievements": ["achievement1"],
  "summary": "Brief professional summary"
}`;

    try {
      const parsed = this._parseJSON(await this._callGemini(prompt, { temperature: 0.1 }));
      if (parsed) return parsed;
      throw new Error('parse_failed');
    } catch {
      return this._localAnalyzeResume(rawText);
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // 2. GENERATE QUESTION  (Gemini only – no question bank)
  // ─────────────────────────────────────────────────────────────────
  _wantBehavioral(interviewType, questionNumber) {
    if (interviewType === 'HR Interview') return true;
    if (interviewType === 'Mixed Interview') return questionNumber === 1 || questionNumber % 3 === 0;
    return false;
  },

  // Things on the résumé a question can be about
  _resumeFocusItems(profile) {
    const items = [];
    for (const p of profile.projects || []) if (p.name && !/^personal project/i.test(p.name)) items.push(`project "${p.name}"${(p.technologies || []).length ? ` (${p.technologies.join(', ')})` : ''}`);
    for (const e of profile.experience || []) if (e.role) items.push(`experience: ${e.role}${e.company ? ' at ' + e.company : ''}`);
    for (const s of [...(profile.programming_languages || []), ...(profile.frameworks || []), ...(profile.skills || []), ...(profile.tools || [])]) items.push(`skill: ${s}`);
    for (const c of [...(profile.certifications || []), ...(profile.achievements || [])]) items.push(`achievement: ${c}`);
    return items;
  },

  _normTopic(topic, behavioral) {
    if (behavioral) return 'Behavioral';
    const names = Taxonomy.TOPIC_NAMES;
    const t = String(topic || '').toLowerCase();
    return names.find(n => n.toLowerCase() === t) ||
      names.find(n => t && (n.toLowerCase().includes(t) || t.includes(n.toLowerCase().split(' ')[0]))) ||
      'Project Deep-Dive';
  },

  // Word-overlap similarity, used to reject near-duplicate questions
  _overlap(a, b) {
    const A = new Set(NLP.contentStems(a)), B = new Set(NLP.contentStems(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / Math.min(A.size, B.size);
  },

  async generateQuestion(ctx) {
    const { profile, jobRole, interviewType, difficulty, previousQuestions, questionNumber, totalQuestions, qaHistory = [] } = ctx;
    if (window.DEMO_MODE) throw new Error('A Gemini API key is required to generate questions. Add one in AI settings.');

    const levels = {
      1: 'Beginner – definitions and core concepts',
      2: 'Intermediate – explaining how something works, with a simple application',
      3: 'Moderate – practical problem-solving and trade-offs',
      4: 'Advanced – complex scenarios, debugging and design decisions',
      5: 'Expert – system design, scale, optimisation and architecture',
    };

    // Follow-up questions, like a real interviewer: only right after a real
    // answer, never two in a row, and at most ~30% of the interview.
    const last = qaHistory[qaHistory.length - 1];
    const followUpsSoFar = qaHistory.filter(q => q.kind === 'follow_up').length;
    const lastScore = last?.evaluation?.overall_score ?? null;
    const followUpAllowed = !!last && last.kind !== 'follow_up' &&
      !['no_answer', 'off_topic'].includes(last.evaluation?.verdict) &&
      followUpsSoFar < Math.max(1, Math.round(totalQuestions * 0.3)) && questionNumber < totalQuestions;
    const followUpPreferred = followUpAllowed && lastScore >= 35 && lastScore <= 88 && (last.answer || '').split(/\s+/).length > 25;
    const wantBehavioral = followUpPreferred && last ? last.type === 'behavioral' : this._wantBehavioral(interviewType, questionNumber);

    const covered = [...new Set(qaHistory.map(q => q.topic))];
    const weak = [...new Set(qaHistory.filter(q => (q.evaluation?.overall_score || 0) < 55).map(q => q.topic))];
    const used = previousQuestions.join(' ').toLowerCase();
    const focus = this._resumeFocusItems(profile).filter(it => !used.includes(it.replace(/^\w+:\s*/, '').replace(/^project "|".*$/g, '').toLowerCase().slice(0, 25)));
    const focusHint = focus.slice(0, 12).join('; ') || 'any relevant résumé item';
    const roleTopics = (Taxonomy.ROLE_TOPICS[jobRole] || []).join(', ');

    const lastBlock = last ? `
PREVIOUS QUESTION (${last.topic}, difficulty ${last.difficulty}): ${last.question}
CANDIDATE'S ANSWER: """${String(last.answer || '').slice(0, 1500)}"""
GRADER'S SUMMARY: ${last.evaluation?.verdict_label || ''} (${lastScore}/100). ${last.evaluation?.summary || ''}` : '\nThis is the first question of the interview.';

    const rejected = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const prompt = `You are a senior interviewer at a top technology company running a ${interviewType} for a ${jobRole} role. You write ONE question at a time and a grading rubric for it.

CANDIDATE RÉSUMÉ
- Name: ${profile.name || 'Candidate'}
- Education: ${(profile.education || []).map(e => [e.degree, e.field, e.institution, e.year].filter(Boolean).join(', ')).join('; ') || 'not given'}
- Languages: ${(profile.programming_languages || []).join(', ') || '–'}
- Frameworks/libraries: ${(profile.frameworks || []).join(', ') || '–'}
- Tools: ${(profile.tools || []).join(', ') || '–'}
- Other skills: ${(profile.skills || []).join(', ') || '–'}
- Projects: ${(profile.projects || []).map(p => `"${p.name}" [${(p.technologies || []).join(', ')}] ${p.description || ''}`).join(' | ') || 'none listed'}
- Experience: ${(profile.experience || []).map(e => `${e.role} at ${e.company} ${e.duration || ''}: ${e.description || ''}`).join(' | ') || 'student / fresher'}
- Certifications/achievements: ${[...(profile.certifications || []), ...(profile.achievements || [])].join('; ') || '–'}

INTERVIEW SO FAR
- Question ${questionNumber} of ${totalQuestions}; required difficulty ${difficulty}/5 = ${levels[difficulty]}
- Topics already covered: ${covered.join(', ') || 'none'}; weak topics: ${weak.join(', ') || 'none'}
- Core topics for this role: ${roleTopics || 'general software engineering'}
- Résumé items not yet discussed: ${focusHint}
${lastBlock}

ALREADY ASKED – never repeat or rephrase these:
${[...previousQuestions, ...rejected].map((q, i) => `${i + 1}. ${q}`).join('\n') || 'none'}

WHAT TO ASK NOW
- Question type: ${wantBehavioral ? 'BEHAVIOURAL – answerable with a real story using the STAR method' : 'TECHNICAL'}
- ${followUpPreferred ? 'Ask a FOLLOW-UP that digs into one specific thing the candidate just said (a choice they made, a claim, a gap). Set "kind" to "follow_up".'
      : followUpAllowed ? 'You MAY ask a follow-up on the previous answer if it is genuinely the most useful next question; otherwise move to a new résumé item. Set "kind" accordingly.'
      : 'Ask a NEW question about a different résumé item or role topic. Set "kind" to "new".'}
- Refer to the candidate's résumé by name (project, tool or role) whenever it fits. Vary the angle: how something works internally, a design decision, debugging a failure, scaling, testing, comparing alternatives, a short scenario.
- The question must be answerable aloud in 1–3 minutes; at most two parts.
- "transition": one short, natural sentence an interviewer would say before the question, reacting to the previous answer without giving away the score (empty string for question 1).
- "topic": choose exactly one of: ${Taxonomy.TOPIC_NAMES.join(', ')}.
- Rubric: a correct, concise model answer (80–150 words) and 4–6 key concepts. Each concept has a short label, a one-sentence "description" that states the idea as a fact, 3–6 "keywords" a candidate would actually say, "core" true if the answer is incomplete without it, and "why" an interviewer expects it.
- ${wantBehavioral ? 'For behavioural questions, key concepts are what THIS story must show (e.g. ownership, the specific skill being probed); STAR structure is graded separately.' : 'Also list 1–3 "misconceptions": plausible but FALSE statements a candidate might make about this topic, each with its correction.'}

Return ONLY this JSON:
{
  "kind": "new" | "follow_up",
  "transition": "…",
  "question": "…",
  "topic": "…",
  "type": "${wantBehavioral ? 'behavioral' : 'technical'}",
  "hint": "one short tip on how to structure the answer, without giving it away",
  "model_answer": "…",
  "key_concepts": [ { "label": "…", "description": "…", "keywords": ["…"], "core": true, "why": "…" } ],
  "misconceptions": [ { "wrong_statement": "…", "correction": "…" } ]
}`;

      this._status(attempt === 0 ? '' : 'Asking Gemini for a different question…');
      const parsed = this._parseJSON(await this._callGemini(prompt, { temperature: 0.9 }));
      const q = parsed && String(parsed.question || '').trim();
      const concepts = Array.isArray(parsed?.key_concepts) ? parsed.key_concepts.filter(c => c && c.label) : [];
      if (!q || q.length < 15 || concepts.length < 2) { rejected.push(q || '(invalid)'); continue; }
      if (previousQuestions.some(p => this._overlap(p, q) > 0.75)) { rejected.push(q); continue; }

      const kind = parsed.kind === 'follow_up' && followUpAllowed ? 'follow_up' : 'new';
      return {
        question: q,
        transition: questionNumber === 1 ? '' : String(parsed.transition || '').trim(),
        kind,
        topic: kind === 'follow_up' && last ? last.topic : this._normTopic(parsed.topic, wantBehavioral),
        type: wantBehavioral ? 'behavioral' : 'technical',
        hint: String(parsed.hint || '').trim(),
        rubricId: null,
        rubric: {
          model: String(parsed.model_answer || '').trim(),
          keyConcepts: concepts.slice(0, 6),
          misconceptions: (Array.isArray(parsed.misconceptions) ? parsed.misconceptions : []).filter(m => m && m.wrong_statement && m.correction).slice(0, 3),
          useStar: wantBehavioral,
        },
        source: 'gemini',
        model: this.lastModel,
      };
    }
    throw new Error('Gemini kept returning a question that was invalid or already asked. Try again.');
  },

  // ─────────────────────────────────────────────────────────────────
  // 3. EVALUATE ANSWER  (embedding model + LLM judge ensemble)
  // ─────────────────────────────────────────────────────────────────

  // Turn Gemini's rubric into the evaluator's format
  _rubricItem({ question, rubric, topic, type }) {
    const behavioral = type === 'behavioral' || rubric?.useStar;
    const kc = (rubric?.keyConcepts || []).map((k, i) => ({
      label: String(k.label),
      description: String(k.description || k.why || k.label),
      w: k.core !== false && i < 4 ? 3 : 2,
      core: behavioral ? false : (k.core !== undefined ? !!k.core : i < 3),
      keys: (Array.isArray(k.keywords) ? k.keywords : []).map(String).filter(Boolean),
      why: String(k.why || 'An interviewer expects this point in a complete answer.'),
    }));
    const S = Taxonomy.STAR;
    const concepts = behavioral ? [S.situation, S.task, S.action, S.result, S.reflection, ...kc.slice(0, 3).map(c => ({ ...c, w: 2 }))] : kc;
    return {
      id: 'gemini', topic: topic || 'General', type: behavioral ? 'behavioral' : 'technical',
      q: question, model: rubric?.model || '', concepts,
      mis: [],                                            // free-text misconceptions are checked semantically below
      misText: (rubric?.misconceptions || []).map(m => ({ wrong: String(m.wrong_statement), right: String(m.correction) })),
      _source: 'ai-rubric',
    };
  },

  // Measure meaning with sentence embeddings
  async _semanticSignals(answer, item) {
    const sentences = NLP.splitSentences(answer).filter(s => NLP.wordCount(s) >= 3).slice(0, 40);
    if (!sentences.length || !item.model) return null;
    const modelSents = NLP.splitSentences(item.model).filter(s => NLP.wordCount(s) >= 3);
    const conceptTexts = item.concepts.map(c => c.re && !c.description ? null : `${c.label}: ${c.description || c.why}`);
    const texts = [answer, item.model, this.CONTROL_SENTENCE, ...sentences, ...modelSents,
      ...conceptTexts.filter(Boolean), ...item.misText.flatMap(m => [m.wrong, m.right])];
    const vecs = await this.embed(texts);
    if (!vecs) return null;
    const V = new Map(texts.map((t, i) => [t, vecs[i]]));
    const v = (t) => V.get(t);
    const cos = (a, b) => this._cos(v(a), v(b));
    const clamp = (x) => Math.max(0, Math.min(1, x));

    // Whole-answer similarity to the model answer, calibrated between an
    // off-topic control sentence (0) and a typical model-answer sentence (1)
    const raw = cos(answer, item.model);
    const ctrl = cos(this.CONTROL_SENTENCE, item.model);
    const ref = modelSents.length ? modelSents.reduce((s, m) => s + cos(m, item.model), 0) / modelSents.length : 0.8;
    const similarity = ref - ctrl > 0.02 ? clamp((raw - ctrl) / (ref - ctrl)) : clamp(raw);

    // Per concept: best-matching answer sentence, calibrated the same way
    const conceptScores = item.concepts.map((c, i) => {
      const ct = conceptTexts[i];
      if (!ct) return null;                                           // STAR parts use their own detector
      let best = -1, bestSent = '';
      for (const s of sentences) { const x = cos(ct, s); if (x > best) { best = x; bestSent = s; } }
      const cRef = modelSents.length ? Math.max(...modelSents.map(m => cos(ct, m))) : 0.8;
      const cCtrl = cos(ct, this.CONTROL_SENTENCE);
      const score = cRef - cCtrl > 0.02 ? clamp((best - cCtrl) / (cRef - cCtrl)) : 0;
      return { score: Math.round(score * 100) / 100, evidence: bestSent };
    });

    // Contrastive misconception check: a sentence closer to a known false
    // statement than to its correction is flagged for the judge to confirm
    const flags = [];
    for (const m of item.misText) {
      const wCtrl = cos(m.wrong, this.CONTROL_SENTENCE);
      let best = null;
      for (const s of sentences) {
        const w = cos(s, m.wrong), r = cos(s, m.right);
        const strength = (w - wCtrl) / Math.max(0.05, 1 - wCtrl);
        // keep the sentence that matches the false claim most strongly
        if (w - r > 0.03 && strength > 0.5 && (!best || strength > best.strength)) best = { s, w, r, strength };
      }
      if (best) flags.push({ sentence: best.s, wrong: m.wrong, correction: m.right, margin: Math.round((best.w - best.r) * 1000) / 1000 });
    }
    return { similarity, rawSimilarity: raw, conceptScores, flags };
  },

  async evaluateAnswer({ question, answer, difficulty, rubric, topic, type, jobRole }) {
    const item = this._rubricItem({ question, rubric, topic, type });

    // Model 1: embeddings (falls back to TF-IDF + keywords if unavailable)
    let semantic = null;
    this._stage('meaning');
    try { semantic = await this._semanticSignals(answer, item); } catch (err) { console.warn('Embedding step failed:', err.message); }
    const ml = AnswerEvaluator.evaluate({ question, answer, difficulty, rubric: item, semantic });
    ml.grading = {
      method: semantic ? 'Embedding model + rubric' : 'Keyword rubric + TF-IDF (embeddings unavailable)',
      ml_overall: ml.overall_score,
      semantic_similarity: semantic ? Math.round(semantic.similarity * 100) : null,
      embed_model: semantic ? this.lastEmbedModel : null,
    };
    if (ml.verdict === 'no_answer' || window.DEMO_MODE) return ml;

    // Model 2: LLM judge, given the measurements as evidence
    const conceptLines = item.concepts.map((c, i) => {
      const sc = semantic?.conceptScores?.[i];
      const mlStatus = ml.concepts[i]?.status;
      return `- ${c.label}${c.core ? ' (essential)' : ''}: ${c.description || c.why}  [automatic check: ${mlStatus}${sc ? `, semantic match ${Math.round(sc.score * 100)}%` : ''}]`;
    }).join('\n');
    const flagLines = (semantic?.flags || []).map(f => `- Sentence "${f.sentence}" looks close to the false claim "${f.wrong}" (correct: ${f.correction})`).join('\n');

    const prompt = `You are a strict but fair senior interviewer grading one answer in a ${jobRole} interview.
Grade against the reference rubric. Quote the candidate's own words as evidence. Do not invent anything the candidate did not say. Judge correctness of meaning, not wording: a correct idea in different words counts.

Difficulty: ${difficulty}/5
Question: ${question}

Reference model answer:
${item.model}

Key concepts (with automatic measurements from an embedding model – use them as evidence, but make your own judgement):
${conceptLines}
${item.type === 'behavioral' ? '\nThis is a behavioural question: also judge whether the story is specific, first-person and has a clear result.' : ''}
Known misconceptions for this topic:
${item.misText.map(m => `- FALSE: ${m.wrong} | TRUE: ${m.right}`).join('\n') || '- none listed'}
${flagLines ? `\nThe embedding model flagged these sentences – confirm or reject each:\n${flagLines}` : ''}

Candidate's answer:
"""${answer}"""

Scoring (0–100 per dimension): 85+ excellent and accurate · 60–84 good with minor gaps · 40–59 partially correct · 20–39 major gaps · 0–19 wrong or off-topic.
Any factually wrong statement must appear in "misconceptions" (quote it exactly) and lowers technical_correctness.

Return ONLY this JSON:
{
  "verdict": "correct|partially_correct|incorrect|off_topic",
  "technical_correctness": 0, "relevance": 0, "depth_of_knowledge": 0, "clarity": 0, "completeness": 0,
  "summary": "One or two sentences: the verdict and the main reason",
  "explanation": ["**What you got right.** …", "**What was wrong.** … (omit if nothing)", "**What was missing.** …", "**Delivery.** …"],
  "concepts": [{"label": "exact concept label from the list", "status": "covered|partial|missed|contradicted", "evidence": "exact quote or empty", "why": "why it matters"}],
  "misconceptions": [{"quote": "exact wrong statement from the answer", "correction": "the correct fact"}],
  "dimension_reasons": {"technical_correctness": "", "relevance": "", "depth_of_knowledge": "", "clarity": "", "completeness": ""},
  "improvement_tips": ["specific tip", "specific tip", "specific tip"],
  "strengths": ["short"], "weaknesses": ["short"]
}`;

    try {
      this._stage('judge');
      const judge = this._parseJSON(await this._callGemini(prompt, { temperature: 0.1 }));
      if (!judge || typeof judge.technical_correctness !== 'number') throw new Error('The judge returned an unreadable grade');
      this._stage('combine');
      return this._fuse(ml, judge, semantic, item);
    } catch (err) {
      console.warn('LLM judge failed, using the embedding model only:', err.message);
      ml.grading.method += ' (LLM judge unavailable)';
      ml.confidence_label = ml.confidence_label === 'High' ? 'Medium' : ml.confidence_label;
      // Embeddings cannot verify facts: a sentence close to a known false claim
      // blocks a "correct" verdict until the judge can check it
      const flag = (semantic?.flags || []).filter(f => f.margin >= 0.06).sort((x, y) => y.margin - x.margin)[0];
      if (flag) {
        if (ml.verdict === 'correct') {
          ml.verdict = 'partially_correct';
          ml.verdict_label = AnswerEvaluator.VERDICTS.partially_correct.label;
          ml.overall_score = Math.min(ml.overall_score, 69);
        }
        ml.confidence_label = 'Low';
        ml.explanation = [`**Needs checking.** The sentence "${flag.sentence}" is close to the known misconception "${flag.wrong}" (correct: ${flag.correction}). The AI judge was unavailable to confirm, so this answer cannot be marked fully correct.`, ...(ml.explanation || [])];
      }
      return ml;
    }
  },

  // Combine the LLM judge with the embedding-based measurements
  _fuse(ml, g, semantic, item) {
    const num = (v, d) => (typeof v === 'number' && !isNaN(v) ? Math.max(0, Math.min(100, Math.round(v))) : d);
    const dims = ['technical_correctness', 'relevance', 'depth_of_knowledge', 'clarity', 'completeness'];
    const W = AnswerEvaluator.WEIGHTS;
    const weighted = (o) => W.technical * o.technical_correctness + W.completeness * o.completeness + W.depth * o.depth_of_knowledge + W.relevance * o.relevance + W.clarity * o.clarity;

    const judgeDims = {}, fused = {};
    for (const d of dims) {
      judgeDims[d] = num(g[d], ml[d]);
      fused[d] = Math.round(this.FUSION.judge * judgeDims[d] + this.FUSION.ml * ml[d]);
    }
    const judgeOverall = Math.round(weighted(judgeDims));
    let overall = Math.round(weighted(fused));

    // Concepts: the judge's status, with the embedding model's evidence as backup
    const byLabel = new Map((Array.isArray(g.concepts) ? g.concepts : []).map(c => [String(c.label || '').toLowerCase(), c]));
    const statuses = ['covered', 'partial', 'missed', 'contradicted'];
    const concepts = ml.concepts.map((c, i) => {
      const j = byLabel.get(c.label.toLowerCase());
      const sc = semantic?.conceptScores?.[i];
      return {
        ...c,
        status: j && statuses.includes(j.status) ? j.status : c.status,
        evidence: (j && j.evidence) || c.evidence || '',
        why: (j && j.why) || c.why,
        semantic_match: sc ? Math.round(sc.score * 100) : null,
        ml_status: c.status,
      };
    });

    const misconceptions = (Array.isArray(g.misconceptions) ? g.misconceptions : [])
      .filter(m => m && m.correction).map(m => ({ quote: String(m.quote || ''), correction: String(m.correction) }));

    // A concept "covered" only by a sentence the judge marked as false is not
    // covered: its key terms appear in the correction of that false statement
    const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9]+/g) || []);
    concepts.forEach((c, i) => {
      if (c.status !== 'covered' && c.status !== 'partial') return;
      for (const m of misconceptions) {
        const q = m.quote.toLowerCase().trim(), ev = String(c.evidence || '').toLowerCase().trim();
        const sameSentence = q && ev && (q.includes(ev.slice(0, 60)) || ev.includes(q.slice(0, 60)));
        const corr = words(m.correction);
        const hits = (item.concepts[i]?.keys || []).filter(k => String(k).toLowerCase().split(/\s+/).every(w => [...corr].some(x => x === w || (w.length > 3 && x.startsWith(w))))).length;
        if (sameSentence && hits >= 2) { c.status = 'contradicted'; c.why = `Contradicted: ${m.correction}`; break; }
      }
    });

    // Verdict: consistent rules applied to the fused result
    const credit = (s) => s === 'covered' ? 1 : s === 'partial' ? 0.5 : 0;
    const core = concepts.filter(c => c.core);
    const coreCov = core.length ? core.reduce((s, c) => s + c.w * credit(c.status), 0) / core.reduce((s, c) => s + c.w, 0) : 1;
    let verdict;
    if (g.verdict === 'off_topic' || (ml.verdict === 'off_topic' && g.verdict !== 'correct' && g.verdict !== 'partially_correct')) { verdict = 'off_topic'; overall = Math.min(overall, 20); }
    else if (misconceptions.length && (coreCov < 0.5 || g.verdict === 'incorrect')) { verdict = 'incorrect'; overall = Math.min(overall, 40); }
    else if (overall >= 70 && !misconceptions.length && g.verdict === 'correct') verdict = 'correct';
    else if (overall >= 38) { verdict = 'partially_correct'; overall = Math.min(overall, misconceptions.length ? 65 : 84); }
    else verdict = 'incorrect';

    const gap = Math.abs(judgeOverall - ml.overall_score);
    const confidence_label = gap <= 10 ? 'High' : gap <= 20 ? 'Medium' : 'Low';

    const reasons = {};
    for (const d of dims) {
      const jr = g.dimension_reasons?.[d];
      reasons[d] = `${jr || ml.dimension_reasons?.[d] || ''} (Gemini judge ${judgeDims[d]}, embedding model ${ml[d]})`.trim();
    }

    const list = (x, d) => (Array.isArray(x) && x.length ? x.filter(Boolean).map(String) : d);
    return {
      ...ml,
      ...fused,
      overall_score: Math.max(0, Math.min(100, overall)),
      verdict,
      verdict_label: AnswerEvaluator.VERDICTS[verdict].label,
      confidence: Math.round((1 - Math.min(gap, 40) / 40) * 100) / 100,
      confidence_label,
      concepts,
      misconceptions,
      summary: g.summary || ml.summary,
      feedback: g.summary || ml.feedback,
      explanation: list(g.explanation, ml.explanation),
      improvement_tips: list(g.improvement_tips, ml.improvement_tips),
      strengths: list(g.strengths, ml.strengths),
      weaknesses: list(g.weaknesses, ml.weaknesses),
      dimension_reasons: reasons,
      model_answer: item.model,
      engine: `Gemini judge + embedding model`,
      grading: {
        method: 'Ensemble: LLM judge (60%) + embedding model (40%)',
        judge_overall: judgeOverall,
        ml_overall: ml.overall_score,
        agreement_gap: gap,
        semantic_similarity: semantic ? Math.round(semantic.similarity * 100) : null,
        llm_model: this.lastModel,
        embed_model: semantic ? this.lastEmbedModel : null,
        flagged_sentences: (semantic?.flags || []).length,
      },
      next_difficulty_action: overall >= 80 && verdict === 'correct' ? 'increase' : overall >= 55 ? 'maintain' : 'decrease',
    };
  },

  // ─────────────────────────────────────────────────────────────────
  // 4. GENERATE FINAL REPORT
  // ─────────────────────────────────────────────────────────────────
  async generateReport({ profile, session, qaHistory }) {
    const scores = qaHistory.map(qa => qa.evaluation?.overall_score || 0);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // The local report is always computed – its numbers come straight from
    // the per-question evaluations, so they are never random.
    const local = this._localReport({ profile, session, qaHistory, avgScore });
    if (window.DEMO_MODE) return local;

    const qaText = qaHistory.map((qa, i) =>
      `Q${i + 1} [${qa.topic}, difficulty ${qa.difficulty}] ${qa.question}\nAnswer: ${qa.answer}\nVerdict: ${qa.evaluation?.verdict_label} (${qa.evaluation?.overall_score}/100). ${qa.evaluation?.summary || ''}`
    ).join('\n\n');

    const prompt = `You are an expert career coach. Write a personalised interview performance report.

Candidate: ${profile.name || 'Candidate'} · Role: ${session.jobRole} · Type: ${session.interviewType}
Average score: ${avgScore}/100
Skills: ${local._skills.join(', ')}

Graded Q&A:
${qaText}

Base every statement on the Q&A above – cite question numbers. Return ONLY this JSON:
{
  "strengths": ["specific strength with evidence (Q#)", "...", "..."],
  "weaknesses": ["specific weakness with evidence (Q#)", "...", "..."],
  "improvement_roadmap": {
    "immediate": [{"topic": "", "description": "", "resources": ""}],
    "short_term": [{"topic": "", "description": "", "resources": ""}],
    "advanced": [{"topic": "", "description": "", "resources": ""}]
  },
  "overall_feedback": "Two short paragraphs of honest, specific feedback",
  "resume_kit": {
    "skills_demonstrated": ["a skill or topic the candidate clearly demonstrated, with the question number, e.g. 'Model validation on imbalanced data (Q1)'"],
    "resume_bullets": ["2 to 4 résumé bullet points the candidate can truthfully add or rewrite. Use ONLY facts, numbers and technologies the candidate stated in their answers or résumé. Start each with a strong past-tense verb. Never invent metrics."],
    "keywords_to_add": ["3 to 6 technologies or concepts expected for the ${session.jobRole} role that are missing from the résumé"]
  }
}`;

    try {
      const g = this._parseJSON(await this._callGemini(prompt, { temperature: 0.5 }));
      if (g?.strengths) {
        return {
          ...local,
          strengths: g.strengths.length ? g.strengths : local.strengths,
          weaknesses: g.weaknesses?.length ? g.weaknesses : local.weaknesses,
          improvement_roadmap: g.improvement_roadmap || local.improvement_roadmap,
          overall_feedback: g.overall_feedback || local.overall_feedback,
          resume_kit: {
            skills_demonstrated: g.resume_kit?.skills_demonstrated?.length ? g.resume_kit.skills_demonstrated.slice(0, 6) : local.resume_kit.skills_demonstrated,
            // the certificate line always comes first, then Gemini's bullets drawn from the answers
            resume_bullets: [local.resume_kit.resume_bullets[0], ...(g.resume_kit?.resume_bullets || []).slice(0, 4)],
            keywords_to_add: g.resume_kit?.keywords_to_add?.length ? g.resume_kit.keywords_to_add.slice(0, 6) : local.resume_kit.keywords_to_add,
          },
        };
      }
      throw new Error('parse_failed');
    } catch {
      return local;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //   LOCAL HELPERS (résumé fallback parser, topic mapping, report maths)
  // ═══════════════════════════════════════════════════════════════

  // ─── Résumé parsing with regular expressions ────────────────────
  _localAnalyzeResume(rawText) {
    const text = rawText || '';
    const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
    // Word-boundary match so "r" does not match every word and "java" does not match "javascript"
    const has = (term) => {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9+#])${esc}(?![a-z0-9+#])`, 'i').test(lower);
    };
    const pretty = {
      'c++': 'C++', 'c#': 'C#', c: 'C', r: 'R', go: 'Go', javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', sql: 'SQL', php: 'PHP',
      nodejs: 'Node.js', 'node.js': 'Node.js', nextjs: 'Next.js', 'next.js': 'Next.js', fastapi: 'FastAPI', mysql: 'MySQL', postgresql: 'PostgreSQL',
      mongodb: 'MongoDB', aws: 'AWS', gcp: 'GCP', github: 'GitHub', grpc: 'gRPC', rabbitmq: 'RabbitMQ', opencv: 'OpenCV', 'scikit-learn': 'scikit-learn', sklearn: 'scikit-learn', pytorch: 'PyTorch',
      tensorflow: 'TensorFlow', numpy: 'NumPy', 'power bi': 'Power BI', 'machine learning': 'Machine Learning', 'deep learning': 'Deep Learning',
      'data structures': 'Data Structures', nlp: 'NLP', 'rest api': 'REST APIs', 'ci/cd': 'CI/CD', oop: 'OOP', dbms: 'DBMS',
    };
    const fmt = (t) => pretty[t] || t.replace(/\b\w/g, ch => ch.toUpperCase());

    const languages = ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'c', 'go', 'golang', 'rust', 'kotlin', 'swift', 'r', 'matlab', 'sql', 'php', 'ruby', 'scala', 'html', 'css', 'bash', 'dart'].filter(has);
    const frameworks = ['react', 'angular', 'vue', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'node.js', 'nodejs', 'express', 'next.js', 'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'sklearn', 'pandas', 'numpy', 'opencv', 'bootstrap', 'tailwind', 'laravel', 'flutter', 'react native'].filter(has);
    const tools = ['git', 'github', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'mysql', 'postgresql', 'mongodb', 'redis', 'kafka', 'rabbitmq', 'nginx', 'grpc', 'prometheus', 'terraform', 'firebase', 'linux', 'jenkins', 'figma', 'jira', 'postman', 'power bi', 'tableau', 'excel'].filter(has);
    const concepts = ['machine learning', 'deep learning', 'data structures', 'algorithms', 'nlp', 'computer vision', 'rest api', 'microservices', 'oop', 'operating systems', 'computer networks', 'dbms', 'ci/cd', 'statistics', 'data analysis'].filter(has);

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const phoneMatch = text.match(/(\+?\d[\d\s-]{8,}\d)/);
    const nameLine = lines.find(l => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(' ').length <= 5) || lines[0] || 'Candidate';

    // Projects: lines under a "Projects" heading until the next heading
    const projects = [];
    const headingRe = /^(education|experience|work experience|skills|technical skills|certifications?|achievements|awards|internships?|publications|languages|interests|hobbies|summary|objective|extra[- ]curricular|positions? of responsibility)\b/i;
    const projIdx = lines.findIndex(l => /^(academic |personal |key )?projects?\b/i.test(l));
    if (projIdx >= 0) {
      for (let i = projIdx + 1; i < lines.length && projects.length < 4; i++) {
        const l = lines[i];
        if (headingRe.test(l)) break;
        const titleLike = l.length <= 80 && !/^[•\-*–]/.test(l) && !/[.]$/.test(l) && /[A-Za-z]/.test(l);
        if (titleLike) {
          const desc = (lines[i + 1] || '').replace(/^[•\-*–]\s*/, '');
          const descLower = ' ' + (l + ' ' + desc).toLowerCase() + ' ';
          const techs = [...languages, ...frameworks, ...tools]
            .filter(t => t.length > 2 && new RegExp(`(^|[^a-z0-9+#])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9+#])`).test(descLower))
            .map(fmt);
          // A "Name | Tech, Tech" title lists the stack explicitly
          const listed = l.includes('|') ? l.split('|').slice(1).join(',').split(/[,/]/).map(t => t.trim()).filter(t => t && t.length <= 24) : [];
          projects.push({ name: l.replace(/\s*[|–]\s*.*$/, '').trim(), description: desc, technologies: [...new Set([...listed, ...techs])] });
        }
      }
    }

    // Lines under a heading, up to the next heading
    const section = (re) => {
      const i = lines.findIndex(l => re.test(l) && l.length < 40);
      if (i < 0) return [];
      const out = [];
      for (let k = i + 1; k < lines.length && !headingRe.test(lines[k]) && !/^(academic |personal |key )?projects?\b/i.test(lines[k]); k++) out.push(lines[k]);
      return out;
    };
    const experience = [];
    const expLines = [...section(/^(work )?experience\b/i), ...section(/^internships?\b/i)];
    const isRoleLine = (l) => l.length <= 120 && !/[.]$/.test(l) && /^[A-Z]/.test(l) && (/\b(19|20)\d{2}\b|present/i.test(l) || /\s(at|@)\s/.test(l));
    for (let k = 0; k < expLines.length && experience.length < 4; k++) {
      const l = expLines[k];
      if (!isRoleLine(l)) continue;
      const duration = (l.match(/\(([^)]*\d{4}[^)]*)\)/) || l.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{4}\s*[-–]\s*(?:\w+\.? \d{4}|present))/i) || [])[1] || '';
      const head = l.replace(/\(.*?\)/, '').replace(duration, '').trim().replace(/[,|–-]\s*$/, '');
      const [role, company] = head.includes(' at ') ? head.split(' at ') : head.split(/\s*[,|–]\s*/);
      const desc = [];
      for (let j = k + 1; j < expLines.length && !isRoleLine(expLines[j]); j++) desc.push(expLines[j].replace(/^[•\-*–]\s*/, ''));
      experience.push({ role: (role || head).trim(), company: (company || '').trim(), duration: duration.trim(), description: desc.join(' ') });
    }
    const listFrom = (ls) => ls.join(' ').split(/(?<=\.)\s+|;|•/).map(t => t.trim().replace(/\.$/, '')).filter(t => t.length > 3);
    const certifications = listFrom(section(/^certifications?\b/i)).slice(0, 8);
    const achievements = listFrom(section(/^(achievements|awards)\b/i)).slice(0, 8);

    const eduMatch = text.match(/(B\.?\s?Tech|B\.?E\.?|B\.?Sc|M\.?Tech|M\.?Sc|MCA|BCA|Bachelor[^,\n]*|Master[^,\n]*)/i);
    const instMatch = text.match(/([A-Z][A-Za-z.& ]+(University|Institute|College|IIT|NIT|VIT)[A-Za-z ,]*)/);

    return {
      name: nameLine,
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0].trim() : '',
      education: [{
        degree: eduMatch ? eduMatch[0].trim() : '',
        field: /computer science|cse/i.test(text) ? 'Computer Science' : '',
        institution: instMatch ? instMatch[0].trim().replace(/[,;.\s]+$/, '') : '',
        year: ((text.match(/20[1-3]\d\s*[-–]\s*(20[1-3]\d)/) || [])[1]) || (text.match(/20[1-3]\d/) || [''])[0],
      }],
      skills: concepts.map(fmt),
      programming_languages: languages.map(fmt),
      frameworks: [...new Set(frameworks.map(fmt))],
      tools: tools.map(fmt),
      projects,
      experience,
      certifications,
      achievements,
      summary: languages.length ? `Developer with experience in ${languages.slice(0, 3).map(fmt).join(', ')}` : '',
    };
  },

  // ─── Topic detection from the candidate profile ─────────────────
  _resumeTopics(profile) {
    const skills = [
      ...(profile.programming_languages || []), ...(profile.frameworks || []),
      ...(profile.skills || []), ...(profile.tools || []),
      ...(profile.projects || []).flatMap(p => p.technologies || []),
    ].map(s => String(s).toLowerCase().trim());
    const found = {};
    for (const [topic, meta] of Object.entries(Taxonomy.TOPICS)) {
      for (const alias of meta.aliases) {
        const hit = skills.find(s => s === alias || (alias.length > 2 && s.includes(alias)));
        if (hit && !found[topic]) found[topic] = hit;
      }
    }
    return found;   // { topic: matchedSkill }
  },

  _prettySkill(s) {
    const map = { 'c++': 'C++', git: 'Git', 'rest api': 'REST APIs', 'rest apis': 'REST APIs', github: 'GitHub', sql: 'SQL', mysql: 'MySQL', postgresql: 'PostgreSQL', javascript: 'JavaScript', 'machine learning': 'Machine Learning', oop: 'OOP', aws: 'AWS', dbms: 'DBMS', nlp: 'NLP' };
    return map[s] || (s.length <= 3 ? s.toUpperCase() : s.replace(/\b\w/g, ch => ch.toUpperCase()));
  },

  // ─── Final report computed from the evaluations ─────────────────
  _localReport({ profile, session, qaHistory, avgScore }) {
    const evals = qaHistory.map(qa => qa.evaluation || {});
    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const field = (k, filter = () => true) => avg(qaHistory.filter(filter).map(qa => qa.evaluation?.[k] || 0));
    const technicalQs = qa => qa.evaluation?.evaluation_type !== 'behavioral';

    const skills = [...new Set([
      ...(profile.programming_languages || []), ...(profile.frameworks || []),
      ...(profile.skills || []), ...(profile.tools || []),
    ])];
    const resumeTopics = this._resumeTopics(profile);

    // ── Skill scores (each traced back to per-question dimensions) ──
    const anyTechnical = qaHistory.some(technicalQs);
    const hardQs = qa => (qa.difficulty || 2) >= 3;
    const confidencePerAnswer = qaHistory.map(qa => {
      const e = qa.evaluation || {};
      const st = e.answer_stats || {};
      if (e.verdict === 'no_answer') return 10;
      let c = 90 - (st.hedges || 0) * 12;
      if (st.words && st.target_words && st.words < st.target_words * 0.4) c -= 20;
      return Math.max(10, Math.min(100, c));
    });
    const resumeQs = qa => resumeTopics[qa.topic] || qa.topic === 'Project Deep-Dive';

    const skill_scores = {
      technical_knowledge: anyTechnical ? field('technical_correctness', technicalQs) : field('technical_correctness'),
      problem_solving: qaHistory.some(hardQs) ? field('depth_of_knowledge', hardQs) : field('depth_of_knowledge'),
      communication: field('clarity'),
      conceptual_understanding: field('completeness'),
      resume_knowledge: qaHistory.some(resumeQs) ? field('overall_score', resumeQs) : field('relevance'),
      overall_confidence: avg(confidencePerAnswer),
    };

    // ── Verdict counts ──
    const verdict_summary = { correct: 0, partially_correct: 0, incorrect: 0, off_topic: 0, no_answer: 0 };
    for (const e of evals) if (verdict_summary[e.verdict] !== undefined) verdict_summary[e.verdict]++;

    // ── Topic performance ──
    const topicMap = {};
    qaHistory.forEach((qa, i) => {
      const t = qa.topic || 'General';
      topicMap[t] = topicMap[t] || { topic: t, scores: [], qs: [], missed: [], wrong: [] };
      topicMap[t].scores.push(qa.evaluation?.overall_score || 0);
      topicMap[t].qs.push(i + 1);
      for (const c of qa.evaluation?.concepts || []) {
        if (c.core && (c.status === 'missed' || c.status === 'contradicted')) topicMap[t].missed.push(c.label);
      }
      for (const m of qa.evaluation?.misconceptions || []) topicMap[t].wrong.push(m.correction);
    });
    const topics = Object.values(topicMap).map(t => ({ ...t, avg: avg(t.scores) })).sort((a, b) => b.avg - a.avg);
    const best = topics[0];
    const worst = topics[topics.length - 1];

    // ── Strengths (evidence-based) ──
    const strengths = [];
    qaHistory
      .map((qa, i) => ({ qa, i }))
      .filter(x => (x.qa.evaluation?.overall_score || 0) >= 65)
      .sort((a, b) => b.qa.evaluation.overall_score - a.qa.evaluation.overall_score)
      .slice(0, 3)
      .forEach(({ qa, i }) => {
        const covered = (qa.evaluation.concepts || []).filter(c => c.status === 'covered').map(c => c.label);
        strengths.push(`${qa.topic}: ${covered.slice(0, 2).join('; ') || 'answered accurately'} (Q${i + 1}, ${qa.evaluation.overall_score}/100)`);
      });
    if (skill_scores.communication >= 75) strengths.push(`Clear, well-structured communication (average clarity ${skill_scores.communication}/100)`);
    if (verdict_summary.no_answer === 0 && qaHistory.length) strengths.push('Attempted every question instead of skipping');
    if (!strengths.length) strengths.push('Completed the full interview – a baseline to improve from');

    // ── Weaknesses (evidence-based) ──
    const weaknesses = [];
    qaHistory.forEach((qa, i) => {
      for (const m of (qa.evaluation?.misconceptions || []).slice(0, 1)) {
        weaknesses.push(`Factual error in Q${i + 1} (${qa.topic}): ${String(m.correction).split(/(?<=\.)\s/)[0]}`);
      }
    });
    qaHistory
      .map((qa, i) => ({ qa, i }))
      .filter(x => (x.qa.evaluation?.overall_score || 0) < 60)
      .sort((a, b) => a.qa.evaluation.overall_score - b.qa.evaluation.overall_score)
      .forEach(({ qa, i }) => {
        const missed = (qa.evaluation?.concepts || []).filter(c => c.core && c.status !== 'covered').map(c => c.label);
        if (qa.evaluation?.verdict === 'no_answer') weaknesses.push(`Skipped Q${i + 1} (${qa.topic})`);
        else if (missed.length) weaknesses.push(`${qa.topic} (Q${i + 1}): missed ${missed.slice(0, 2).join('; ')}`);
      });
    const shortAnswers = qaHistory.filter(qa => {
      const st = qa.evaluation?.answer_stats || {};
      return st.words && st.target_words && st.words < st.target_words * 0.5;
    }).length;
    if (shortAnswers >= Math.max(2, qaHistory.length / 2)) weaknesses.push(`Answers are too brief – ${shortAnswers} of ${qaHistory.length} were under half the expected length`);
    if (skill_scores.overall_confidence < 65) weaknesses.push('Frequent hedging ("I think", "maybe") or very short answers make you sound unsure');
    if (!weaknesses.length) weaknesses.push('No major gaps – focus on adding trade-offs and real examples to reach expert level');

    // ── Learning roadmap from actual gaps ──
    const res = (t) => (Taxonomy.TOPICS[t] || {}).resources || 'Official documentation, practice problems and mock interviews';
    const weakTopics = topics.filter(t => t.avg < 60).reverse();
    const midTopics = topics.filter(t => t.avg >= 60 && t.avg < 80);
    const roleTopics = Taxonomy.ROLE_TOPICS[session.jobRole] || [];
    const untested = roleTopics.filter(t => !topicMap[t]);

    const immediate = weakTopics.slice(0, 3).map(t => ({
      topic: t.topic,
      description: `Scored ${t.avg}/100 (Q${t.qs.join(', Q')}). ${t.wrong.length ? 'Fix the misconception first. ' : ''}${t.missed.length ? `Revise: ${[...new Set(t.missed)].slice(0, 3).join('; ')}.` : 'Revise the fundamentals and practise explaining them aloud.'}`,
      resources: res(t.topic),
    }));
    if (shortAnswers >= 2 || immediate.length === 0) {
      immediate.push({
        topic: 'Answer structure',
        description: 'Practise a 4-part structure for every technical answer: direct answer → how it works → example → trade-offs. Aim for 60–120 seconds.',
        resources: 'Record yourself answering, then compare against the model answers in this report.',
      });
    }
    const short_term = midTopics.slice(0, 3).map(t => ({
      topic: t.topic,
      description: `Solid base (${t.avg}/100). Push to expert level by covering ${[...new Set(t.missed)].slice(0, 2).join('; ') || 'edge cases, trade-offs and real-world examples'}.`,
      resources: res(t.topic),
    }));
    if (qaHistory.some(qa => qa.evaluation?.evaluation_type === 'behavioral') || session.interviewType !== 'Technical Interview') {
      short_term.push({ topic: 'Behavioural stories (STAR)', description: 'Prepare 5 stories – conflict, failure, leadership, tight deadline, learning fast – each ending with a measurable result.', resources: res('Behavioral') });
    }
    if (!short_term.length) short_term.push({ topic: 'Mock interviews', description: 'Repeat this interview at a higher starting difficulty to confirm your level.', resources: 'InterviewAI, Pramp, peer mock interviews' });
    const advanced = untested.slice(0, 3).map(t => ({
      topic: t,
      description: `A core area for ${session.jobRole} roles that this interview did not test yet.`,
      resources: res(t),
    }));
    if (!advanced.length) advanced.push({ topic: 'System Design', description: 'Learn to design scalable systems: caching, load balancing, databases and trade-offs.', resources: res('System Design') });

    // ── Job recommendations (skill coverage × interview performance) ──
    const roleMeta = {
      'Software Developer':   { icon: '💻', salary: '₹6 – ₹14 LPA' },
      'Frontend Developer':   { icon: '🎨', salary: '₹5 – ₹12 LPA' },
      'Backend Developer':    { icon: '⚙️', salary: '₹6 – ₹15 LPA' },
      'Full Stack Developer': { icon: '🚀', salary: '₹7 – ₹16 LPA' },
      'Data Analyst':         { icon: '📊', salary: '₹4 – ₹10 LPA' },
      'Data Scientist':       { icon: '🔬', salary: '₹8 – ₹20 LPA' },
      'ML Engineer':          { icon: '🤖', salary: '₹10 – ₹24 LPA' },
      'AI Engineer':          { icon: '🧠', salary: '₹12 – ₹28 LPA' },
    };
    // Topics backed by real project work (technologies used in projects)
    const projectTopics = this._resumeTopics({ programming_languages: (profile.projects || []).flatMap(p => p.technologies || []) });
    const job_recommendations = Object.entries(Taxonomy.ROLE_TOPICS).map(([role, rTopics]) => {
      const core = rTopics.slice(0, 5);
      const have = core.filter(t => resumeTopics[t]);
      const proven = core.filter(t => projectTopics[t]);
      const tested = qaHistory.filter(qa => core.includes(qa.topic));
      const perf = tested.length ? avg(tested.map(qa => qa.evaluation?.overall_score || 0)) : null;
      const coverage = have.length / core.length;
      // résumé mentions 30 · project evidence 20 · interview performance 40 (untested roles get a reduced estimate)
      const perfPart = perf !== null ? 0.40 * perf : 0.22 * avgScore;
      const match = Math.round(Math.min(96, 8 + 30 * coverage + 20 * (proven.length / core.length) + perfPart + (role === session.jobRole ? 4 : 0)));
      return {
        title: role,
        icon: roleMeta[role].icon,
        match_percentage: match,
        reason: `Your résumé mentions ${have.length} of ${core.length} core areas for this role${have.length ? ` (${have.join(', ')})` : ''}` +
          `${proven.length ? `, ${proven.length} backed by your projects` : ''}` +
          (perf !== null ? `, and you averaged ${perf}/100 on related interview questions.` : '. These skills were not tested in this interview, so the match is an estimate.'),
        matching_skills: [...new Set(have.map(t => this._prettySkill(resumeTopics[t])))],
        missing_skills: core.filter(t => !resumeTopics[t]).slice(0, 3),
        salary_range: `${roleMeta[role].salary} (indicative)`,
      };
    }).sort((a, b) => b.match_percentage - a.match_percentage).slice(0, 6);

    // ── Written feedback ──
    const n = qaHistory.length;
    const journey = qaHistory.map(qa => qa.difficulty);
    const trend = journey.length > 1 ? journey[journey.length - 1] - journey[0] : 0;
    const level = avgScore >= 80 ? 'interview-ready' : avgScore >= 65 ? 'close to interview-ready' : avgScore >= 40 ? 'still developing' : 'at an early stage';
    const keyFix = weaknesses.find(w => !/^Skipped|No major gaps/.test(w));
    const overall_feedback =
      `You answered ${n} question${n === 1 ? '' : 's'} for the ${session.jobRole} role and scored ${avgScore}/100 overall: ` +
      `${verdict_summary.correct} correct, ${verdict_summary.partially_correct} partially correct, ${verdict_summary.incorrect + verdict_summary.off_topic} incorrect or off-topic${verdict_summary.no_answer ? `, ${verdict_summary.no_answer} skipped` : ''}. ` +
      `Based on this session you are ${level} for this role. ` +
      (best ? `Your strongest area was ${best.topic} (${best.avg}/100)` : '') +
      (worst && worst !== best ? ` and your weakest was ${worst.topic} (${worst.avg}/100).` : '.') +
      `\n\nThe adaptive engine ${trend > 0 ? `raised the difficulty from level ${journey[0]} to ${journey[journey.length - 1]}, so you handled harder questions as the interview went on` : trend < 0 ? `lowered the difficulty from level ${journey[0]} to ${journey[journey.length - 1]} after some answers fell short` : `kept the difficulty steady at level ${journey[0] || 2}`}. ` +
      `${keyFix ? `The single most valuable fix – ${keyFix.replace(/\.$/, '')}.` : 'Keep adding trade-offs and concrete project examples to move from good to excellent.'} ` +
      'Every question below has a model answer and a concept-by-concept breakdown.';

    // ── Résumé kit (used on the downloadable report card) ──
    const roleLabel = `${String(session.interviewType || 'technical').replace(' Interview', '').toLowerCase()} mock interview`;
    const goodTopics = topics.filter(t => t.avg >= 65 && !/behavio/i.test(t.topic)).map(t => `${t.topic} (${t.avg}/100)`);
    const resume_kit = {
      skills_demonstrated: goodTopics.length ? goodTopics : topics.slice().sort((a, b) => b.avg - a.avg).slice(0, 2).map(t => `${t.topic} (${t.avg}/100)`),
      resume_bullets: [
        `Completed a ${n}-question ${roleLabel} for the ${session.jobRole} role with InterviewAI, scoring ${avgScore}/100.`,
        ...(best && best.avg >= 65 ? [`Scored ${best.avg}/100 on ${best.topic} questions in an adaptive, résumé-based technical interview.`] : []),
      ],
      keywords_to_add: [...new Set(job_recommendations.slice(0, 3).flatMap(j => j.missing_skills || []))].slice(0, 6),
    };

    return {
      overall_score: avgScore,
      skill_scores,
      verdict_summary,
      resume_kit,
      topic_performance: topics.map(t => ({ topic: t.topic, score: t.avg, questions: t.qs })),
      strengths: strengths.slice(0, 5),
      weaknesses: weaknesses.slice(0, 5),
      improvement_roadmap: { immediate, short_term, advanced },
      job_recommendations,
      overall_feedback,
      _skills: skills,
    };
  },
};

window.AIEngine = AIEngine;
