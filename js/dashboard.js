/**
 * InterviewAI – Dashboard Module
 */

const Dashboard = {
  charts: {},

  render() {
    const user = Auth.requireAuth();
    if (!user) return;

    const sessions = DB.getUserSessions(user.id);
    const resume   = DB.getLatestResume(user.id);

    this._renderStats(user, sessions);
    this._renderRecentHistory(sessions);
    this._renderSkillBars(sessions);
    this._renderScoreHistory(sessions);
    this._renderRecommendedJobs(sessions, resume);
  },

  _renderStats(user, sessions) {
    const el = s => document.getElementById(s);
    if (el('stat-name'))  el('stat-name').textContent  = user.name;
    if (el('nav-name'))   el('nav-name').textContent   = user.name;
    if (el('user-avatar')) el('user-avatar').textContent = user.name.charAt(0).toUpperCase();

    const total   = sessions.length;
    const latest  = sessions[0]?.finalScore || '–';
    const avg     = total > 0 ? Math.round(sessions.reduce((s, r) => s + (r.finalScore || 0), 0) / total) : '–';

    // Best skill from latest report
    let topSkill = '–';
    let topWeakness = '–';
    if (sessions[0]?.report?.job_recommendations) {
      const skills = sessions[0].report.job_recommendations[0]?.matching_skills || [];
      topSkill = skills[0] || '–';
    }
    if (sessions[0]?.report?.weaknesses) {
      topWeakness = sessions[0].report.weaknesses[0]?.split(' ').slice(0, 3).join(' ') || '–';
    }

    if (el('stat-total'))    el('stat-total').textContent    = total;
    if (el('stat-latest'))   el('stat-latest').textContent   = String(latest);
    if (el('stat-average'))  el('stat-average').textContent  = String(avg);
    if (el('stat-strength')) el('stat-strength').textContent = topSkill;
    if (el('stat-weakness')) el('stat-weakness').textContent = topWeakness;
  },

  _renderRecentHistory(sessions) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (sessions.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="empty-cell">No interviews yet. Your finished sessions will appear here.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.slice(0, 8).map(s => {
      const score = s.finalScore || 0;
      const cat   = InterviewEngine.getScoreCategory(score);
      const date  = new Date(s.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <tr>
          <td>${date}</td>
          <td style="color:var(--ink);font-weight:500">${s.jobRole}</td>
          <td>${String(s.interviewType || '').replace(' Interview', '')}</td>
          <td>${s.totalQuestions || '–'}</td>
          <td><span class="score-pill ev-pill-${EvalView.scoreTone(score)}">${score}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="Router.navigate('scorecard-view','${s.id}')">View</button>
          </td>
        </tr>`;
    }).join('');
  },

  _renderSkillBars(sessions) {
    const container = document.getElementById('skill-bars');
    if (!container) return;

    if (sessions.length === 0) {
      container.innerHTML = '<p class="muted">Finish an interview to see your skill breakdown.</p>';
      return;
    }

    // Average skill scores across sessions
    const skillTotals = {};
    const skillCounts = {};
    sessions.forEach(s => {
      const scores = s.report?.skill_scores || {};
      Object.entries(scores).forEach(([k, v]) => {
        skillTotals[k] = (skillTotals[k] || 0) + v;
        skillCounts[k] = (skillCounts[k] || 0) + 1;
      });
    });

    const labels = {
      technical_knowledge: 'Technical', problem_solving: 'Problem Solving',
      communication: 'Communication', conceptual_understanding: 'Conceptual',
      resume_knowledge: 'Resume Knowledge', overall_confidence: 'Confidence',
    };

    container.innerHTML = Object.keys(labels).map(k => {
      const avg = skillCounts[k] ? Math.round(skillTotals[k] / skillCounts[k]) : 0;
      return `
        <div class="skill-bar-item">
          <span class="skill-bar-label">${labels[k]}</span>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" style="width:${avg}%"></div>
          </div>
          <span class="skill-bar-value">${avg}%</span>
        </div>`;
    }).join('');
  },

  _renderScoreHistory(sessions) {
    const ctx = document.getElementById('score-history-chart');
    if (!ctx) return;

    const recent = sessions.slice(0, 8).reverse();
    let empty = ctx.parentElement.querySelector('.chart-empty');
    if (!empty) { empty = document.createElement('p'); empty.className = 'chart-empty muted'; empty.textContent = 'Your scores will be plotted here after your first interview.'; ctx.parentElement.appendChild(empty); }
    empty.hidden = recent.length > 0;
    ctx.style.display = recent.length ? '' : 'none';
    if (recent.length === 0) return;

    if (this.charts.scoreHistory) this.charts.scoreHistory.destroy();
    this.charts.scoreHistory = new Chart(ctx, {
      type: 'line',
      data: {
        labels: recent.map(s => new Date(s.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })),
        datasets: [{
          label: 'Score',
          data: recent.map(s => s.finalScore || 0),
          borderColor: '#1F5BE6',
          backgroundColor: 'rgba(31,91,230,0.06)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#1F5BE6',
          pointRadius: 5,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 100, grid: { color: '#EEF0F3' }, border: { display: false }, ticks: { stepSize: 25 } },
          x: { grid: { display: false }, border: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
  },

  _renderRecommendedJobs(sessions, resume) {
    const container = document.getElementById('recommended-jobs');
    if (!container) return;

    // Get latest job recommendations
    const latestJobs = sessions[0]?.report?.job_recommendations;
    if (!latestJobs || latestJobs.length === 0) {
      container.innerHTML = '<p class="muted">Finish an interview to see which roles fit you.</p>';
      return;
    }

    container.innerHTML = `<div class="job-chips-grid">${
      latestJobs.slice(0, 6).map(job => `
        <div class="job-chip">
          <span class="job-mini-ico"><svg class="ico"><use href="#i-briefcase"/></svg></span>
          <span>${job.title}</span>
          <span class="badge ${job.match_percentage >= 80 ? 'badge-success' : ''}">${job.match_percentage}% match</span>
        </div>`).join('')
    }</div>`;
  },
};

window.Dashboard = Dashboard;
