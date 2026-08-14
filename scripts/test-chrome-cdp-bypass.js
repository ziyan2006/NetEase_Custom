import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';
const DEBUG_PORT = 9222;

function httpGetLocal(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port: DEBUG_PORT,
      path: urlPath,
      headers: { 'Host': `127.0.0.1:${DEBUG_PORT}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
  });
}

async function testChromeCDP() {
  console.log('========================================================================');
  console.log('       Chrome DevTools Protocol (CDP) 真实无头动态过盾与曲目提取测试');
  console.log('========================================================================\n');

  console.log(`[1] 启动后台 Chrome CDP 实例 (Port: ${DEBUG_PORT})...`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--user-data-dir=C:\\Users\\30519\\AppData\\Local\\Temp\\chrome_dj_test_profile',
    TARGET_URL,
  ]);

  // 等待 Chrome 启动并就绪
  await new Promise((r) => setTimeout(r, 3000));

  try {
    console.log('[2] 请求本地 CDP 端口 /json/version 与 /json/list...');
    const version = await httpGetLocal('/json/version');
    console.log('   Chrome 版本信息:', version?.Browser || version);

    const tabs = await httpGetLocal('/json/list');
    console.log('   检测到打开的 Tab 数量:', Array.isArray(tabs) ? tabs.length : 0);

    if (Array.isArray(tabs) && tabs.length > 0) {
      console.log(`   初始 Tab URL: ${tabs[0].url}`);
      console.log(`   初始 Tab Title: "${tabs[0].title}"`);
    }

    console.log('\n[3] 正在等待 Cloudflare Turnstile 验证与页面自动跳转 (等待 8 秒)...');
    await new Promise((r) => setTimeout(r, 8000));

    const updatedTabs = await httpGetLocal('/json/list');
    if (Array.isArray(updatedTabs) && updatedTabs.length > 0) {
      const activeTab = updatedTabs.find(t => t.type === 'page') || updatedTabs[0];
      console.log(`\n🎉 8 秒后当前 Tab 状态:`);
      console.log(`   URL: ${activeTab.url}`);
      console.log(`   Title: "${activeTab.title}"`);

      const hasForwarded = !activeTab.title.includes("1001Tracklists ⋅ The World's Leading") && activeTab.title.includes('Culture Shock');
      console.log(`   是否成功完成过盾并进入现场详情页: ${hasForwarded ? '✅ 成功' : '⚠️ 需进一步渲染'}`);
    }
  } catch (err) {
    console.error('CDP 请求异常:', err.message);
  } finally {
    chromeProc.kill();
    console.log('\n[DONE] Chrome 实例已退出');
  }
}

testChromeCDP();
