const DEFAULT_PROJECTOR_URL = './projector.html';
const DEFAULT_PROJECTOR_NAME = 'ProjectorOutput';
const CLOSE_POLL_INTERVAL_MS = 500;

/**
 * Manages projector window lifecycle. Supports multiple named projector
 * windows (e.g. one per physical projector for soft-edge blending).
 */
export class WindowManager {
  private projectorWindows = new Map<string, Window>();
  private checkInterval: number | null = null;
  private onCloseCallback?: () => void;

  /**
   * Open a projector window at 1280x800. Re-focuses if a window with the
   * same name is already open.
   */
  openProjectorWindow(url: string = DEFAULT_PROJECTOR_URL, name: string = DEFAULT_PROJECTOR_NAME): void {
    const existing = this.projectorWindows.get(name);
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }

    // Open at 1280x800, centered on screen
    const width = 1280;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const opened = window.open(
      url,
      name,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    if (opened) {
      this.projectorWindows.set(name, opened);
    }

    this.startCloseMonitoring();
  }

  /**
   * Check if any projector window is open
   */
  isProjectorOpen(): boolean {
    return [...this.projectorWindows.values()].some((w) => !w.closed);
  }

  /**
   * Register callback for when the last projector window closes
   */
  onProjectorClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Close all projector windows
   */
  closeProjectorWindow(): void {
    for (const projectorWindow of this.projectorWindows.values()) {
      if (!projectorWindow.closed) projectorWindow.close();
    }
    this.projectorWindows.clear();
    this.stopCloseMonitoring();
  }

  /**
   * Start monitoring for window close events
   */
  private startCloseMonitoring(): void {
    this.stopCloseMonitoring();
    this.checkInterval = window.setInterval(() => {
      for (const [name, projectorWindow] of this.projectorWindows) {
        if (projectorWindow.closed) this.projectorWindows.delete(name);
      }
      if (this.projectorWindows.size === 0) {
        this.handleAllWindowsClosed();
      }
    }, CLOSE_POLL_INTERVAL_MS);
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
   * Handle all projector windows closed
   */
  private handleAllWindowsClosed(): void {
    this.stopCloseMonitoring();
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
