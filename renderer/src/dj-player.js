function messageForPlaybackError(error) {
  if (error?.name === "NotAllowedError") return "浏览器阻止了自动播放，请按播放按钮重试。";
  if (error?.message) return error.message;
  return "音频无法播放，请检查曲目权限或网络后重试。";
}

/** One HTMLAudioElement and one queue shared by all DJ playback entry points. */
export class DjPlayer {
  constructor({ resolveAudioUrl, onChange = () => {}, audio = new Audio() }) {
    this.audio = audio;
    this.resolveAudioUrl = resolveAudioUrl;
    this.onChange = onChange;
    this.requestId = 0;
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
    return { ...this.state, queue: [...this.state.queue], track: this.state.queue[this.state.index] ?? null };
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
    const selectedIndex = Math.max(0, Math.min(valid.length - 1, Number(index) || 0));
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

  async playIndex(index, force = false) {
    if (!this.state.queue.length) return;
    const nextIndex = (index + this.state.queue.length) % this.state.queue.length;
    const track = this.state.queue[nextIndex];
    if (!force && nextIndex === this.state.index && this.state.status === "playing") return;
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
    if (this.state.queue.length) await this.playIndex(this.state.index + 1, true);
  }

  async previous() {
    if (this.state.queue.length) await this.playIndex(this.state.index - 1, true);
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
    this.setState({ queue: [], index: -1, status: "idle", currentTime: 0, duration: 0, error: "" });
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
