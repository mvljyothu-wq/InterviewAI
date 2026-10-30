/**
 * InterviewAI – Database Layer (localStorage)
 * Simulates a full database for the application.
 */

const DB = {
  // ─── Helpers ────────────────────────────────────
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  // ─── USERS ──────────────────────────────────────
  getUsers()      { return this._get('iai_users'); },
  saveUsers(u)    { this._set('iai_users', u); },

  getUserByEmail(email) {
    return this.getUsers().find(u => u.email === email);
  },

  createUser({ name, email, password }) {
    const users = this.getUsers();
    if (users.find(u => u.email === email)) throw new Error('Email already registered');
    const user = { id: this._id(), name, email, password, createdAt: Date.now() };
    users.push(user);
    this.saveUsers(users);
    return user;
  },

  // ─── CURRENT SESSION AUTH ───────────────────────
  getCurrentUser() {
    try { return JSON.parse(sessionStorage.getItem('iai_current_user')); }
    catch { return null; }
  },
  setCurrentUser(user) { sessionStorage.setItem('iai_current_user', JSON.stringify(user)); },
  clearCurrentUser()   { sessionStorage.removeItem('iai_current_user'); },

  // ─── RESUMES ────────────────────────────────────
  getResumes()      { return this._get('iai_resumes'); },
  saveResumes(r)    { this._set('iai_resumes', r); },

  saveResume({ userId, fileName, extractedProfile }) {
    const resumes = this.getResumes();
    const resume = { id: this._id(), userId, fileName, extractedProfile, uploadedAt: Date.now() };
    resumes.push(resume);
    this.saveResumes(resumes);
    return resume;
  },

  getLatestResume(userId) {
    return this.getResumes()
      .filter(r => r.userId === userId)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)[0] || null;
  },

  // ─── INTERVIEW SESSIONS ──────────────────────────
  getSessions()      { return this._get('iai_sessions'); },
  saveSessions(s)    { this._set('iai_sessions', s); },

  createSession({ userId, resumeId, jobRole, interviewType, startDifficulty, totalQuestions }) {
    const sessions = this.getSessions();
    const session = {
      id: this._id(),
      userId, resumeId, jobRole, interviewType,
      startDifficulty, totalQuestions,
      currentDifficulty: startDifficulty,
      status: 'active',
      startedAt: Date.now(),
      completedAt: null,
      finalScore: null,
      questions: [],   // [{questionId, question, topic, difficulty}]
      answers: [],     // [{questionId, answer, evaluation}]
    };
    sessions.push(session);
    this.saveSessions(sessions);
    return session;
  },

  getSession(id) { return this.getSessions().find(s => s.id === id) || null; },

  updateSession(id, updates) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx === -1) return null;
    sessions[idx] = { ...sessions[idx], ...updates };
    this.saveSessions(sessions);
    return sessions[idx];
  },

  completeSession(id, finalScore, report) {
    return this.updateSession(id, {
      status: 'completed',
      completedAt: Date.now(),
      finalScore,
      report,
    });
  },

  getUserSessions(userId) {
    return this.getSessions()
      .filter(s => s.userId === userId && s.status === 'completed')
      .sort((a, b) => b.completedAt - a.completedAt);
  },

  // ─── REPORTS ────────────────────────────────────
  getReports()   { return this._get('iai_reports'); },
  saveReports(r) { this._set('iai_reports', r); },

  saveReport(report) {
    const reports = this.getReports();
    const existing = reports.findIndex(r => r.sessionId === report.sessionId);
    if (existing !== -1) { reports[existing] = report; }
    else { reports.push({ id: this._id(), ...report, savedAt: Date.now() }); }
    this.saveReports(reports);
    return report;
  },

  getReport(sessionId) {
    return this.getReports().find(r => r.sessionId === sessionId) || null;
  },
};

window.DB = DB;
