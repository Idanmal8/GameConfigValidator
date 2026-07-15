// Controller: wires the DOM to the api (model) and view.
import { byId } from './util.js';
import { fetchProviders, validate } from './api.js';
import { initEditor } from './editor.js';
import {
  populateProviders,
  renderResult,
  renderMessage,
  renderBusy,
} from './view.js';

export function initController() {
  const config = byId('config');
  const result = byId('result');
  const modelSelect = byId('model');
  const submit = byId('submit');

  const editor = initEditor({
    textarea: config,
    backdrop: byId('backdrop'),
    highlights: byId('highlights'),
    hint: byId('hint'),
  });

  // Populate the provider dropdown from the server.
  fetchProviders()
    .then((data) => populateProviders(modelSelect, data))
    .catch(() => {
      /* leave the "server default" option only */
    });

  // Example buttons load a pre-filled config.
  document.querySelectorAll('.examples button').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.setValue(JSON.stringify(JSON.parse(btn.dataset.ex), null, 2));
    });
  });

  // Format button.
  byId('format').addEventListener('click', () => editor.format());

  // Submit.
  submit.addEventListener('click', () => onSubmit());

  async function onSubmit() {
    const raw = config.value.trim();
    if (!raw) {
      renderMessage(result, 'bad', 'Empty', 'Please enter a configuration.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Validating…';
    renderBusy(result, 'Analyzing…');
    try {
      const [provider, model] = (modelSelect.value || '').split('|');
      const data = await validate(raw, { provider, model });
      renderResult(result, data);
    } catch (e) {
      renderMessage(result, 'bad', 'Request failed', (e && e.message) || 'Unknown error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Validate';
    }
  }
}
