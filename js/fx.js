/**
 * InterviewAI – Interface effects
 *   Interviewer  – the voice indicator: idle / thinking / speaking / listening
 *   WordReveal   – reveals a question word by word
 *   Typewriter   – types text character by character (landing replay)
 *   CountUp      – animates score numbers
 *   Speech       – optional read-aloud of questions (browser text-to-speech)
 *   HeroDemo     – the looping demo on the landing page
 *   Settings     – the "AI settings" dialog (Gemini key, model, test)
 */

const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Typewriter ─────────────────────────────────────────────────────
const Typewriter = {
  _tokens: new WeakMap(),

  type(el, text, { speed = 18, onDone } = {}) {
    if (!el) return;
    const token = {};
    this._tokens.set(el, token);
    if (reducedMotion()) { el.textContent = text; el.classList.remove('caret'); onDone && onDone(); return; }
    el.textContent = '';
    el.classList.add('caret');
    let i = 0;
    const step = () => {
      if (this._tokens.get(el) !== token) return;           // cancelled by a newer call
      // type a few characters per frame on long text so it never drags
      const chunk = text.length > 160 ? 3 : 2;
      i = Math.min(text.length, i + chunk);
      el.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(step, speed);
      else { el.classList.remove('caret'); onDone && onDone(); }
    };
    step();
  },

  cancel(el) { if (el) this._tokens.set(el, {}); },
};

// ─── Read-aloud ─────────────────────────────────────────────────────
const Speech = {
  get supported() { return 'speechSynthesis' in window; },
  get enabled() { try { return localStorage.getItem('iai_tts') === '1'; } catch { return false; } },
  set enabled(v) { try { localStorage.setItem('iai_tts', v ? '1' : '0'); } catch {} },

  speak(text, { onEnd } = {}) {
    if (!this.supported || !this.enabled) { onEnd && onEnd(); return false; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(x => /en-(IN|GB|US)/i.test(x.lang) && /female|google|natural/i.test(x.name)) || voices.find(x => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.speak(u);
    return true;
  },

  stop() { if (this.supported) window.speechSynthesis.cancel(); },
};

// ─── Word-by-word reveal (used for interview questions) ─────────────
const WordReveal = {
  show(el, text, { onDone } = {}) {
    if (!el) return;
    Typewriter.cancel(el);
    el.classList.remove('caret');
    if (reducedMotion()) { el.textContent = text; onDone && setTimeout(onDone, 0); return; }
    const words = String(text).split(/(\s+)/);
    let i = 0;
    el.innerHTML = words.map(w => /^\s+$/.test(w) ? w : `<span class="w" style="--i:${i++}">${EvalView.escape(w)}</span>`).join('');
    const total = i * 32 + 550;
    clearTimeout(el._revealTimer);
    el._revealTimer = setTimeout(() => onDone && onDone(), Math.min(total, 2600));
  },
};

// ─── The interviewer's voice indicator ──────────────────────────────
const Interviewer = {
  STATES: ['is-idle', 'is-thinking', 'is-speaking', 'is-listening', 'is-hearing', 'is-good', 'is-bad'],

  _orb() { return document.getElementById('interviewer-orb'); },

  set(state, status) {
    const orb = this._orb();
    if (orb) {
      orb.classList.remove(...this.STATES);
      orb.classList.add(`is-${state}`);
    }
    if (status !== undefined) {
      const el = document.getElementById('stage-status');
      if (el && el.textContent !== status) {
        el.style.opacity = '0';
        setTimeout(() => { el.textContent = status; el.style.opacity = '1'; }, 150);
      }
    }
  },

  hearing(on) { this._orb()?.classList.toggle('is-hearing', !!on); },

  // Present a question: reveal it, optionally read it aloud, then listen
  ask(question, { onReady, spoken } = {}) {
    const textEl = document.getElementById('question-text');
    const card = document.getElementById('question-card');
    card?.classList.remove('is-new'); void card?.offsetWidth; card?.classList.add('is-new');
    this.set('speaking', 'Asking');
    // The answer box opens as soon as the question is on screen. Chrome's
    // speech engine does not always report when it has finished speaking,
    // so waiting for it could leave the box locked.
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      if (!Speech.enabled || !window.speechSynthesis?.speaking) this.set('listening', 'Listening');
      else setTimeout(() => this.set('listening', 'Listening'), 1500);
      onReady && onReady();
    };
    WordReveal.show(textEl, question, { onDone: open });
    setTimeout(open, 4000);                                   // safety net
    if (Speech.enabled) Speech.speak(spoken || question, {});
  },

  react(verdict) {
    const orb = this._orb();
    const good = verdict === 'correct';
    const bad = verdict === 'incorrect' || verdict === 'off_topic' || verdict === 'no_answer';
    this.set('idle', good ? 'Strong answer' : bad ? 'Review what was missing' : 'Good start');
    if (orb && (good || bad)) {
      orb.classList.add(good ? 'is-good' : 'is-bad');
      setTimeout(() => orb.classList.remove('is-good', 'is-bad'), 2200);
    }
  },
};

// ─── Number count-up ────────────────────────────────────────────────
const CountUp = {
  run(el, to, { duration = 1100, from = 0 } = {}) {
    if (!el) return;
    if (reducedMotion()) { el.textContent = to; return; }
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  // Count up every score ring number inside a container
  rings(container) {
    container?.querySelectorAll('.ev-ring-num').forEach(n => this.run(n, +n.textContent || 0, { duration: 1200 }));
  },
};

// ─── Landing-page replay ────────────────────────────────────────────
const HeroDemo = {
  SAMPLES: [
    {
      tag: 'SQL and databases', n: 2,
      q: 'How do database indexes work, and what do they cost you?',
      a: 'An index is usually a B-tree, so the database can find rows without scanning the whole table. It makes WHERE filters and joins much faster.',
      score: 64, verdict: ['v-partial', '◐', 'Partially correct'],
      summary: 'Good on how indexes speed up reads. The trade-off was missing.',
      concepts: [['ok', 'B-tree lookup instead of a full scan'], ['ok', 'Speeds up WHERE and JOIN'], ['miss', 'Indexes slow down writes and use space']],
    },
    {
      tag: 'Your project', n: 3,
      q: 'In your intrusion detection project, how did you check the model would work on new traffic?',
      a: 'I held out 20% as a test set and used 5-fold cross-validation. Attacks were rare, so I tracked precision, recall and F1 instead of accuracy.',
      score: 88, verdict: ['v-correct', '✓', 'Correct'],
      summary: 'Sound validation, and the right metrics for imbalanced data.',
      concepts: [['ok', 'Held-out test set and cross-validation'], ['ok', 'Metrics chosen for imbalanced classes'], ['ok', 'Avoided accuracy as the headline number']],
    },
    {
      tag: 'Python', n: 1,
      q: 'What is the difference between a list and a tuple in Python?',
      a: 'Lists are immutable and tuples are mutable, so I use tuples when the data needs to change.',
      score: 27, verdict: ['v-incorrect', '✕', 'Incorrect'],
      summary: 'The two were swapped: lists are mutable, tuples are not.',
      concepts: [['miss', 'Stated incorrectly: lists are mutable'], ['ok', 'Mentioned mutability'], ['miss', 'When to use each']],
    },
  ],
  _i: 0,
  _timer: null,
  _running: false,

  start() {
    if (this._running || !document.getElementById('demo-q')) return;
    this._running = true;
    this._run();
  },

  stop() { this._running = false; clearTimeout(this._timer); },

  _wait(ms) { return new Promise(r => { this._timer = setTimeout(r, ms); }); },

  async _run() {
    const $ = (id) => document.getElementById(id);
    await this._wait(900);                                    // let the page entrance finish first
    while (this._running) {
      const s = this.SAMPLES[this._i % this.SAMPLES.length];
      this._i++;
      const orb = $('demo-orb'), state = $('demo-state'), grade = $('demo-grade');
      grade.classList.remove('show');
      $('demo-a').textContent = '';
      $('demo-q').textContent = '';
      $('demo-tag').textContent = s.tag;
      $('demo-time').textContent = `Question ${s.n} of 5`;

      orb.className = 'voice voice-sm is-thinking'; state.textContent = 'Writing a question from your résumé';
      await this._wait(1300); if (!this._running) return;

      orb.className = 'voice voice-sm is-speaking'; state.textContent = 'Asking';
      await new Promise(r => WordReveal.show($('demo-q'), s.q, { onDone: r }));
      await this._wait(700); if (!this._running) return;

      orb.className = 'voice voice-sm is-listening'; state.textContent = 'Listening';
      await new Promise(r => Typewriter.type($('demo-a'), s.a, { speed: 24, onDone: r }));
      await this._wait(500); if (!this._running) return;

      orb.className = 'voice voice-sm is-thinking'; state.textContent = 'Grading';
      await this._wait(1100); if (!this._running) return;

      $('demo-ring').innerHTML = EvalView.ring(s.score, 72);
      const v = grade.querySelector('.ev-verdict');
      v.className = `ev-verdict ${s.verdict[0]}`;
      v.innerHTML = `<span class="ev-verdict-icon">${s.verdict[1]}</span>${s.verdict[2]}`;
      $('demo-summary').textContent = s.summary;
      $('demo-concepts').innerHTML = s.concepts.map(([cls, text], i) =>
        `<li class="${cls}" style="--i:${i}"><span class="mark">${cls === 'ok' ? '<svg class="ico"><use href="#i-check"/></svg>' : '✕'}</span>${text}</li>`).join('');
      orb.className = 'voice voice-sm is-idle'; state.textContent = 'Graded';
      void grade.offsetWidth;
      grade.classList.add('show');
      CountUp.rings(grade);
      await this._wait(reducedMotion() ? 9000 : 5600);
    }
  },
};

// ─── Page-level motion ──────────────────────────────────────────────
//   reveals      – blocks fade up the first time they scroll into view
//   progress bar – a thin bar under the nav on long pages
//   landing      – hero parallax, the five-step grading story, looping
//                  topic rows, the timeline line and the closing headline
const Motion = {
  init() {
    this.reduce = reducedMotion();
    const nav = document.querySelector('.navbar');
    this._nav = nav;
    this._bar = document.getElementById('scroll-progress');

    if ('IntersectionObserver' in window && !this.reduce) {
      this._io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); this._io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    document.querySelectorAll('[data-reveal]').forEach(el => this.observe(el));

    this._setupStory();
    this._setupScrub();
    this._setupMarquee();

    const onScroll = () => { if (!this._raf) this._raf = requestAnimationFrame(() => this._tick()); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    this.refresh = onScroll;
    onScroll();
  },

  observe(el) {
    if (!el) return;
    if (!this._io) { el.classList.add('in'); return; }
    this._io.observe(el);
  },

  // Mark blocks inside a freshly rendered page so they reveal on scroll
  revealIn(root, selector) {
    if (!root) return;
    let n = 0;
    root.querySelectorAll(selector).forEach(el => {
      if (el.hasAttribute('data-reveal')) return;
      el.setAttribute('data-reveal', '');
      el.style.setProperty('--d', String(n++ % 3));
      this.observe(el);
    });
    this.refresh?.();
  },

  // Run fn once, when el first becomes visible (used for charts)
  whenVisible(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window) || this.reduce) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
  },

  _setupStory() {
    const card = document.getElementById('story-card');
    const steps = [...document.querySelectorAll('.story-step')];
    if (!card || !steps.length) return;
    const activate = (i) => {
      if (card.dataset.active === String(i)) return;
      card.dataset.active = String(i);
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      const ring = document.getElementById('story-ring');
      if (i === 4 && ring) { ring.innerHTML = EvalView.ring(61, ring.offsetWidth || 84); CountUp.rings(ring); }
    };
    activate(0);
    steps[0].classList.add('is-active');
    // On phones the card is shown complete above the list of steps
    if (this.reduce || !('IntersectionObserver' in window) || window.innerWidth <= 760) { activate(4); steps.forEach(s => s.classList.add('is-active')); return; }
    const narrow = () => window.innerWidth <= 1020;
    const make = () => {
      this._storyIO?.disconnect();
      this._storyIO = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) activate(+e.target.dataset.step); });
      }, { rootMargin: narrow() ? '-62% 0px -30% 0px' : '-48% 0px -48% 0px' });
      steps.forEach(s => this._storyIO.observe(s));
    };
    make();
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if ((w <= 1020) !== narrow()) { w = window.innerWidth; make(); } });
  },

  // Topic rows loop forever: the track holds two copies and slides by half its width
  _setupMarquee() {
    document.querySelectorAll('[data-marquee] .marquee-track').forEach(track => {
      if (track.dataset.cloned) return;
      track.dataset.cloned = '1';
      [...track.children].forEach(el => {
        const copy = el.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        track.appendChild(copy);
      });
    });
  },

  _setupScrub() {
    document.querySelectorAll('[data-scrub]').forEach(el => {
      const words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words.map(w => `<span class="sw">${EvalView.escape(w)}</span>`).join(' ');
      if (this.reduce) el.querySelectorAll('.sw').forEach(w => w.classList.add('lit'));
    });
  },

  _tick() {
    this._raf = null;
    const y = window.scrollY, vh = window.innerHeight;
    this._nav?.classList.toggle('scrolled', y > 4);

    // Reading progress on pages that scroll a long way
    const max = document.documentElement.scrollHeight - vh;
    if (this._bar) {
      this._bar.classList.toggle('on', max > vh * 1.2 && y > 40);
      this._bar.style.setProperty('--sp', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    }

    if (this.reduce) return;
    const landing = document.getElementById('page-landing');
    if (!landing?.classList.contains('active')) return;
    const clamp = (v) => Math.max(0, Math.min(1, v));

    // Hero: the copy drifts up and fades a little, the window lags behind
    const copy = landing.querySelector('[data-parallax="copy"]');
    const win = landing.querySelector('[data-parallax="window"]');
    if (y < vh * 1.2) {
      const p = clamp(y / (vh * 0.9));
      if (copy) { copy.style.transform = `translate3d(0, ${(-y * 0.14).toFixed(1)}px, 0)`; copy.style.opacity = (1 - p * 0.55).toFixed(3); }
      if (win) win.style.transform = `translate3d(0, ${(-y * 0.05).toFixed(1)}px, 0) scale(${(1 - p * 0.035).toFixed(4)})`;
    }

    // Timeline: the line draws as the section crosses the screen
    landing.querySelectorAll('[data-line]').forEach(list => {
      const r = list.getBoundingClientRect();
      const vertical = window.innerWidth <= 760;
      const p = vertical ? clamp((vh * 0.7 - r.top) / r.height) : clamp((vh * 0.85 - r.top) / (vh * 0.45));
      list.style.setProperty('--p', p.toFixed(3));
      const items = list.children;
      [...items].forEach((li, i) => li.classList.toggle('is-reached', p >= (items.length > 1 ? i / (items.length - 1) : 0) - 0.001));
    });

    // Closing headline: words fill in from left to right
    landing.querySelectorAll('[data-scrub]').forEach(el => {
      const r = el.getBoundingClientRect();
      const p = clamp((vh * 0.88 - r.top) / (vh * 0.42));
      const words = el.querySelectorAll('.sw');
      words.forEach((w, i) => w.classList.toggle('lit', p * words.length > i + 0.2));
    });
  },
};

// ─── AI settings dialog ─────────────────────────────────────────────
const Settings = {
  init() {
    const $ = (id) => document.getElementById(id);
    $('ai-mode-pill')?.addEventListener('click', () => this.open());
    $('settings-close')?.addEventListener('click', () => this.close());
    $('settings-modal')?.addEventListener('click', (e) => { if (e.target.id === 'settings-modal') this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settings-modal').hidden) this.close(); });

    $('settings-key-toggle')?.addEventListener('click', () => {
      const input = $('settings-key');
      input.type = input.type === 'password' ? 'text' : 'password';
      $('settings-key-toggle').textContent = input.type === 'password' ? 'Show' : 'Hide';
    });

    $('settings-save')?.addEventListener('click', () => {
      window.AISettings.apiKey = $('settings-key').value;
      window.AISettings.model = $('settings-model').value;
      this.refreshPill();
      this.close();
      UI.toast(window.DEMO_MODE ? 'Key removed. Add a key to run interviews.' : 'Saved. Gemini will write your questions and grade your answers.', 'success');
    });

    $('settings-clear')?.addEventListener('click', () => {
      window.AISettings.apiKey = '';
      $('settings-key').value = '';
      this.status('Key removed. Interviews need a key to start.', 'ok');
      this.refreshPill();
    });

    $('settings-test')?.addEventListener('click', async () => {
      const key = $('settings-key').value.trim();
      if (!key) { this.status('Paste a key first.', 'err'); return; }
      const prevKey = window.AISettings.apiKey, prevModel = window.AISettings.model;
      window.AISettings.apiKey = key;
      window.AISettings.model = $('settings-model').value;
      this.status('Contacting Gemini…', 'busy');
      try {
        const model = await AIEngine.testConnection();
        this.status(`Connected. Using ${model}. Press Save to keep this key.`, 'ok');
        if (AIEngine.lastModel) $('settings-model').value = AIEngine.lastModel;
      } catch (err) {
        this.status(`Could not connect: ${err.message}`, 'err');
      } finally {
        window.AISettings.apiKey = prevKey;
        window.AISettings.model = prevModel;
      }
    });

    this.refreshPill();
  },

  open() {
    const $ = (id) => document.getElementById(id);
    $('settings-key').value = window.AISettings.apiKey;
    $('settings-key').type = 'password';
    $('settings-key-toggle').textContent = 'Show';
    const models = [...new Set([window.AISettings.model, ...window.GEMINI_MODELS])];
    $('settings-model').innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    $('settings-model').value = window.AISettings.model;
    this.status(window.DEMO_MODE ? 'No key yet – interviews cannot start without one.' : `Key saved – using ${window.AISettings.model}.`, window.DEMO_MODE ? '' : 'ok');
    $('settings-modal').hidden = false;
    setTimeout(() => $('settings-key').focus(), 50);
  },

  close() { document.getElementById('settings-modal').hidden = true; },

  status(text, cls) {
    const el = document.getElementById('settings-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-status' + (cls ? ' ' + cls : '');
  },

  refreshPill() {
    const pill = document.getElementById('ai-mode-pill');
    const label = document.getElementById('ai-mode-label');
    const ai = !window.DEMO_MODE;
    pill?.classList.toggle('is-ai', ai);
    if (label) label.textContent = ai ? 'Gemini connected' : 'Add Gemini key';
    const mode = document.getElementById('stage-mode');
    if (mode) mode.textContent = ai ? `Every question written live by Gemini` : 'Add a Gemini key to start';
  },
};

// ─── Small page wiring ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Settings.init();

  Motion.init();

  if (window.Chart) {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#6E717A';
    Chart.defaults.borderColor = '#E4E5E9';
    Chart.defaults.plugins.tooltip.backgroundColor = '#1D1E22';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.animation.duration = 900;
    Chart.defaults.animation.easing = 'easeOutQuart';
  }

  document.getElementById('cta-how')?.addEventListener('click', () => {
    document.getElementById('grading')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  });

  // Keyboard access for the upload zone and logo
  document.getElementById('upload-zone')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('file-input')?.click(); }
  });
  document.getElementById('logo-btn')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('logo-btn').click();
  });

  // Read-aloud toggle
  const speakBtn = document.getElementById('speak-btn');
  if (speakBtn) {
    if (!Speech.supported) speakBtn.style.display = 'none';
    speakBtn.setAttribute('aria-pressed', String(Speech.enabled));
    speakBtn.addEventListener('click', () => {
      Speech.enabled = !Speech.enabled;
      speakBtn.setAttribute('aria-pressed', String(Speech.enabled));
      if (Speech.enabled) {
        const q = App.currentQuestion?.question;
        if (q) Speech.speak(q);
        UI.toast('Questions will be read aloud.', 'info', 2500);
      } else {
        Speech.stop();
      }
    });
  }

  // The orb listens while the candidate types
  const input = document.getElementById('answer-input');
  input?.addEventListener('focus', () => {
    if (!document.getElementById('evaluation-panel')?.classList.contains('visible')) Interviewer.set('listening', 'Listening');
  });
  let typingTimer;
  input?.addEventListener('input', () => {
    Interviewer.hearing(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => Interviewer.hearing(false), 700);
  });
});

window.Typewriter = Typewriter;
window.Speech = Speech;
window.Interviewer = Interviewer;
window.HeroDemo = HeroDemo;
window.WordReveal = WordReveal;
window.CountUp = CountUp;
window.Motion = Motion;
window.Settings = Settings;
