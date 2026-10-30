/**
 * InterviewAI – Taxonomy (NOT a question bank)
 * ─────────────────────────────────────────────────────────────────
 * Every interview question is written by Google Gemini. This file only
 * holds reference data the app needs around those questions:
 *   TOPICS      – topic names Gemini must choose from, résumé aliases used
 *                 to map skills to topics, and study resources for the report
 *   ROLE_TOPICS – which topics matter most for each job role
 *   STAR        – the STAR-method rubric used to grade behavioural answers
 */

// Small helper so each concept fits on a few lines.
function C(label, w, core, keys, why, re) {
  return { label, w, core, keys, why, re };
}

// ─── Shared STAR rubric for behavioural questions ─────────────────
const STAR = {
  situation: C('Situation – sets the context', 2, true, [],
    'Interviewers need a concrete setting (which project, team or semester) before your actions make sense. Open with one or two sentences of context.',
    /\b(when i was|while (i was|working|building|developing)|during (my|our|the|a|an)\b|at my (previous|last|first|internship|college)|in (my|our|a|an) [\w\s-]{0,30}?(project|internship|team|course|semester|hackathon|class|club|job|company|role|competition)|last (year|semester|summer|month)|our team|in (college|university|school)|for (a|our|my) [\w\s-]{0,20}?(project|hackathon|competition|course))\b/i),
  task: C('Task – your responsibility or goal', 2, true, [],
    'Say clearly what *you* were responsible for or what problem had to be solved. Without it, the interviewer cannot judge your contribution.',
    /\b(my (role|task|responsibility|job|goal|aim|part) was|i was (responsible|asked|tasked|assigned|in charge)|i (had|needed) to|we (needed|had) to|the (goal|challenge|problem|issue|deadline|task) was|i owned|as the [\w\s-]{0,25}?(lead|owner|coordinator|captain|person|developer|engineer)\b|no one was assigned|it had to|our goal)\b/i),
  action: C('Action – specific steps *you* took', 3, true, [],
    'The Action part carries the most weight. Describe 2–3 concrete steps in first person ("I proposed…", "I rewrote…") rather than "we did stuff".',
    /\bi (\w{3,}ed|built|wrote|made|led|took|ran|spoke|set|split|cut|spent|read|told|kept|chose|found|went|gave|did|broke|began|drew|sat|met|taught|thought|sought|brought)\b/i),
  result: C('Result – measurable outcome', 3, true, [],
    'A story without an outcome feels unfinished. State what changed – ideally with a number (time saved, grade, users, % improvement).',
    /\b(as a result|resulted|the result|outcome|in the end|eventually|successfully|improv(ed|ing)|reduc(ed|ing)|increas(ed|ing)|deliver(ed)?|on time|we won|i won|award|grade|got selected|was selected|appreciated|praised|\d+\s?%|\d+x|percent|faster|completed|finished|launched|deployed|resolved|shipped|passed|scored|\d+\s*\/\s*\d+|early|reached|achieved|saved|zero (crashes|bugs|errors))\b/i),
  reflection: C('Reflection – what you learned', 2, false, [],
    'Ending with a lesson learned shows self-awareness and growth, which is what behavioural questions are really testing.',
    /\b(i learn(ed|t)|lesson|taught me|next time|in hindsight|looking back|would (do|have done)|differently|now i (always|make sure|try|follow|write|ask)|my approach now|ever since|this experience|since then|realized|realised)\b/i),
};

function starConcepts(extra) {
  return [STAR.situation, STAR.task, STAR.action, STAR.result, STAR.reflection, ...(extra || [])];
}

// ─── Topic metadata ───────────────────────────────────────────────
const TOPICS = {
  'Python': {
    aliases: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
    resources: 'Python docs (docs.python.org), "Fluent Python" by Luciano Ramalho, Real Python tutorials',
  },
  'JavaScript': {
    aliases: ['javascript', 'typescript', 'nodejs', 'node', 'express', 'html', 'css', 'jquery'],
    resources: 'MDN Web Docs, "You Don\'t Know JS" (Kyle Simpson), javascript.info',
  },
  'React': {
    aliases: ['react', 'next.js', 'nextjs', 'redux', 'react native'],
    resources: 'react.dev (official docs), Kent C. Dodds\' blog, Epic React',
  },
  'Java': {
    aliases: ['java', 'spring', 'springboot', 'spring boot', 'kotlin', 'hibernate'],
    resources: '"Effective Java" by Joshua Bloch, Baeldung, Oracle Java tutorials',
  },
  'C/C++': {
    aliases: ['c++', 'cpp', 'c', 'embedded', 'stl'],
    resources: 'cppreference.com, "A Tour of C++" by Stroustrup, learncpp.com',
  },
  'SQL & Databases': {
    aliases: ['sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'database', 'oracle', 'sqlite', 'dbms'],
    resources: 'Use The Index, Luke (use-the-index-luke.com), SQLBolt, PostgreSQL docs',
  },
  'Machine Learning': {
    aliases: ['machine learning', 'ml', 'scikit', 'scikit-learn', 'sklearn', 'tensorflow', 'pytorch', 'keras', 'data science', 'xgboost'],
    resources: 'Andrew Ng\'s ML Specialization (Coursera), "Hands-On ML" by Aurélien Géron, scikit-learn user guide',
  },
  'Deep Learning': {
    aliases: ['deep learning', 'tensorflow', 'pytorch', 'keras', 'cnn', 'nlp', 'llm', 'transformers', 'computer vision', 'opencv'],
    resources: 'fast.ai Practical Deep Learning, d2l.ai (Dive into Deep Learning), Stanford CS231n notes',
  },
  'Data Analysis & Statistics': {
    aliases: ['statistics', 'pandas', 'excel', 'power bi', 'powerbi', 'tableau', 'r', 'data analysis', 'analytics'],
    resources: 'Khan Academy Statistics, "Practical Statistics for Data Scientists", Mode SQL/Analytics tutorials',
  },
  'Data Structures & Algorithms': {
    aliases: ['data structures', 'algorithms', 'dsa', 'competitive programming', 'leetcode'],
    resources: 'NeetCode 150, "Introduction to Algorithms" (CLRS), visualgo.net',
  },
  'OOP': {
    aliases: ['oop', 'object oriented', 'java', 'c++', 'python', 'c#'],
    resources: '"Head First Design Patterns", refactoring.guru (design patterns & SOLID)',
  },
  'Operating Systems': {
    aliases: ['linux', 'operating system', 'operating systems', 'unix', 'shell', 'bash'],
    resources: '"Operating Systems: Three Easy Pieces" (free online), Linux man pages',
  },
  'Computer Networks': {
    aliases: ['networking', 'networks', 'tcp', 'http', 'socket', 'cisco'],
    resources: '"Computer Networking: A Top-Down Approach" (Kurose & Ross), Cloudflare Learning Center',
  },
  'Web & APIs': {
    aliases: ['rest', 'api', 'nodejs', 'express', 'django', 'flask', 'spring', 'fastapi', 'graphql', 'backend'],
    resources: 'MDN HTTP guide, Microsoft REST API Guidelines, OWASP Top 10',
  },
  'System Design': {
    aliases: ['system design', 'microservices', 'distributed', 'aws', 'kafka', 'redis'],
    resources: 'System Design Primer (GitHub), "Designing Data-Intensive Applications" by Martin Kleppmann',
  },
  'Git & DevOps': {
    aliases: ['git', 'github', 'gitlab', 'docker', 'kubernetes', 'jenkins', 'aws', 'azure', 'gcp', 'ci/cd'],
    resources: 'Pro Git (git-scm.com/book), Docker docs, GitHub Actions docs',
  },
  'Behavioral': {
    aliases: [],
    resources: 'The STAR method (Situation, Task, Action, Result), "Cracking the Coding Interview" behavioural chapter',
  },
};

// Topics each role is most likely to be grilled on (in priority order).
const ROLE_TOPICS = {
  'Software Developer':   ['Data Structures & Algorithms', 'OOP', 'Operating Systems', 'SQL & Databases', 'Git & DevOps', 'Computer Networks'],
  'Frontend Developer':   ['JavaScript', 'React', 'Web & APIs', 'Data Structures & Algorithms', 'Computer Networks'],
  'Backend Developer':    ['Web & APIs', 'SQL & Databases', 'System Design', 'Operating Systems', 'Computer Networks', 'Data Structures & Algorithms'],
  'Full Stack Developer': ['JavaScript', 'React', 'Web & APIs', 'SQL & Databases', 'System Design', 'Git & DevOps'],
  'Data Analyst':         ['SQL & Databases', 'Data Analysis & Statistics', 'Python', 'Machine Learning'],
  'Data Scientist':       ['Machine Learning', 'Data Analysis & Statistics', 'Python', 'SQL & Databases', 'Deep Learning'],
  'ML Engineer':          ['Machine Learning', 'Deep Learning', 'Python', 'System Design', 'Git & DevOps'],
  'AI Engineer':          ['Deep Learning', 'Machine Learning', 'Python', 'Web & APIs', 'System Design'],
};

const Taxonomy = { TOPICS, ROLE_TOPICS, STAR, TOPIC_NAMES: Object.keys(TOPICS).filter(t => t !== 'Behavioral').concat(['Project Deep-Dive', 'Behavioral']) };

if (typeof window !== 'undefined') window.Taxonomy = Taxonomy;
if (typeof module !== 'undefined') module.exports = Taxonomy;
