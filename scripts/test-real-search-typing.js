import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

async function testRealSearchTyping(query = 'Culture Shock') {
  console.log('========================================================================');
  console.log(`       1001Tracklists 真实搜索框键入与结果解析: "${query}"`);
  console.log('========================================================================\n');

  const { browser, page } = await connect({
    headless: false,
    args: ['--window-size=1280,900'],
    turnstile: true,
  });

  try {
    console.log('[1] 正在打开 1001Tracklists 主页...');
    await page.goto('https://www.1001tracklists.com/', { waitUntil: 'load', timeout: 35000 });

    console.log('[2] 等待搜索框出现并聚焦...');
    await page.waitForSelector('#sBoxInput', { timeout: 10000 });
    await page.click('#sBoxInput');

    console.log(`[3] 输入关键词: "${query}" 并回车...`);
    await page.type('#sBoxInput', query, { delay: 100 });
    await page.keyboard.press('Enter');

    console.log('[4] 等待搜索结果页面加载与跳转 (最多 10 秒)...');
    await new Promise(r => setTimeout(r, 6000));

    const currentUrl = page.url();
    const currentTitle = await page.title();
    console.log(`\n🎉 跳转后 URL: ${currentUrl}`);
    console.log(`页面标题: "${currentTitle}"`);

    // 提取搜索结果中的所有 Setlist 候选卡片
    const searchResults = await page.evaluate(() => {
      const list = [];
      // 遍历所有可能的现场卡片容器 (例如 .bItm, .bTitle, a[href*="/tracklist/"])
      const links = document.querySelectorAll('a[href*="/tracklist/"]');
      links.forEach((a, idx) => {
        const href = a.getAttribute('href');
        const text = a.innerText.trim();
        if (href && href.startsWith('/tracklist/') && text && text.length > 5 && !text.includes('1001Tracklists')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.1001tracklists.com${href}`;
          if (!list.some(item => item.url === fullUrl)) {
            // 查找周围的日期或地点信息
            const parent = a.closest('.bItm, .cRow, .fTab, div');
            const dateSpan = parent ? parent.querySelector('.date, .fontS, span') : null;
            list.push({
              index: list.length + 1,
              title: text,
              url: fullUrl,
              date: dateSpan ? dateSpan.innerText.trim() : '',
            });
          }
        }
      });
      return list;
    });

    console.log('\n========================================================================');
    console.log(`🎉 成功从 1001Tracklists 真实搜索接口获取到 ${searchResults.length} 场候选演出！`);
    console.log('========================================================================\n');
    searchResults.slice(0, 10).forEach(s => {
      console.log(`   🎪 [#${s.index}] ${s.title}`);
      console.log(`       🔗 URL: ${s.url}`);
      if (s.date) console.log(`       📅 信息: ${s.date}`);
    });

    await browser.close();
    return searchResults;
  } catch (err) {
    console.error('搜索异常:', err.message);
  }
}

testRealSearchTyping('Culture Shock');
