/**
 * InterviewAI – NLP Toolkit
 * ─────────────────────────────────────────────────────────────────
 * Small, dependency-free text-processing library used by the local
 * answer evaluator. Everything here runs in the browser.
 *
 *   tokenize(text)          → lowercase word tokens
 *   stem(word)              → light suffix-stripping stemmer
 *   contentStems(text)      → tokens minus stopwords, stemmed
 *   splitSentences(text)    → array of sentences
 *   buildIdf(documents)     → inverse-document-frequency table
 *   tfidfVector(stems, idf) → sparse TF-IDF vector (plain object)
 *   cosine(vecA, vecB)      → cosine similarity in [0, 1]
 */

const NLP = {

  // Common English words that carry no technical meaning.
  // Negations ("not", "no", "never") are deliberately NOT here:
  // the evaluator needs them to spot contradictions.
  STOPWORDS: new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'so', 'than', 'too', 'very',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'doing',
    'have', 'has', 'had', 'having', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
    'might', 'must', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
    'out', 'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'what',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'yours', 'he', 'him', 'his',
    'she', 'her', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'as', 'until',
    'while', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
    'just', 'also', 'like', 'basically', 'actually', 'really', 'um', 'uh', 'okay', 'ok', 'yes',
    'well', 'thing', 'things', 'something', 'anything', 'everything', 'get', 'got', 'use',
    'used', 'using', 'uses', 'one', 'two', 'way', 'ways', 'lot', 'lots', 'kind', 'sort',
    'mean', 'means', 'say', 'said', 'think', 'know', 'want', 'need', 'make', 'makes', 'made',
    'let', 'lets', 'us', 'both', 'either', 'neither', 'whether', 'because', 'since', 'however',
    'therefore', 'thus', 'hence', 'example', 'e', 'g', 'eg', 'ie', 'etc', 'via', 'per',
  ]),

  NEGATIONS: new Set(['not', 'no', 'never', 'cannot', 'cant', 'dont', 'doesnt', 'isnt', 'arent', 'wont', 'without', 'nor']),

  // Abbreviations normalised before stemming so "db" and "database" match.
  SYNONYMS: {
    db: 'database', dbs: 'database', js: 'javascript', ts: 'typescript', py: 'python',
    func: 'function', funcs: 'function', fn: 'function', args: 'argument', arg: 'argument',
    param: 'parameter', params: 'parameter', obj: 'object', objs: 'object', var: 'variable',
    vars: 'variable', oop: 'object-oriented', api: 'api', apis: 'api', ml: 'machine-learning',
    ai: 'artificial-intelligence', dl: 'deep-learning', nn: 'neural-network', gc: 'garbage-collection',
    os: 'operating-system', cpu: 'processor', ram: 'memory', hashmap: 'hash-map', hashtable: 'hash-table',
    dict: 'dictionary', dicts: 'dictionary', btree: 'b-tree', cv: 'cross-validation', pk: 'primary-key',
    fk: 'foreign-key', ui: 'interface', async: 'asynchronous', sync: 'synchronous', http: 'http',
    lr: 'learning-rate', bst: 'binary-search-tree', dfs: 'depth-first', bfs: 'breadth-first',
    vdom: 'virtual-dom', ci: 'continuous-integration', cd: 'continuous-delivery',
  },

  // ─── Tokenisation ────────────────────────────────────────────────
  tokenize(text) {
    if (!text) return [];
    const cleaned = String(text)
      .toLowerCase()
      .replace(/n't\b/g, ' not')          // don't → do not
      .replace(/[’']/g, '')
      .replace(/c\+\+/g, 'cplusplus')
      .replace(/c#/g, 'csharp')
      .replace(/\.net\b/g, 'dotnet')
      .replace(/node\.js/g, 'nodejs')
      .replace(/o\(([^)]*)\)/g, ' bigo_$1 ') // O(n log n) → bigo_n log n
      .replace(/[^a-z0-9_\-\s]/g, ' ');

    const raw = cleaned.split(/\s+/).filter(Boolean);
    const out = [];
    for (const t of raw) {
      const mapped = Object.prototype.hasOwnProperty.call(this.SYNONYMS, t) ? this.SYNONYMS[t] : t;
      // hyphenated synonyms / compound words become separate tokens
      for (const part of mapped.split('-')) {
        if (part) out.push(part);
      }
    }
    return out;
  },

  // ─── Light stemmer ───────────────────────────────────────────────
  // A simplified Porter-style suffix stripper. It does not need to be
  // linguistically perfect – it only needs to map "caches", "cached",
  // "caching" and "cache" to the same stem consistently.
  SUFFIX_RULES: [
    ['ational', 'ate'], ['ization', 'ize'], ['isation', 'ize'], ['ability', 'able'],
    ['ibility', 'ible'], ['fulness', 'ful'], ['iveness', 'ive'], ['ousness', 'ous'],
    ['ations', 'ate'], ['ation', 'ate'], ['ities', 'ity'], ['ments', ''], ['ment', ''],
    ['ness', ''], ['ings', ''], ['ing', ''], ['ies', 'y'], ['ied', 'y'], ['edly', ''],
    ['ed', ''], ['ly', ''], ['s', ''],
  ],

  stem(word) {
    let w = word;
    if (w.length <= 3 || /^\d/.test(w) || w.startsWith('bigo_')) return w;

    for (const [suffix, replacement] of this.SUFFIX_RULES) {
      if (!w.endsWith(suffix)) continue;
      // keep "ss" endings (class, process) and short Latin endings (status, analysis)
      if (suffix === 's' && /(ss|us|is)$/.test(w)) break;
      const base = w.slice(0, w.length - suffix.length);
      if (base.length < 3) break;
      w = base + replacement;
      break;
    }

    // undouble trailing consonant: "stopp" → "stop", "runn" → "run"
    if (/([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1);
    // British spelling: "normalise" → "normalize"
    if (w.length > 5 && w.endsWith('ise')) w = w.slice(0, -3) + 'ize';
    // drop a final silent "e": "cache" → "cach", "create" → "creat"
    if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
    return w;
  },

  isStopword(token) {
    return this.STOPWORDS.has(token);
  },

  // Tokens that carry meaning, stemmed.
  contentStems(text) {
    return this.tokenize(text)
      .filter(t => !this.STOPWORDS.has(t) && !this.NEGATIONS.has(t) && t.length > 1)
      .map(t => this.stem(t));
  },

  // ─── Sentences ───────────────────────────────────────────────────
  splitSentences(text) {
    if (!text) return [];
    const parts = String(text)
      .replace(/\b(e\.g|i\.e|etc|vs)\./gi, '$1')   // don't split on abbreviations
      .split(/(?<=[.!?;])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Long unpunctuated text (e.g. from voice input) is chunked into
    // ~25-word windows so concept matching stays local.
    const result = [];
    for (const s of parts) {
      const words = s.split(/\s+/);
      if (words.length <= 40) { result.push(s); continue; }
      for (let i = 0; i < words.length; i += 25) {
        result.push(words.slice(i, i + 30).join(' '));
      }
    }
    return result;
  },

  wordCount(text) {
    return (String(text || '').match(/[A-Za-z0-9+#]+/g) || []).length;
  },

  // ─── TF-IDF ──────────────────────────────────────────────────────
  buildIdf(documents) {
    const df = Object.create(null);
    const n = documents.length;
    for (const doc of documents) {
      const unique = new Set(this.contentStems(doc));
      for (const s of unique) df[s] = (df[s] || 0) + 1;
    }
    const idf = Object.create(null);
    for (const term in df) {
      idf[term] = Math.log((n + 1) / (df[term] + 1)) + 1;
    }
    idf.__default = Math.log(n + 1) + 1;   // unseen words are treated as rare
    return idf;
  },

  tfidfVector(stems, idf) {
    const counts = Object.create(null);
    for (const s of stems) counts[s] = (counts[s] || 0) + 1;
    const vec = Object.create(null);
    for (const term in counts) {
      const tf = 1 + Math.log(counts[term]);            // sub-linear term frequency
      const weight = Object.prototype.hasOwnProperty.call(idf, term) ? idf[term] : idf.__default;
      vec[term] = tf * weight;
    }
    return vec;
  },

  cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (const k in a) {
      normA += a[k] * a[k];
      if (k in b) dot += a[k] * b[k];
    }
    for (const k in b) normB += b[k] * b[k];
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  // Fraction of distinct words that are unique – low values mean repetition.
  typeTokenRatio(text) {
    const tokens = this.tokenize(text).filter(t => !this.STOPWORDS.has(t));
    if (tokens.length === 0) return 1;
    return new Set(tokens).size / tokens.length;
  },
};

if (typeof window !== 'undefined') window.NLP = NLP;
if (typeof module !== 'undefined') module.exports = NLP;
