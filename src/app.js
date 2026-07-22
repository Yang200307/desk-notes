// src/app.js — Application entry point
import { createEditor } from './editor.js';
import { initTheme } from './theme.js';

(async () => {
  // Init theme (listen to system pref — no manual override yet)
  await initTheme();

  const api = await createEditor('#editor-container', '# Hello!\n\n**Bold** text.');
  console.log('Markdown:', api.getMarkdown());
})();
