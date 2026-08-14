import { createAppServer } from '../server.js';

async function testMultipleArtistsWorkflow() {
  console.log('========================================================================');
  console.log('       多艺人实机全链路自动化测试 (Culture Shock / Martin Garrix / Anyma / Fisher)');
  console.log('========================================================================\n');

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[INIT] 测试服务器在 ${baseUrl} 就绪\n`);

  const artistsToTest = [
    {
      name: 'Culture Shock',
      prompt: '帮我看看culture shock最近的演出',
      genre: 'Drum & Bass',
    },
    {
      name: 'Martin Garrix',
      prompt: '帮我看看 Martin Garrix 最近的现场',
      genre: 'Mainstage EDM / Progressive House',
    },
    {
      name: 'Anyma',
      prompt: '查查 Anyma 最近有什么演出',
      genre: 'Melodic Techno',
    },
    {
      name: 'Fisher',
      prompt: '帮我看看 Fisher 最近的演出',
      genre: 'Tech House',
    },
  ];

  const summaryResults = [];

  for (let i = 0; i < artistsToTest.length; i++) {
    const item = artistsToTest[i];
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`【测试用例 ${i + 1}/${artistsToTest.length}】艺人: ${item.name} (${item.genre})`);
    console.log(`用户提问: "${item.prompt}"`);
    console.log(`------------------------------------------------------------------------`);

    // 1. 发送查询演出指令
    const chatRes1 = await fetch(`${baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: item.prompt }),
    });

    const sseText1 = await chatRes1.text();
    let setsCard = null;

    for (const line of sseText1.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === 'card' && evt.data?.sourceType === 'artist_sets_selector') {
          setsCard = evt.data;
        }
      } catch {}
    }

    if (!setsCard || !setsCard.sets || setsCard.sets.length === 0) {
      console.error(`❌ 未能获取到 ${item.name} 的候选演出列表`);
      summaryResults.push({ name: item.name, status: 'FAILED_SEARCH' });
      continue;
    }

    console.log(`✅ 成功检索到 ${setsCard.sets.length} 场近期代表性演出:`);
    setsCard.sets.forEach((s, idx) => {
      console.log(`   ${idx + 1}. [${s.date}] ${s.title} (${s.venue || s.event || 'Main Stage'}) - 约 ${s.trackCount} 首`);
    });

    // 2. 模拟用户点击第 1 场演出的 [⚡ 解析并生成歌单]
    const chosenSet = setsCard.sets[0];
    console.log(`\n▶ 模拟用户点击解析第 1 场: "${chosenSet.title}"`);

    let parsePrompt = '';
    if (chosenSet.tracks && chosenSet.tracks.length > 0) {
      parsePrompt = `请为以下现场演出生成网易云 320k 歌单：\n【${chosenSet.title}】\n` + chosenSet.tracks.map((t, idx) => `${idx + 1}. ${t}`).join('\n');
    } else {
      parsePrompt = chosenSet.url;
    }

    const chatRes2 = await fetch(`${baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: parsePrompt }),
    });

    const sseText2 = await chatRes2.text();
    let previewCard = null;

    for (const line of sseText2.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === 'card' && Array.isArray(evt.data?.tracks)) {
          previewCard = evt.data;
        }
      } catch {}
    }

    if (!previewCard || !previewCard.tracks || previewCard.tracks.length === 0) {
      console.error(`❌ ${item.name} 曲目匹配失败 (0 首匹配)`);
      summaryResults.push({ name: item.name, status: 'FAILED_MATCH' });
    } else {
      console.log(`✅ 成功生成「${previewCard.title}」歌单预览卡片！`);
      console.log(`   匹配网易云 320k 曲目数: ${previewCard.tracks.length} 首`);
      console.log(`   高音质曲目展示 (Top 3):`);
      previewCard.tracks.slice(0, 3).forEach((t, idx) => {
        console.log(`     🎵 #${idx + 1} 《${t.name}》 - ${t.artist} (ID: ${t.id} | 320K: ${t.playable320k ? 'YES' : 'NO'})`);
      });

      summaryResults.push({
        name: item.name,
        genre: item.genre,
        status: 'SUCCESS',
        setChosen: chosenSet.title,
        matchedCount: previewCard.tracks.length,
      });
    }
  }

  server.close();

  console.log('\n========================================================================');
  console.log('                      多艺人测试总结报告');
  console.log('========================================================================');
  console.table(summaryResults);
  console.log('========================================================================\n');
}

testMultipleArtistsWorkflow();
