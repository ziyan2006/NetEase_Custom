const clampPercent = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
const validCount = value => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));

export function createPlaylistExportState(playlist, phase = "confirm") {
  return {
    playlistId: String(playlist.id),
    name: String(playlist.name || "未命名歌单"),
    coverUrl: playlist.coverUrl || null,
    total: validCount(playlist.trackCount),
    completed: 0,
    success: 0,
    failed: 0,
    overallPercent: 0,
    phase,
    stage: phase === "confirm" ? "等待确认" : "正在连接导出服务…",
    currentTrack: "",
    message: "",
    finishedTrackKeys: [],
  };
}

export function reducePlaylistExportEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  const next = { ...state, finishedTrackKeys: [...(state.finishedTrackKeys ?? [])] };
  const overall = event.overall;
  if (Number.isFinite(Number(overall))) {
    next.overallPercent = Math.max(next.overallPercent, Math.min(99, clampPercent(overall)));
  }

  if (Number.isFinite(Number(event.total))) next.total = validCount(event.total);
  if (Number.isFinite(Number(event.completed))) next.completed = Math.max(next.completed, validCount(event.completed));

  if (event.type === "start") {
    next.phase = "running";
    next.stage = "正在准备歌曲列表";
    next.message = "";
  } else if (event.type === "urls") {
    next.phase = "running";
    next.stage = "正在获取音源";
  } else if (event.type === "track") {
    next.phase = "running";
    next.stage = "正在下载与处理";
    next.currentTrack = [event.artist, event.title].filter(Boolean).join(" — ");
  } else if (event.type === "progress") {
    next.phase = "running";
    next.stage = event.phase === "processing" ? "正在转换音频" : "正在下载音频";
    next.currentTrack = [event.artist, event.title].filter(Boolean).join(" — ") || next.currentTrack;
  } else if (event.type === "track-done" || event.type === "track-fail") {
    const key = event.index === undefined
      ? `${event.type}:${next.finishedTrackKeys.length}`
      : String(event.index);
    if (!next.finishedTrackKeys.includes(key)) {
      next.finishedTrackKeys.push(key);
      if (event.type === "track-done") next.success++;
      else next.failed++;
    }
    next.stage = event.type === "track-done" ? "歌曲已导出" : "歌曲导出失败";
    next.currentTrack = [event.artist, event.title].filter(Boolean).join(" — ") || next.currentTrack;
  } else if (event.type === "done") {
    next.phase = "done";
    next.stage = "导出结束";
    next.overallPercent = 100;
    if (Number.isFinite(Number(event.total))) next.total = validCount(event.total);
    if (Number.isFinite(Number(event.successCount))) next.success = validCount(event.successCount);
    if (Number.isFinite(Number(event.failedCount))) next.failed = validCount(event.failedCount);
    next.completed = Number.isFinite(Number(event.completed))
      ? validCount(event.completed)
      : Math.min(next.total || next.success + next.failed, next.success + next.failed);
    next.message = next.failed > 0
      ? `部分完成：成功 ${next.success} 首，失败 ${next.failed} 首。`
      : `已完成：成功导出 ${next.success} 首。`;
  } else if (event.type === "error") {
    next.phase = "error";
    next.stage = "导出失败 / 结果未完整确认";
    next.message = String(event.message || "导出服务返回错误。");
  }

  if (next.phase !== "done") next.overallPercent = Math.min(99, next.overallPercent);
  return next;
}

export function failPlaylistExport(state, error) {
  return {
    ...state,
    phase: "error",
    stage: "连接中断 / 结果未完整确认",
    message: error instanceof Error ? error.message : String(error || "导出流意外结束。"),
    overallPercent: Math.min(99, state.overallPercent),
  };
}

export function toSceneExportProgress(state) {
  return {
    playlistId: state.playlistId,
    name: state.name,
    coverUrl: state.coverUrl,
    total: state.total,
    completed: state.completed,
    success: state.success,
    failed: state.failed,
    overallPercent: state.overallPercent,
    phase: state.phase,
    stage: state.stage,
    currentTrack: state.currentTrack,
    message: state.message,
  };
}
