---
name: plan-dj-crate
description: >
  Plan a DJ crate or playlist from real NetEase catalog hits. Use when the user
  asks to 排一套 / 做一张歌单 / crate / Peak Time set. Load before search_netease_tracks.
---

# Plan a DJ crate

1. Call `search_netease_tracks` for each needed query. Only recommend tracks that appear in those results.
2. Use `analyze_dj_transition` only when both sides have known key and BPM.
3. Finish with a ```json array of `{ "title", "artist" }` plus optional `version`, taken from search hits. Omit unknown bpm/camelot. Do not invent songs.

Host UI matches those titles against NetEase and shows the playlist card.
