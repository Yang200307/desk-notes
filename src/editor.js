// src/editor.js
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

let crepe = null;

export async function createEditor(container, content) {
  // Destroy previous instance
  if (crepe) {
    await crepe.destroy();
    crepe = null;
  }

  // Clean container
  const el = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  if (!el) throw new Error('Editor container not found');
  el.innerHTML = '';

  crepe = new Crepe({
    root: el,
    defaultValue: content || '# Start typing...',
  });

  await crepe.create();

  return {
    // Uses Crepe's built-in getMarkdown() which properly serializes
    // ProseMirror document to markdown source via the markdown serializer.
    getMarkdown: () => {
      if (!crepe) return '';
      return crepe.getMarkdown();
    },

    // Replace the entire document content via a ProseMirror transaction.
    // Milkdown auto-parses the inserted text into its internal node tree.
    setMarkdown: (md) => {
      if (!crepe) return;
      crepe.editor.action((ctx) => {
        const view = ctx.get('editorView');
        const { state } = view;
        const tr = state.tr.replaceWith(
          0,
          state.doc.content.size,
          state.schema.text(md || ''),
        );
        view.dispatch(tr);
      });
    },

    destroy: async () => {
      if (crepe) {
        await crepe.destroy();
        crepe = null;
      }
    },

    getEditor: () => crepe,
  };
}
