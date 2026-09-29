/** Fill the naturally raised archive lane with the current playback queue. */
export const DJ_COVER_RADIUS = 24;
export const DJ_COVER_ROW_STEP = 1;

export function djCoverSlots(queueLength, index, anchorLane, anchorRow) {
  if (!Number.isInteger(index) || index < 0 || index >= queueLength) return [];
  const slots = [];
  const count = Math.min(queueLength, DJ_COVER_RADIUS * 2 + 1);
  const firstOffset = -Math.floor((count - 1) / 2);
  for (let offset = firstOffset; offset < firstOffset + count; offset++) {
    const trackIndex = (index + offset + queueLength) % queueLength;
    slots.push({ lane: anchorLane, row: anchorRow + offset * DJ_COVER_ROW_STEP, trackIndex, active: offset === 0 });
  }
  return slots;
}
