import { pipeline, env } from '@huggingface/transformers';
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url);
// Downloads Xenova/all-MiniLM-L6-v2 (Apache-2.0) on first run
const fe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
globalThis.window = globalThis; globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]} };
const J=new URL('../../', import.meta.url).pathname;
(0,eval)(fs.readFileSync(J+'config.js','utf8'));
globalThis.NLP=require(J+'js/nlp.js'); globalThis.Taxonomy=require(J+'js/taxonomy.js'); globalThis.AnswerEvaluator=require(J+'js/evaluator.js');
(0,eval)(fs.readFileSync(J+'js/aiEngine.js','utf8').replace('window.AIEngine = AIEngine;','globalThis.AIEngine = AIEngine;'));
const cache = new Map();
AIEngine.embed = async (texts) => { const out=[]; for (const t of texts) { if(!cache.has(t)) cache.set(t, Array.from((await fe(t,{pooling:'mean',normalize:true})).data)); out.push(cache.get(t)); } return out; };
const cos=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const D = JSON.parse(fs.readFileSync(new URL('../dataset.json', import.meta.url),'utf8'));
const GOLD = { A:'correct', B:'correct', C:'partially_correct', D:'incorrect', E:'incorrect', F:'off_topic' };
const rows = [];
AISettings.apiKey='AIzaOFFLINE'; AIEngine._sleep = async()=>{};
globalThis.fetch = async () => ({ ok:false, status:503, json: async()=>({error:{message:'offline'}}) });
const _warn = console.warn; console.warn = () => {};
const t0 = Date.now();
for (const q of D.questions) {
  const rubric = { model: q.model_answer, keyConcepts: q.key_concepts, misconceptions: q.misconceptions, useStar:false };
  const item = AIEngine._rubricItem({ question: q.question, rubric, topic: q.topic, type: 'technical' });
  const kws = q.key_concepts.flatMap(c => c.keywords.map(k => k.toLowerCase()));
  const cases = [...Object.entries(q.answers).map(([k,a])=>({k, a, variant:false})), ...Object.entries(q.variants).map(([k,a])=>({k, a, variant:true}))];
  for (const c of cases) {
    const ans = c.a, low = ans.toLowerCase();
    // B1 keyword-rule baseline
    const hit = kws.filter(k => low.includes(k)).length / kws.length;
    const b1 = hit >= 0.45 ? 'correct' : hit >= 0.2 ? 'partially_correct' : hit >= 0.05 ? 'incorrect' : 'off_topic';
    // B2 embedding cosine to model answer, fixed thresholds
    const [va, vm] = await AIEngine.embed([ans, q.model_answer]);
    const cs = cos(va, vm);
    const b2 = cs >= 0.75 ? 'correct' : cs >= 0.55 ? 'partially_correct' : cs >= 0.3 ? 'incorrect' : 'off_topic';
    // B3 rubric NLP evaluator, no embeddings
    const b3 = AnswerEvaluator.evaluate({ question:q.question, answer:ans, difficulty:3, rubric:item });
    // Ours-ML
    const sem = await AIEngine._semanticSignals(ans, item);
    const ours = AnswerEvaluator.evaluate({ question:q.question, answer:ans, difficulty:3, rubric:item, semantic:sem });
    // Ablation 1: no control-sentence calibration (raw cosines)
    const sentences = NLP.splitSentences(ans).filter(s => NLP.wordCount(s) >= 3);
    const cTexts = item.concepts.map(cc => `${cc.label}: ${cc.description || cc.why}`);
    const cv = await AIEngine.embed(cTexts); const sv = await AIEngine.embed(sentences);
    const rawConcepts = cv.map((v,i) => { let best=-1, bs=''; sv.forEach((s,j)=>{const x=cos(v,s); if(x>best){best=x;bs=sentences[j];}}); return { score: Math.max(0,best), evidence: bs }; });
    const noCal = AnswerEvaluator.evaluate({ question:q.question, answer:ans, difficulty:3, rubric:item, semantic:{ ...sem, similarity: Math.max(0,sem.rawSimilarity), conceptScores: rawConcepts } });
    // Ablation 2: no concept-level matching (whole-answer similarity only)
    const noConcept = AnswerEvaluator.evaluate({ question:q.question, answer:ans, difficulty:3, rubric:item, semantic:{ ...sem, conceptScores: sem.conceptScores.map(()=>null) } });
    const [vc] = await AIEngine.embed([AIEngine.CONTROL_SENTENCE]);
    const ctrl = cos(vc, vm);
    const simFix = Math.max(0, Math.min(1, (sem.rawSimilarity - ctrl) / (1 - ctrl)));
    const fix = AnswerEvaluator.evaluate({ question:q.question, answer:ans, difficulty:3, rubric:item, semantic:{ ...sem, similarity: simFix } });
    const fb = await AIEngine.evaluateAnswer({ question:q.question, answer:ans, difficulty:3, rubric, topic:q.topic, type:'technical', jobRole:'Software Engineer' });
    rows.push({ fb: fb.verdict, fb_score: fb.overall_score, fix: fix.verdict, fix_score: fix.overall_score, simfix:+simFix.toFixed(3), ctrl:+ctrl.toFixed(3), q:q.id, topic:q.topic, case:c.k, variant:c.variant, gold:GOLD[c.k], words: NLP.wordCount(ans),
      b1, b1_hit:+hit.toFixed(3), b2, b2_cos:+cs.toFixed(3), b3:b3.verdict, b3_score:b3.overall_score,
      ours:ours.verdict, ours_score:ours.overall_score, sim:+sem.similarity.toFixed(3), flags: sem.flags.length,
      nocal:noCal.verdict, nocal_score:noCal.overall_score, noconcept:noConcept.verdict, noconcept_score:noConcept.overall_score });
  }
}
const ms = Date.now()-t0;
fs.writeFileSync(new URL('./preds.json', import.meta.url), JSON.stringify({ rows, ms, n: rows.length }, null, 1));
console.log('done', rows.length, 'rows in', ms, 'ms');
