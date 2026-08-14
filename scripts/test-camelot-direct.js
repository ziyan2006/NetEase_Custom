import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";

async function main() {
  console.log("=== 测试 Camelot 技能执行 ===");
  const t0 = Date.now();
  let text = "";
  const res = await dispatchAgentWorkflow({
    message: "我现在在 8A 调性，想要一个顺时针升能量的接歌方案",
    onStream: (event) => {
      if (event.type === "status") console.log(`[STATUS] ${event.data}`);
      if (event.type === "reasoning") process.stdout.write(event.data);
      if (event.type === "text") {
        text += event.data;
        process.stdout.write(event.data);
      }
      if (event.type === "card") console.log("\n[CARD RECEIVED]:", event.data.title);
    },
  });

  console.log("\n\n=== RESULT ===");
  console.log(`耗时: ${Date.now() - t0}ms`);
  console.log("Type:", res?.type);
}

main().catch(console.error);
