/**
 * InterviewAI – Resume Parser
 * Extracts text from PDF and DOCX files using CDN libraries.
 */

const ResumeParser = {
  /**
   * Entry point: detect file type and extract text
   * @param {File} file
   * @returns {Promise<string>} raw text
   */
  async extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf')  return this._extractPDF(file);
    if (ext === 'docx') return this._extractDOCX(file);
    if (ext === 'doc')  throw new Error('Old .doc files are not supported. Save the résumé as PDF or DOCX and upload it again.');
    throw new Error('Unsupported file type. Please upload PDF or DOCX.');
  },

  /**
   * Extract text from PDF using PDF.js
   */
  async _extractPDF(file) {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) {
      throw new Error('The PDF reader did not load. Check your internet connection, or upload the DOCX version of your résumé.');
    }
    await this._configurePdfWorker(pdfjsLib);

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Keep line breaks (pdf.js marks the end of each line with hasEOL)
      // so headings like "Projects" and project titles stay on their own lines.
      let pageText = '';
      for (const item of content.items) {
        pageText += item.str + (item.hasEOL ? '\n' : ' ');
      }
      fullText += pageText.replace(/[ \t]+\n/g, '\n') + '\n';
    }
    return fullText.trim();
  },

  /**
   * When the app is opened straight from disk (file://), browsers refuse to
   * start a worker from another origin. Loading the worker code into a Blob
   * URL avoids that; if even that fails, pdf.js falls back to the main thread.
   */
  async _configurePdfWorker(pdfjsLib) {
    if (this._workerReady) return;
    const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    try {
      const res = await fetch(WORKER_URL);
      if (!res.ok) throw new Error('worker fetch failed');
      const code = await res.text();
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
    }
    this._workerReady = true;
  },

  /**
   * Extract text from DOCX using Mammoth.js
   */
  async _extractDOCX(file) {
    if (!window.mammoth) {
      throw new Error('The DOCX reader did not load. Check your internet connection, or upload a PDF instead.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  },
};

window.ResumeParser = ResumeParser;
