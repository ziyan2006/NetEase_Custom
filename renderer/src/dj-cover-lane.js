/** Fill the naturally raised archive lane with the current playback queue. */
export const DJ_COVER_RADIUS = 24;
export const DJ_COVER_ROW_STEP = 1;

/** Return the one-slot playback direction, including queue wraparound. */
export function djCoverStepDirection(fromIndex, toIndex, queueLength) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || !Number.isInteger(queueLength) || queueLength < 2) return 0;
  const forward = ((toIndex - fromIndex) % queueLength + queueLength) % queueLength;
  const backward = ((fromIndex - toIndex) % queueLength + queueLength) % queueLength;
  if (forward === 1) return 1;
  if (backward === 1) return -1;
  return 0;
}

export function djCoverSlots(queueLength, index, anchorLane, anchorRow) {
  if (!Number.isInteger(index) || index < 0 || index >= queueLength) return [];
  const slots = [];
  const count = DJ_COVER_RADIUS * 2 + 1;
  const firstOffset = -Math.floor((count - 1) / 2);
  for (let offset = firstOffset; offset < firstOffset + count; offset++) {
    const trackIndex = ((index + offset) % queueLength + queueLength) % queueLength;
    slots.push({ lane: anchorLane, row: anchorRow + offset * DJ_COVER_ROW_STEP, trackIndex, active: offset === 0 });
  }
  return slots;
}

/** Keep the logical slot/card mapping intact while culling off-screen covers. */
export function djVisibleCoverSlots(queueLength, index, anchorLane, anchorRow, visibleRows) {
  const visible = new Set(visibleRows);
  return djCoverSlots(queueLength, index, anchorLane, anchorRow)
    .flatMap((slot, cardIndex) => visible.has(slot.row) || slot.active ? [{ slot, cardIndex }] : []);
}

/** Keep the queue lane mounted through archive detail focus and return. */
export function djCoverLaneState({ prototype, cinematic, looping, presence, hasCurrentTrack, exportFocus,
  targetDetail, detail, workbench, archivePinned, archiveReturning }) {
  const available = prototype && !cinematic && looping && presence > .05 && hasCurrentTrack && !exportFocus;
  const workbenchReady = available && !targetDetail && detail < .1 && workbench;
  const archiveDetailVisible = targetDetail || detail >= .1 || archivePinned;
  return {
    visible: available && (workbenchReady || archiveDetailVisible || archiveReturning),
    workbenchReady,
  };
}
