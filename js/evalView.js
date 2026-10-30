/**
 * InterviewAI – Evaluation View
 * Renders a graded answer (verdict, score breakdown, concept checklist,
 * misconceptions, explanation, tips and model answer). Used both on the
 * live interview page and in the scorecard's Q&A review.
 */

const EvalView = {

  escape(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // Escape, then allow **bold** and *italic* from our own explanation text
  rich(text) {
    return this.escape(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  },

  scoreTone(v) {
    if (v >= 80) return 'good';
    if (v >= 60) return 'ok';
    if (v >= 40) return 'warn';
    return 'bad';
  },

  verdictMeta(verdict) {
    const map = {
      correct:           { label: 'Correct',           icon: '✓', cls: 'v-correct' },
      partially_correct: { label: 'Partially correct', icon: '◐', cls: 'v-partial' },
      incorrect:         { label: 'Incorrect',         icon: '✕', cls: 'v-incorrect' },
      off_topic:         { label: 'Off-topic',         icon: '↯', cls: 'v-incorrect' },
      no_answer:         { label: 'No answer',         icon: '–', cls: 'v-none' },
    };
    return map[verdict] || map.partially_correct;
  },

  // Older saved sessions (before this upgrade) only have basic fields.
  isRich(e) {
    return e && Array.isArray(e.concepts);
  },

  ring(score, size = 92) {
    const r = (size - (size > 120 ? 14 : 10)) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
    return `
      <svg class="ev-ring ev-tone-${this.scoreTone(score)}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Score ${score} out of 100">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ev-ring-track"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ev-ring-fill" style="--c:${c.toFixed(1)}"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
        <text x="50%" y="${size < 90 ? 52 : 47}%" text-anchor="middle" dominant-baseline="middle" class="ev-ring-num" style="font-size:${Math.round(size * (size < 90 ? .32 : .28))}px">${score}</text>
        ${size >= 90 ? `<text x="50%" y="69%" text-anchor="middle" class="ev-ring-sub">/ 100</text>` : ''}
      </svg>`;
  },

  // ─── Full evaluation (live interview page) ────────────────────────
  render(e, { compact = false } = {}) {
    if (!this.isRich(e)) return this._renderLegacy(e);

    const v = this.verdictMeta(e.verdict);
    const labels = e.dimension_labels || {};
    const reasons = e.dimension_reasons || {};
    const dims = ['technical_correctness', 'completeness', 'depth_of_knowledge', 'relevance', 'clarity'];
    const defaultLabels = { technical_correctness: 'Technical accuracy', completeness: 'Completeness', depth_of_knowledge: 'Depth', relevance: 'Relevance', clarity: 'Clarity' };
    const weights = { technical_correctness: 35, completeness: 20, depth_of_knowledge: 18, relevance: 15, clarity: 12 };
    const st = e.answer_stats || {};

    const header = `
      <div class="ev-head">
        ${this.ring(e.overall_score || 0, compact ? 76 : 96)}
        <div class="ev-head-main">
          <div class="ev-verdict ${v.cls}"><span class="ev-verdict-icon">${v.icon}</span>${v.label}</div>
          <p class="ev-summary">${this.rich(e.summary || e.feedback || '')}</p>
          <div class="ev-meta">
            ${e.confidence_label ? `<span class="ev-chip" title="How certain the evaluator is about this verdict">Confidence: <b>${this.escape(e.confidence_label)}</b></span>` : ''}
            ${e.topic ? `<span class="ev-chip">${this.escape(e.topic)}</span>` : ''}
            ${e.engine ? `<span class="ev-chip ev-chip-muted">${this.escape(e.engine)}</span>` : ''}
          </div>
        </div>
      </div>`;

    const breakdown = `
      <section class="ev-section">
        <h5 class="ev-h">Score breakdown</h5>
        <div class="ev-dims">
          ${dims.map(k => {
            const val = Math.round(e[k] || 0);
            return `
            <div class="ev-dim">
              <div class="ev-dim-top">
                <span class="ev-dim-label">${this.escape(labels[k] || defaultLabels[k])} <span class="ev-dim-weight">${weights[k]}%</span></span>
                <span class="ev-dim-val ev-tone-${this.scoreTone(val)}">${val}</span>
              </div>
              <div class="ev-bar"><div class="ev-bar-fill ev-tone-${this.scoreTone(val)}" style="width:${val}%"></div></div>
              ${reasons[k] ? `<div class="ev-dim-reason">${this.escape(reasons[k])}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>`;

    const statusIcon = { covered: '✓', partial: '◐', missed: '✕', contradicted: '!' };
    const statusText = { covered: 'Covered', partial: 'Partly covered', missed: 'Missing', contradicted: 'Stated incorrectly' };
    const checklist = `
      <section class="ev-section">
        <h5 class="ev-h">Key concepts the interviewer was looking for
          <span class="ev-h-count">${e.concepts.filter(c => c.status === 'covered').length}/${e.concepts.length} covered</span></h5>
        <ul class="ev-concepts">
          ${e.concepts.map((c, i) => `
            <li class="ev-concept ev-st-${c.status}" style="--i:${i}">
              <span class="ev-concept-icon" title="${statusText[c.status] || ''}">${statusIcon[c.status] || '•'}</span>
              <div class="ev-concept-body">
                <div class="ev-concept-label">${this.escape(c.label)}${c.core ? '<span class="ev-tag">Essential</span>' : ''}<span class="ev-concept-status">${statusText[c.status] || ''}${c.semantic_match !== null && c.semantic_match !== undefined ? `, ${c.semantic_match}% match` : ''}</span></div>
                ${c.evidence && c.status !== 'missed'
                  ? `<div class="ev-evidence">You said: “${this.escape(c.evidence)}”</div>`
                  : c.why && !compact ? `<div class="ev-why">${this.rich(c.why)}</div>` : ''}
              </div>
            </li>`).join('')}
        </ul>
      </section>`;

    // How the grade was produced: the two models and how well they agree
    const gr = e.grading;
    const ensemble = gr && gr.judge_overall !== undefined ? `
      <section class="ev-section">
        <h5 class="ev-h">How this grade was computed <span class="ev-h-count">${this.escape(gr.method || '')}</span></h5>
        <div class="ev-ensemble">
          <div class="ev-ens"><b>${gr.judge_overall}</b><span>Gemini judge${gr.llm_model ? ` (${this.escape(gr.llm_model)})` : ''}</span></div>
          <div class="ev-ens"><b>${gr.ml_overall}</b><span>Embedding model${gr.semantic_similarity !== null && gr.semantic_similarity !== undefined ? `, ${gr.semantic_similarity}% meaning match` : ''}</span></div>
          <div class="ev-ens"><b class="ev-tone-${gr.agreement_gap <= 10 ? 'good' : gr.agreement_gap <= 20 ? 'warn' : 'bad'}">${gr.agreement_gap <= 10 ? 'High' : gr.agreement_gap <= 20 ? 'Medium' : 'Low'}</b><span>Agreement between the two (${gr.agreement_gap}-point gap)</span></div>
        </div>
      </section>` : gr ? `
      <section class="ev-section">
        <h5 class="ev-h">How this grade was computed <span class="ev-h-count">${this.escape(gr.method || '')}</span></h5>
      </section>` : '';

    const misc = (e.misconceptions || []).length ? `
      <section class="ev-section">
        <h5 class="ev-h ev-h-danger">${e.evaluation_type === 'behavioral' ? 'Red flags' : 'Factual errors detected'}</h5>
        ${e.misconceptions.map(m => `
          <div class="ev-misc">
            <div class="ev-misc-quote"><span>You said</span>“${this.escape(m.quote)}”</div>
            <div class="ev-misc-fix"><span>${e.evaluation_type === 'behavioral' ? 'Why it hurts' : 'Correct'}</span>${this.rich(m.correction)}</div>
          </div>`).join('')}
      </section>` : '';

    const explanation = (e.explanation || []).length ? `
      <section class="ev-section">
        <h5 class="ev-h">Detailed explanation</h5>
        <div class="ev-explain">${e.explanation.map(p => `<p>${this.rich(p)}</p>`).join('')}</div>
      </section>` : '';

    const tips = (e.improvement_tips || []).length ? `
      <section class="ev-section">
        <h5 class="ev-h">How to improve this answer</h5>
        <ol class="ev-tips">${e.improvement_tips.map(t => `<li>${this.rich(t)}</li>`).join('')}</ol>
      </section>` : '';

    const model = e.model_answer ? `
      <details class="ev-model" ${compact ? '' : 'open'}>
        <summary>Model answer</summary>
        <p>${this.rich(e.model_answer)}</p>
      </details>` : '';

    const stats = st.words !== undefined ? `
      <div class="ev-stats">
        <span><b>${st.words}</b> words <i>(~${st.target_words} expected)</i></span>
        <span><b>${st.sentences}</b> sentences</span>
        <span><b>${st.examples}</b> example${st.examples === 1 ? '' : 's'}</span>
        <span><b>${st.hedges}</b> hedge${st.hedges === 1 ? '' : 's'}</span>
        ${e.similarity !== undefined ? `<span><b>${e.similarity}%</b> similarity to model answer</span>` : ''}
      </div>` : '';

    return `<div class="ev ${compact ? 'ev-compact' : ''}">${header}${misc}${checklist}${explanation}${tips}${breakdown}${ensemble}${model}${stats}</div>`;
  },

  _renderLegacy(e) {
    if (!e) return '';
    return `<div class="ev"><div class="ev-head">${this.ring(e.overall_score || 0, 76)}
      <div class="ev-head-main"><p class="ev-summary">${this.escape(e.feedback || '')}</p></div></div></div>`;
  },
};

window.EvalView = EvalView;
