/*
HandleKeyboard
--------------
Arrow-key nudging of the selected warp handle.

Some calibrations need a corner outside the window — a surface that runs off the
edge of the projection, or a keystone correction steep enough to push a corner
past the frame. A pointer cannot put it there: the drag runs out of screen first,
and zooming out to make room is not available when the controller is the output,
because the view is exactly what the projector shows.

So: click a handle to select it, then walk it with the arrow keys, which have no
edge to run into. Tab steps to the next handle without needing to hit it, which
matters most for the handle that is already off screen.

Steps are in screen pixels rather than world units, so a nudge covers the same
visible distance whatever the surface's size or the view's zoom.
*/

import type { WarpSurface } from '../warp/WarpSurface';
import { HANDLE_NUDGE } from './defaults';

export interface HandleKeyboardConfig {
  /** The surface whose handles the keys act on — the active one */
  getSurface: () => WarpSurface | null;
  /** World units per screen pixel, so a step is a constant visible distance */
  getPixelToWorld: () => number;
  /** False on projector windows and whenever the controls are hidden */
  isEnabled: () => boolean;
}

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
} as const satisfies Record<string, readonly [x: number, y: number]>;

type ArrowKey = keyof typeof ARROW_DELTAS;

const isArrowKey = (key: string): key is ArrowKey => key in ARROW_DELTAS;

export class HandleKeyboard {
  private config: HandleKeyboardConfig;
  private enabled = true;
  private uncommittedNudge = false;

  private onKeyDown: (event: KeyboardEvent) => void;
  private onKeyUp: (event: KeyboardEvent) => void;
  private onBlur: () => void;

  constructor(config: HandleKeyboardConfig) {
    this.config = config;

    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onKeyUp = (event) => this.handleKeyUp(event);
    this.onBlur = () => this.commit();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.commit();
  }

  /**
   * Tweakpane's numeric and text fields are real inputs, and Tab and the arrow
   * keys belong to them while one has focus — stepping a slider must not also
   * walk a corner across the screen.
   */
  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || typeof element.tagName !== 'string') return false;
    if (element.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled || !this.config.isEnabled()) return;
    if (this.isTypingTarget(event.target)) return;
    // Leave the browser's own shortcuts alone
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const surface = this.config.getSurface();
    if (!surface) return;
    const warper = surface.getWarper();

    if (event.key === 'Tab') {
      // Only swallow the focus change if a handle actually took the selection
      if (warper.selectNextHandle(event.shiftKey ? -1 : 1)) event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      if (warper.getSelectedHandle()) {
        this.commit();
        warper.clearSelectedHandle();
      }
      return;
    }

    if (!isArrowKey(event.key)) return;
    if (!warper.getSelectedHandle()) return; // arrows stay free until a warp point is armed

    const [directionX, directionY] = ARROW_DELTAS[event.key];
    const pixels = event.shiftKey ? HANDLE_NUDGE.coarseStepPixels : HANDLE_NUDGE.stepPixels;
    const step = pixels * this.config.getPixelToWorld();

    if (surface.nudgeSelectedHandle(directionX * step, directionY * step)) {
      this.uncommittedNudge = true;
    }
    // Swallowed either way: the arrows belong to the handle while one is armed,
    // and a nudge refused for folding the quad should not scroll the page.
    event.preventDefault();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (isArrowKey(event.key)) this.commit();
  }

  /**
   * Writing once per burst rather than per keypress, as a drag writes once at its
   * end. Projector windows are not waiting on this — each nudge reports itself as
   * a transform, so they follow live; only the stored calibration waits.
   */
  private commit(): void {
    if (!this.uncommittedNudge) return;
    this.uncommittedNudge = false;
    this.config.getSurface()?.getWarper().commitHandlePositions();
  }

  dispose(): void {
    this.commit();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

export default HandleKeyboard;
