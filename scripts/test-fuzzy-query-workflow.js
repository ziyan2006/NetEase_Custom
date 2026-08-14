/**
 * 测试自然语言模糊询问 -> AI 实时调用 1001TL 搜索接口 -> 候选 Set 列表 -> 点击解析真实曲目全流程
 */

import { dispatchAgentWorkflow } from '../lib/dj-agent/agent-dispatcher.js';

async function testFuzzyQueryWorkflow() {
  console.log('========================================================================');
  console.log('       自然语言模糊询问 -> 1001TL 实时搜索接口调用全流程实测');
  console.log('========================================================================\n');

  console.log('[STEP 1] 用户模糊提问: "帮我看看 Culture Shock 最近的演出"');
  let searchCard = null;

  await dispatchAgentWorkflow({
    message: '帮我看看 Culture Shock 最近的演出',
    onStream: (event) => {
      if (event.type === 'status') {
        console.log(`   [STATUS] ${event.data}`);
      } else if (event.type === 'card') {
        searchCard = event.data;
      }
    }
  });

  if (searchCard && searchCard.sets && searchCard.sets.length > 0) {
    console.log('\n========================================================================');
    console.log(`🎉 成功从 1001Tracklists 实时搜索接口检索到 ${searchCard.sets.length} 场候选现场！`);
    console.log('========================================================================');
    searchCard.sets.forEach((s, idx) => {
      console.log(`   🎪 [#${idx + 1}] ${s.name}`);
      console.log(`       🔗 1001TL 真实链接: ${s.url}`);
      console.log(`       📅 日期/地点: ${s.date || s.location}`);
    });
  } else {
    console.log('❌ 未能获取到候选演出列表');
  }
}

testFuzzyQueryWorkflow();
