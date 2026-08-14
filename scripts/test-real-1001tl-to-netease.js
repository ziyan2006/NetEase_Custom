/**
 * 全链路端到端实机验证：从 1001Tracklists 真实网页抓取 Set -> 过滤 ID -> 匹配网易云 320k
 */

import { dispatchAgentWorkflow } from '../lib/dj-agent/agent-dispatcher.js';

const REAL_1001TL_URL = 'https://www.1001tracklists.com/tracklist/1zrx5s11/culture-shock-dome-stage-rampage-open-air-belgium-2023-07-01.html';

async function testReal1001ToEndToEnd() {
  console.log('========================================================================');
  console.log('       1001Tracklists 真实原站抓取 -> 网易云 320k 全链路端到端验证');
  console.log('========================================================================\n');
  console.log(`[INPUT] 用户发送真实 1001TL 链接:\n${REAL_1001TL_URL}\n`);

  let generatedCard = null;
  const statusUpdates = [];

  const result = await dispatchAgentWorkflow({
    message: `帮我解析这场 1001Tracklists 演出并生成网易云歌单：${REAL_1001TL_URL}`,
    onStream: (event) => {
      if (event.type === 'status') {
        console.log(`[STATUS] ${event.data}`);
        statusUpdates.push(event.data);
      } else if (event.type === 'card') {
        generatedCard = event.data;
      }
    }
  });

  console.log('\n========================================================================');
  console.log('                      全链路验证结果与歌单卡片');
  console.log('========================================================================');
  if (generatedCard) {
    console.log(`✅ 成功生成歌单卡片！`);
    console.log(`卡片标题: ${generatedCard.title}`);
    console.log(`副标题: ${generatedCard.subtitle}`);
    console.log(`成功匹配网易云 320k 官方音频曲目数: ${generatedCard.tracks.length} 首`);
    console.log('\n前 10 首匹配曲目详情 (网易云 320k 官方音源):');
    generatedCard.tracks.slice(0, 10).forEach(t => {
      console.log(`   🎵 #${t.trackNumber} ${t.artist} - ${t.name} (320k可用: ${t.playable320k}) [ID: ${t.id}]`);
    });
  } else {
    console.log('❌ 未能生成歌单卡片');
  }
  console.log('========================================================================\n');
}

testReal1001ToEndToEnd();
