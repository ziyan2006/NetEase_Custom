---
name: search-live-sets
description: >
  Find a DJ's real 1001Tracklists live sets. Use when the user asks about recent
  shows, festivals, setlists, or 最近的演出 / 现场. Load this skill before calling
  search_1001tl_sets.
---

# Search live sets

Do not call `search_1001tl_sets` on the first turn if the artist string is informal.

## Confirm the official name

1. Infer the billed artist name (keep `&`, `+`, and punctuation; do not invent a setlist).
2. If spelling, `and` vs `&`, abbreviations, or namesakes could be wrong, ask one short question with 1–3 candidates. Wait for the user.
3. After they confirm, call `search_1001tl_sets` with that official name only.
4. If this conversation already confirmed a name, search immediately.

`artist` must be the confirmed name. Never pass the whole user sentence (e.g. 「帮我查一下…最近的演出」).

## After the tool returns

- Host UI builds the interactive set-list card (with 解析 buttons). Do not rebuild the list as a Markdown table, and do not tell the user to paste URLs that are already on the card.
- `needs_verify`: tell the user to verify the 1001Tracklists source (Electron window). Optionally call `get_1001tl_status`.
- `needs_confirmation`: ask again instead of retrying with the raw sentence.
- Empty sets: say so. Offer a pasteable 1001Tracklists URL or tracklist text.

To parse a chosen set, load `parse-setlist` and call `parse_1001tl_setlist`.
