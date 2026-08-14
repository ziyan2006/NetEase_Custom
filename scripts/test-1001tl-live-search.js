import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

async function search1001Tracklists(artistQuery = 'Culture Shock') {
  console.log('========================================================================');
  console.log(`       1001Tracklists 原站实时搜索接口测试: "${artistQuery}"`);
  console.log('========================================================================\n');

  const searchUrl = `https://www.1001tracklists.com/search/result.php?search=${encodeURIComponent(artistQuery)}`;
  console.log(`[TARGET SEARCH URL] ${searchUrl}`);

  const { browser, page } = await connect({
    headless: false,
    args: ['--window-size=1280,900'],
    turnstile: true,
  });

  try {
    console.log('[NAVIGATE] 正在请求 1001Tracklists 搜索结果页...');
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 45000 });

    console.log('[WAIT] 等待搜索结果渲染与 Turnstile 放行...');
    for (let i = 1; i <= 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const hasResults = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/tracklist/"]');
        const bItms = document.querySelectorAll('.bItm, .fTab, .tlpItem, [id^="tl_"]');
        return { linksCount: links.length, bItmsCount: bItms.length };
      });
      console.log(`   [第 ${i} 秒] 发现 /tracklist/ 链接: ${hasResults.linksCount} | 结果卡片: ${hasResults.bItmsCount}`);
      if (hasResults.linksCount > 0) break;
    }

    const html = await page.content();
    fs.writeFileSync('scripts/1001tl_search_dump.html', html, 'utf-8');

    // 解析搜索结果中的现场候选
    const searchResults = await page.evaluate((query) => {
      const sets = [];
      // 遍历所有链接中包含 /tracklist/ 的元素
      const links = document.querySelectorAll('a[href*="/tracklist/"]');
      links.forEach((a) => {
        const href = a.getAttribute('href');
        const text = a.innerText.trim();
        // 过滤掉无效链接
        if (href && href.startsWith('/tracklist/') && text && text.length > 5 && !text.includes('1001Tracklists')) {
          // 查找该链接所在容器的日期或副标题
          const parent = a.closest('.bItm, .cRow, tr, div');
          const dateNode = parent ? parent.querySelector('.date, .fontS, span') : null;
          const dateText = dateNode ? dateNode.innerText.trim() : '';

          const fullUrl = `https://www.1001tracklists.com${href}`;
          if (!sets.some(s => s.url === fullUrl)) {
            sets.push({
              title: text,
              url: fullUrl,
              date: dateText,
            });
          }
        }
      });

      return {
        query,
        count: sets.length,
        sets: sets.slice(0, 10)
      };
    }, artistQuery);

    console.log('\n========================================================================');
    console.log(`🎉 [SUCCESS] 成功从 1001Tracklists 搜索出 ${searchResults.count} 场真实候选演出！`);
    console.log('========================================================================\n');
    searchResults.sets.forEach((s, idx) => {
      console.log(`   🎪 [${idx + 1}] ${s.title}`);
      console.log(`       🔗 URL: ${s.url}`);
      if (s.date) console.log(`       📅 日期/信息: ${s.date}`);
    });

    await browser.close();
    return searchResults;
  } catch (err) {
    console.error('搜索异常:', err.message);
  }
}

search1001Tracklists('Culture Shock');
