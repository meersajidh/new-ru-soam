import { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';

export class PicklistNodeView implements NodeView {
  readonly dom: HTMLElement;
  private dropdown: HTMLElement | null = null;
  private selectedIdx = 0;
  private currentNode: PMNode;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.view = view;
    this.getPos = getPos;
    this.currentNode = node;
    this.dom = document.createElement('span');
    this.dom.className = 'ru-snippet-placeholder ru-snippet-placeholder--picklist';
    this.dom.setAttribute('contenteditable', 'false');
    this.dom.setAttribute('tabindex', '0');
    this.dom.setAttribute('role', 'combobox');
    this.dom.setAttribute('aria-expanded', 'false');
    this.dom.setAttribute('aria-haspopup', 'listbox');
    this.renderLabel(node);
    this.dom.addEventListener('click', (e) => { e.preventDefault(); this.openDropdown(); });
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openDropdown(); }
    });
  }

  private renderLabel(node: PMNode): void {
    const val = node.attrs.value ?? node.attrs.default ?? node.attrs.name;
    this.dom.textContent = String(val);
    this.dom.setAttribute('aria-label', `Picklist: ${String(val)}`);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.currentNode.type) return false;
    this.currentNode = node;
    this.renderLabel(node);
    return true;
  }

  private openDropdown(): void {
    if (this.dropdown) return;

    const options: string[] = Array.isArray(this.currentNode.attrs.options)
      ? (this.currentNode.attrs.options as string[])
      : [];
    if (options.length === 0) return;

    this.selectedIdx = 0;
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'ru-snippet-picklist-dropdown';
    this.dropdown.setAttribute('role', 'listbox');

    for (let i = 0; i < options.length; i++) {
      const item = document.createElement('div');
      item.className = 'ru-snippet-picklist-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.textContent = options[i];
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(i);
      });
      this.dropdown.appendChild(item);
    }

    const rect = this.dom.getBoundingClientRect();
    this.dropdown.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 2}px;
      left: ${rect.left}px;
      z-index: 9999;
    `;

    document.body.appendChild(this.dropdown);
    this.updateHighlight();
    this.dom.setAttribute('aria-expanded', 'true');

    // Capture keyboard on the editor view so Tab/Arrow/Enter/Esc work.
    this.view.dom.addEventListener('keydown', this.handleDropdownKey, true);
    // Close on outside interaction.
    document.addEventListener('mousedown', this.handleOutsideClick, true);
  }

  private handleDropdownKey = (e: KeyboardEvent): void => {
    if (!this.dropdown) return;
    const options: string[] = Array.isArray(this.currentNode.attrs.options)
      ? (this.currentNode.attrs.options as string[])
      : [];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIdx = Math.min(this.selectedIdx + 1, options.length - 1);
        this.updateHighlight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIdx = Math.max(this.selectedIdx - 1, 0);
        this.updateHighlight();
        break;
      case 'Enter':
        e.preventDefault();
        this.select(this.selectedIdx);
        break;
      case 'Tab':
        // Select and let the snippet walk keymap handle Tab advance.
        this.select(this.selectedIdx);
        // Do NOT prevent default — the snippet plugin's handleKeyDown will see Tab next.
        break;
      case 'Escape':
        e.preventDefault();
        this.closeDropdown();
        break;
    }
  };

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.dropdown && !this.dropdown.contains(e.target as Node) && e.target !== this.dom) {
      this.closeDropdown();
    }
  };

  private updateHighlight(): void {
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll('.ru-snippet-picklist-item');
    items.forEach((item, i) => {
      const selected = i === this.selectedIdx;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', String(selected));
      if (selected) (item as HTMLElement).scrollIntoView({ block: 'nearest' });
    });
  }

  private select(idx: number): void {
    const options: string[] = Array.isArray(this.currentNode.attrs.options)
      ? (this.currentNode.attrs.options as string[])
      : [];
    const value = options[idx] ?? '';
    const pos = this.getPos();
    if (pos === undefined) { this.closeDropdown(); return; }

    const { state } = this.view;
    const tr = state.tr.replaceWith(pos, pos + this.currentNode.nodeSize, state.schema.text(value));
    this.view.dispatch(tr);
    this.closeDropdown();
    this.view.focus();
  }

  private closeDropdown(): void {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    this.dom.setAttribute('aria-expanded', 'false');
    this.view.dom.removeEventListener('keydown', this.handleDropdownKey, true);
    document.removeEventListener('mousedown', this.handleOutsideClick, true);
  }

  destroy(): void {
    this.closeDropdown();
  }

  stopEvent(): boolean {
    // Let clicks on the chip reach our listener but stop them from defocusing the editor.
    return false;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

// Builds the nodeViews map for placeholder nodes.
// Text placeholders get a simple label chip; picklist placeholders get PicklistNodeView.
export const placeholderNodeViews: Record<
  string,
  (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView
> = {
  placeholder: (node, view, getPos) => {
    if (node.attrs.type === 'picklist') {
      return new PicklistNodeView(node, view, getPos);
    }
    // Text placeholder: simple non-editable chip; user types to replace (atom: true).
    const dom = document.createElement('span');
    dom.className = 'ru-snippet-placeholder ru-snippet-placeholder--text';
    dom.setAttribute('contenteditable', 'false');
    dom.textContent = String(node.attrs.default ?? node.attrs.name);
    return {
      dom,
      update(newNode) {
        if (newNode.type !== node.type) return false;
        dom.textContent = String(newNode.attrs.default ?? newNode.attrs.name);
        return true;
      },
      ignoreMutation: () => true,
    };
  },
};
