import { fetchNetEaseApi } from "../lib/netease-api.js";
import { scoreCandidateSong } from "../lib/dj-agent/track-matcher.js";

async function test() {
  const res = await fetchNetEaseApi("/cloudsearch/pc", {
    params: { s: "Sub Focus X-Ray Remix", type: 1, limit: 10, offset: 0 },
  });
  console.log("Songs returned for 'Sub Focus X-Ray Remix':");
  (res?.result?.songs || []).forEach(s => {
    const art = (s.ar || s.artists || []).map(a => a.name).join(" & ");
    console.log(`- ID: ${s.id} | ${art} - ${s.name}`);
  });
}

test();
