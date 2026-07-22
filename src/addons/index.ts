/**
 * Addons for three-projection-mapper
 *
 * Import with: import { WindowSync, WINDOW_SYNC_MODE } from 'three-projection-mapper/addons';
 */

export { WindowSync, WINDOW_SYNC_MODE, type WindowSyncConfig } from './WindowSync';
export { UvRectEditor, type UvRectEditorConfig } from './UvRectEditor';

// Host apps need these to broadcast their own state changes through WindowSync
export { ProjectionEventType } from '../ipc/EventTypes';
export type { ProjectionEventPayloads } from '../ipc/EventPayloads';
