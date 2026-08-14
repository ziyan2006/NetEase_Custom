import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

const GARRIX_URL = 'https://www.1001tracklists.com/tracklist/2w14q43k/martin-garrix-mainstage-ultra-music-festival-miami-united-states-2024-03-24.html';

async function testGarrixSet() {
  console.log('========================================================================');
  console.log('       1001Tracklists 真实现场全音轨提取测试 (Martin Garrix Ultra 2024)');
  console.log('========================================================================\n');

  const { browser, page } = await connect({
    headless: false,
    args: ['--window-size=1280,900'],
    turnstile: true,
  });

  try {
    console.log(`[GOTO] 打开 ${GARRIX_URL}...`);
    await page.goto(GARRIX_URL, { waitUntil: 'load', timeout: 45000 });

    console.log('[WAIT] 等待 DOM 渲染与 Turnstile 自动放行 (最多 15 秒)...');
    let found = false;
    for (let i = 1; i <= 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const count = await page.evaluate(() => document.querySelectorAll('.tlpItem, .tlpTog').length);
        console.log(`   [第 ${i} 秒] 检测到曲目节点: ${count}`);
        if (count > 5) {
          found = true;
          break;
        }
      } catch (navErr) {
        console.log(`   [第 ${i} 秒] 页面正在自动跳转放行...`);
      }
    }

    const setInfo = await page.evaluate(() => {
      const pageTitle = document.title;
      const list = [];
      const items = document.querySelectorAll('.tlpItem, .tlpTog');
      items.forEach((item, idx) => {
        const tv = item.querySelector('.trackValue, .tlpValue');
        const art = item.querySelector('.artItm, .artistValue');
        const remix = item.querySelector('.remixValue');
        const cue = item.querySelector('.cue');
        if (tv || art) {
          list.push({
            trackNum: idx + 1,
            time: cue ? cue.innerText.trim() : '',
            artist: art ? art.innerText.trim() : '',
            title: tv ? tv.innerText.trim() : '',
            remix: remix ? remix.innerText.trim() : '',
            fullText: item.innerText.replace(/\n+/g, ' ').trim()
          });
        }
      });
      return { title: pageTitle, count: list.length, tracks: list };
    });

    console.log('\n========================================================================');
    console.log(`🎉 [SUCCESS] 提取到 Martin Garrix 现场 ${setInfo.count} 首真实现场音轨！`);
    console.log(`现场标题: ${setInfo.title}`);
    console.log('========================================================================\n');
    setInfo.tracks.slice(0, 15).forEach(t => {
      console.log(`   🎵 #${t.trackNum} [${t.time || '00:00'}] ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''}`);
    });

    await browser.close();
  } catch (e) {
    console.error('Garrix Set 异常:', e.message);
  }
}

testGarrixSet();
