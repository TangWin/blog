import type { Plugin } from 'unified';
import type { Root, Code } from 'mdast';
import { visit } from 'unist-util-visit';

export const remarkMermaid: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'code', (node: Code) => {
      if (node.lang === 'mermaid') {
        (node as any).type = 'html';
        (node as any).value = `<div class="mermaid">\n${node.value}\n</div>`;
        delete (node as any).lang;
        delete (node as any).meta;
      }
    });
  };
};
