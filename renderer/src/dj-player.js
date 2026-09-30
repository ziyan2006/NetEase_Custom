function messageForPlaybackError(error) {
  if (error?.name === "NotAllowedError") return "浏览器阻止了自动播放，请按播放按钮重试。";
  if (error?.message) return error.message;
  return "音频无法播放，请检查曲目权限或网络后重试。";
}

const DJ_PLAYBACK_HISTORY_LIMIT = 49;

/** One HTMLAudioElement and one queue shared by all DJ playback entry points. */
export class DjPlayer {
  constructor({ resolveAudioUrl, onChange = () => {}, onPlayRequested = () => {}, audio = new Audio() }) {
    this.audio = audio;
    this.resolveAudioUrl = resolveAudioUrl;
    this.onChange = onChange;
    this.onPlayRequested = onPlayRequested;
    this.requestId = 0;
    this.restorePosition = 0;
    this.playbackMode = "loop";
    this.shuffleHistory = [];
    this.shufflePosition = -1;
    this.shuffleBag = [];
    this.stepDirection = 0;
    this.queueRevision = 0;
    this.state = { queue: [], index: -1, status: "idle", currentTime: 0, duration: 0, error: "" };
    this.audio.preload = "metadata";
    this.audio.addEventListener("loadedmetadata", () => this.syncTime());
    this.audio.addEventListener("durationchange", () => this.syncTime());
    this.audio.addEventListener("timeupdate", () => this.syncTime());
    this.audio.addEventListener("play", () => this.setState({ status: "playing", error: "" }));
    this.audio.addEventListener("pause", () => {
      if (this.state.status === "playing") this.setState({ status: "paused" });
    });
    this.audio.addEventListener("ended", () => { void this.next(); });
    this.audio.addEventListener("error", () => {
      if (this.state.status !== "loading" && this.state.status !== "playing") return;
      const error = this.audio.error;
      this.setState({ status: "error", error: error?.message || "音频加载失败，播放链接可能已过期。" });
    });
  }

  getState() {
    const playbackIndices = this.playbackMode === "shuffle"
      ? [...this.shuffleHistory, ...this.shuffleBag]
      : this.state.queue.map((_, index) => index);
    const playbackQueue = playbackIndices.map(index => this.state.queue[index]).filter(Boolean);
    return {
      ...this.state,
      queue: [...this.state.queue],
      playbackMode: this.playbackMode,
      playbackQueue,
      playbackIndex: this.playbackMode === "shuffle" ? this.shufflePosition : this.state.index,
      queueRevision: this.queueRevision,
      stepDirection: this.stepDirection,
      track: this.state.queue[this.state.index] ?? null,
    };
  }

  shuffleIndices(exceptIndex, queue = this.state.queue) {
    const indices = queue.map((_, index) => index).filter(index => index !== exceptIndex);
    for (let index = indices.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [indices[index], indices[target]] = [indices[target], indices[index]];
    }
    return indices;
  }

  startShuffle(index, queue = this.state.queue) {
    this.shuffleHistory = queue.length ? [index] : [];
    this.shufflePosition = this.shuffleHistory.length ? 0 : -1;
    this.shuffleBag = queue.length > 1 ? this.shuffleIndices(index, queue) : [];
  }

  setPlaybackMode(mode) {
    const nextMode = mode === "shuffle" ? "shuffle" : "loop";
    if (nextMode === this.playbackMode) return;
    this.stepDirection = 0;
    this.playbackMode = nextMode;
    if (nextMode === "shuffle") this.startShuffle(this.state.index);
    else {
      this.shuffleHistory = [];
      this.shufflePosition = -1;
      this.shuffleBag = [];
    }
    this.setState({});
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.getState());
  }

  syncTime() {
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    const currentTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    this.setState({ duration, currentTime });
  }

  async setQueue(queue, index = 0, autoplay = true) {
    const valid = Array.isArray(queue) ? queue.filter(track => track && String(track.id)) : [];
    if (!valid.length) return this.clear();
    this.queueRevision++;
    const selectedIndex = Math.max(0, Math.min(valid.length - 1, Number(index) || 0));
    this.stepDirection = 0;
    this.restorePosition = 0;
    if (this.playbackMode === "shuffle") this.startShuffle(selectedIndex, valid);
    this.setState({ queue: valid, index: selectedIndex, status: autoplay ? "loading" : "paused", currentTime: 0, duration: 0, error: "" });
    if (!autoplay) {
      this.requestId++;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      return;
    }
    await this.playIndex(selectedIndex, true);
  }

  restoreQueue(queue, index = 0, currentTime = 0, duration = 0) {
    const valid = Array.isArray(queue) ? queue.filter(track => track && String(track.id)) : [];
    if (!valid.length) return this.clear();
    this.queueRevision++;
    const selectedIndex = Math.max(0, Math.min(valid.length - 1, Number(index) || 0));
    this.stepDirection = 0;
    if (this.playbackMode === "shuffle") this.startShuffle(selectedIndex, valid);
    const restoredTime = Math.max(0, Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0);
    this.requestId++;
    this.restorePosition = restoredTime;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.setState({
      queue: valid,
      index: selectedIndex,
      status: "paused",
      currentTime: restoredTime,
      duration: Math.max(0, Number.isFinite(Number(duration)) ? Number(duration) : 0),
      error: "",
    });
  }

  async waitForMetadata(requestId) {
    if (Number(this.audio.readyState) >= 1) return;
    await new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.audio.removeEventListener("loadedmetadata", loaded);
        this.audio.removeEventListener("error", failed);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(this.audio.error?.message || "音频元数据读取失败。")); };
      this.audio.addEventListener("loadedmetadata", loaded, { once: true });
      this.audio.addEventListener("error", failed, { once: true });
      timer = setTimeout(() => { cleanup(); reject(new Error("等待音频时长超时，无法恢复上次播放位置。")); }, 15000);
      if (Number(this.audio.readyState) >= 1) loaded();
    });
    if (requestId !== this.requestId) throw new Error("播放队列已更改。");
  }

  async playIndex(index, force = false) {
    if (!this.state.queue.length) return;
    const nextIndex = (index + this.state.queue.length) % this.state.queue.length;
    const track = this.state.queue[nextIndex];
    if (!force && nextIndex === this.state.index && this.state.status === "playing") return;
    this.onPlayRequested();
    const resumePosition = nextIndex === this.state.index ? this.restorePosition : 0;
    this.restorePosition = 0;
    const requestId = ++this.requestId;
    this.setState({ index: nextIndex, status: "loading", currentTime: 0, duration: 0, error: "" });
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    try {
      const url = await this.resolveAudioUrl(track.id);
      if (requestId !== this.requestId) return;
      if (!url) throw new Error("此曲目暂无可播放音源，可能受版权或会员权限限制。");
      this.audio.src = url;
      this.audio.load();
      if (resumePosition > 0) {
        await this.waitForMetadata(requestId);
        if (requestId !== this.requestId) return;
        const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : resumePosition;
        this.audio.currentTime = Math.min(resumePosition, Math.max(0, duration));
        this.syncTime();
      }
      await this.audio.play();
      if (requestId === this.requestId) this.setState({ status: "playing", error: "" });
    } catch (error) {
      if (requestId !== this.requestId) return;
      this.setState({ status: "error", error: messageForPlaybackError(error) });
    }
  }

  async toggle() {
    if (this.state.status === "playing") {
      this.audio.pause();
      this.setState({ status: "paused" });
      return;
    }
    if (this.state.index < 0 || !this.state.queue.length) return;
    if (this.audio.src && !this.audio.ended && this.state.status !== "error") {
      this.onPlayRequested();
      try {
        await this.audio.play();
        this.setState({ status: "playing", error: "" });
      } catch (error) {
        this.setState({ status: "error", error: messageForPlaybackError(error) });
      }
      return;
    }
    await this.playIndex(this.state.index, true);
  }

  async next() {
    if (!this.state.queue.length) return;
    this.stepDirection = 1;
    if (this.playbackMode !== "shuffle") {
      await this.playIndex(this.state.index + 1, true);
      return;
    }
    if (this.shufflePosition < this.shuffleHistory.length - 1) {
      this.shufflePosition++;
      await this.playIndex(this.shuffleHistory[this.shufflePosition], true);
      return;
    }
    if (!this.shuffleBag.length && this.state.queue.length > 1) this.shuffleBag = this.shuffleIndices(this.state.index);
    if (!this.shuffleBag.length) {
      await this.playIndex(this.state.index, true);
      return;
    }
    const nextIndex = this.shuffleBag.shift();
    this.shuffleHistory.push(nextIndex);
    this.shufflePosition = this.shuffleHistory.length - 1;
    if (this.shuffleHistory.length > DJ_PLAYBACK_HISTORY_LIMIT) {
      const discardCount = this.shuffleHistory.length - DJ_PLAYBACK_HISTORY_LIMIT;
      this.shuffleHistory.splice(0, discardCount);
      this.shufflePosition -= discardCount;
    }
    await this.playIndex(nextIndex, true);
  }

  async previous() {
    if (!this.state.queue.length) return;
    if (this.playbackMode === "shuffle" && this.shufflePosition <= 0) return;
    this.stepDirection = -1;
    if (this.playbackMode !== "shuffle") {
      await this.playIndex(this.state.index - 1, true);
      return;
    }
    this.shufflePosition--;
    await this.playIndex(this.shuffleHistory[this.shufflePosition], true);
  }

  seek(value) {
    const duration = Number(this.audio.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(value)) return;
    const currentTime = Math.max(0, Math.min(duration, value));
    try {
      this.audio.currentTime = currentTime;
      this.setState({ currentTime });
    } catch {
      // Metadata can disappear while the current stream is being replaced.
    }
  }

  clear() {
    this.requestId++;
    this.restorePosition = 0;
    this.shuffleHistory = [];
    this.shufflePosition = -1;
    this.shuffleBag = [];
    this.stepDirection = 0;
    this.setState({ queue: [], index: -1, status: "idle", currentTime: 0, duration: 0, error: "" });
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
