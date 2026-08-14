import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

const TARGET_URL = 'https://www.1001tracklists.com/tracklist/1zrx5s11/culture-shock-dome-stage-rampage-open-air-belgium-2023-07-01.html';

async function debug1001TLNetwork() {
  console.log('========================================================================');
  console.log('       1001Tracklists 网络请求与动态 DOM 抓取深度分析');
  console.log('========================================================================\n');

  try {
    const { browser, page } = await connect({
      headless: false,
      args: ['--window-size=1280,900'],
      turnstile: true,
    });

    const networkRequests = [];
    page.on('response', async (response) => {
      const url = response.url();
      const status = response.status();
      const type = response.request().resourceType();
      if (type === 'xhr' || type === 'fetch' || type === 'document' || url.includes('ajax') || url.includes('tracklist')) {
        console.log(`[NET ${status}] [${type}] ${url.slice(0, 100)}`);
        networkRequests.push({ url, status, type });
      }
    });

    console.log(`[GOTO] 打开 ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 45000 });

    console.log('[WAIT] 等待 15 秒并监控页面动态渲染与网络交互...');
    for (let i = 1; i <= 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      
      const status = await page.evaluate(() => {
        const title = document.title || '';
        const bodyLen = document.body ? document.body.innerHTML.length : 0;
        const divs = document.querySelectorAll('div').length;
        const tracks = document.querySelectorAll('.tlpItem, .tlpTog, .artItm, .trackValue, [id^="tl_"]').length;
        const textHasArtist = document.body ? document.body.innerText.includes('Culture Shock') : false;
        return { title, bodyLen, divs, tracks, textHasArtist };
      });

      console.log(`   [第 ${i} 秒] Title: "${status.title.slice(0, 40)}" | BodyLen: ${status.bodyLen} | Divs: ${status.divs} | Tracks: ${status.tracks} | 文本包含艺人: ${status.textHasArtist}`);

      if (status.tracks > 0) {
        console.log('\n🎯 [FOUND TRACKS] 成功检测到曲目节点生成！');
        break;
      }
    }

    const finalHtml = await page.content();
    fs.writeFileSync('scripts/culture_shock_debug_final.html', finalHtml, 'utf-8');
    console.log(`[DUMP] 保存最终 HTML (${finalHtml.length} 字符)`);

    // 检查页面提取
    const tracks = await page.evaluate(() => {
      const list = [];
      const items = document.querySelectorAll('.tlpItem, .tlpTog');
      items.forEach((item, idx) => {
        const tv = item.querySelector('.trackValue, .tlpValue');
        const art = item.querySelector('.artItm, .artistValue');
        const remix = item.querySelector('.remixValue');
        if (tv || art) {
          list.push({
            idx: idx + 1,
            artist: art ? art.innerText.trim() : '',
            title: tv ? tv.innerText.trim() : '',
            remix: remix ? remix.innerText.trim() : ''
          });
        }
      });
      return list;
    });

    console.log(`\n🎉 提取曲目数量: ${tracks.length} 首`);
    tracks.slice(0, 10).forEach(t => console.log(`   🎵 #${t.idx} ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''}`));

    await browser.close();
  } catch (err) {
    console.error('Debug 异常:', err.message);
  }
}

debug1001TLNetwork();
