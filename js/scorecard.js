/**
 * InterviewAI – Scorecard Renderer
 * Generates and renders charts + UI for the final scorecard page.
 */

const Scorecard = {
  charts: {},

  render(report) {
    this._renderScoreHero(report);
    // Charts are drawn when they scroll into view, so their animation is seen
    const M = window.Motion;
    if (M) {
      M.whenVisible(document.getElementById('radar-chart'), () => this._renderSkillCharts(report));
      M.whenVisible(document.getElementById('difficulty-chart'), () => this._renderDifficultyChart(report));
    } else {
      this._renderSkillCharts(report);
      this._renderDifficultyChart(report);
    }
    this._renderStrengthsWeaknesses(report);
    this._renderRoadmap(report);
    this._renderJobRecommendations(report);
    this._renderQAReview(report);
    window.Motion?.revealIn(document.getElementById('page-scorecard'),
      '.charts-section > .chart-card, .scorecard-page > .card, .sw-card, .roadmap-section, .job-card, .qa-review-item, .scorecard-page > div > .section-header');
  },

  // ─── Score Hero ────────────────────────────────────────────────
  _renderScoreHero(report) {
    const score = report.overall_score || 0;
    const cat   = InterviewEngine.getScoreCategory(score);

    const el = document.getElementById('score-display');
    if (!el) return;

    el.innerHTML = `
      <div class="score-ring-wrap">
        ${EvalView.ring(score, 168)}
        <div class="score-category ${cat.cls}">${cat.label}</div>
      </div>
      <div class="overall-feedback">${String(report.overall_feedback || '').split(/\n\n+/).map(p => `<p>${EvalView.rich(p)}</p>`).join('')}</div>
      <div class="score-meta">
        <div class="score-meta-item">Role <strong>${report.jobRole || '–'}</strong></div>
        <div class="score-meta-item">Round <strong>${String(report.interviewType || '–').replace(' Interview', '')}</strong></div>
        <div class="score-meta-item">Questions <strong>${report.totalQuestions || (report.qa_history || []).length}</strong></div>
        <div class="score-meta-item">Date <strong>${new Date(report.completedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>
      </div>
      ${report.verdict_summary ? `
      <div class="verdict-tally">
        <span class="vt vt-correct"><b>${report.verdict_summary.correct}</b> Correct</span>
        <span class="vt vt-partial"><b>${report.verdict_summary.partially_correct}</b> Partially correct</span>
        <span class="vt vt-incorrect"><b>${report.verdict_summary.incorrect + report.verdict_summary.off_topic}</b> Incorrect or off-topic</span>
        ${report.verdict_summary.no_answer ? `<span class="vt vt-none"><b>${report.verdict_summary.no_answer}</b> Skipped</span>` : ''}
      </div>` : ''}
      ${(report.topic_performance || []).length ? `
      <div class="topic-perf">
        ${report.topic_performance.map(t => `
          <div class="topic-perf-row">
            <span class="topic-perf-name">${EvalView.escape(t.topic)}</span>
            <div class="ev-bar"><div class="ev-bar-fill ev-tone-${EvalView.scoreTone(t.score)}" style="width:${t.score}%"></div></div>
            <span class="topic-perf-val">${t.score}</span>
          </div>`).join('')}
      </div>` : ''}
    `;

    // Animated score counter
    CountUp.rings(el);
  },

  _animateCounter(id, from, to, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = performance.now();
    const update = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  },

  // ─── Skill Charts ──────────────────────────────────────────────
  _renderSkillCharts(report) {
    const scores = report.skill_scores || {};
    const labels = ['Technical knowledge', 'Problem solving', 'Communication', 'Concepts', 'Résumé knowledge', 'Confidence'];
    const keys   = ['technical_knowledge', 'problem_solving', 'communication', 'conceptual_understanding', 'resume_knowledge', 'overall_confidence'];
    const data   = keys.map(k => scores[k] || 0);

    // Radar Chart
    const radarCtx = document.getElementById('radar-chart');
    if (radarCtx) {
      if (this.charts.radar) this.charts.radar.destroy();
      this.charts.radar = new Chart(radarCtx, {
        type: 'radar',
        data: {
          labels,
          datasets: [{
            label: 'Your score',
            data,
            backgroundColor: 'rgba(31,91,230,0.10)',
            borderColor: '#1F5BE6',
            borderWidth: 2,
            pointBackgroundColor: '#1F5BE6',
            pointBorderColor: '#fff',
            pointRadius: 4,
          }],
        },
        options: {
          responsive: true,
          scales: {
            r: {
              min: 0, max: 100,
              ticks: { color: '#9A9DA5', stepSize: 20, backdropColor: 'transparent', font: { size: 10 } },
              grid: { color: '#E4E5E9' },
              angleLines: { color: '#E4E5E9' },
              pointLabels: { color: '#45474F', font: { size: 11 } },
            },
          },
          plugins: { legend: { display: false } },
        },
      });
    }

    // Bar Chart
    const barCtx = document.getElementById('bar-chart');
    if (barCtx) {
      if (this.charts.bar) this.charts.bar.destroy();
      const colors = data.map(v => v >= 75 ? '#13803D' : v >= 55 ? '#1F5BE6' : v >= 40 ? '#A55A00' : '#C2321F');
      this.charts.bar = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: labels.map(l => l.length > 14 ? l.substring(0, 14) + '…' : l),
          datasets: [{
            label: 'Score',
            data,
            backgroundColor: colors,
            borderWidth: 0,
            borderRadius: 99,
            borderSkipped: false,
            barThickness: 12,
          }],
        },
        options: {
          responsive: true,
          indexAxis: 'y',
          scales: {
            x: { min: 0, max: 100, grid: { color: '#EEF0F3' }, border: { display: false } },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: '#45474F', font: { size: 11 } } },
          },
          plugins: { legend: { display: false } },
        },
      });
    }
  },

  // ─── Difficulty Journey Chart ──────────────────────────────────
  _renderDifficultyChart(report) {
    const journey = report.difficulty_journey || [];
    const ctx = document.getElementById('difficulty-chart');
    if (!ctx || journey.length === 0) return;

    if (this.charts.difficulty) this.charts.difficulty.destroy();
    this.charts.difficulty = new Chart(ctx, {
      type: 'line',
      data: {
        labels: journey.map((_, i) => `Q${i + 1}`),
        datasets: [{
          label: 'Difficulty',
          data: journey,
          borderColor: '#1D1E22',
          backgroundColor: 'rgba(29,30,34,0.04)',
          borderWidth: 2,
          tension: 0,
          fill: true,
          clip: false,
          pointBackgroundColor: journey.map(d => {
            const c = { 1: '#13803D', 2: '#13803D', 3: '#1F5BE6', 4: '#C2321F', 5: '#C2321F' };
            return c[d] || '#1F5BE6';
          }),
          pointRadius: 6,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        aspectRatio: 3.4,
        layout: { padding: { top: 10, bottom: 4, right: 10 } },
        scales: {
          y: {
            min: 1, max: 5,
            ticks: {
              stepSize: 1,
              color: '#9A9DA5',
              callback: (v) => ({ 1: 'Beginner', 2: 'Intermediate', 3: 'Moderate', 4: 'Advanced', 5: 'Expert' }[v] || ''),
            },
            grid: { color: '#EEF0F3' }, border: { display: false },
          },
          x: { grid: { display: false }, border: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
  },

  // ─── Strengths & Weaknesses ───────────────────────────────────
  _renderStrengthsWeaknesses(report) {
    const sEl = document.getElementById('strengths-list');
    const wEl = document.getElementById('weaknesses-list');

    if (sEl) {
      sEl.innerHTML = (report.strengths || []).map(s => `
        <li class="sw-item strength">
          <span class="sw-item-icon">✓</span>
          <span>${EvalView.escape(s)}</span>
        </li>`).join('') || '<li class="sw-item strength"><span>No clear strengths yet. Answer a few more questions in full.</span></li>';
    }

    if (wEl) {
      wEl.innerHTML = (report.weaknesses || []).map(w => `
        <li class="sw-item weakness">
          <span class="sw-item-icon">!</span>
          <span>${EvalView.escape(w)}</span>
        </li>`).join('') || '<li class="sw-item weakness"><span>Nothing stood out as weak in this round.</span></li>';
    }
  },

  // ─── Learning Roadmap ─────────────────────────────────────────
  _renderRoadmap(report) {
    const roadmap = report.improvement_roadmap || {};
    const phases  = [
      { key: 'immediate', label: 'This week', subtitle: 'Fix these first', cls: 'phase-1' },
      { key: 'short_term', label: 'Next few weeks', subtitle: 'Build on the basics', cls: 'phase-2' },
      { key: 'advanced', label: 'Longer term', subtitle: 'Go deeper', cls: 'phase-3' },
    ];

    const container = document.getElementById('roadmap-phases');
    if (!container) return;

    container.innerHTML = phases.map((phase, i) => {
      const items = roadmap[phase.key] || [];
      return `
        <div class="roadmap-phase ${phase.cls}">
          <div class="phase-header">
            <div class="phase-number">${i + 1}</div>
            <div>
              <div class="phase-title">${phase.label}</div>
              <div class="phase-subtitle">${phase.subtitle}</div>
            </div>
          </div>
          <div class="phase-topics">
            ${items.map(item => `
              <div class="phase-item">
                <strong>${EvalView.escape(item.topic)}</strong>
                ${item.description ? `<p>${EvalView.escape(item.description)}</p>` : ''}
                ${item.resources ? `<small>${EvalView.escape(item.resources)}</small>` : ''}
              </div>`).join('') || '<div class="phase-topic">Nothing urgent here.</div>'}
          </div>
        </div>`;
    }).join('');
  },

  // ─── Job Recommendations ──────────────────────────────────────
  _renderJobRecommendations(report) {
    const jobs = report.job_recommendations || [];
    const container = document.getElementById('jobs-grid');
    if (!container) return;

    container.innerHTML = jobs.map(job => {
      const tone = job.match_percentage >= 80 ? 'good' : job.match_percentage >= 65 ? 'ok' : 'warn';
      return `
        <div class="job-card">
          <div class="job-card-header">
            <div style="display:flex;align-items:center;gap:12px;min-width:0">
              <div class="job-icon"><svg class="ico"><use href="#i-briefcase"/></svg></div>
              <div style="min-width:0">
                <div class="job-title">${job.title}</div>
                <div class="job-sub">${job.salary_range || ''}</div>
              </div>
            </div>
            <div class="job-match ${tone}">${job.match_percentage}%
              <div class="match-bar"><div class="match-fill" style="width:${job.match_percentage}%"></div></div>
            </div>
          </div>
          <p class="job-reason">${job.reason || ''}</p>
          <div class="skills-comparison">
            <div class="skills-comp-row">
              <div class="skills-comp-label">Skills you have</div>
              <div class="skills-list">
                ${(job.matching_skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('')}
              </div>
            </div>
            ${(job.missing_skills || []).length > 0 ? `
            <div class="skills-comp-row">
              <div class="skills-comp-label">Skills to build</div>
              <div class="skills-list">
                ${(job.missing_skills || []).map(s => `<span class="skill-tag is-gap">${s}</span>`).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>`;
    }).join('');
  },

  // ─── Q&A Review ───────────────────────────────────────────────
  _renderQAReview(report) {
    const history = report.qa_history || [];
    const container = document.getElementById('qa-review-list');
    if (!container) return;
    const esc = (t) => EvalView.escape(t);

    container.innerHTML = history.map((qa, i) => {
      const e = qa.evaluation || {};
      const score = e.overall_score || 0;
      const v = EvalView.verdictMeta(e.verdict);
      return `
        <div class="qa-review-item">
          <div class="qa-review-header" onclick="this.nextElementSibling.classList.toggle('open'); this.classList.toggle('expanded')">
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
              <span class="score-pill ev-pill-${EvalView.scoreTone(score)}">${score}</span>
              ${e.verdict ? `<span class="ev-verdict ev-verdict-sm ${v.cls}"><span class="ev-verdict-icon">${v.icon}</span>${v.label}</span>` : ''}
              <span class="qa-review-title">${i + 1}. ${esc(qa.question)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              <span class="diff-badge diff-${qa.difficulty}">${InterviewEngine.getDifficultyLabel(qa.difficulty)}</span>
              <span class="qa-chevron" aria-hidden="true"></span>
            </div>
          </div>
          <div class="qa-review-body"><div class="qa-inner">
            <div class="qa-q"><span class="qa-k">Question</span>${esc(qa.question)}</div>
            <div class="qa-a"><span class="qa-k">Your answer</span>${esc(qa.answer || 'No answer provided')}</div>
            ${EvalView.render(e, { compact: true })}
          </div></div>
        </div>`;
    }).join('') || '<p style="color:var(--text-muted);padding:20px">No questions recorded.</p>';
  },
};

window.Scorecard = Scorecard;
