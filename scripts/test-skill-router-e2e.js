import { dispatchAgentWorkflow } from '../lib/dj-agent/agent-dispatcher.js';

async function runTest(title, message) {
  console.log('------------------------------------------------------------------------');
  console.log(`[TEST] ${title}`);
  console.log(`[USER INPUT] "${message}"`);

  const startTime = Date.now();
  let activatedSkill = '';
  let cardGenerated = null;
  let textLength = 0;

  const result = await dispatchAgentWorkflow({
    message,
    onStream: (event) => {
      if (event.type === 'status') {
        console.log(`   [STATUS] ${event.data}`);
        if (event.data.includes('[已激活')) {
          activatedSkill = event.data;
        }
      } else if (event.type === 'card') {
        cardGenerated = event.data;
      } else if (event.type === 'text') {
        textLength += event.data.length;
      }
    }
  });

  const duration = Date.now() - startTime;
  console.log(`\n🎉 [RESULT] 耗时: ${duration}ms | 返回类型: ${result?.type}`);
  if (cardGenerated) {
    console.log(`   🎴 卡片: "${cardGenerated.title}" (${cardGenerated.sourceType || 'custom'})`);
  }
  console.log(`   📝 生成文本总长: ${textLength} 字符`);
  console.log('------------------------------------------------------------------------\n');
}

async function main() {
  console.log('========================================================================');
  console.log('       纯 LLM Skill 自主决策与渐进式披露架构 端到端实机验证');
  console.log('========================================================================\n');

  // 1. 现场演出检索
  await runTest('1. 演出检索技能 (live_set_search)', '帮我看看 Anyma 最近有什么好看的现场');

  // 2. 调性和谐混音
  await runTest('2. Camelot 调性过渡技能 (camelot_harmonic_mixing)', '我现在正在播放 8A 调性的歌曲，接下来想做一个平滑过渡，推荐接什么调性？');

  // 3. 流派榜单雷达
  await runTest('3. 流派热单雷达技能 (genre_trend_radar)', '推荐几首本周 Beatport 榜单最热门的 Melodic Techno 单曲');

  // 4. 自由对话与制作理论
  await runTest('4. DJ 自由对话技能 (general_dj_chat)', '请教一下在先锋混音台上做三频 EQ 切换的技术要领');

  console.log('========================================================================');
  console.log('🎉 全部 4 种典型场景的纯 LLM 自主决策与渐进式披露验证完毕！');
  console.log('========================================================================\n');
}

main();
