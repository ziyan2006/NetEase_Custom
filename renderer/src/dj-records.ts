// Sample records for the visual prototype. They preserve the source archive
// renderer's data shape without presenting invented tracks as real matches.
const source = "https://github.com/LBEILC/RhineLabWallpaper";
const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#ddd8cb"/><stop offset="1" stop-color="#aaa394"/></linearGradient></defs><rect width="320" height="320" fill="url(#p)"/><circle cx="225" cy="94" r="48" fill="#bd8551"/><path d="M-20 250 132 64l54 65-146 179zm115 91 127-156 73 89-55 68z" fill="#262a26"/><path d="M0 24h320M0 296h320" stroke="#f4f1e9" stroke-width="3"/><text x="22" y="48" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="5" fill="#20231f">YESMUSIC / 01</text><text x="22" y="283" font-family="Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="4" fill="#f4f1e9">PREVIEW TRACK</text></svg>`;
const cover = `data:image/svg+xml,${encodeURIComponent(coverSvg)}`;
export const djPlaceholderCover = cover;

export const djPreview = {
  title: "尚未载入曲目",
  artist: "",
  album: "",
  cover: "",
};
export const djDemoTracks = ["示例曲目 A", "示例曲目 B", "示例曲目 C"]
  .map(title => ({ title, artist: "示例艺术家 / 待接入", album: "试听信息待接入" }));

export function setDjPreview(track: { title: string; artist?: string; album?: string; coverUrl?: string | null } | null) {
  djPreview.title = track?.title || "尚未载入曲目";
  djPreview.artist = track?.artist || "";
  djPreview.album = track?.album || "";
  djPreview.cover = track?.coverUrl || "";
}

const groups = [
  {
    category: "工作台档案",
    items: [
      ["工作台概览", "DJ WORKSPACE", "汇集时钟、事项、功能导航和常驻播放器的视觉结构。", "保留进入动画和三维阵列", "四个入口与原版 YesMusic 对应", "业务数据接入后替换示例状态"],
      ["播放状态", "PLAYER STATUS", "正在试听是全局播放器组件，不作为独立功能入口。", "显示选中曲目", "显示播放进度", "后续接入真实音频"],
      ["账号状态", "ACCOUNT STATUS", "网易云账号入口位于终端右上角。当前仅展示未登录的视觉状态。", "扫码登录", "官方窗口登录", "后续接入原版账号流程"],
    ],
  },
  {
    category: "AI DJ 助手",
    items: [
      ["Copilot 会话", "DJ COPILOT", "原版 AI DJ 助手包含会话、模型配置与自然语言排歌。此原型尚未发送请求。", "输入 Setlist 或排歌需求", "保留会话上下文", "显示工具执行记录"],
      ["1001TL 现场解析", "LIVE SET PARSER", "1001Tracklists 链接与现场曲目解析属于 AI DJ 助手内部流程。", "验证现场数据源", "解析真实曲目", "匹配网易云曲库"],
      ["Camelot 调性建议", "CAMELOT STUDY", "调性轮盘与 BPM 过渡建议属于 AI DJ 助手能力。", "显示已验证元数据", "分析相邻曲目", "人工确认衔接"],
    ],
  },
  {
    category: "在线搜索歌曲",
    items: [
      ["歌曲检索", "TRACK SEARCH", "对应原版的网易云曲库在线搜索，可按歌曲名、歌手或专辑查询。", "输入搜索词", "查看曲库结果", "来源于网易云"],
      ["搜索结果", "SEARCH RESULTS", "原版搜索结果可以试听，并把曲目加入云端歌单。", "查看曲目详情", "试听单曲", "添加到目标歌单"],
      ["当前播放曲目", "TRACK PREVIEW", "打开此档案可查看队列当前歌曲、真实封面和作者信息。", "显示当前播放曲目", "查看封面与作者", "状态来自真实音频"],
    ],
  },
  {
    category: "云端歌单",
    items: [
      ["歌单索引", "PLAYLIST INDEX", "网易云歌单列表的三维档案映射示意。实际歌单在后续接入账号数据后显示。", "浏览与搜索歌单", "新建歌单", "删除歌单"],
      ["歌单详情", "PLAYLIST DETAIL", "原版详情页支持查看曲目、试听、编辑和一键导出。", "检查曲目顺序", "添加或移除曲目", "导出此歌单"],
      ["导出进度", "EXPORT PROGRESS", "歌单批量导出在原版中显示逐曲进度与成功失败数量。", "显示总体进度", "列出当前曲目", "完成后查看结果"],
    ],
  },
  {
    category: "导出根目录",
    items: [
      ["目标路径", "OUTPUT ROOT", "原版允许填写 Windows 本地目录，或通过 Electron 窗口浏览选择。", "输入本地路径", "浏览目录", "保存导出位置"],
      ["歌单文件夹", "PLAYLIST FOLDER", "导出歌单时在根目录下按歌单建立独立文件夹。", "按歌单命名", "保持曲目顺序", "避免重复文件"],
      ["导出格式", "EXPORT FORMAT", "此原型只保留歌单导出相关设置。", "显示音质信息", "检查可用目录", "后续接入原版导出流程"],
    ],
  },
] as const;

export const djContent = {
  categories: groups.map(group => group.category),
  columns: ["在线搜索歌曲", "云端歌单", "工作台档案", "AI DJ 助手", "导出根目录"],
  records: groups.flatMap(group => group.items.map(([title, en, abstract, ...findings], index) => {
    const track = en === "TRACK PREVIEW";
    return {
      id: `YM-${String(groups.slice(0, groups.indexOf(group)).reduce((sum, entry) => sum + entry.items.length, 0) + index + 1).padStart(3, "0")}`,
      get title() { return track ? djPreview.title : title; },
      en,
      department: group.category,
      category: group.category,
      get date() { return track ? "当前播放状态" : "视觉原型 / 模块说明"; },
      get lead() { return track ? djPreview.artist || "播放曲目" : "YesMusic DJ Workspace"; },
      clearance: "PROTOTYPE",
      abstract,
      findings: [...findings],
      source,
      ...(track ? {
        get artist() { return djPreview.artist; },
        get album() { return djPreview.album; },
        get cover() { return djPreview.cover; },
      } : {}),
    };
  })),
};
