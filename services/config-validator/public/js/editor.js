// Editor behaviors for the JSON textarea: live highlight, Tab indent/dedent,
// move-line (Alt/Ctrl+↑/↓), and Format (prettify).
import { highlightHtml, stripTrailingCommas } from './highlighter.js';

const INDENT = '  '; // 2 spaces

export function initEditor({ textarea, backdrop, highlights, hint }) {
  function refresh() {
    const { html, issues } = highlightHtml(textarea.value);
    highlights.innerHTML = html;
    hint.textContent = issues.length
      ? '⚠ Possible JSON issue: ' +
        [...new Set(issues.map((i) => i.label))].join(', ') +
        '.'
      : '';
    syncScroll();
  }

  function syncScroll() {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  function setValue(value, caret) {
    textarea.value = value;
    if (typeof caret === 'number') {
      textarea.selectionStart = textarea.selectionEnd = caret;
    }
    refresh();
  }

  function format() {
    const raw = textarea.value.trim();
    if (!raw) return;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      try {
        obj = JSON.parse(stripTrailingCommas(raw));
      } catch {
        hint.textContent = '⚠ Can’t format — fix the JSON first.';
        return;
      }
    }
    setValue(JSON.stringify(obj, null, 2));
  }

  function onKeydown(ev) {
    // Format: ⌘/Ctrl + S
    if ((ev.metaKey || ev.ctrlKey) && (ev.key === 's' || ev.key === 'S')) {
      ev.preventDefault();
      format();
      return;
    }
    // Move line(s): Alt or Ctrl + ↑/↓
    if (
      (ev.altKey || ev.ctrlKey) &&
      !ev.metaKey &&
      (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')
    ) {
      ev.preventDefault();
      moveLines(textarea, ev.key === 'ArrowUp' ? -1 : 1);
      refresh();
      return;
    }
    // Indent / dedent
    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (ev.shiftKey) dedent(textarea);
      else indentOrInsert(textarea);
      refresh();
    }
  }

  textarea.addEventListener('keydown', onKeydown);
  textarea.addEventListener('input', refresh);
  textarea.addEventListener('scroll', syncScroll);
  refresh();

  return { refresh, setValue, format };
}

// ── text-manipulation helpers (operate directly on the textarea) ──

function indentOrInsert(ta) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  if (s === e) {
    ta.value = value.slice(0, s) + INDENT + value.slice(s);
    ta.selectionStart = ta.selectionEnd = s + INDENT.length;
    return;
  }
  // indent every line touched by the selection
  const from = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(from, e);
  const indented = block.replace(/^/gm, INDENT);
  ta.value = value.slice(0, from) + indented + value.slice(e);
  ta.selectionStart = s + INDENT.length;
  ta.selectionEnd = e + (indented.length - block.length);
}

function dedent(ta) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const from = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(from, e);
  let firstRemoved = 0;
  let totalRemoved = 0;
  const out = block
    .split('\n')
    .map((line, idx) => {
      const m = line.match(/^( {1,2}|\t)/);
      if (!m) return line;
      const n = m[1].length;
      if (idx === 0) firstRemoved = n;
      totalRemoved += n;
      return line.slice(n);
    })
    .join('\n');
  ta.value = value.slice(0, from) + out + value.slice(e);
  ta.selectionStart = Math.max(from, s - firstRemoved);
  ta.selectionEnd = e - totalRemoved;
}

function moveLines(ta, dir) {
  const value = ta.value;
  const lines = value.split('\n');
  const lineAt = (pos) => value.slice(0, pos).split('\n').length - 1;
  const a = lineAt(ta.selectionStart);
  const b = lineAt(ta.selectionEnd);
  if (dir < 0 && a === 0) return;
  if (dir > 0 && b === lines.length - 1) return;

  const block = lines.splice(a, b - a + 1);
  lines.splice(a + dir, 0, ...block);

  const posOfLine = (arr, i) =>
    arr.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  const start = posOfLine(lines, a + dir);
  ta.value = lines.join('\n');
  ta.selectionStart = start;
  ta.selectionEnd = start + block.join('\n').length;
}
