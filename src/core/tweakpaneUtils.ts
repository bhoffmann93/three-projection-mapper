import type { BindingApi, FolderApi } from '@tweakpane/core';

export interface TweakpaneButtonOptions {
  background?: string;
  width?: number;
  height?: number;
  fontSize?: string;
}

export function createTweakpaneButton(
  label: string,
  onClick: () => void,
  { background, width, height = 20, fontSize = '9px' }: TweakpaneButtonOptions = {},
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `
    background: ${background ?? 'var(--btn-bg, hsl(230, 7%, 30%))'};
    border: none;
    border-radius: var(--bld-br, 2px);
    box-sizing: border-box;
    color: var(--btn-fg, hsl(230, 7%, 17%));
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: inherit;
    font-size: ${fontSize};
    font-weight: bold;
    height: ${height}px;
    line-height: ${height}px;
    padding: ${width != null ? '0' : '0 4px'};
    ${width != null ? `width: ${width}px;` : ''}
  `;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function replaceLabelWithButton(binding: BindingApi, button: HTMLButtonElement): void {
  const label = binding.element.querySelector('.tp-lblv_l') as HTMLElement | null;
  if (!label) return;
  label.style.cssText += '; display: flex; align-items: center; padding: 0; margin: 0;';
  label.textContent = '';
  label.appendChild(button);
}

export function appendButtonToListBinding(binding: BindingApi, button: HTMLButtonElement, gapPx: number, dropdownWidthPx?: number): void {
  const label = binding.element.querySelector('.tp-lblv_l') as HTMLElement | null;
  if (label) label.style.display = 'none';
  const container = binding.element.querySelector('.tp-lblv_v') as HTMLElement;
  container.style.flex = '1';
  container.style.width = 'auto';
  container.style.display = 'flex';
  container.style.gap = `${gapPx}px`;
  const select = container.querySelector('select') as HTMLElement;
  if (dropdownWidthPx != null) {
    select.style.width = `${dropdownWidthPx}px`;
    select.style.flexShrink = '0';
  } else {
    select.style.flex = '1';
  }
  container.appendChild(button);
}

export interface FolderHeaderRefs {
  trailingContainer: HTMLElement | null;
}

export function setupFolderHeader(
  folder: FolderApi,
  { leading, trailing, gapPx = 4 }: { leading?: HTMLElement[]; trailing?: HTMLElement[]; gapPx?: number },
): FolderHeaderRefs {
  const header = folder.element.querySelector('.tp-fldv_b') as HTMLElement;
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.overflow = 'visible';
  if (leading) {
    for (const el of leading) header.prepend(el);
  }
  let trailingContainer: HTMLElement | null = null;
  if (trailing) {
    trailingContainer = document.createElement('span');
    trailingContainer.style.cssText = `margin-left: auto; display: flex; align-items: center; gap: ${gapPx}px; padding-right: ${gapPx}px;`;
    trailingContainer.append(...trailing);
    header.append(trailingContainer);
  }
  return { trailingContainer };
}

export function setFolderEnabled(folder: FolderApi, enabled: boolean, disabledOpacity: string): void {
  const content = folder.element.querySelector('.tp-fldv_c') as HTMLElement;
  content.style.transition = 'none';
  content.style.opacity = enabled ? '' : disabledOpacity;
  content.style.pointerEvents = enabled ? '' : 'none';
  requestAnimationFrame(() => { content.style.transition = ''; });

  const title = folder.element.querySelector('.tp-fldv_t') as HTMLElement | null;
  if (title) title.style.opacity = enabled ? '' : disabledOpacity;
}
