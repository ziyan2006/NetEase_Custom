import { chatCompletion, DEFAULT_LLM_CONFIG } from '../lib/dj-agent/llm-client.js';

async function testDynamicSetSearch() {
  const prompt = `请列出电子音乐艺人/DJ "Culture Shock" 在 2024~2025 年近期的 3~4 场标志性现场演出 (Live Sets / Festivals / Clubs)。
请以严格 JSON 格式返回 (不要包含多余废话)，格式如下：
{
  "artist": "Culture Shock",
  "sets": [
    {
      "id": "cs_2024_1",
      "title": "Culture Shock @ Rampage Open Air 2024",
      "event": "Rampage Open Air",
      "date": "2024-07-06",
      "venue": "Kristalpark, Belgium",
      "trackCount": 35,
      "description": "2024 欧洲最大 Bass 音乐节现场",
      "tracks": [
        "Culture Shock - Renaissance",
        "Culture Shock - Visions",
        "Culture Shock - Get To Me",
        "Culture Shock - Breathe",
        "Sub Focus - Solar System",
        "Dimension - DJ Turn It Up",
        "Culture Shock - Rise (Extended Mix)",
        "1991 - Chant",
        "Wilkinson - Afterglow"
      ]
    }
  ]
}`;

  const res = await chatCompletion({
    messages: [{ role: 'user', content: prompt }],
    config: DEFAULT_LLM_CONFIG,
  });

  console.log('DeepSeek Raw Content:\n', res.content);
}

testDynamicSetSearch();
