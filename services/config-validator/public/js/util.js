/** HTML-escape a value for safe innerHTML insertion. */
export const escapeHtml = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Shorthand for document.getElementById. */
export const byId = (id) => document.getElementById(id);
