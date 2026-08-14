/**
 * 1001Tracklists 多种反爬绕过与抓取方案实机验证脚本
 */

const TEST_SET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';
const TEST_SET_URL_2 = 'https://www.1001tracklists.com/tracklist/2w14q43k/martin-garrix-mainstage-ultra-music-festival-miami-united-states-2024-03-24.html';

async function testMethods() {
  console.log('========================================================================');
  console.log('       1001Tracklists 真实现场抓取与反爬绕过可行性多方案对比验证');
  console.log('========================================================================\n');
  console.log(`目标测试 Set 1: ${TEST_SET_URL}`);
  console.log(`目标测试 Set 2: ${TEST_SET_URL_2}\n`);

  const results = [];

  // 方案 1: 原生 Node.js fetch (直连无伪装)
  try {
    console.log('▶ [方案 1] 测试原生 fetch 直连...');
    const res = await fetch(TEST_SET_URL, {
      headers: { 'User-Agent': 'Node-Fetch/3.0' }
    });
    const status = res.status;
    const text = await res.text();
    const isCloudflare = text.includes('cf-browser-verification') || text.includes('Cloudflare') || text.includes('Just a moment');
    const hasTracks = /class="tlpTog"|itemprop="tracks"/i.test(text);
    console.log(`   HTTP 状态: ${status} | Cloudflare 拦截: ${isCloudflare} | 包含曲目内容: ${hasTracks}`);
    results.push({ method: '方案 1: 原生直连 fetch', status: `${status}`, bypassed: !isCloudflare && hasTracks, notes: isCloudflare ? '触发 Cloudflare 403 盾' : (hasTracks ? '成功' : '无曲目') });
  } catch (err) {
    console.log(`   请求异常: ${err.message}`);
    results.push({ method: '方案 1: 原生直连 fetch', status: 'ERR', bypassed: false, notes: err.message });
  }

  // 方案 2: 全拟真 Chrome 124 浏览器指纹 Headers (包含 Sec-CH-UA, Referer, Accept-Encoding)
  try {
    console.log('\n▶ [方案 2] 测试全拟真 Chrome 124 真实浏览器请求头...');
    const res = await fetch(TEST_SET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    const status = res.status;
    const text = await res.text();
    const isCloudflare = text.includes('cf-browser-verification') || text.includes('Cloudflare') || text.includes('Just a moment');
    const hasTracks = /class="tlpTog"|itemprop="tracks"|tlpItem/i.test(text);
    console.log(`   HTTP 状态: ${status} | Cloudflare 拦截: ${isCloudflare} | 包含曲目内容: ${hasTracks}`);
    results.push({ method: '方案 2: 拟真 Chrome 请求头', status: `${status}`, bypassed: !isCloudflare && hasTracks, notes: isCloudflare ? 'TLS 指纹被 Cloudflare 识别拦截' : (hasTracks ? '成功提取' : '无曲目') });
  } catch (err) {
    console.log(`   请求异常: ${err.message}`);
    results.push({ method: '方案 2: 拟真 Chrome 请求头', status: 'ERR', bypassed: false, notes: err.message });
  }

  // 方案 3: Jina AI Reader 协议 (专为 LLM 与 Agent 穿透 Cloudflare 设计的 Markdown 渲染服务)
  try {
    console.log('\n▶ [方案 3] 测试 Jina AI Reader (r.jina.ai) 穿透服务...');
    const jinaUrl = `https://r.jina.ai/${TEST_SET_URL}`;
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const status = res.status;
    const text = await res.text();
    const isCloudflare = text.includes('cf-browser-verification') || text.includes('Just a moment...');
    // 检查是否抓取到了实际歌名与序号，例如 "01 Culture Shock" 或 "02 Sub Focus"
    const trackCount = (text.match(/\d{1,3}\s+[-–—]\s+|\[\d{1,3}\]|\b\d{1,2}\s+[A-Z]/g) || []).length;
    const hasArtist = text.includes('Culture Shock') || text.includes('Renaissance') || text.includes('Rampage');
    console.log(`   HTTP 状态: ${status} | 页面长度: ${text.length} 字符 | 匹配到艺人/现场特征: ${hasArtist}`);
    if (text.length > 500) {
      console.log(`   内容前 300 字符预览:\n${text.slice(0, 300)}...`);
    }
    results.push({
      method: '方案 3: Jina Reader 渲染引擎',
      status: `${status}`,
      bypassed: !isCloudflare && text.length > 500 && hasArtist,
      notes: text.length > 500 && hasArtist ? `成功穿透！捕获 ${text.length} 字符完整文本` : '受限'
    });
  } catch (err) {
    console.log(`   请求异常: ${err.message}`);
    results.push({ method: '方案 3: Jina Reader 渲染引擎', status: 'ERR', bypassed: false, notes: err.message });
  }

  // 方案 4: AllOrigins 代理网关
  try {
    console.log('\n▶ [方案 4] 测试 AllOrigins 代理网关...');
    const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(TEST_SET_URL)}`;
    const res = await fetch(allOriginsUrl);
    const status = res.status;
    const text = await res.text();
    const isCloudflare = text.includes('Cloudflare') || text.includes('Just a moment');
    const hasTracks = /tlpItem|itemprop="tracks"/i.test(text);
    console.log(`   HTTP 状态: ${status} | 包含曲目特征: ${hasTracks}`);
    results.push({ method: '方案 4: AllOrigins Proxy', status: `${status}`, bypassed: !isCloudflare && hasTracks, notes: isCloudflare ? '代理端被拦截' : (hasTracks ? '成功' : '空或拦截') });
  } catch (err) {
    console.log(`   请求异常: ${err.message}`);
    results.push({ method: '方案 4: AllOrigins Proxy', status: 'ERR', bypassed: false, notes: err.message });
  }

  // 方案 5: 1001Tracklists 移动版 / AMP / Schema.org JSON-LD 注入探测
  try {
    console.log('\n▶ [方案 5] 测试 1001TL 备用 API / 移动端路由...');
    const mobileUrl = TEST_SET_URL.replace('www.1001tracklists.com', 'm.1001tracklists.com');
    const res = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    const status = res.status;
    const text = await res.text();
    const isCloudflare = text.includes('Cloudflare') || text.includes('Just a moment');
    console.log(`   HTTP 状态: ${status} | Cloudflare 拦截: ${isCloudflare}`);
    results.push({ method: '方案 5: 移动端/AMP 路由', status: `${status}`, bypassed: !isCloudflare, notes: isCloudflare ? '移动端同样受盾保护' : '可访问' });
  } catch (err) {
    console.log(`   请求异常: ${err.message}`);
    results.push({ method: '方案 5: 移动端/AMP 路由', status: 'ERR', bypassed: false, notes: err.message });
  }

  console.log('\n========================================================================');
  console.log('                      抓取方案可行性测试总结');
  console.log('========================================================================');
  console.table(results);
  console.log('========================================================================\n');
}

testMethods();
