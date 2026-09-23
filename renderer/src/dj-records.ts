// Static module descriptions preserve the source archive renderer's visual
// structure. Song, playlist, account, and export data comes from live services.
const source = "https://github.com/LBEILC/RhineLabWallpaper";

export const djPreview = {
  title: "尚未载入曲目",
  artist: "",
  album: "",
  cover: "",
};

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
      ["工作台概览", "DJ WORKSPACE", "播放器、账号状态与 DJ 功能入口共用一个工作空间。", "保留进入动画和三维场景", "在线搜索、云端歌单、Agent 与导出目录可直接进入", "业务状态由对应服务实时提供"],
      ["播放状态", "PLAYER STATUS", "全局播放器展示当前队列曲目与实际播放进度。", "播放或暂停当前曲目", "上一首、下一首与拖动进度", "曲目元数据来自当前队列"],
      ["账号状态", "ACCOUNT STATUS", "网易云账号状态显示在终端右上角，登录后启用云端能力。", "扫码或官方窗口登录", "验证本机登录状态", "未登录时显示受限状态"],
    ],
  },
  {
    category: "AI DJ 助手",
    items: [
      ["Copilot 会话", "DJ COPILOT", "Agent 对话通过本机服务流式执行，并持久化会话与工具记录。", "输入 Setlist 或排歌需求", "切换并恢复会话", "查看工具与结构化曲目结果"],
      ["1001TL 现场解析", "LIVE SET PARSER", "解析现场曲目单并为曲目匹配网易云音乐结果。", "导入链接或曲目文本", "查看匹配候选", "创建网易云歌单"],
      ["Camelot 调性建议", "CAMELOT STUDY", "基于曲目元数据展示 Camelot 调性与 BPM 衔接建议。", "查看调性信息", "分析相邻曲目", "人工确认后编排"],
    ],
  },
  {
    category: "在线搜索歌曲",
    items: [
      ["歌曲检索", "TRACK SEARCH", "按歌曲名、歌手或专辑检索网易云曲库。", "输入搜索词", "查看在线曲库结果", "按权限试听或加入歌单"],
      ["搜索结果", "SEARCH RESULTS", "在线搜索结果支持试听、查看曲目详情与加入目标歌单。", "查看曲目详情", "试听单曲", "添加到目标歌单"],
      ["当前播放曲目", "TRACK PREVIEW", "展示共享播放器当前曲目的封面与元数据。", "显示当前播放曲目", "查看真实封面与作者", "没有播放曲目时显示等待状态"],
    ],
  },
  {
    category: "云端歌单",
    items: [
      ["歌单索引", "PLAYLIST INDEX", "登录后从网易云读取歌单列表，搜索、创建并浏览歌单详情。", "浏览与搜索歌单", "新建歌单", "查看歌单曲目"],
      ["歌单详情", "PLAYLIST DETAIL", "歌单详情从网易云读取曲目，并统一操作播放、编辑与导出。", "检查曲目顺序", "添加或移除曲目", "导出此歌单"],
      ["导出进度", "EXPORT PROGRESS", "歌单导出通过服务端事件流报告真实进度与结果。", "显示总体进度", "列出当前曲目", "显示成功与失败数量"],
    ],
  },
  {
    category: "导出根目录",
    items: [
      ["目标路径", "OUTPUT ROOT", "导出根目录保存在本机设置，可输入路径或通过 Electron 目录窗口选择。", "输入本地路径", "浏览目录", "保存导出位置"],
      ["歌单文件夹", "PLAYLIST FOLDER", "导出服务在根目录下按歌单创建文件夹并顺序写入曲目。", "按歌单命名", "保持曲目顺序", "显示冲突与失败结果"],
      ["导出格式", "EXPORT FORMAT", "当前导出接口按已实现的音频格式与服务端音质设置处理。", "显示音质信息", "检查可用目录", "按服务端结果报告状态"],
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
      clearance: "MODULE",
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
