// JSON issue detection + overlay rendering (view helper).
import { escapeHtml } from './util.js';

/**
 * Find character ranges to flag. String-aware, so commas *inside* string
 * values are never mistaken for structural issues. Falls back to the parser's
 * reported position for anything else broken.
 */
export function findIssues(text) {
  const issues = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && (text[j] === '}' || text[j] === ']')) {
        issues.push({ start: i, end: i + 1, label: 'trailing comma' });
      }
    }
  }

  if (!issues.length && text.trim()) {
    try {
      JSON.parse(text);
    } catch (e) {
      const m = /position (\d+)/.exec(e.message);
      if (m) {
        const p = Math.min(Number(m[1]), Math.max(text.length - 1, 0));
        issues.push({ start: p, end: p + 1, label: 'unexpected token' });
      }
    }
  }
  return issues.sort((a, b) => a.start - b.start);
}

/** Build the backdrop HTML with error characters wrapped in <mark>. */
export function highlightHtml(text) {
  const issues = findIssues(text);
  let html = '';
  let last = 0;
  for (const r of issues) {
    html += escapeHtml(text.slice(last, r.start));
    html += '<mark>' + escapeHtml(text.slice(r.start, r.end)) + '</mark>';
    last = r.end;
  }
  html += escapeHtml(text.slice(last)) + '\n';
  return { html, issues };
}

/** Remove structural trailing commas (string-aware) — used by Format. */
export function stripTrailingCommas(text) {
  const commas = findIssues(text)
    .filter((i) => i.label === 'trailing comma')
    .sort((a, b) => b.start - a.start); // right-to-left keeps indices valid
  let out = text;
  for (const r of commas) out = out.slice(0, r.start) + out.slice(r.end);
  return out;
}
