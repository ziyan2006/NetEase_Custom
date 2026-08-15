async function testStream() {
  console.log("=== 测试 /api/agent/chat 流式 Thinking 与 Tool 调用 ===");
  const res = await fetch("http://127.0.0.1:4178/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "推荐 8A Camelot 调性的接歌方案与选曲",
      config: {
        thinkingEffort: "balanced",
        model: "deepseek-reasoner",
      },
    }),
  });

  const text = await res.text();
  console.log("=== 接收到 SSE 数据片段 (前 1500 字符) ===");
  console.log(text.slice(0, 1500));
}

testStream().catch(console.error);
