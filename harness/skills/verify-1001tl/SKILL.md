---
name: verify-1001tl
description: >
  Check or restore the 1001Tracklists cookie fast path. Use when live-set search
  or parsing reports needs_verify, Turnstile, or missing cookies. Load before
  get_1001tl_status.
---

# Verify 1001Tracklists access

Call `get_1001tl_status`. If `ready` is false, tell the user to use Copilot's 「去验证」 control (Electron official-site window). Do not start Puppeteer or invent sets while cookies are missing.
