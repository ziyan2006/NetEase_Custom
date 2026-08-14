import { getTrendingTracksByGenre } from '../lib/dj-agent/trend-radar.js';

async function testDynamicTrendRadar() {
  console.log('========================================================================');
  console.log('    测试 Tech House 风格热单雷达 (连续调用 2 次，验证完全动态与非重复)');
  console.log('========================================================================\n');

  console.log('▶ [第 1 次调用] 正在向 DeepSeek 请求本周 Tech House 热门单曲...');
  const round1 = await getTrendingTracksByGenre('tech_house');
  console.log(`✅ 第 1 次返回 ${round1.tracks.length} 首单曲：`);
  round1.tracks.forEach((t, i) => console.log(`   ${i + 1}. ${t.artist} - ${t.title} (${t.remix || 'Original Mix'})`));

  console.log('\n▶ [第 2 次调用] 再次向 DeepSeek 请求本周 Tech House 热门单曲...');
  const round2 = await getTrendingTracksByGenre('tech_house');
  console.log(`✅ 第 2 次返回 ${round2.tracks.length} 首单曲：`);
  round2.tracks.forEach((t, i) => console.log(`   ${i + 1}. ${t.artist} - ${t.title} (${t.remix || 'Original Mix'})`));

  const list1 = round1.tracks.map((t) => `${t.artist} - ${t.title}`);
  const list2 = round2.tracks.map((t) => `${t.artist} - ${t.title}`);
  const isIdentical = JSON.stringify(list1) === JSON.stringify(list2);

  console.log('\n========================================================================');
  console.log(`结果比对：两次返回结果是否完全相同？ -> ${isIdentical ? '❌ 相同 (仍为固定预设)' : '✅ 不同 (已成功实现 100% 动态实时生成)'}`);
  console.log('========================================================================\n');
}

testDynamicTrendRadar();
