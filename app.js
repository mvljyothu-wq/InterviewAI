/**
 * InterviewAI – Main App & Router
 * SPA routing, global utilities, and page orchestration.
 */

// ═══════════════════════════════════════════════════════════════════
//   ROUTER
// ═══════════════════════════════════════════════════════════════════
const Router = {
  currentPage: null,
  pages: ['landing', 'auth', 'dashboard', 'resume-upload', 'resume-analysis', 'interview-setup', 'interview', 'scorecard', 'history'],

  navigate(page, data) {
    // Handle data parameter (e.g., session ID for scorecard-view)
    if (page === 'scorecard-view' && data) {
      // Load specific session report
      const session = DB.getSession(data);
      if (session?.report) {
        sessionStorage.setItem('iai_last_report', JSON.stringify(session.report));
      }
      page = 'scorecard';
    }

    // Auth gate
    const publicPages = ['landing', 'auth'];
    if (!publicPages.includes(page) && !Auth.getUser()) {
      page = 'auth';
    }

    // Hide all pages
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));

    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.add('active');
      this.currentPage = page;
      this._onPageLoad(page, data);
      this._updateNav(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.Motion?.refresh?.();
    }
  },

  _onPageLoad(page, data) {
    if (page === 'landing') HeroDemo.start(); else HeroDemo.stop();
    if (page !== 'interview') { App.stopTimer?.(); Speech.stop(); }
    switch (page) {
      case 'dashboard':        Dashboard.render(); break;
      case 'resume-upload':    App.initResumeUpload(); break;
      case 'resume-analysis':  App.renderResumeAnalysis(); break;
      case 'interview-setup':  App.renderInterviewSetup(); break;
      case 'interview':        App.initInterview(); break;
      case 'scorecard':        App.renderScorecard(); break;
      case 'history':          App.renderHistory(); break;
    }
  },

  _updateNav(page) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeLink = document.querySelector(`[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Show/hide nav sections based on auth
    const user = Auth.getUser();
    document.getElementById('nav-auth')?.style && (document.getElementById('nav-auth').style.display = user ? 'none' : 'flex');
    document.getElementById('nav-app')?.style  && (document.getElementById('nav-app').style.display  = user ? 'flex' : 'none');
    document.getElementById('nav-user')?.style && (document.getElementById('nav-user').style.display = user ? 'flex' : 'none');
  },
};

window.Router = Router;

// ═══════════════════════════════════════════════════════════════════
//   GLOBAL UTILITIES
// ═══════════════════════════════════════════════════════════════════
const UI = {
  showLoading(msg = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    const text    = document.getElementById('loading-text');
    if (overlay) overlay.classList.remove('hidden');
    if (text)    text.textContent = msg;
  },

  hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
  },

  toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✓', error: '✕', info: 'i', warning: '!' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-ico">${icons[type] || 'i'}</span><span></span>`;
    toast.lastChild.textContent = message;
    container?.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 260);
    }, duration);
  },

  showElement(id)  { const el = document.getElementById(id); if (el) el.style.display = ''; },
  hideElement(id)  { const el = document.getElementById(id); if (el) el.style.display = 'none'; },
  toggleClass(id, cls, force) { document.getElementById(id)?.classList.toggle(cls, force); },
  setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; },
  setText(id, txt)  { const el = document.getElementById(id); if (el) el.textContent = txt; },
  setVal(id, val)   { const el = document.getElementById(id); if (el) el.value = val; },
  getVal(id)        { return document.getElementById(id)?.value || ''; },
};

window.UI = UI;

// ═══════════════════════════════════════════════════════════════════
//   MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════
const App = {
  // In-memory state for the current flow
  currentResume: null,
  currentProfile: null,
  currentQuestion: null,
  speechRecognition: null,
  timer: null,

  // ─── INIT ──────────────────────────────────────────────────────
  init() {
    // Short status messages from the AI engine (rate limits, retries)
    AIEngine.onStatus = (msg) => { if (msg) UI.toast(msg, 'info', 3500); };

    this.setupAuth();
    this.setupNavigation();

    // Route to correct page
    const user = Auth.getUser();
    Router.navigate(user ? 'dashboard' : 'landing');

    // Demo mode banner
    let seen = false;
    try { seen = localStorage.getItem('iai_seen_intro') === '1'; localStorage.setItem('iai_seen_intro', '1'); } catch {}
    if (window.DEMO_MODE && !seen) {
      UI.toast('Add your free Gemini API key from the top bar to start interviewing.', 'info', 8000);
    }
  },

  // ─── AUTH SETUP ────────────────────────────────────────────────
  setupAuth() {
    // Auth Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`form-${target}`)?.classList.add('active');
        document.getElementById('auth-error')?.classList.remove('visible');
      });
    });

    // Register Form
    document.getElementById('form-register')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name  = UI.getVal('reg-name').trim();
      const email = UI.getVal('reg-email').trim();
      const pass  = UI.getVal('reg-password');
      const confirm = UI.getVal('reg-confirm');

      if (pass !== confirm) { this.showAuthError('Passwords do not match'); return; }

      try {
        UI.showLoading('Creating account...');
        Auth.register({ name, email, password: pass });
        UI.hideLoading();
        UI.toast('Account created. Welcome to InterviewAI.', 'success');
        Router.navigate('dashboard');
      } catch (err) {
        UI.hideLoading();
        this.showAuthError(err.message);
      }
    });

    // Login Form
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = UI.getVal('login-email').trim();
      const pass  = UI.getVal('login-password');

      try {
        UI.showLoading('Signing in...');
        Auth.login({ email, password: pass });
        UI.hideLoading();
        UI.toast(`Welcome back.`, 'success');
        Router.navigate('dashboard');
      } catch (err) {
        UI.hideLoading();
        this.showAuthError(err.message);
      }
    });

    // Password visibility toggles
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
        }
      });
    });
  },

  showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
  },

  // ─── NAVIGATION SETUP ─────────────────────────────────────────
  setupNavigation() {
    // All nav-link buttons
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page) Router.navigate(page);
      });
    });

    // Logo click → dashboard or landing
    document.getElementById('logo-btn')?.addEventListener('click', () => {
      Router.navigate(Auth.getUser() ? 'dashboard' : 'landing');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Auth.logout();
      InterviewEngine.clearState();
      UI.toast('Signed out.', 'info');
      Router.navigate('landing');
    });

    // Start interview button on landing
    document.getElementById('cta-start')?.addEventListener('click', () => {
      Router.navigate(Auth.getUser() ? 'dashboard' : 'auth');
    });

    // New Interview from dashboard
    document.getElementById('btn-new-interview')?.addEventListener('click', () => {
      Router.navigate('resume-upload');
    });
  },

  // ═══════════════════════════════════════════════════════════════
  //   RESUME UPLOAD
  // ═══════════════════════════════════════════════════════════════
  initResumeUpload() {
    const user = Auth.requireAuth();
    if (!user) return;

    const zone   = document.getElementById('upload-zone');
    const input  = document.getElementById('file-input');
    const preview = document.getElementById('file-preview');
    const btn    = document.getElementById('btn-analyze');

    if (!zone) return;

    // Always start from a clean upload screen (the spinner from a previous
    // analysis used to stay on screen forever)
    this._resetUploadUI();

    // Listeners are attached only once – re-attaching on every visit made
    // each click fire several times.
    if (this._uploadBound) return;
    this._uploadBound = true;

    // Click to open file picker
    zone.addEventListener('click', () => input?.click());

    // Drag & Drop
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file) this.handleFileSelect(file);
    });

    // File input change
    input?.addEventListener('change', e => {
      if (e.target.files[0]) this.handleFileSelect(e.target.files[0]);
    });

    // Remove file
    document.getElementById('file-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.currentResume = null;
      preview?.classList.remove('visible');
      if (input) input.value = '';
      if (btn) btn.disabled = true;
    });

    // Analyze button
    btn?.addEventListener('click', () => this.analyzeResume());

    if (btn) btn.disabled = true;
  },

  _resetUploadUI() {
    this.currentResume = null;
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
    show('upload-section', '');
    show('analysis-loading', 'none');
    document.getElementById('file-preview')?.classList.remove('visible');
    const input = document.getElementById('file-input');
    if (input) input.value = '';
    const btn = document.getElementById('btn-analyze');
    if (btn) btn.disabled = true;
    document.querySelectorAll('.analysis-step').forEach((el, i) => {
      el.classList.remove('active', 'done');
      const icon = el.querySelector('.step-icon');
      if (icon) icon.textContent = String(i + 1);
    });
  },

  handleFileSelect(file) {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    const allowedExts  = ['pdf', 'docx', 'doc'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!allowedExts.includes(ext)) {
      UI.toast('Choose a PDF or DOCX file.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      UI.toast('This file is larger than 10 MB. Upload a smaller PDF or DOCX.', 'error');
      return;
    }

    this.currentResume = file;

    // Show preview
    const preview  = document.getElementById('file-preview');
    const fileIcon = document.getElementById('file-icon');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');

    if (preview) preview.classList.add('visible');
    if (fileIcon) { fileIcon.className = `file-icon ${ext}`; fileIcon.innerHTML = '<svg class="ico"><use href="#i-file"/></svg>'; }
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';

    const btn = document.getElementById('btn-analyze');
    if (btn) btn.disabled = false;
  },

  async analyzeResume() {
    const user = Auth.getUser();
    if (!this.currentResume || !user) return;

    // Show analysis loading screen
    document.getElementById('upload-section')?.style && (document.getElementById('upload-section').style.display = 'none');
    document.getElementById('analysis-loading')?.style && (document.getElementById('analysis-loading').style.display = 'flex');

    const steps = ['step-extract', 'step-parse', 'step-profile', 'step-complete'];
    const markStep = (id, done = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('done');
      document.querySelectorAll('.analysis-step').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      if (done) { el.classList.add('done'); el.querySelector('.step-icon').textContent = '✓'; }
    };

    try {
      // Step 1: Extract text
      markStep('step-extract');
      await this._delay(600);
      const rawText = await this._withTimeout(
        ResumeParser.extractText(this.currentResume), 25000,
        'Reading the file took too long. Check your internet connection (the PDF reader loads online) or upload the DOCX version.');
      if (!rawText || rawText.replace(/\s/g, '').length < 40) {
        throw new Error('No readable text was found. The file may be a scanned image – upload a text-based PDF or a DOCX file.');
      }
      markStep('step-extract', true);

      // Step 2: Parse with AI
      markStep('step-parse');
      await this._delay(400);
      const profile = await AIEngine.analyzeResume(rawText);
      markStep('step-parse', true);

      // Step 3: Build profile
      markStep('step-profile');
      await this._delay(500);
      const savedResume = DB.saveResume({
        userId: user.id,
        fileName: this.currentResume.name,
        extractedProfile: profile,
      });
      markStep('step-profile', true);

      // Step 4: Complete
      markStep('step-complete');
      await this._delay(400);
      document.getElementById('step-complete')?.classList.add('done');

      this.currentProfile  = profile;
      this.currentResumeSaved = savedResume;

      await this._delay(800);
      Router.navigate('resume-analysis');
    } catch (err) {
      console.error('Resume analysis error:', err);
      document.getElementById('upload-section').style.display = '';
      document.getElementById('analysis-loading').style.display = 'none';
      document.querySelectorAll('.analysis-step').forEach(el => el.classList.remove('active', 'done'));
      UI.toast(err.message || 'The résumé could not be analysed. Try another file.', 'error', 7000);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //   RESUME ANALYSIS PAGE
  // ═══════════════════════════════════════════════════════════════
  renderResumeAnalysis() {
    if (!this.currentProfile) {
      UI.toast('Upload a résumé first.', 'warning');
      Router.navigate('resume-upload');
      return;
    }
    const p = this.currentProfile;

    UI.setText('profile-name',  p.name || 'Candidate');
    UI.setText('profile-avatar', (p.name || 'C').trim().charAt(0).toUpperCase());
    UI.setText('profile-email', p.email || '–');
    UI.setText('profile-edu',   (p.education || []).map(e => `${e.degree} – ${e.institution}`).join(', ') || '–');
    UI.setText('profile-exp',   (p.experience || []).map(e => e.role).join(', ') || 'Fresher');

    const renderTags = (id, arr) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = (arr || []).map(item => `<span class="skill-tag">${item}</span>`).join('') || '<span style="color:var(--text-muted)">None detected</span>';
    };

    renderTags('profile-languages', p.programming_languages);
    renderTags('profile-frameworks', p.frameworks);
    renderTags('profile-tools',     p.tools);
    renderTags('profile-skills',    p.skills);
    renderTags('profile-certs',     p.certifications);

    const projEl = document.getElementById('profile-projects');
    if (projEl) {
      projEl.innerHTML = (p.projects || []).map(proj => `
        <div class="exp-item">
          <h4>${proj.name || 'Project'}</h4>
          <p>${proj.description || ''}</p>
          ${(proj.technologies || []).length > 0 ? `<div class="skills-list" style="margin-top:6px">${proj.technologies.map(t => `<span class="skill-tag">${t}</span>`).join('')}</div>` : ''}
        </div>`).join('') || '<p style="color:var(--text-muted)">No projects detected</p>';
    }

    const expEl = document.getElementById('profile-experience');
    if (expEl) {
      expEl.innerHTML = (p.experience || []).map(e => `
        <div class="exp-item">
          <h4>${e.role} <span style="color:var(--text-muted);font-weight:400">at ${e.company || '–'}</span></h4>
          <p>${e.duration || ''}</p>
        </div>`).join('') || '<p style="color:var(--text-muted)">No work experience listed</p>';
    }

    document.getElementById('btn-proceed-setup')?.addEventListener('click', () => {
      Router.navigate('interview-setup');
    }, { once: true });
  },

  // ═══════════════════════════════════════════════════════════════
  //   INTERVIEW SETUP
  // ═══════════════════════════════════════════════════════════════
  renderInterviewSetup() {
    if (!this.currentProfile) {
      Router.navigate('resume-upload');
      return;
    }

    // Pre-select defaults (only if nothing is selected yet)
    const preselect = (group, value) => {
      if (!document.querySelector(`.option-card.selected[data-group="${group}"]`)) {
        document.querySelector(`[data-group="${group}"][data-value="${value}"]`)?.classList.add('selected');
      }
    };
    preselect('role', 'Software Developer');
    preselect('type', 'Technical Interview');
    preselect('difficulty', 'Intermediate');
    preselect('count', '5');

    if (this._setupBound) return;
    this._setupBound = true;

    // Option card selection
    document.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        const group = card.dataset.group;
        document.querySelectorAll(`.option-card[data-group="${group}"]`).forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    document.getElementById('btn-start-interview')?.addEventListener('click', () => {
      const getSelected = (group) => document.querySelector(`.option-card.selected[data-group="${group}"]`)?.dataset.value;

      const role       = getSelected('role');
      const type       = getSelected('type');
      const difficulty = getSelected('difficulty');
      const count      = parseInt(getSelected('count') || '5');

      if (!role || !type || !difficulty) {
        UI.toast('Choose a role, round, difficulty and length.', 'warning');
        return;
      }

      if (window.DEMO_MODE) {
        UI.toast('Add your Gemini API key to start. Questions are written by Gemini.', 'warning', 6000);
        Settings.open();
        return;
      }

      // Store settings
      sessionStorage.setItem('iai_interview_settings', JSON.stringify({ role, type, difficulty, count }));
      InterviewEngine.clearState(); // Ensure fresh start
      Router.navigate('interview');
    });
  },

  // ═══════════════════════════════════════════════════════════════
  //   LIVE INTERVIEW PAGE
  // ═══════════════════════════════════════════════════════════════
  async initInterview() {
    const user = Auth.requireAuth();
    if (!user) return;
    if (window.DEMO_MODE) {
      Router.navigate('interview-setup');
      Settings.open();
      return;
    }

    // Check if resuming or fresh start
    const hasState = InterviewEngine.restoreState();
    const settingsRaw = sessionStorage.getItem('iai_interview_settings');

    if (!hasState || !InterviewEngine.state.sessionId) {
      // Fresh start
      if (!settingsRaw || !this.currentProfile || !this.currentResumeSaved) {
        UI.toast('This session was lost. Upload your résumé again to start a new one.', 'warning');
        Router.navigate('resume-upload');
        return;
      }

      const settings = JSON.parse(settingsRaw);
      UI.showLoading('Initializing your interview session...');

      try {
        await InterviewEngine.initSession({
          userId: user.id,
          profile: this.currentProfile,
          resume: this.currentResumeSaved,
          jobRole: settings.role,
          interviewType: settings.type,
          startDifficulty: settings.difficulty,
          totalQuestions: settings.count,
        });
        UI.hideLoading();
      } catch (err) {
        UI.hideLoading();
        UI.toast('The interview could not start: ' + err.message, 'error');
        return;
      }
    }

    // Update sidebar info
    this._resetInterviewUI();
    this.updateInterviewSidebar();
    this.setupAnswerUI();

    // Speech recognition setup
    this.setupSpeechRecognition();

    // Load first question
    await this.loadNextQuestion();
  },

  updateInterviewSidebar() {
    const s = InterviewEngine.state;
    UI.setText('sidebar-role',  s.jobRole  || '--');
    UI.setText('sidebar-type',  String(s.interviewType || '–').replace(' Interview', ''));
    UI.setText('sidebar-total', s.totalQuestions);
    this.updateDifficultyDisplay();
  },

  updateDifficultyDisplay() {
    const diff  = InterviewEngine.state.currentDifficulty;
    const label = InterviewEngine.getDifficultyLabel(diff);

    UI.setHTML('diff-badge-main', `<span class="diff-badge diff-${diff}">${label}</span>`);
    UI.setHTML('diff-badge-side', `<span class="diff-badge diff-${diff}">${label}</span>`);
    UI.setText('sidebar-diff',    label);
  },

  _resetInterviewUI() {
    document.getElementById('evaluation-panel')?.classList.remove('visible');
    const set = (id, prop, v) => { const el = document.getElementById(id); if (el) el.style[prop] = v; };
    set('answer-card', 'display', '');
    set('btn-submit', 'display', '');
    set('btn-skip', 'display', '');
    set('btn-next', 'display', 'none');
    document.getElementById('eval-your-answer')?.removeAttribute('open');
    UI.setVal('answer-input', '');
    this._updateAnswerMeter();
    const card = document.getElementById('answer-card');
    if (card) { card.classList.add('entering'); setTimeout(() => card.classList.remove('entering'), 500); }
    this._submitting = false;
    this._finishing = false;
  },

  setupAnswerUI() {
    if (this._answerBound) return;
    this._answerBound = true;

    // Submit answer
    document.getElementById('btn-submit')?.addEventListener('click', () => this.submitAnswer());

    // Skip question (counts as empty answer)
    document.getElementById('btn-skip')?.addEventListener('click', () => {
      UI.setVal('answer-input', 'I am not sure about this question.');
      this.submitAnswer();
    });

    // Next question button (shown after evaluation)
    document.getElementById('btn-next')?.addEventListener('click', async () => {
      if (InterviewEngine.state.isComplete) {
        await this.finishInterview();
      } else {
        this._resetInterviewUI();
        await this.loadNextQuestion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // Character counter
    document.getElementById('answer-input')?.addEventListener('input', (e) => {
      if (window.speechSynthesis?.speaking) Speech.stop();       // stop reading aloud once the candidate starts typing
      this._updateAnswerMeter();
    });
  },

  async loadNextQuestion() {
    const s = InterviewEngine.state;
    if (s.isComplete || s.questionNumber >= s.totalQuestions) {
      await this.finishInterview();
      return;
    }

    // The interviewer "thinks" in place instead of covering the page
    this.currentQuestion = null;
    document.getElementById('answer-input')?.setAttribute('disabled', '');
    document.getElementById('btn-submit')?.setAttribute('disabled', '');
    this.updateQuestionDots();
    const qEl = document.getElementById('question-text');
    if (qEl && qEl.querySelector('.w')) { qEl.classList.add('leaving'); await this._wait(200); }
    qEl?.classList.remove('leaving');
    Typewriter.cancel(qEl);
    UI.setHTML('question-text', `<div class="skeleton" aria-label="Writing the next question"><i></i><i></i><i></i></div><p class="skeleton-note">${InterviewEngine.state.qaHistory.length ? 'Writing a question based on your last answer' : 'Writing your first question from your résumé'}</p>`);
    UI.setText('question-topic', '');
    document.getElementById('question-hint') && (document.getElementById('question-hint').style.display = 'none');
    const input = document.getElementById('answer-input');
    input?.setAttribute('disabled', '');
    document.getElementById('btn-submit')?.setAttribute('disabled', '');
    UI.setText('question-transition', '');
    const hasHistory = InterviewEngine.state.qaHistory.length > 0;
    Interviewer.set('thinking', hasHistory ? 'Thinking' : 'Reading your résumé');

    try {
      const q = await InterviewEngine.getNextQuestion();
      this.currentQuestion = q;
      this.displayQuestion(q);
    } catch (err) {
      Interviewer.set('idle', 'Question not ready');
      UI.setHTML('question-text', `<span class="muted">${EvalView.escape(err.message)}</span>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btn-retry-question">Try again</button>
          <button class="btn btn-secondary btn-sm" onclick="Settings.open()">AI settings</button>
        </div>`);
      document.getElementById('btn-retry-question')?.addEventListener('click', () => this.loadNextQuestion());
    }
  },

  displayQuestion(q) {
    const num   = q.number;
    const total = InterviewEngine.state.totalQuestions;
    const pct   = Math.round(((num - 1) / total) * 100);

    UI.setText('question-number', `Question ${num} of ${total}`);
    UI.setText('question-topic',  q.kind === 'follow_up' ? `${q.topic || 'Follow-up'}, follow-up` : (q.topic || ''));
    UI.setText('question-transition', q.transition || '');

    // Progress bar
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    UI.setText('progress-text', `${pct}%`);

    // Difficulty
    this.updateDifficultyDisplay();

    // Hint (if any)
    const hintEl = document.getElementById('question-hint');
    if (hintEl) {
      if (q.hint) { hintEl.style.display = ''; hintEl.querySelector('span').textContent = q.hint; }
      else { hintEl.style.display = 'none'; }
    }

    // Update current dot
    this.updateQuestionDots();

    // Type the question out (and read it aloud if enabled), then open the floor
    this.stopTimer();
    this._updateTimerDisplay(180);
    Interviewer.ask(q.question, {
      spoken: q.transition ? `${q.transition} ${q.question}` : q.question,
      onReady: () => {
        const input = document.getElementById('answer-input');
        input?.removeAttribute('disabled');
        document.getElementById('btn-submit')?.removeAttribute('disabled');
        this._updateAnswerMeter();
        this.startTimer(180); // 3 min per question
      },
    });
  },

  updateQuestionDots() {
    const s   = InterviewEngine.state;
    const container = document.getElementById('question-dots');
    if (!container) return;

    container.innerHTML = Array.from({ length: s.totalQuestions }, (_, i) => {
      let cls = '';
      const qa = s.qaHistory[i];
      if (qa) {
        const score = qa.evaluation?.overall_score || 0;
        cls = score >= 75 ? 'answered-good' : score >= 50 ? 'answered-average' : 'answered-poor';
      } else if (i === s.questionNumber - 1 && !s.isComplete) {
        cls = 'current';
      }
      return `<div class="q-dot ${cls}">${i + 1}</div>`;
    }).join('');
  },

  async submitAnswer() {
    if (this._submitting) return;
    const answer = UI.getVal('answer-input').trim();
    if (!answer && !InterviewEngine.state.isComplete) {
      UI.toast('Write an answer first, or skip the question.', 'warning');
      return;
    }

    this._submitting = true;
    this.stopTimer();
    Speech.stop();
    Interviewer.set('thinking', 'Grading');

    // Disable inputs, then swap the answer box for the grading progress
    document.getElementById('answer-input')?.setAttribute('disabled', '');
    document.getElementById('btn-submit')?.setAttribute('disabled', '');
    await this._showGrading();

    try {
      const result = await InterviewEngine.submitAnswer({
        question:   this.currentQuestion?.question,
        answer:     answer || 'No answer provided',
        topic:      this.currentQuestion?.topic,
        difficulty: this.currentQuestion?.difficulty,
        type:       this.currentQuestion?.type,
        rubricId:   this.currentQuestion?.rubricId,
        rubric:     this.currentQuestion?.rubric,
        kind:       this.currentQuestion?.kind,
      });
      await this._finishGrading();

      // Re-enable
      document.getElementById('answer-input')?.removeAttribute('disabled');

      this.showEvaluation(result);
    } catch (err) {
      await this._finishGrading(true);
      document.getElementById('answer-input')?.removeAttribute('disabled');
      document.getElementById('btn-submit')?.removeAttribute('disabled');
      this._submitting = false;
      UI.toast('The answer could not be evaluated: ' + err.message, 'error');
    }
  },

  _wait(ms) { return new Promise(r => setTimeout(r, reducedMotion() ? 0 : ms)); },

  // ─── Grading progress (replaces the answer box while Gemini works) ───
  async _showGrading() {
    const card = document.getElementById('answer-card');
    const g = document.getElementById('grading-card');
    if (!g) return;
    g.querySelectorAll('li').forEach(li => li.classList.remove('active', 'done'));
    card?.classList.add('leaving');
    await this._wait(230);
    if (card) { card.style.display = 'none'; card.classList.remove('leaving'); }
    g.classList.remove('leaving');
    g.hidden = false;
    this._gradingStage('meaning');
    AIEngine.onStage = (stage) => this._gradingStage(stage);
  },

  _gradingStage(stage) {
    const items = [...document.querySelectorAll('#grading-card li')];
    const idx = items.findIndex(li => li.dataset.stage === stage);
    if (idx < 0) return;
    items.forEach((li, i) => {
      li.classList.toggle('done', i < idx);
      li.classList.toggle('active', i === idx);
    });
  },

  async _finishGrading(failed) {
    AIEngine.onStage = null;
    const g = document.getElementById('grading-card');
    if (!g || g.hidden) return;
    if (!failed) {
      g.querySelectorAll('li').forEach(li => { li.classList.remove('active'); li.classList.add('done'); });
      await this._wait(450);
    }
    g.classList.add('leaving');
    await this._wait(230);
    g.hidden = true;
    g.classList.remove('leaving');
    if (failed) {
      const card = document.getElementById('answer-card');
      if (card) { card.style.display = ''; card.classList.add('entering'); setTimeout(() => card.classList.remove('entering'), 500); }
    }
  },

  showEvaluation(result) {
    const { evaluation, difficultyAction, isComplete, newDifficulty } = result;

    // Hide answer area, show evaluation
    document.getElementById('answer-card').style.display   = 'none';
    document.getElementById('btn-submit').style.display    = 'none';
    document.getElementById('btn-skip').style.display      = 'none';
    document.getElementById('btn-next').style.display      = '';

    const panel = document.getElementById('evaluation-panel');
    if (!panel) return;
    panel.classList.add('visible');

    const qa = InterviewEngine.state.qaHistory[InterviewEngine.state.qaHistory.length - 1];
    UI.setText('eval-qlabel', `Question ${InterviewEngine.state.questionNumber} of ${InterviewEngine.state.totalQuestions}`);
    UI.setText('eval-your-answer-text', qa ? qa.answer : '');

    // Verdict, score breakdown, concept checklist, explanation, tips, model answer
    UI.setHTML('eval-body', EvalView.render(evaluation));
    window.Motion?.revealIn(panel, '.ev-section, .ev-model, .ev-stats');

    // Difficulty change
    const diffEl = document.getElementById('eval-diff-change');
    if (diffEl) {
      const label = InterviewEngine.getDifficultyLabel(newDifficulty);
      const actionMap = {
        increase: { cls: 'increase', text: `The next question will be harder: level ${newDifficulty}, ${label.toLowerCase()}` },
        maintain: { cls: 'maintain', text: `The next question stays at level ${newDifficulty}, ${label.toLowerCase()}` },
        decrease: { cls: 'decrease', text: `The next question will be easier: level ${newDifficulty}, ${label.toLowerCase()}` },
      };
      const info = actionMap[difficultyAction] || actionMap.maintain;
      diffEl.innerHTML = isComplete ? '' : `<div class="diff-change ${info.cls}">${info.text}</div>`;
    }

    // Update next button label
    const nextBtn = document.getElementById('btn-next');
    if (nextBtn) {
      nextBtn.textContent = isComplete ? 'See your report' : 'Next question';
      nextBtn.className   = isComplete ? 'btn btn-primary btn-lg' : 'btn btn-success btn-lg';
    }

    Interviewer.react(evaluation.verdict);
    CountUp.rings(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.updateQuestionDots();
    this.updateDifficultyDisplay();
  },

  // Word count against a rough target for this difficulty, shown as a thin bar
  _updateAnswerMeter() {
    const text = UI.getVal('answer-input');
    const words = (text.match(/\S+/g) || []).length;
    const q = this.currentQuestion || {};
    const target = q.type === 'behavioral' ? 120 : ({ 1: 50, 2: 70, 3: 90, 4: 110, 5: 130 }[q.difficulty] || 90);
    const fill = document.getElementById('answer-meter-fill');
    if (fill) {
      fill.style.width = `${Math.min(100, (words / target) * 100)}%`;
      fill.classList.toggle('is-good', words >= target * 0.6 && words <= target * 1.8);
      fill.classList.toggle('is-long', words > target * 1.8);
    }
    const label = words > target * 1.8 ? 'a bit long, keep it focused' : `aim for about ${target}`;
    UI.setHTML('char-count', `<b>${words}</b> word${words === 1 ? '' : 's'}, ${label}`);
  },

  _scoreColor(val) {
    if (!val && val !== 0) return 'var(--text-muted)';
    if (val >= 80) return 'var(--good)';
    if (val >= 60) return 'var(--accent)';
    if (val >= 40) return 'var(--warn)';
    return 'var(--bad)';
  },

  // ─── Timer ─────────────────────────────────────────────────────
  startTimer(seconds) {
    this.stopTimer();
    let remaining = seconds;
    this._timerTotal = seconds;
    this._updateTimerDisplay(remaining);
    this.timer = setInterval(() => {
      remaining--;
      this._updateTimerDisplay(remaining);
      if (remaining <= 0) {
        this.stopTimer();
        UI.toast('Time is up. Submitting your answer.', 'warning');
        this.submitAnswer();
      }
    }, 1000);
  },

  _updateTimerDisplay(seconds) {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.className = 'timer-display' + (seconds <= 30 ? (seconds <= 10 ? ' danger' : ' warning') : '');
    const ring = document.getElementById('timer-ring');
    if (ring) ring.style.strokeDashoffset = (106.8 * (1 - seconds / (this._timerTotal || seconds || 1))).toFixed(2);
  },

  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  // ─── Speech Recognition ────────────────────────────────────────
  setupSpeechRecognition() {
    const btn = document.getElementById('voice-btn');
    if (!btn || this._speechBound) return;
    this._speechBound = true;

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      btn.style.display = 'none';
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let isRecording = false;

    btn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
        btn.querySelector('span') ? (btn.querySelector('span').textContent = 'Speak') : (btn.textContent = 'Speak');
        btn.classList.remove('recording');
        Interviewer.hearing(false);
        isRecording = false;
      } else {
        recognition.start();
        btn.querySelector('span') ? (btn.querySelector('span').textContent = 'Stop') : (btn.textContent = 'Stop');
        btn.classList.add('recording');
        isRecording = true;
        Interviewer.set('listening', 'Listening – speak your answer');
        Interviewer.hearing(true);
      }
    });

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      UI.setVal('answer-input', transcript);
      this._updateAnswerMeter();
    };

    recognition.onend = () => {
      btn.querySelector('span') ? (btn.querySelector('span').textContent = 'Speak') : (btn.textContent = 'Speak');
      Interviewer.hearing(false);
      btn.classList.remove('recording');
      isRecording = false;
    };

    this.speechRecognition = recognition;
  },

  // ─── Finish Interview ──────────────────────────────────────────
  async finishInterview() {
    if (this._finishing) return;
    this._finishing = true;
    UI.showLoading('Generating your personalized interview report...');
    this.stopTimer();

    try {
      const report = await InterviewEngine.generateFinalReport();
      UI.hideLoading();
      UI.toast('Interview complete. Your report is ready.', 'success');
      Router.navigate('scorecard');
    } catch (err) {
      UI.hideLoading();
      this._finishing = false;
      UI.toast('The report could not be generated: ' + err.message, 'error');
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //   SCORECARD
  // ═══════════════════════════════════════════════════════════════
  renderScorecard() {
    const reportRaw = sessionStorage.getItem('iai_last_report');
    if (!reportRaw) {
      UI.toast('No report yet. Finish an interview to see one.', 'warning');
      Router.navigate('dashboard');
      return;
    }

    try {
      const report = JSON.parse(reportRaw);
      Scorecard.render(report);

      // Report card: older saved sessions may not have a candidate name
      if (!report.candidate) report.candidate = { name: Auth.getUser()?.name || 'Candidate' };
      ['btn-report-card', 'btn-report-card-2'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => ReportCard.open(report);
      });

      // Share/download button
      document.getElementById('btn-new-interview-sc')?.addEventListener('click', () => {
        InterviewEngine.clearState();
        Router.navigate('resume-upload');
      }, { once: true });

      document.getElementById('btn-dashboard-sc')?.addEventListener('click', () => {
        Router.navigate('dashboard');
      }, { once: true });
    } catch (err) {
      UI.toast('The report could not be opened: ' + err.message, 'error');
      Router.navigate('dashboard');
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //   HISTORY
  // ═══════════════════════════════════════════════════════════════
  renderHistory() {
    const user = Auth.requireAuth();
    if (!user) return;

    const sessions  = DB.getUserSessions(user.id);
    const container = document.getElementById('history-list');
    if (!container) return;

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No interviews yet</h3>
          <p>Finished sessions appear here with their full report.</p>
          <button class="btn btn-primary" style="margin-top:20px" onclick="Router.navigate('resume-upload')">Start an interview</button>
        </div>`;
      return;
    }

    container.innerHTML = sessions.map((s, i) => {
      const score = s.finalScore || 0;
      const cat   = InterviewEngine.getScoreCategory(score);
      const date  = new Date(s.completedAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div class="history-item" style="--i:${i}">
          <div class="history-score ev-pill-${EvalView.scoreTone(score)}">${score}</div>
          <div style="min-width:0">
            <div class="history-title">${s.jobRole}</div>
            <div class="history-sub">${String(s.interviewType || '').replace(' Interview', '')} round, ${s.totalQuestions || 0} questions, ${date}</div>
          </div>
          <div class="history-actions">
            <span class="score-category ${cat.cls}">${cat.label}</span>
            <button class="btn btn-sm btn-secondary" onclick="Router.navigate('scorecard-view','${s.id}')">Open report</button>
          </div>
        </div>`;
    }).join('');
  },

  // ─── Utility ──────────────────────────────────────────────────
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); },

  _withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  },

  // Demo account so the app can be tried without registering
  loginDemo() {
    const email = 'demo@interviewai.app';
    try {
      if (!DB.getUserByEmail(email)) Auth.register({ name: 'Demo User', email, password: 'demo1234' });
      else Auth.login({ email, password: 'demo1234' });
      UI.toast('Signed in to the demo account.', 'success');
      Router.navigate('dashboard');
    } catch (err) {
      this.showAuthError(err.message);
    }
  },
};

window.App = App;

// ═══════════════════════════════════════════════════════════════════
//   BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
