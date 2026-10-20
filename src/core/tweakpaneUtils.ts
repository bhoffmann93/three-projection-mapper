import type { BindingApi, FolderApi, TabApi } from '@tweakpane/core';
import { PANE_THEME } from './defaults';

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
    background: ${background ?? `var(--btn-bg, ${PANE_THEME.buttonBackground})`};
    border: none;
    border-radius: var(--bld-br, 2px);
    box-sizing: border-box;
    color: var(--btn-fg, ${PANE_THEME.buttonForeground});
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

export function appendButtonToListBinding(
  binding: BindingApi,
  button: HTMLButtonElement,
  gapPx: number,
  dropdownWidthPx?: number,
): void {
  const label = binding.element.querySelector('.tp-lblv_l') as HTMLElement | null;
  if (label) label.style.display = 'none';
  const container = binding.element.querySelector('.tp-lblv_v') as HTMLElement;
  container.style.flex = '1';
  container.style.width = 'auto';
  container.style.display = 'flex';
  container.style.gap = `${gapPx}px`;
  const select = container.querySelector('select') as HTMLElement | null;
  if (select != null) {
    if (dropdownWidthPx != null) {
      select.style.width = `${dropdownWidthPx}px`;
      select.style.flexShrink = '0';
    } else {
      select.style.flex = '1';
    }
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
  requestAnimationFrame(() => {
    content.style.transition = '';
  });

  const title = folder.element.querySelector('.tp-fldv_t') as HTMLElement | null;
  if (title) title.style.opacity = enabled ? '' : disabledOpacity;
}

interface ButtonGridContainer {
  addBlade(params: Record<string, unknown>): unknown;
}

/**
 * Tweakpane's buttongrid blade is untyped in the public API, so its shape is
 * declared here rather than re-asserted at every call site.
 */
export interface ButtonGridBladeApi {
  element: HTMLElement;
  on(event: 'click', callback: (ev: { index: [number, number] }) => void): void;
}

export interface ButtonGridHandle {
  blade: ButtonGridBladeApi;
  buttons: HTMLButtonElement[];
}

/** Add a row of buttons and hand back the elements, which callers need to style */
export function addButtonGrid(container: ButtonGridContainer, titles: readonly string[]): ButtonGridHandle {
  const blade = container.addBlade({
    view: 'buttongrid',
    size: [titles.length, 1],
    cells: (x: number) => ({ title: titles[x] }),
  }) as unknown as ButtonGridBladeApi;

  return {
    blade,
    buttons: Array.from(blade.element.querySelectorAll('button')) as HTMLButtonElement[],
  };
}

/** The single `<button>` inside a button blade */
export function buttonElement(button: { element: HTMLElement }): HTMLButtonElement {
  return button.element.querySelector('button') as HTMLButtonElement;
}



const injectedStyleClasses = new Set<string>();

const injectStyleOnce = (styleClass: string, rules: readonly string[]): void => {
  if (injectedStyleClasses.has(styleClass)) return;
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  injectedStyleClasses.add(styleClass);
};

const TAB_FLAT_CLASS = 'wm-tab-flat';

export const removeTabIndent = (tab: TabApi): void => {
  injectStyleOnce(TAB_FLAT_CLASS, [
    `.${TAB_FLAT_CLASS} .tp-tbpv_c { padding-left: 0; }`,
    `.${TAB_FLAT_CLASS} .tp-tbpv_c > .tp-cntv { margin-left: 0; }`,
    `.${TAB_FLAT_CLASS} .tp-tabv_i { display: none; }`,
  ]);
  tab.element.classList.add(TAB_FLAT_CLASS);
};

const TWEAKPANE_THEME_VARIABLE_PREFIX = '--tp-';

/** Sets Tweakpane's theming variables on a pane's root, each keyed by its name after the --tp- prefix. */
export const applyPaneTheme = (pane: { readonly element: HTMLElement }, theme: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(theme)) {
    pane.element.style.setProperty(`${TWEAKPANE_THEME_VARIABLE_PREFIX}${name}`, value);
  }
};

export interface PanePosition {
  readonly x: number;
  readonly y: number;
}

// How far the pointer travels on a title before a press becomes a drag rather than a fold
const PANE_DRAG_THRESHOLD_PX = 3;
const PANE_TITLE_SELECTOR = '.tp-rotv_b';

// Only the title has to stay on screen, a tall pane may hang below the window and still be caught
const clampToViewport = (position: PanePosition, container: HTMLElement, title: HTMLElement): PanePosition => ({
  x: Math.min(Math.max(0, position.x), Math.max(0, window.innerWidth - container.offsetWidth)),
  y: Math.min(Math.max(0, position.y), Math.max(0, window.innerHeight - title.offsetHeight)),
});

// Caps the pane at the window below where it sits, so a scrolling pane keeps its last rows reachable
const fitPaneBelow = (paneElement: HTMLElement, container: HTMLElement): void => {
  paneElement.style.maxHeight = `${window.innerHeight - container.offsetTop}px`;
};

const placeAt = (paneElement: HTMLElement, container: HTMLElement, position: PanePosition): void => {
  container.style.left = `${position.x}px`;
  container.style.top = `${position.y}px`;
  fitPaneBelow(paneElement, container);
};

// The side a pane was left nearest to and its gap to it, so a resize keeps it there instead of pushing it off screen
interface PaneSideGap {
  readonly fromRight: boolean;
  readonly gapX: number;
}

const gapToNearestSide = (container: HTMLElement): PaneSideGap => {
  const left = container.offsetLeft;
  const right = window.innerWidth - left - container.offsetWidth;
  const fromRight = right < left;
  return { fromRight, gapX: Math.max(0, fromRight ? right : left) };
};

const positionFromSideGap = (sideGap: PaneSideGap, container: HTMLElement): PanePosition => ({
  x: sideGap.fromRight ? window.innerWidth - container.offsetWidth - sideGap.gapX : sideGap.gapX,
  y: container.offsetTop,
});

/**
 * Tweakpane mounts every pane in one top right wrapper unless it is handed a container, so a pane
 * that sits and moves on its own needs this one.
 */
export const createFloatingPaneContainer = (widthPx: number, zIndex: number): HTMLElement => {
  const container = document.createElement('div');
  container.style.cssText = `position: fixed; width: ${widthPx}px; z-index: ${zIndex};`;
  document.body.appendChild(container);
  return container;
};

/**
 * Moves the pane's container by dragging its title bar. A press that never travels past the
 * threshold is left alone, so the title still folds the pane on a plain click. The pane is capped
 * at the window below where it sits. Returns a function that removes the window listener.
 */
export const makePaneDraggable = (
  pane: { readonly element: HTMLElement },
  container: HTMLElement,
  position: PanePosition,
  onMoved: (position: PanePosition) => void,
): (() => void) => {
  const title = pane.element.querySelector<HTMLElement>(PANE_TITLE_SELECTOR);
  if (!title) throw new Error('Tweakpane pane has no title bar element, its DOM structure changed');

  placeAt(pane.element, container, clampToViewport(position, container, title));
  title.style.cursor = 'grab';
  let sideGap = gapToNearestSide(container);

  const onResize = (): void => {
    placeAt(pane.element, container, clampToViewport(positionFromSideGap(sideGap, container), container, title));
  };
  window.addEventListener('resize', onResize);

  let drag: { startX: number; startY: number; origin: PanePosition; moved: boolean } | null = null;
  let swallowNextClick = false;

  title.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // Capturing the pointer would retarget the click of a button placed in the title to the title
    if (event.target instanceof Element && event.target.closest('button') !== title) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: container.offsetLeft, y: container.offsetTop },
      moved: false,
    };
    title.setPointerCapture(event.pointerId);
  });

  title.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < PANE_DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    placeAt(
      pane.element,
      container,
      clampToViewport({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }, container, title),
    );
  });

  title.addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    swallowNextClick = true;
    sideGap = gapToNearestSide(container);
    onMoved({ x: container.offsetLeft, y: container.offsetTop });
  });

  // Capture on the container runs before the title's own click handler, which is what folds the pane
  container.addEventListener(
    'click',
    (event) => {
      if (!swallowNextClick) return;
      swallowNextClick = false;
      event.stopPropagation();
    },
    true,
  );

  return () => window.removeEventListener('resize', onResize);
};

const PANE_SCROLL_CLASS = 'pm-pane-scroll';
// Above the pane's own rows, which the held title scrolls over
const PANE_STICKY_TITLE_Z_INDEX = 1;

/** Scrolls a pane taller than its space vertically only, with no scrollbar shown and its title held in view. */
export const makePaneScrollable = (pane: { readonly element: HTMLElement }): void => {
  injectStyleOnce(PANE_SCROLL_CLASS, [
    `.${PANE_SCROLL_CLASS} { overflow-x: hidden; overflow-y: auto; scrollbar-width: none; }`,
    `.${PANE_SCROLL_CLASS}::-webkit-scrollbar { display: none; }`,
    `.${PANE_SCROLL_CLASS} > ${PANE_TITLE_SELECTOR} { position: sticky; top: 0; z-index: ${PANE_STICKY_TITLE_Z_INDEX}; }`,
  ]);
  pane.element.classList.add(PANE_SCROLL_CLASS);
};
