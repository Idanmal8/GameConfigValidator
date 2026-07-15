// View: pure DOM rendering. No fetch, no event wiring.
import { escapeHtml } from './util.js';

const PROVIDER_LABELS = {
  ollama: 'Ollama',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  mock: 'Mock',
};

/** Build the model dropdown from /providers data (enabled vs needs key). */
export function populateProviders(select, data) {
  select.length = 1; // keep the first "server default" option
  select.options[0].textContent = 'server default (' + data.default + ')';
  for (const p of data.providers) {
    const status = !p.requiresKey
      ? p.name === 'mock'
        ? 'offline'
        : 'local · no key'
      : p.available
      ? 'enabled ✓'
      : 'needs key';
    const group = document.createElement('optgroup');
    group.label = (PROVIDER_LABELS[p.name] || p.name) + ' — ' + status;
    const blocked = p.requiresKey && !p.available;
    group.disabled = blocked;
    for (const model of p.models) {
      const opt = document.createElement('option');
      opt.value = p.name + '|' + model;
      opt.textContent = model;
      opt.disabled = blocked;
      group.appendChild(opt);
    }
    select.appendChild(group);
  }
}

/** Render a validation response into the result panel. */
export function renderResult(out, data) {
  const sv = data.schema_validation || {};
  const fb = data.llm_feedback;
  let html = '';

  html += '<div><strong>Schema</strong> ';
  html += sv.valid
    ? '<span class="badge ok">valid</span>'
    : '<span class="badge bad">invalid</span>';
  html += '</div>';

  if (sv.errors && sv.errors.length) {
    html +=
      '<ul>' + sv.errors.map((e) => '<li>' + escapeHtml(e) + '</li>').join('') + '</ul>';
  }

  if (fb) {
    const pct = Math.round((fb.confidence || 0) * 100);
    html +=
      '<div style="margin-top:14px"><strong>LLM feedback</strong> ' +
      '<span class="badge ok">confidence ' + pct + '%</span></div>';
    html += '<pre>' + escapeHtml(fb.analysis) + '</pre>';
    if (fb.suggested_actions && fb.suggested_actions.length) {
      html +=
        '<ul>' +
        fb.suggested_actions.map((a) => '<li>' + escapeHtml(a) + '</li>').join('') +
        '</ul>';
    }
  } else {
    html +=
      '<p class="muted" style="margin-top:12px">LLM analysis skipped (fix schema errors first).</p>';
  }

  html +=
    '<p class="muted" style="margin-top:12px;font-size:12px">provider: ' +
    escapeHtml(data.provider || '—') +
    (data.model ? ' · model: ' + escapeHtml(data.model) : '') +
    '</p>';
  out.innerHTML = html;
}

/** Render a simple badge + message (busy / empty / error states). */
export function renderMessage(out, kind, title, body) {
  out.innerHTML =
    '<span class="badge ' + kind + '">' + escapeHtml(title) + '</span>' +
    (body ? '<pre>' + escapeHtml(body) + '</pre>' : '');
}

/**
 * Show an animated "analyzing" state with a live elapsed timer and, after a few
 * seconds, a reassurance note (local models can be slow). Returns a handle whose
 * .stop() clears the timer — call it once the response arrives.
 */
export function startBusy(out) {
  const started = Date.now();
  out.innerHTML =
    '<div class="loading">' +
    '<span class="spinner" aria-hidden="true"></span>' +
    '<span>Analyzing… <span class="loading-elapsed muted" id="busy-elapsed"></span></span>' +
    '</div>' +
    '<p class="muted loading-note" id="busy-note" hidden>' +
    'Local models (Ollama) can take a little longer, especially on the first run — still working…' +
    '</p>';

  const elapsedEl = out.querySelector('#busy-elapsed');
  const noteEl = out.querySelector('#busy-note');

  const tick = () => {
    const secs = Math.floor((Date.now() - started) / 1000);
    if (elapsedEl) elapsedEl.textContent = secs > 0 ? secs + 's' : '';
    if (noteEl && secs >= 4) noteEl.hidden = false;
  };
  tick();
  const timer = setInterval(tick, 1000);

  return { stop: () => clearInterval(timer) };
}
