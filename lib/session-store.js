/**
 * 对话会话存储层 (Session Store) — SQLite 持久化
 * 基于 Node.js 原生内置 node:sqlite (DatabaseSync), 提供会话 CRUD 与消息的持久化读写。
 * 零外部二进制依赖，完美兼容 Electron / Node.js 跨平台打包。
 *
 * 数据模型:
 * - sessions: 会话元信息 (id, title, created_at, updated_at)
 * - messages: 消息记录 (role/content/reasoning/card_data/tool_events JSON 字段)
 *
 * 设计要点:
 * - WAL 模式 + busy_timeout + foreign_keys, 支持读写并发与事务安全
 * - 首条用户消息自动生成会话标题 (前 20 字)
 * - 删除会话级联删除消息 (外键 ON DELETE CASCADE)
 * - cardData / toolEvents 以 JSON 文本存储, 读取时解析
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "sessions.db");
const DEFAULT_TITLE = "新对话";

export class SessionStore {
  /**
   * @param {string} [dbPath] - SQLite 文件路径, 默认 data/sessions.db (可用环境变量 SESSION_DB_PATH 覆盖)
   */
  constructor(dbPath = process.env.SESSION_DB_PATH || DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '${DEFAULT_TITLE}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        card_data TEXT NOT NULL DEFAULT '',
        tool_events TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_time
        ON messages(session_id, created_at);
    `);
  }

  /**
   * 创建新会话
   * @param {string} [title] - 会话标题, 默认「新对话」
   * @returns {object|null} 会话对象
   */
  createSession(title = DEFAULT_TITLE) {
    const id = `sess_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .prepare("INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, title || DEFAULT_TITLE, now, now);
    return this.getSession(id);
  }

  /**
   * 获取单个会话
   * @param {string} id
   * @returns {object|null}
   */
  getSession(id) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return row ? mapSession(row) : null;
  }

  /**
   * 会话列表 (按最近更新排序, 附带消息数)
   * @param {number} [limit]
   * @returns {Array<object>}
   */
  listSessions(limit = 100) {
    const rows = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
         FROM sessions s
         ORDER BY s.updated_at DESC
         LIMIT ?`
      )
      .all(limit);
    return rows.map((r) => ({ ...mapSession(r), messageCount: Number(r.message_count || 0) }));
  }

  /**
   * 重命名会话
   * @param {string} id
   * @param {string} title
   * @returns {boolean} 是否成功
   */
  renameSession(id, title) {
    const t = (title || "").trim();
    if (!t) return false;
    const res = this.db
      .prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(t, Date.now(), id);
    return res.changes > 0;
  }

  /**
   * 删除会话 (级联删除其全部消息)
   * @param {string} id
   * @returns {boolean} 是否成功
   */
  deleteSession(id) {
    const res = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return res.changes > 0;
  }

  /**
   * 读取会话全部消息 (按时间正序)
   * @param {string} sessionId
   * @returns {Array<object>}
   */
  getMessages(sessionId) {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(sessionId);
    return rows.map(mapMessage);
  }

  /**
   * 获取单条消息
   * @param {string} id
   * @returns {object|null}
   */
  getMessage(id) {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
    return row ? mapMessage(row) : null;
  }

  /**
   * 向会话追加一条消息 (自动刷新会话 updated_at)
   * @param {string} sessionId
   * @param {object} params
   * @param {'user'|'assistant'|'system'} params.role
   * @param {string} [params.content]
   * @param {string} [params.reasoning]
   * @param {object|null} [params.cardData] - 歌单卡片 (JSON 序列化存储)
   * @param {Array|null} [params.toolEvents] - 工具调用事件序列 (JSON 序列化存储)
   * @returns {object} 消息对象
   */
  appendMessage(sessionId, { role, content = "", reasoning = "", cardData = null, toolEvents = null }) {
    const id = `msg_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, reasoning, card_data, tool_events, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionId,
        role,
        content || "",
        reasoning || "",
        cardData ? JSON.stringify(cardData) : "",
        toolEvents ? JSON.stringify(toolEvents) : "",
        now
      );
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);

    // 首条用户消息自动生成会话标题 (取前 20 字)
    if (role === "user" && content && content.trim()) {
      const session = this.getSession(sessionId);
      if (session && session.title === DEFAULT_TITLE) {
        const autoTitle = content.trim().replace(/\s+/g, " ").slice(0, 20);
        this.db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(autoTitle, sessionId);
      }
    }

    return this.getMessage(id) || { id, sessionId, role, content, reasoning, cardData, toolEvents, createdAt: now };
  }

  /** 关闭数据库连接 */
  close() {
    this.db.close();
  }
}

function mapSession(row) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    cardData: row.card_data ? JSON.parse(row.card_data) : null,
    toolEvents: row.tool_events ? JSON.parse(row.tool_events) : [],
    createdAt: row.created_at,
  };
}
