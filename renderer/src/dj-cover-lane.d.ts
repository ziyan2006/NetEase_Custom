export const DJ_COVER_RADIUS: number;
export const DJ_COVER_ROW_STEP: number;
export function djCoverStepDirection(fromIndex: number, toIndex: number, queueLength: number): -1 | 0 | 1;
export type DjCoverSlot = { lane: number; row: number; trackIndex: number; active: boolean };
export function djCoverSlots(queueLength: number, index: number, anchorLane: number, anchorRow: number): DjCoverSlot[];
export function djVisibleCoverSlots(queueLength: number, index: number, anchorLane: number, anchorRow: number, visibleRows: number[]): Array<{ slot: DjCoverSlot; cardIndex: number }>;
export function djCoverLaneState(state: { prototype: boolean; cinematic: boolean; looping: boolean; presence: number; hasCurrentTrack: boolean; exportFocus: boolean; targetDetail: boolean; detail: number; workbench: boolean; archivePinned: boolean; archiveReturning: boolean }): { visible: boolean; workbenchReady: boolean };
