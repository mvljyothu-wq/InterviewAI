# InterviewAI

Adaptive mock interviews written live from your résumé, graded by a two-model ensemble (Google Gemini judge + Gemini embedding model), with a written explanation for every grade and a downloadable report card.

BCSE306 Artificial Intelligence, Fall Semester 2026–27, VIT Vellore. Team 22:
Madhavarapu Venkata Lakshmi Jyothiradithya (24BCI0184) and Dhruv Verma (24BCI0191).

> Research prototype for interview practice. It is not a hiring or assessment tool and must not be used to make decisions about real candidates.

## How it works

1. **Profile**: a PDF or DOCX résumé is read in the browser (PDF.js / Mammoth) and turned into a structured profile by Gemini, with a rule-based parser as fallback.
2. **Interview**: Gemini writes each question from the résumé, the earlier answers and the target difficulty, and returns a grading rubric with it (model answer, key concepts, known misconceptions). Difficulty rises after a correct answer scoring 80 or more, stays the same from 55 to 79, and falls below 55.
3. **Grading**: an embedding model (`gemini-embedding-2`, 768 dimensions) measures meaning against the rubric, a rubric NLP scorer produces five dimension scores, and a Gemini judge grades with that evidence. The final grade is 60% judge and 40% embedding/rubric model, and the confidence comes from how closely the two agree.
4. **Feedback**: you get a per-answer explanation, an interview report with a study plan, a two-page PDF report card, and your history and dashboard (stored in `localStorage`).

## Run it

No build step is needed. Serve the folder and open it in Chrome:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Add a free Gemini API key from Google AI Studio using the key button in the top bar. The key is stored only in your browser's `localStorage`. It is never written to this repository and never sent anywhere except Google's API.

## Reproduce the evaluation

- **Offline** (no API key needed; MiniLM stands in for the Gemini embedding model): this regenerates the B1–B3, embedding-model and ablation rows of the report.

  ```bash
  cd eval/offline
  npm install
  npm run eval      # writes preds.json and metrics.json
  ```

- **Full ensemble**: open `eval.html` in the served app, add your key, and press **Run evaluation**. It grades all 96 answers with the production grader and reports accuracy, macro-F1, per-class scores, rewording flips and run-to-run agreement. Download the results as JSON or CSV.

The evaluation set is `eval/dataset.json`: 12 questions × 6 answers with gold verdicts, plus 24 Indian-English rewordings.

## Layout

| Path | Contents |
|---|---|
| `index.html`, `app.js`, `css/app.css` | Single-page app and design system |
| `config.js` | Model lists; API key handling (browser only) |
| `js/aiEngine.js` | Gemini calls, question generation, embeddings, grading ensemble, report |
| `js/evaluator.js`, `js/nlp.js`, `js/taxonomy.js` | Rubric NLP scorer (keywords, TF-IDF, dimension scores) |
| `js/resumeParser.js` | Résumé text extraction |
| `js/interview.js` | Session state, adaptive difficulty, prefetching |
| `js/scorecard.js`, `js/evalView.js`, `js/dashboard.js`, `js/certificate.js` | Results views, charts and the PDF report card |
| `js/db.js`, `js/auth.js` | Local storage and local profiles |
| `eval.html`, `eval/` | Evaluation set and harnesses |

## Licence

MIT for this repository's code. Third-party libraries keep their own licences: PDF.js (Apache-2.0), Mammoth (BSD-2-Clause), Chart.js (MIT), html-to-image (MIT), jsPDF (MIT), html2canvas (MIT), and Transformers.js and all-MiniLM-L6-v2 (Apache-2.0).
