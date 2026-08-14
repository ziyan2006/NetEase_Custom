import { app, BrowserWindow } from 'electron';

const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

app.whenReady().then(async () => {
  console.log('========================================================================');
  console.log('       Electron 后台静默 Chromium 穿透 1001Tracklists 实机测试');
  console.log('========================================================================\n');
  console.log(`[INIT] 正在后台启动 Electron Chromium 引擎...`);

  const win = new BrowserWindow({
    show: false, // 后台静默无头运行
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  console.log(`[NAVIGATE] 正在请求目标现场: ${TARGET_URL}`);
  await win.loadURL(TARGET_URL, {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });

  console.log('[WAIT] 等待页面及 Turnstile 验证渲染 (最多等待 10 秒)...');

  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const pageInfo = await win.webContents.executeJavaScript(`
        (() => {
          const title = document.title || '';
          const isTurnstile = document.body ? document.body.innerText.includes('Please wait, you will be forwarded') : false;
          
          // 查找所有曲目节点
          const trackElements = document.querySelectorAll('.tlpTog, .tlpItem, [itemprop="tracks"]');
          const rawTracks = [];

          // 尝试提取包含歌名的元素
          const trackValueNodes = document.querySelectorAll('.trackValue, .tlpValue, .artItm');
          trackValueNodes.forEach(node => {
            const text = node.innerText.trim();
            if (text && text.length > 2 && !rawTracks.includes(text)) {
              rawTracks.push(text);
            }
          });

          // 通用 fallback: 提取包含 " - " 的行
          const allText = document.body ? document.body.innerText : '';
          const linesWithDash = allText.split('\\n')
            .map(l => l.trim())
            .filter(l => l.includes(' - ') && !l.includes('1001Tracklists') && l.length > 5 && l.length < 120);

          return {
            title,
            isTurnstile,
            trackElementsCount: trackElements.length,
            rawTracksCount: rawTracks.length,
            linesWithDashCount: linesWithDash.length,
            sampleTracks: (rawTracks.length > 0 ? rawTracks : linesWithDash).slice(0, 10),
            htmlLength: document.documentElement.outerHTML.length
          };
        })()
      `);

      console.log(`[轮询 ${attempts}/10] Title: "${pageInfo.title.slice(0, 50)}" | Turnstile拦截中: ${pageInfo.isTurnstile} | 识别到曲目行: ${pageInfo.linesWithDashCount || pageInfo.rawTracksCount}`);

      if (!pageInfo.isTurnstile && (pageInfo.linesWithDashCount > 5 || pageInfo.rawTracksCount > 5)) {
        clearInterval(interval);
        console.log('\n🎉 [SUCCESS] 成功穿透 1001Tracklists 并提取真实 DOM 曲目列表！');
        console.log(`页面完整标题: ${pageInfo.title}`);
        console.log(`提取曲目数量: ${pageInfo.linesWithDashCount || pageInfo.rawTracksCount} 首`);
        console.log('前 10 首真实现场曲目样本:');
        pageInfo.sampleTracks.forEach((t, i) => console.log(`   🎵 #${i + 1} ${t}`));
        console.log('\n========================================================================\n');
        app.quit();
      } else if (attempts >= 10) {
        clearInterval(interval);
        console.log('\n⚠️ [TIMEOUT] 10 秒内未完成 Turnstile 验证或页面未输出曲目。');
        app.quit();
      }
    } catch (err) {
      console.log(`[ERROR] 轮询异常: ${err.message}`);
    }
  }, 1000);
});
