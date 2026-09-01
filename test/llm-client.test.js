import test from "node:test";
import assert from "node:assert/strict";
import { chatCompletion, streamChatCompletion } from "../lib/dj-agent/llm-client.js";

test("llm-client: chatCompletion handles JSON error response without body reuse error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ error: { message: "API key is invalid" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () => chatCompletion({ messages: [{ role: "user", content: "test" }] }),
      (err) => {
        assert.match(err.message, /HTTP 401/);
        assert.match(err.message, /API key is invalid/);
        assert.doesNotMatch(err.message, /Body is unusable/i);
        assert.doesNotMatch(err.message, /already been read/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("llm-client: chatCompletion handles non-JSON HTML/text error response without body reuse error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
  };

  try {
    await assert.rejects(
      () => chatCompletion({ messages: [{ role: "user", content: "test" }] }),
      (err) => {
        assert.match(err.message, /HTTP 502/);
        assert.match(err.message, /502 Bad Gateway/);
        assert.doesNotMatch(err.message, /Body is unusable/i);
        assert.doesNotMatch(err.message, /already been read/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
