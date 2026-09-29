export const DJ_COVER_RADIUS: number;
export const DJ_COVER_ROW_STEP: number;
export type DjCoverSlot = { lane: number; row: number; trackIndex: number; active: boolean };
export function djCoverSlots(queueLength: number, index: number, anchorLane: number, anchorRow: number): DjCoverSlot[];
