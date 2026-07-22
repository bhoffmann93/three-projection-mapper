/*
A callback slot several consumers can share.

The mapper's notifications were plain assignable properties, so each had exactly
one owner: ProjectionMapperGUI claimed three of them, and a host app that
subscribed alongside it would silently replace the GUI's handler rather than run
next to it. Nothing errored, the pane just stopped updating.
*/

export type Listener<Args extends unknown[]> = (...args: Args) => void;

export class ListenerSet<Args extends unknown[]> {
  private listeners = new Set<Listener<Args>>();

  /** Returns a function that removes this listener again */
  add(listener: Listener<Args>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(...args: Args): void {
    // Copied so a listener that subscribes or unsubscribes mid-emit cannot
    // disturb the iteration
    for (const listener of [...this.listeners]) listener(...args);
  }

  clear(): void {
    this.listeners.clear();
  }
}
