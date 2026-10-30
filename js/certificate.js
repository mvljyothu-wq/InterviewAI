/**
 * InterviewAI – Report card
 * Builds a two-page A4 report card from a finished interview:
 *   page 1  certificate with the score, five grading dimensions and topics
 *   page 2  "For your résumé": skills shown, résumé lines, keywords, next steps
 * The card is previewed in a dialog and downloaded as a PDF (html-to-image +
 * jsPDF, loaded only when needed) or printed.
 */

const ReportCard = {
  LIBS: {
    htmlToImage: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  },

  // ─── Helpers ──────────────────────────────────────────────────────
  _esc(t) { return EvalView.escape(t); },

  // Short, stable ID derived from the session (FNV-1a hash, base-32)
  certificateId(report) {
    const src = [report.sessionId, report.overall_score, report.completedAt, report.candidate?.name].join('|');
    const hash = (seed) => {
      let h = 0x811c9dc5 ^ seed;
      for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h >>> 0;
    };
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (const seed of [1, 2, 3]) {
      let h = hash(seed);
      for (let i = 0; i < 4; i++) { out += alphabet[h % 32]; h = Math.floor(h / 32); }
    }
    return `IAI-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
  },

  _dims(report) {
    const evals = (report.qa_history || []).map(q => q.evaluation || {});
    const avg = (k) => evals.length ? Math.round(evals.reduce((s, e) => s + (e[k] || 0), 0) / evals.length) : 0;
    return [
      ['Technical accuracy', avg('technical_correctness')],
      ['Completeness', avg('completeness')],
      ['Depth', avg('depth_of_knowledge')],
      ['Relevance', avg('relevance')],
      ['Clarity', avg('clarity')],
    ];
  },

  _band(score) {
    if (score >= 90) return 'Distinction';
    if (score >= 75) return 'Merit';
    if (score >= 60) return 'Proficient';
    if (score >= 40) return 'Developing';
    return 'Foundation';
  },

  _tone(v) { return v >= 75 ? 'good' : v >= 55 ? 'ok' : v >= 40 ? 'warn' : 'bad'; },

  _seal(year) {
    const text = 'INTERVIEWAI • CERTIFIED ASSESSMENT • INTERVIEW PERFORMANCE •';
    return `
      <svg class="rc-seal" viewBox="0 0 120 120" aria-hidden="true">
        <defs><path id="rc-seal-path" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"/></defs>
        <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" stroke-width=".6"/>
        <circle cx="60" cy="60" r="37" fill="none" stroke="currentColor" stroke-width=".6"/>
        <text font-size="7" fill="currentColor" font-weight="600"><textPath href="#rc-seal-path" textLength="284" lengthAdjust="spacing">${text}</textPath></text>
        <g transform="translate(46 44)" fill="currentColor"><rect x="4" y="9" width="4" height="10" rx="2"/><rect x="12" y="3" width="4" height="22" rx="2"/><rect x="20" y="7" width="4" height="14" rx="2"/></g>
        <text x="60" y="84" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" letter-spacing="1">${year}</text>
      </svg>`;
  },

  _ring(score, size) {
    const r = (size - 12) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="rc-ring rc-${this._tone(score)}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="rc-ring-track"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="rc-ring-fill" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
        <text x="50%" y="49%" text-anchor="middle" dominant-baseline="middle" class="rc-ring-num">${score}</text>
        <text x="50%" y="69%" text-anchor="middle" class="rc-ring-sub">out of 100</text>
      </svg>`;
  },

  // ─── Markup ───────────────────────────────────────────────────────
  build(report) {
    const e = (t) => this._esc(t);
    const id = this.certificateId(report);
    const date = new Date(report.completedAt || Date.now());
    const dateText = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const score = report.overall_score || 0;
    const name = report.candidate?.name || (window.Auth && Auth.getUser()?.name) || 'Candidate';
    const round = String(report.interviewType || 'Technical Interview').replace(' Interview', '').toLowerCase();
    const n = report.totalQuestions || (report.qa_history || []).length;
    const vs = report.verdict_summary || {};
    const topics = (report.topic_performance || []).slice().sort((a, b) => b.score - a.score);
    const kit = report.resume_kit || {};
    const graders = report.graders || {};
    const agreement = graders.avg_gap == null ? null : graders.avg_gap <= 10 ? 'High' : graders.avg_gap <= 20 ? 'Medium' : 'Low';

    const header = (pageLabel) => `
      <header class="rc-top">
        <div class="rc-brand"><span class="rc-mark"><i></i><i></i><i></i></span>InterviewAI</div>
        <div class="rc-meta"><span>${pageLabel}</span><span>Certificate ID <b>${id}</b></span></div>
      </header>`;

    const footer = (page) => `
      <footer class="rc-foot">
        <span>Issued by InterviewAI on ${dateText}. Certificate ID ${id}.</span>
        <span>Page ${page} of 2</span>
      </footer>`;

    const page1 = `
      <section class="rc-page">
        <div class="rc-frame">
          ${header('Interview performance certificate')}

          <div class="rc-hero">
            <p class="rc-kicker">This certifies that</p>
            <h1 class="rc-name">${e(name)}</h1>
            <div class="rc-rule"></div>
            <p class="rc-statement">completed a ${e(round)} mock interview for the role of <b>${e(report.jobRole || 'Software Developer')}</b> on ${dateText}, answering ${n} question${n === 1 ? '' : 's'} written from their own résumé. Each answer was graded by two independent AI models.</p>
          </div>

          <div class="rc-score">
            ${this._ring(score, 128)}
            <div class="rc-score-side">
              <div class="rc-band">${this._band(score)}</div>
              <div class="rc-kpis">
                <div><b>${vs.correct || 0}<small> of ${n}</small></b><span>answers fully correct</span></div>
                <div><b>${(vs.correct || 0) + (vs.partially_correct || 0)}<small> of ${n}</small></b><span>correct or partly correct</span></div>
                <div><b>${topics[0] ? e(topics[0].topic) : '–'}</b><span>strongest topic</span></div>
                <div><b>${agreement || '–'}</b><span>agreement between the two graders</span></div>
              </div>
            </div>
          </div>

          <div class="rc-cols">
            <div>
              <h3 class="rc-h">How the answers scored</h3>
              ${this._dims(report).map(([label, v]) => `
                <div class="rc-bar-row"><span>${label}</span><i><em class="rc-${this._tone(v)}" style="width:${v}%"></em></i><b>${v}</b></div>`).join('')}
            </div>
            <div>
              <h3 class="rc-h">By topic</h3>
              ${topics.slice(0, 6).map(t => `
                <div class="rc-bar-row"><span>${e(t.topic)}</span><i><em class="rc-${this._tone(t.score)}" style="width:${t.score}%"></em></i><b>${t.score}</b></div>`).join('') || '<p class="rc-muted">No topics recorded.</p>'}
            </div>
          </div>

          ${this._questionTable(report)}

          <div class="rc-sign">
            <div class="rc-signer">
              <div class="rc-sig-line">${e(graders.llm || 'Google Gemini')}</div>
              <span>Judge model</span>
            </div>
            ${this._seal(date.getFullYear())}
            <div class="rc-signer">
              <div class="rc-sig-line">${e(graders.embed || 'Gemini embeddings')}</div>
              <span>Embedding model</span>
            </div>
          </div>
          ${footer(1)}
        </div>
      </section>`;

    const list = (items, cls = '') => (items || []).length ? `<ul class="rc-list ${cls}">${items.map(t => `<li>${e(t)}</li>`).join('')}</ul>` : '<p class="rc-muted">Nothing to add from this session.</p>';

    const page2 = `
      <section class="rc-page">
        <div class="rc-frame">
          ${header('For your résumé')}

          <h2 class="rc-title">For your résumé</h2>
          <p class="rc-lead">Drawn from what ${e(name.split(' ')[0])} actually said in this interview. Every line uses only facts from the answers or the résumé.</p>

          <div class="rc-block">
            <h3 class="rc-h">Lines you can add</h3>
            ${list(kit.resume_bullets, 'rc-bullets')}
          </div>

          <div class="rc-cols">
            <div class="rc-block">
              <h3 class="rc-h">Skills demonstrated</h3>
              <div class="rc-chips">${(kit.skills_demonstrated || []).map(s => `<span>${e(s)}</span>`).join('') || '<p class="rc-muted">Answer more questions in full to show skills.</p>'}</div>
            </div>
            <div class="rc-block">
              <h3 class="rc-h">Keywords to add for ${e(report.jobRole || 'this role')}</h3>
              <div class="rc-chips rc-chips-out">${(kit.keywords_to_add || []).map(s => `<span>${e(s)}</span>`).join('') || '<p class="rc-muted">Your résumé already covers the core areas.</p>'}</div>
            </div>
          </div>

          <div class="rc-cols">
            <div class="rc-block">
              <h3 class="rc-h">What went well</h3>
              ${list((report.strengths || []).slice(0, 4))}
            </div>
            <div class="rc-block">
              <h3 class="rc-h">What to practise next</h3>
              ${list((report.weaknesses || []).slice(0, 4))}
            </div>
          </div>

          <div class="rc-method">
            <h3 class="rc-h">How this was graded</h3>
            <p>Questions were written live by Google Gemini from the candidate's résumé. Each answer was scored on five dimensions: technical accuracy (35%), completeness (20%), depth (18%), relevance (15%) and clarity (12%). An embedding model compared every sentence with the key ideas of a model answer, and Gemini checked facts and reasoning. The final score combines the two (60% judge, 40% embedding model).</p>
            <p class="rc-note">This is a practice assessment from InterviewAI, a mock interview tool. It shows performance in one session and is not a qualification from an employer or university.</p>
          </div>
          ${footer(2)}
        </div>
      </section>`;

    return `<div class="rc-doc">${page1}${page2}</div>`;
  },

  _questionTable(report) {
    const qa = report.qa_history || [];
    if (!qa.length) return '';
    const max = qa.length > 8 ? 7 : 8;
    const label = { correct: 'Correct', partially_correct: 'Partly correct', incorrect: 'Incorrect', off_topic: 'Off-topic', no_answer: 'Skipped' };
    const rows = qa.slice(0, max).map((q, i) => {
      const ev = q.evaluation || {};
      return `<tr><td>${i + 1}</td><td>${this._esc(q.topic || 'General')}${q.kind === 'follow_up' ? ' <em>follow-up</em>' : ''}</td><td><span class="rc-v rc-v-${ev.verdict || 'none'}">${label[ev.verdict] || '–'}</span></td><td>${ev.overall_score ?? '–'}</td></tr>`;
    }).join('');
    const more = qa.length > max ? `<tr><td></td><td colspan="3" class="rc-more">and ${qa.length - max} more questions, listed in the full report</td></tr>` : '';
    return `
      <div class="rc-qs">
        <h3 class="rc-h">Question by question</h3>
        <table class="rc-table"><thead><tr><th>#</th><th>Topic</th><th>Result</th><th>Score</th></tr></thead><tbody>${rows}${more}</tbody></table>
      </div>`;
  },

  // ─── Dialog ───────────────────────────────────────────────────────
  open(report) {
    this._report = report;
    let dlg = document.getElementById('rc-dialog');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'rc-dialog';
      dlg.className = 'rc-dialog';
      dlg.innerHTML = `
        <div class="rc-dialog-bar">
          <div>
            <b>Your report card</b>
            <span id="rc-dialog-id"></span>
          </div>
          <div class="rc-dialog-actions">
            <button class="btn btn-secondary btn-sm" id="rc-print">Print</button>
            <button class="btn btn-primary btn-sm" id="rc-download">Download PDF</button>
            <button class="modal-close" id="rc-close" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="rc-dialog-body"><div class="rc-stage" id="rc-stage"></div></div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('#rc-close').addEventListener('click', () => this.close());
      dlg.querySelector('#rc-download').addEventListener('click', () => this.download());
      dlg.querySelector('#rc-print').addEventListener('click', () => this.print());
      dlg.addEventListener('click', (ev) => { if (ev.target === dlg.querySelector('.rc-dialog-body')) this.close(); });
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && dlg.classList.contains('open')) this.close(); });
      window.addEventListener('resize', () => this._fit());
    }
    document.getElementById('rc-stage').innerHTML = this.build(report);
    this._fitPages(document.getElementById('rc-stage'));
    document.getElementById('rc-dialog-id').textContent = this.certificateId(report);
    dlg.classList.add('open');
    document.body.style.overflow = 'hidden';
    this._fit();
  },

  // Long Gemini text can overflow a page: tighten spacing, then shrink type slightly
  _fitPages(root) {
    root.querySelectorAll('.rc-frame').forEach(fr => {
      const over = () => fr.scrollHeight > fr.clientHeight + 1;
      if (over()) fr.classList.add('rc-tight');
      if (over()) fr.classList.add('rc-tighter');
    });
  },

  close() {
    document.getElementById('rc-dialog')?.classList.remove('open');
    document.body.style.overflow = '';
  },

  // Scale the A4 pages to fit the dialog width
  _fit() {
    const stage = document.getElementById('rc-stage');
    if (!stage) return;
    const avail = Math.min(stage.parentElement.clientWidth - 32, 820);
    const scale = Math.min(1, avail / 794);
    stage.style.setProperty('--rc-scale', scale.toFixed(3));
    stage.style.height = `${(1123 * 2 + 24) * scale}px`;
  },

  _load(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { setTimeout(resolve, 0); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the PDF library. Check your internet connection.'));
      document.head.appendChild(s);
    });
  },

  _fileName() {
    const name = (this._report.candidate?.name || 'Candidate').replace(/[^\w]+/g, '_');
    return `InterviewAI_Report_Card_${name}_${this.certificateId(this._report)}.pdf`;
  },

  async download() {
    const btn = document.getElementById('rc-download');
    btn?.classList.add('is-busy');
    try {
      if (!window.jspdf) await this._load(this.LIBS.jspdf);
      // html-to-image lets the browser itself draw the page (exact text placement);
      // html2canvas is the fallback if it cannot load
      let snap = null;
      try {
        if (!window.htmlToImage) await this._load(this.LIBS.htmlToImage);
        snap = (el) => window.htmlToImage.toJpeg(el, { pixelRatio: 2.5, quality: 0.94, backgroundColor: '#ffffff', cacheBust: true });
      } catch {
        if (!window.html2canvas) await this._load(this.LIBS.html2canvas);
        snap = async (el) => (await window.html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false })).toDataURL('image/jpeg', 0.94);
      }
      if (document.fonts?.ready) await document.fonts.ready;

      // Render full-size pages off screen so the PDF is sharp regardless of the preview scale
      const holder = document.createElement('div');
      holder.className = 'rc-offscreen';
      holder.innerHTML = this.build(this._report);
      document.body.appendChild(holder);
      this._fitPages(holder);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const pages = holder.querySelectorAll('.rc-page');
      for (let i = 0; i < pages.length; i++) {
        const img = await snap(pages[i]);
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      pdf.setProperties({ title: `InterviewAI report card – ${this._report.candidate?.name || ''}`, subject: `Certificate ID ${this.certificateId(this._report)}`, creator: 'InterviewAI' });
      holder.remove();
      pdf.save(this._fileName());
      UI.toast('Report card downloaded.', 'success');
    } catch (err) {
      UI.toast(err.message || 'The PDF could not be created. Try Print and choose Save as PDF.', 'error', 6000);
    } finally {
      btn?.classList.remove('is-busy');
    }
  },

  // Vector output through the browser's print dialog ("Save as PDF")
  print() {
    let holder = document.getElementById('rc-print-root');
    if (!holder) { holder = document.createElement('div'); holder.id = 'rc-print-root'; document.body.appendChild(holder); }
    holder.innerHTML = this.build(this._report);
    document.body.classList.add('rc-printing');
    this._fitPages(holder);
    const done = () => { document.body.classList.remove('rc-printing'); holder.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  },
};

window.ReportCard = ReportCard;
