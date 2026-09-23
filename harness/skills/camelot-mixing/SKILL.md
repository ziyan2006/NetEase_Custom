---
name: camelot-mixing
description: >
  Camelot harmonic mixing and key transitions. Use when the user mentions Camelot,
  8A/9A, 调性, 接歌, or BPM-compatible keys. Load before analyze_camelot or
  analyze_dj_transition.
---

# Camelot mixing

1. For a single key or “what to mix after 8A”, call `analyze_camelot` with `key` or the user `query`.
2. Call `analyze_dj_transition` only when both tracks already have a key and BPM. Do not invent BPM or keys.

Host UI shows the compatible-key card from the engine JSON. Explain that result only. Do not invent example tracks unless `search_netease_tracks` actually hit them.
