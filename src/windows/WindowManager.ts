/**
 * Manages projector window lifecycle
 */
export class WindowManager {
  private projectorWindow: Window | null = null;
  private checkInterval: number | null = null;
  private onCloseCallback?: () => void;

  /**
   * Open the projector window at 1280x800
   */
  openProjectorWindow(): void {
    if (this.projectorWindow && !this.projectorWindow.closed) {
      this.projectorWindow.focus();
      return;
    }

    // Open at 1280x800, centered on screen
    const width = 1280;
    const height = 800;
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
