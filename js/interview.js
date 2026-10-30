/**
 * InterviewAI – Adaptive Interview Engine
 * Manages session state, difficulty adaptation, and question flow.
 */

const InterviewEngine = {
  // Current active session state (in-memory)
  state: {
    sessionId: null,
    userId: null,
    profile: null,
    jobRole: null,
    interviewType: null,
    totalQuestions: 0,
    questionNumber: 0,
    currentDifficulty: 2,
    qaHistory: [],        // [{question, topic, difficulty, answer, evaluation}]
    previousQuestions: [],
    askedIds: [],         // knowledge-base ids of questions already asked
    strengths: [],
    weaknesses: [],
    isLoading: false,
    isComplete: false,
  },

  // ─── Initialize Session ────────────────────────────────────────
  async initSession({ userId, profile, resume, jobRole, interviewType, startDifficulty, totalQuestions }) {
    this._prefetch = null;
    const diffMap = { Beginner: 1, Intermediate: 3, Advanced: 5 };
    const numericDiff = typeof startDifficulty === 'number' ? startDifficulty : (diffMap[startDifficulty] || 2);

    // Create DB session
    const session = DB.createSession({
      userId,
      resumeId: resume.id,
      jobRole,
      interviewType,
      startDifficulty: numericDiff,
      totalQuestions,
    });

    // Reset in-memory state
    this.state = {
      sessionId: session.id,
      userId,
      profile,
      jobRole,
      interviewType,
      totalQuestions,
      questionNumber: 0,
      currentDifficulty: numericDiff,
      qaHistory: [],
      previousQuestions: [],
      askedIds: [],
      strengths: [],
      weaknesses: [],
      isLoading: false,
      isComplete: false,
    };

    // Save state to sessionStorage for page refreshes
    this._saveState();

    return session;
  },

  // ─── Generate Next Question ────────────────────────────────────
  async getNextQuestion() {
    this.state.questionNumber++;
    this.state.isLoading = true;
    this._saveState();

    try {
      // Use the question written in the background while the candidate read
      // the feedback; write a fresh one if it is missing or failed
      let result = null;
      const pf = this._prefetch;
      this._prefetch = null;
      if (pf && pf.n === this.state.questionNumber && pf.history === this.state.qaHistory.length) {
        try { result = await pf.promise; } catch { result = null; }
      }
      if (!result) result = await AIEngine.generateQuestion(this._questionContext(this.state.questionNumber));
      if (!result || !result.question) throw new Error('No question was returned');

      this.state.previousQuestions.push(result.question);
      if (result.rubricId) {
        this.state.askedIds = this.state.askedIds || [];
        this.state.askedIds.push(result.rubricId);
      }
      this.state.isLoading = false;
      this._saveState();

      return {
        ...result,
        number: this.state.questionNumber,
        difficulty: this.state.currentDifficulty,
      };
    } catch (err) {
      // The question was never shown, so it does not count
      this.state.questionNumber--;
      this.state.isLoading = false;
      this._saveState();
      throw err;
    }
  },

  _questionContext(questionNumber) {
    return {
      profile: this.state.profile,
      jobRole: this.state.jobRole,
      interviewType: this.state.interviewType,
      difficulty: this.state.currentDifficulty,
      previousQuestions: this.state.previousQuestions,
      weaknesses: this.state.weaknesses,
      questionNumber,
      totalQuestions: this.state.totalQuestions,
      userId: this.state.userId,
      askedIds: this.state.askedIds || [],
      qaHistory: this.state.qaHistory,
    };
  },

  // Start writing the next question as soon as an answer is graded
  prefetchNext() {
    if (this.state.isComplete || this.state.questionNumber >= this.state.totalQuestions) return;
    const n = this.state.questionNumber + 1;
    const promise = AIEngine.generateQuestion(this._questionContext(n));
    promise.catch(() => {});
    this._prefetch = { n, history: this.state.qaHistory.length, promise };
  },

  // ─── Submit Answer & Evaluate ─────────────────────────────────
  async submitAnswer({ question, answer, topic, difficulty, type, rubricId, rubric, kind }) {
    this.state.isLoading = true;
    this._saveState();

    const evaluation = await AIEngine.evaluateAnswer({
      question,
      answer,
      profile: this.state.profile,
      jobRole: this.state.jobRole,
      difficulty: difficulty || this.state.currentDifficulty,
      rubricId,
      rubric,
      topic,
      type,
    });

    // Store Q&A
    const qaEntry = {
      questionNumber: this.state.questionNumber,
      question,
      topic: topic || 'General',
      type: type || 'technical',
      kind: kind || 'new',
      rubricId: rubricId || null,
      difficulty: difficulty || this.state.currentDifficulty,
      answer,
      evaluation,
    };
    this.state.qaHistory.push(qaEntry);

    // Accumulate strengths/weaknesses
    if (evaluation.strengths) {
      this.state.strengths.push(...evaluation.strengths.filter(s => s));
    }
    if (evaluation.weaknesses) {
      this.state.weaknesses.push(...evaluation.weaknesses.filter(w => w));
    }

    // Deduplicate
    this.state.strengths = [...new Set(this.state.strengths)].slice(0, 10);
    this.state.weaknesses = [...new Set(this.state.weaknesses)].slice(0, 10);

    // Adapt difficulty
    const prevDiff = this.state.currentDifficulty;
    const diffAction = evaluation.next_difficulty_action ||
      (evaluation.overall_score >= 85 ? 'increase' : evaluation.overall_score >= 60 ? 'maintain' : 'decrease');
    this.state.currentDifficulty = this._adaptDifficulty(
      this.state.currentDifficulty,
      diffAction,
    );

    // Update DB session
    DB.updateSession(this.state.sessionId, {
      currentDifficulty: this.state.currentDifficulty,
      questions: this.state.qaHistory.map(q => ({ question: q.question, topic: q.topic, difficulty: q.difficulty })),
      answers: this.state.qaHistory.map(q => ({ answer: q.answer, evaluation: q.evaluation })),
    });

    this.state.isLoading = false;

    // Check completion
    const isComplete = this.state.questionNumber >= this.state.totalQuestions;
    this.state.isComplete = isComplete;
    this._saveState();
    this.prefetchNext();

    return {
      evaluation,
      prevDifficulty: prevDiff,
      newDifficulty: this.state.currentDifficulty,
      difficultyAction: diffAction,
      isComplete,
      questionsRemaining: this.state.totalQuestions - this.state.questionNumber,
    };
  },

  // ─── Adaptive Difficulty Logic ────────────────────────────────
  _adaptDifficulty(current, action) {
    if (action === 'increase') return Math.min(5, current + 1);
    if (action === 'decrease') return Math.max(1, current - 1);
    return current;
  },

  // ─── Generate Final Report ────────────────────────────────────
  async generateFinalReport() {
    const session = DB.getSession(this.state.sessionId);
    const scores = this.state.qaHistory.map(qa => qa.evaluation?.overall_score || 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const report = await AIEngine.generateReport({
      profile: this.state.profile,
      session,
      qaHistory: this.state.qaHistory,
    });

    // Add difficulty journey
    report.difficulty_journey = this.state.qaHistory.map(qa => qa.difficulty);
    report.qa_history = this.state.qaHistory;
    report.sessionId = this.state.sessionId;
    report.jobRole = this.state.jobRole;
    report.interviewType = this.state.interviewType;
    report.totalQuestions = this.state.questionNumber;
    report.completedAt = Date.now();
    const user = (window.Auth && Auth.getUser && Auth.getUser()) || {};
    report.candidate = { name: this.state.profile?.name || user.name || 'Candidate', email: this.state.profile?.email || user.email || '' };
    report.graders = (() => {
      const g = this.state.qaHistory.map(q => q.evaluation?.grading).filter(Boolean);
      const last = g[g.length - 1] || {};
      const gaps = g.map(x => x.agreement_gap).filter(x => typeof x === 'number');
      return { llm: last.llm_model || null, embed: last.embed_model || null, avg_gap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null };
    })();

    // Save to DB
    DB.completeSession(this.state.sessionId, avgScore, report);
    DB.saveReport(report);

    // Save to sessionStorage for scorecard page
    sessionStorage.setItem('iai_last_report', JSON.stringify(report));

    return report;
  },

  // ─── Session State Persistence ────────────────────────────────
  _saveState() {
    sessionStorage.setItem('iai_interview_state', JSON.stringify(this.state));
  },

  restoreState() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('iai_interview_state'));
      if (saved && saved.sessionId) { this.state = saved; return true; }
    } catch {}
    return false;
  },

  clearState() {
    sessionStorage.removeItem('iai_interview_state');
    this.state = {
      sessionId: null, userId: null, profile: null, jobRole: null,
      interviewType: null, totalQuestions: 0, questionNumber: 0,
      currentDifficulty: 2, qaHistory: [], previousQuestions: [], askedIds: [],
      strengths: [], weaknesses: [], isLoading: false, isComplete: false,
    };
  },

  // ─── Helpers ──────────────────────────────────────────────────
  getProgress() {
    return {
      current: this.state.questionNumber,
      total: this.state.totalQuestions,
      percentage: Math.round((this.state.questionNumber / this.state.totalQuestions) * 100),
    };
  },

  getDifficultyLabel(level) {
    const map = { 1: 'Beginner', 2: 'Intermediate', 3: 'Moderate', 4: 'Advanced', 5: 'Expert' };
    return map[level] || 'Intermediate';
  },

  getScoreCategory(score) {
    if (score >= 90) return { label: 'Excellent',         cls: 'excellent' };
    if (score >= 75) return { label: 'Very good',         cls: 'very-good' };
    if (score >= 60) return { label: 'Good',              cls: 'good' };
    if (score >= 40) return { label: 'Average',           cls: 'average' };
    return             { label: 'Needs work',             cls: 'needs-imp' };
  },

  getScoreColor(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  },

  getScorePillStyle(score) {
    if (score >= 85) return 'background: rgba(16,185,129,0.15); color: #34d399;';
    if (score >= 70) return 'background: rgba(99,102,241,0.15); color: #818cf8;';
    if (score >= 50) return 'background: rgba(245,158,11,0.15); color: #fbbf24;';
    return 'background: rgba(239,68,68,0.15); color: #f87171;';
  },
};

window.InterviewEngine = InterviewEngine;
