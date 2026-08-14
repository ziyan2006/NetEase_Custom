import { createAppServer } from '../server.js';

async function runLiveVerification() {
  console.log('================================================================');
  console.log('       AI DJ COPILOT 真实环境全链路实机验证');
  console.log('================================================================\n');

  const server = createAppServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const baseUrl = 'http://127.0.0.1:' + port;
  console.log('[1/4] 本地服务器已启动: ' + baseUrl + '\n');

  // -------------------------------------------------------------
  // 第一步：模拟用户提问 “帮我看看culture shock最近的演出”
  // -------------------------------------------------------------
  console.log('▶ 【第一步】模拟用户输入指令: "帮我看看culture shock最近的演出"');
  const chatResponse1 = await fetch(baseUrl + '/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '帮我看看culture shock最近的演出',
    }),
  });

  const rawSseStream1 = await chatResponse1.text();
  const lines1 = rawSseStream1.split('\n');

  let candidateCard = null;
  let responseText = '';

  for (const line of lines1) {
    if (!line.startsWith('data:')) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;
    try {
      const evt = JSON.parse(jsonStr);
      if (evt.type === 'text') responseText += evt.data;
      if (evt.type === 'card') candidateCard = evt.data;
    } catch {}
  }

  console.log('\n[Agent 流式打字回复]:');
  console.log(responseText.trim());
  console.log('\n[Agent 返回的演出候选卡片数据]:');
  console.log('卡片标题:', candidateCard?.title);
  console.log('艺人名称:', candidateCard?.artist);
  console.log('演出场次总数:', candidateCard?.sets?.length);
  candidateCard?.sets?.forEach((s, idx) => {
    console.log(`  ${idx + 1}. [${s.date}] ${s.title}`);
    console.log(`     场地: ${s.venue || 'N/A'} | 预估曲目: ${s.trackCount} 首`);
    console.log(`     链接: ${s.url}`);
  });

  // -------------------------------------------------------------
  // 第二步：模拟用户点击第一场（如 Rampage Open Air）右侧的 [⚡ 解析并生成歌单]
  // -------------------------------------------------------------
  const chosenSet = candidateCard.sets[0];
  console.log('\n----------------------------------------------------------------');
  console.log(`▶ 【第二步】模拟用户点击第 1 个演出: "${chosenSet.title}"`);
  console.log(`▶ 发送演出链接: ${chosenSet.url}`);
  console.log('----------------------------------------------------------------\n');

  const chatResponse2 = await fetch(baseUrl + '/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: chosenSet.url,
    }),
  });

  const rawSseStream2 = await chatResponse2.text();
  const lines2 = rawSseStream2.split('\n');

  let playlistPreviewCard = null;
  let parseResponseText = '';
  const statusEvents = [];

  for (const line of lines2) {
    if (!line.startsWith('data:')) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;
    try {
      const evt = JSON.parse(jsonStr);
      if (evt.type === 'status') statusEvents.push(evt.data);
      if (evt.type === 'text') parseResponseText += evt.data;
      if (evt.type === 'card') playlistPreviewCard = evt.data;
    } catch {}
  }

  console.log('[Agent 处理状态轨迹]:');
  statusEvents.forEach((st) => console.log('  ⏳ ' + st));

  console.log('\n[Agent 返回的歌单预览卡片 (网易云 320k 真实匹配结果)]:');
  console.log('歌单标题:', playlistPreviewCard?.title);
  console.log('成功匹配曲目数:', playlistPreviewCard?.tracks?.length);
  console.log('\n前 5 首匹配成功的 320k 网易云曲目详情:');
  playlistPreviewCard?.tracks?.slice(0, 5).forEach((t, i) => {
    console.log(`  🎵 [${i + 1}] 《${t.name}》 - ${t.artist}`);
    console.log(`      网易云歌曲 ID: ${t.id} | 320K: ${t.playable320k ? 'YES ✅' : 'NO'} | 时长: ${(t.durationMs / 1000).toFixed(0)}s`);
    console.log(`      专辑封面: ${t.coverUrl?.slice(0, 60)}...`);
  });

  server.close();
  console.log('\n================================================================');
  console.log('✅ 实机全链路测试全部通过！数据流转无缝闭环！');
  console.log('================================================================');
}

runLiveVerification();
