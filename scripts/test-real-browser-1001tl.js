import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

async function testRealBrowser() {
  console.log('========================================================================');
  console.log('       puppeteer-real-browser (Cloudflare 专用穿透引擎) 1001TL 实机测试');
  console.log('========================================================================\n');
  console.log(`[TARGET] ${TARGET_URL}`);
  console.log('[CONNECT] 正在启动 real-browser 穿透引擎...');

  try {
    const { browser, page } = await connect({
      headless: false, // 视窗模式以确保 Turnstile 触发物理过盾
      args: ['--window-size=1280,800'],
      turnstile: true, // 开启自动 Cloudflare Turnstile 求解器
    });

    console.log('[NAVIGATE] 正在请求 1001Tracklists 现场页面...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    console.log('[WAIT] 等待页面加载与 Turnstile 自动穿透 (等待 10 秒)...');
    await new Promise(r => setTimeout(r, 10000));

    const html = await page.content();
    fs.writeFileSync('scripts/real_browser_dump.html', html, 'utf-8');
    console.log(`[DUMP] 保存页面 HTML (${html.length} 字符) 到 scripts/real_browser_dump.html`);

    const pageInfo = await page.evaluate(() => {
      const title = document.title || '';
      const isChallenge = document.body ? document.body.innerText.includes('Please wait, you will be forwarded') : false;
      const bodySnippet = document.body ? document.body.innerText.slice(0, 500) : '';
      const htmlLen = document.documentElement.outerHTML.length;
      
      const tracks = [];
      // 遍历页面所有的 div 和 span 查找包含歌名特征的元素
      const allDivs = document.querySelectorAll('div, tr, li, p');
      const sampleLines = document.body ? document.body.innerText.split('\n').filter(l => l.includes(' - ') && l.length > 5 && l.length < 150) : [];

      return {
        title,
        isChallenge,
        htmlLen,
        bodySnippet,
        sampleLines: sampleLines.slice(0, 15),
      };
    });

    console.log(`\n🎉 页面标题: "${pageInfo.title}"`);
    console.log(`是否仍在挑战页: ${pageInfo.isChallenge}`);
    console.log(`页面文本 Snippet:\n${pageInfo.bodySnippet}\n`);
    console.log(`匹配到包含 " - " 的行数: ${pageInfo.sampleLines.length}`);
    pageInfo.sampleLines.forEach((l, i) => console.log(`   🎵 #${i + 1} ${l}`));

    if (pageInfo.tracksCount > 0) {
      console.log('\n========================================================================');
      console.log('前 15 首真实现场原站音轨数据 (直接来自 1001Tracklists DOM):');
      console.log('========================================================================');
      pageInfo.tracks.forEach(t => {
        console.log(`   🎵 #${t.trackNum} [${t.time || '00:00'}] ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''}`);
      });

      // 保存完整的 Cookies
      const cookies = await page.cookies();
      console.log('\n提取到的 1001TL Session Cookies:');
      cookies.forEach(c => console.log(`   🍪 ${c.name}=${c.value.slice(0, 20)}... (domain: ${c.domain})`));
      fs.writeFileSync('scripts/1001tl_cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
    }

    await browser.close();
  } catch (err) {
    console.error('❌ real-browser 异常:', err.message);
  }
}

testRealBrowser();
