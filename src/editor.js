// src/editor.js
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

let crepe = null;

export async function createEditor(container, content, { onChange } = {}) {
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
    featureConfigs: {
      [CrepeFeature.CodeMirror]: {
        // LaTeX code blocks have a rendered preview. Keep reading mode clean;
        // Crepe's built-in toggle still exposes the source for editing.
        previewOnlyByDefault: true,
      },
    },
  });

  let suppressChange = false;
  let readyForChanges = false;
  crepe.on((listener) => {
    listener.markdownUpdated((_ctx, markdown, previousMarkdown) => {
      if (readyForChanges && !suppressChange && markdown !== previousMarkdown) onChange?.(markdown, previousMarkdown);
    });
  });

  await crepe.create();
  setTimeout(() => { readyForChanges = true; }, 100);

  // Disable browser spellcheck (red wavy underlines)
  const pm = el.querySelector('.ProseMirror');
  if (pm) pm.setAttribute('spellcheck', 'false');

  return {
    // Uses Crepe's built-in getMarkdown() which properly serializes
    // ProseMirror document to markdown source via the markdown serializer.
    getMarkdown: () => {
      if (!crepe) return '';
      return crepe.getMarkdown();
    },

    // Replace the document through Milkdown's Markdown parser.
    setMarkdown: (md) => {
      if (!crepe) return;
      try {
        suppressChange = true;
        crepe.editor.action(replaceAll(md || '', true));
      } catch (err) {
        console.error('setMarkdown failed:', err);
        throw err;
      } finally {
        suppressChange = false;
      }
    },

    // Extract all headings from the document for outline navigation
    getHeadings: () => {
      if (!crepe) return [];
      const headings = [];
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get('editorView');
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
              headings.push({
                level: node.attrs.level,
                text: node.textContent.trim() || `(H${node.attrs.level})`,
                pos,
              });
            }
            return true; // continue traversing children
          });
        });
      } catch (err) {
        console.error('getHeadings failed:', err);
      }
      return headings;
    },

    // Scroll the editor to a specific document position (used for heading navigation)
    scrollToHeading: (pos) => {
      if (!crepe) return;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get('editorView');
          const node = view.nodeDOM(pos);
          const el = node instanceof HTMLElement
            ? node
            : view.domAtPos(pos).node.parentElement;
          if (el) {
            const container = document.getElementById('editor-container');
            if (container) {
              const containerRect = container.getBoundingClientRect();
              const elRect = el.getBoundingClientRect();
              container.scrollTo({
                top: container.scrollTop + elRect.top - containerRect.top - 60,
                behavior: 'smooth',
              });
            }
          }
        });
      } catch (err) {
        console.error('scrollToHeading failed:', err);
      }
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
