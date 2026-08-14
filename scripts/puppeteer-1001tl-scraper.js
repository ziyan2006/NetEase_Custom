import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

async function scrape1001TL(url = TARGET_URL) {
  console.log('========================================================================');
  console.log('       Puppeteer-Core + 本地 Chrome 引擎 1001Tracklists 穿透抓取');
  console.log('========================================================================\n');
  console.log(`[TARGET] 目标现场: ${url}`);
  console.log(`[ENGINE] 启动 Chrome: ${CHROME_PATH}...`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new', // 现代无头模式
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ],
    defaultViewport: { width: 1366, height: 768 },
  });

  try {
    const page = await browser.newPage();

    // 注入反检测脚本，移除 navigator.webdriver 标记
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'zh-CN'] });
    });

    console.log('[NAVIGATE] 正在加载页面...');
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('goto warning:', e.message));

    console.log(`[STATUS] 初始页面 HTTP 状态: ${response ? response.status() : 'Unknown'}`);
    let title = await page.title();
    console.log(`[TITLE] 初始页面标题: "${title}"`);

    // 等待 Turnstile 验证或自动跳转 (最多轮询 15 秒)
    console.log('[WAIT] 检测是否触发 Cloudflare Turnstile 并等待穿透...');
    let passed = false;
    for (let i = 1; i <= 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      title = await page.title();
      
      const pageState = await page.evaluate(() => {
        const isChallenge = document.body ? document.body.innerText.includes('Please wait, you will be forwarded') : false;
        const tracks = document.querySelectorAll('.tlpItem, .tlpTog, .artItm, [itemprop="tracks"]');
        return { isChallenge, tracksCount: tracks.length, bodyLength: document.body ? document.body.innerHTML.length : 0 };
      });

      console.log(`   [第 ${i} 秒] Title: "${title.slice(0, 45)}" | 盾挑战中: ${pageState.isChallenge} | 发现曲目节点数: ${pageState.tracksCount}`);

      if (!pageState.isChallenge && pageState.tracksCount > 0) {
        passed = true;
        break;
      }
    }

    // 提取完整曲目数据
    console.log('\n[PARSE] 正在从页面 DOM 中解析曲目列表...');
    const extractedData = await page.evaluate(() => {
      const pageTitle = document.title || '';
      const setDateMatch = document.querySelector('.cRow .fontM, .cRow span');
      const results = [];

      // 1. 从 .tlpItem 中精确提取
      const items = document.querySelectorAll('.tlpItem, .tlpTog');
      items.forEach((item, idx) => {
        // 查找歌名与艺人
        const trackValue = item.querySelector('.trackValue, .tlpValue');
        const artItm = item.querySelector('.artItm, .artistValue');
        const songName = trackValue ? trackValue.innerText.trim() : '';
        const artistName = artItm ? artItm.innerText.trim() : '';

        // 查找混音或版本
        const remixVal = item.querySelector('.remixValue');
        const remixName = remixVal ? remixVal.innerText.trim() : '';

        // 查找时间戳
        const cueNode = item.querySelector('.cue');
        const timeCue = cueNode ? cueNode.innerText.trim() : '';

        if (songName || artistName) {
          results.push({
            trackNumber: idx + 1,
            time: timeCue,
            artist: artistName,
            title: songName,
            remix: remixName,
            rawText: item.innerText.replace(/\n+/g, ' ').trim()
          });
        }
      });

      // 2. 如果常规结构未捕获，从纯文本中提取带 ' - ' 的行
      if (results.length === 0 && document.body) {
        const lines = document.body.innerText.split('\n')
          .map(l => l.trim())
          .filter(l => l.includes(' - ') && !l.includes('1001Tracklists') && l.length > 6 && l.length < 150);
        
        lines.forEach((line, idx) => {
          results.push({
            trackNumber: idx + 1,
            rawText: line,
          });
        });
      }

      return {
        title: pageTitle,
        totalExtracted: results.length,
        tracks: results
      };
    });

    console.log('========================================================================');
    console.log(`🎉 [SUCCESS] 从 1001Tracklists 真实网页成功提取出 ${extractedData.totalExtracted} 首曲目！`);
    console.log(`现场标题: ${extractedData.title}`);
    console.log('========================================================================\n');
    console.log('前 10 首真实现场音轨详情:');
    extractedData.tracks.slice(0, 10).forEach(t => {
      console.log(`   🎵 #${t.trackNumber} [${t.time || '00:00'}] ${t.artist ? `${t.artist} - ${t.title}` : t.rawText} ${t.remix ? `(${t.remix})` : ''}`);
    });

    return extractedData;
  } catch (err) {
    console.error('❌ 抓取过程发生异常:', err.message);
  } finally {
    await browser.close();
  }
}

scrape1001TL();
