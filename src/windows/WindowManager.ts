/**
 * Manages projector window lifecycle
 */
/** Fallback only — the projector should be opened at the output's own aspect */
const FALLBACK_PROJECTOR_SIZE = { width: 1280, height: 800 };

export class WindowManager {
  private projectorWindow: Window | null = null;
  private sizeSource: () => { width: number; height: number } = () => FALLBACK_PROJECTOR_SIZE;
  private checkInterval: number | null = null;
  private onCloseCallback?: () => void;

  /**
   * Where the projector window's size comes from. WindowSync points this at the
   * mapper's output resolution, so a 9:16 output opens a 9:16 window instead of
   * the landscape default it used to hardcode. Read on open rather than stored,
   * so a resolution changed at runtime is picked up.
   */
  setSizeSource(sizeSource: () => { width: number; height: number }): void {
    this.sizeSource = sizeSource;
  }

  /** Open the projector at the output's aspect, centered and fitted to the screen */
  openProjectorWindow(size = this.sizeSource()): void {
    if (this.projectorWindow && !this.projectorWindow.closed) {
      this.projectorWindow.focus();
      return;
    }

    // Never larger than the screen, keeping the output's aspect
    const fit = Math.min(1, window.screen.width / size.width, window.screen.height / size.height);
    const width = Math.round(size.width * fit);
    const height = Math.round(size.height * fit);
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    this.projectorWindow = window.open(
      './projector.html',
      'ProjectorOutput',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );

    // Monitor for window close
    this.startCloseMonitoring();
  }

  /**
   * Check if projector window is open
   */
  isProjectorOpen(): boolean {
    return this.projectorWindow !== null && !this.projectorWindow.closed;
  }

  /**
   * Register callback for when projector window closes
   */
  onProjectorClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Close the projector window
   */
  closeProjectorWindow(): void {
    if (this.projectorWindow && !this.projectorWindow.closed) {
      this.projectorWindow.close();
    }
    this.stopCloseMonitoring();
  }

  /**
   * Start monitoring for window close events
   */
  private startCloseMonitoring(): void {
    this.stopCloseMonitoring();
    this.checkInterval = window.setInterval(() => {
      if (this.projectorWindow && this.projectorWindow.closed) {
        this.handleWindowClosed();
      }
    }, 500);
  }

  /**
   * Stop monitoring for window close events
   */
  private stopCloseMonitoring(): void {
    if (this.checkInterval !== null) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Handle projector window closed event
   */
  private handleWindowClosed(): void {
    this.stopCloseMonitoring();
    this.projectorWindow = null;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.closeProjectorWindow();
  }
}
