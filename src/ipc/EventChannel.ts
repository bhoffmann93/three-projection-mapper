import { ProjectionEventType } from './EventTypes';
import { ProjectionEventPayloads } from './EventPayloads';

/**
 * Message envelope for BroadcastChannel communication
 */
interface EventMessage<T extends ProjectionEventType> {
  type: T;
  payload: ProjectionEventPayloads[T];
  timestamp: number;
  source: string;
}

/**
 * Type-safe wrapper around BroadcastChannel for projection mapper IPC
 * Provides Unity/C#-style event API with compile-time type checking
 */
export class EventChannel {
  private channel: BroadcastChannel;
  private handlers: Map<ProjectionEventType, Set<(payload: any) => void>> = new Map();
  private source: string;

  constructor(channelName: string = 'projection-mapper-sync', source: string = 'unknown') {
    this.channel = new BroadcastChannel(channelName);
    this.source = source;
    this.channel.onmessage = this.handleMessage.bind(this);
  }

  /**
   * Emit a type-safe event with payload
   */
  emit<T extends ProjectionEventType>(type: T, payload: ProjectionEventPayloads[T]): void {
    const message: EventMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source: this.source,
    };
    this.channel.postMessage(message);
  }

  /**
   * Register a type-safe event handler
   */
  on<T extends ProjectionEventType>(
    type: T,
    handler: (payload: ProjectionEventPayloads[T]) => void
  ): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /**
   * Unregister an event handler
   */
  off<T extends ProjectionEventType>(
    type: T,
    handler: (payload: ProjectionEventPayloads[T]) => void
  ): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Handle incoming BroadcastChannel messages
   */
  private handleMessage(event: MessageEvent): void {
    const message = event.data as EventMessage<any>;

    // Don't process our own messages
    if (message.source === this.source) {
      return;
    }

    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message.payload));
    }
  }

  /**
   * Close the channel
   */
  close(): void {
    this.channel.close();
    this.handlers.clear();
  }
}
