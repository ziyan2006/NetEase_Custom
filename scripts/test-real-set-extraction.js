import { connect } from 'puppeteer-real-browser';
import fs from 'fs';
import { parse1001TracklistHtml } from '../lib/dj-agent/tracklist-parser.js';

const TARGET_URL = 'https://www.1001tracklists.com/tracklist/1zrx5s11/culture-shock-dome-stage-rampage-open-air-belgium-2023-07-01.html';

async function testRealSetExtraction() {
  console.log('========================================================================');
  console.log('       1001Tracklists 真实现场全音轨提取实机验证 (Culture Shock)');
  console.log('========================================================================\n');
  console.log(`[TARGET] ${TARGET_URL}`);
  console.log('[CONNECT] 正在启动 real-browser 穿透引擎...');

  try {
    const { browser, page } = await connect({
      headless: false,
      args: ['--window-size=1280,800'],
      turnstile: true,
    });

    console.log('[NAVIGATE] 正在请求目标现场详情页...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    console.log('[WAIT] 等待页面加载与 DOM 渲染...');
    await new Promise(r => setTimeout(r, 6000));

    const html = await page.content();
    fs.writeFileSync('scripts/culture_shock_set.html', html, 'utf-8');
    console.log(`[DUMP] 保存现场完整 HTML (${html.length} 字符)`);

    // 运行我们的 parse1001TracklistHtml
    const parsed = parse1001TracklistHtml(html, { filterUnreleased: false });

    console.log('\n========================================================================');
    console.log(`🎉 [SUCCESS] 成功从 1001Tracklists 真实网页提取出全部曲目！`);
    console.log(`现场标题: ${parsed.title}`);
    console.log(`DJ: ${parsed.dj || 'Culture Shock'}`);
    console.log(`曲目总数: ${parsed.totalCount} 首`);
    console.log('========================================================================\n');

    console.log('全部真实现场曲目列表:');
    parsed.tracks.forEach(t => {
      console.log(`   🎵 #${t.trackNumber} ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''} ${t.label ? `[${t.label}]` : ''}`);
    });

    // 提取 Cookies
    const cookies = await page.cookies();
    fs.writeFileSync('scripts/1001tl_cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
    console.log('\n[COOKIE] 已保存有效会话 Cookies 到 scripts/1001tl_cookies.json');

    await browser.close();
    return parsed;
  } catch (err) {
    console.error('❌ 提取异常:', err.message);
  }
}

testRealSetExtraction();
