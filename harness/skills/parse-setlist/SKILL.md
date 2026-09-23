---
name: parse-setlist
description: >
  Parse a 1001Tracklists URL or pasted Artist - Title lines into a real setlist
  and match NetEase tracks. Use when the user pastes a tracklist URL, a multi-line
  set, or clicks 解析 on a live-set card. Load before parse_1001tl_setlist.
---

# Parse a setlist

Call `parse_1001tl_setlist` with either:

- `url`: a real `https://www.1001tracklists.com/tracklist/<id>/...` link
- `text`: pasted `Artist - Title` lines

Do not invent tracks if the page is empty, blocked, or the URL is fake (`/tracklist/dynamic/`).

Host UI turns matched songs into the preview card (play, 320k badge, create playlist). Explain the match; do not add songs that were not in the tool result.

If the tool returns `needs_verify`, ask the user to complete 1001Tracklists verification rather than guessing the set.
