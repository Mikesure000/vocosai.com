import csv
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
DB_PATH = DATA / "vocos.db"


def load_env_file(path=ROOT / ".env"):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


DEFAULT_BRAND = {
    "name": "轻氧护肤",
    "industry": "新消费护肤",
    "slogan": "成分护肤，科学有效",
    "positioning": "面向敏感肌、熬夜党和功效护肤用户的内容投放决策系统",
}

SEED_DEMANDS = [
    ("人群适配", "敏感肌能不能用？", 89, "rising", "拍摄敏感肌专项内容，邀请达人体验"),
    ("场景需求", "夏天用会不会油？", 72, "rising", "突出清爽吸收场景，补充季节化素材"),
    ("使用教育", "早上用还是晚上用？", 56, "stable", "制作早晚使用教程短视频"),
    ("效果验证", "多久能看到效果？", 48, "stable", "用打卡和周期对比内容建立预期"),
    ("竞品替代", "和竞品比哪个好？", 67, "rising", "做客观竞品对比，突出差异化优势"),
]

SEED_BARRIERS = [
    ("price", "价格偏高，用户不理解贵在哪里", "high", 89, "拆解成分、工艺和长期使用成本"),
    ("trust", "担心无效或踩雷", "high", 67, "用真实评价、第三方验证和长期记录增强信任"),
    ("competitor", "用户频繁拿竞品比较", "medium", 54, "不贬低竞品，围绕差异化场景做对比"),
    ("audience", "不确定自己的肤质是否适合", "medium", 48, "按敏感肌、油皮、干皮分人群讲清楚"),
    ("risk", "担心过敏、爆痘等风险", "medium", 29, "补充安全说明、试用装和售后政策"),
]

SEED_STRATEGIES = [
    (
        "用户不是嫌贵，而是不知道贵在哪里",
        "价格异议转化策略",
        "P0",
        "active",
        "把价格问题拆成成分成本、功效验证和单次使用成本，用 3 条内容连续解释。",
    ),
    (
        "敏感肌专项内容补齐信任缺口",
        "人群适配策略",
        "P1",
        "draft",
        "针对敏感肌用户做使用边界、测试流程和真实反馈内容。",
    ),
    (
        "竞品对比不要攻击，要给选择理由",
        "竞品心智策略",
        "P1",
        "draft",
        "围绕成分、肤感、售后和适用场景做客观比较。",
    ),
]

SEED_COMPETITOR_OPPS = [
    ("润百颜", "品牌认知强、功效感知强", "价格高、品控和客服争议", "用更低试错成本和稳定服务切入", "做客观对比内容，突出成分稳定性和售后体验"),
    ("薇诺娜", "敏感肌心智强、专业背书强", "价格敏感用户流失", "承接同效更亲民的敏感肌需求", "制作敏感肌友好专题和价格对比表"),
    ("珀莱雅", "品牌声量大、渠道覆盖广", "香精和肤感争议", "承接反感香精和敏感肌用户", "做无香精、温和修护专题"),
]

SEED_CONTENT_ITEMS = [
    ("抖音", "贵在哪里：30 秒成分拆解", "价格解释", "用评论原话开头，拆解成分、工艺、单次成本", 1),
    ("小红书", "敏感肌能不能用：真实测试笔记", "人群适配", "封面突出肤质和测试周期，正文写使用边界", 1),
    ("B站", "竞品横评：不拉踩的选择指南", "竞品对比", "长视频结构，按肤感、成分、售后、价格对比", 0),
]

SEED_TEST_PLANS = [
    ("降低价格异议", "用户不是嫌贵，而是不知道贵在哪里", "A: 成分成本拆解; B: 单次使用成本; C: 用户效果证据", "3000", "CTR +20% 且评论价格质疑下降", "planned"),
    ("验证敏感肌内容方向", "敏感肌专项内容补齐信任缺口", "A: 医生背书; B: 达人体验; C: 评论答疑", "2500", "收藏率和私信咨询提升", "planned"),
]

SEED_REVIEWS = [
    ("价格解释内容首轮复盘", "CTR 上升，CVR 小幅上升，价格质疑评论下降", "价值解释有效，但需要补充真实使用证据", "增加用户证言和第三方检测材料"),
    ("敏感肌专题复盘", "收藏率高，转化慢", "教育内容有效，但购买路径不清晰", "在内容末尾增加适用人群和购买入口"),
]

SEED_REPORTS = [
    ("老板版周报", "经营视角", "Top5 动作、核心指标、投入产出判断", "weekly"),
    ("执行版清单", "内容团队", "策略卡、脚本、素材测试变量", "weekly"),
    ("投放版报告", "投放团队", "测试组、预算、放大/停止规则", "weekly"),
    ("竞品版报告", "策略团队", "竞品优势、弱点、我方切入机会", "monthly"),
    ("客户版汇报", "客户/管理层", "结论、证据、下一步计划", "weekly"),
    ("月度复盘", "增长团队", "趋势、归因、知识沉淀", "monthly"),
]

SEED_KNOWLEDGE_TAGS = [
    ("人群", "敏感肌", "高频适配问题，需要明确使用边界"),
    ("障碍", "价格异议", "需要价值解释和成本拆解"),
    ("场景", "夏季清爽", "突出吸收速度和不黏腻"),
    ("卖点", "成分修护", "围绕成分安全、有效和浓度表达"),
    ("竞品", "平替比较", "客观比较，不攻击竞品"),
]


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now():
    return datetime.now().isoformat(timespec="seconds")


def rowdict(row):
    return dict(row) if row else None


BRAND_SCOPED_TABLES = [
    "comments",
    "demands",
    "barriers",
    "strategies",
    "competitor_opps",
    "content_items",
    "test_plans",
    "reviews",
    "reports",
    "knowledge_tags",
    "ai_runs",
    "ai_run_steps",
]


def table_columns(db, table):
    return {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}


def ensure_column(db, table, column, definition):
    if column not in table_columns(db, table):
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def active_brand_id(db):
    row = db.execute("SELECT value FROM app_state WHERE key = 'active_brand_id'").fetchone()
    if row:
        try:
            return int(row["value"])
        except (TypeError, ValueError):
            pass
    return 1


def set_active_brand(db, brand_id):
    db.execute(
        "INSERT INTO app_state (key, value) VALUES ('active_brand_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(brand_id),),
    )


def init_db():
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_state (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS brands (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              industry TEXT NOT NULL DEFAULT '',
              slogan TEXT NOT NULL DEFAULT '',
              positioning TEXT NOT NULL DEFAULT '',
              categories TEXT NOT NULL DEFAULT '[]',
              is_active INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              external_id TEXT,
              content TEXT NOT NULL,
              platform TEXT NOT NULL DEFAULT '抖音',
              category TEXT NOT NULL DEFAULT 'content',
              type TEXT NOT NULL DEFAULT 'demand',
              sentiment TEXT NOT NULL DEFAULT 'neutral',
              labels TEXT NOT NULL DEFAULT '[]',
              author TEXT NOT NULL DEFAULT '匿名用户',
              douyin_id TEXT,
              likes INTEGER NOT NULL DEFAULT 0,
              comment_time TEXT,
              ip_address TEXT,
              is_competitor INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS demands (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              category TEXT NOT NULL,
              text TEXT NOT NULL,
              frequency INTEGER NOT NULL DEFAULT 0,
              trend TEXT NOT NULL DEFAULT 'stable',
              action TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS barriers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              text TEXT NOT NULL,
              severity TEXT NOT NULL DEFAULT 'medium',
              count INTEGER NOT NULL DEFAULT 0,
              solution TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS strategies (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              subtitle TEXT NOT NULL DEFAULT '',
              priority TEXT NOT NULL DEFAULT 'P2',
              status TEXT NOT NULL DEFAULT 'draft',
              body TEXT NOT NULL DEFAULT '',
              evidence TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS competitor_opps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              competitor TEXT NOT NULL,
              strength TEXT NOT NULL DEFAULT '',
              weakness TEXT NOT NULL DEFAULT '',
              opportunity TEXT NOT NULL DEFAULT '',
              action TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS content_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              platform TEXT NOT NULL,
              title TEXT NOT NULL,
              content_type TEXT NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '',
              is_analyzed INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_plans (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              objective TEXT NOT NULL,
              strategy_title TEXT NOT NULL DEFAULT '',
              variants TEXT NOT NULL DEFAULT '',
              budget TEXT NOT NULL DEFAULT '',
              success_rule TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'planned',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reviews (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              result TEXT NOT NULL DEFAULT '',
              attribution TEXT NOT NULL DEFAULT '',
              next_action TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              audience TEXT NOT NULL DEFAULT '',
              scope TEXT NOT NULL DEFAULT '',
              cadence TEXT NOT NULL DEFAULT 'weekly',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_tags (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dimension TEXT NOT NULL,
              tag TEXT NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS brand_profile (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              data TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              provider TEXT NOT NULL DEFAULT 'deepseek',
              model TEXT NOT NULL DEFAULT 'deepseek-chat',
              base_url TEXT NOT NULL DEFAULT '',
              api_key TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mode TEXT NOT NULL,
              status TEXT NOT NULL,
              summary TEXT NOT NULL DEFAULT '',
              tokens INTEGER NOT NULL DEFAULT 0,
              latency_ms INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_run_steps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id INTEGER NOT NULL,
              agent_id TEXT NOT NULL,
              agent_name TEXT NOT NULL,
              layer TEXT NOT NULL,
              status TEXT NOT NULL,
              input_summary TEXT NOT NULL DEFAULT '',
              output_json TEXT NOT NULL DEFAULT '{}',
              error TEXT NOT NULL DEFAULT '',
              records_written INTEGER NOT NULL DEFAULT 0,
              tokens INTEGER NOT NULL DEFAULT 0,
              latency_ms INTEGER NOT NULL DEFAULT 0,
              started_at TEXT NOT NULL,
              finished_at TEXT,
              FOREIGN KEY(run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS import_batches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand_id INTEGER NOT NULL DEFAULT 1,
              source TEXT NOT NULL DEFAULT '',
              mode TEXT NOT NULL DEFAULT 'manual',
              total_rows INTEGER NOT NULL DEFAULT 0,
              inserted_rows INTEGER NOT NULL DEFAULT 0,
              duplicate_rows INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'success',
              run_id INTEGER,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS review_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand_id INTEGER NOT NULL DEFAULT 1,
              source_table TEXT NOT NULL,
              source_id INTEGER NOT NULL,
              title TEXT NOT NULL,
              summary TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'pending',
              confidence INTEGER NOT NULL DEFAULT 70,
              notes TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS briefs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand_id INTEGER NOT NULL DEFAULT 1,
              strategy_id INTEGER,
              title TEXT NOT NULL,
              platform TEXT NOT NULL DEFAULT '',
              objective TEXT NOT NULL DEFAULT '',
              audience TEXT NOT NULL DEFAULT '',
              key_message TEXT NOT NULL DEFAULT '',
              content_outline TEXT NOT NULL DEFAULT '',
              kpi TEXT NOT NULL DEFAULT '',
              budget TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'draft',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS weekly_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand_id INTEGER NOT NULL DEFAULT 1,
              week_start TEXT NOT NULL,
              metrics TEXT NOT NULL DEFAULT '{}',
              summary TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            """
        )
        migrate(db)
        seed(db)


def migrate(db):
    for table in BRAND_SCOPED_TABLES:
        ensure_column(db, table, "brand_id", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(db, "comments", "dedupe_key", "TEXT NOT NULL DEFAULT ''")
    ensure_column(db, "comments", "import_batch_id", "INTEGER")
    ensure_column(db, "strategies", "review_status", "TEXT NOT NULL DEFAULT 'pending'")
    ensure_column(db, "strategies", "confidence", "INTEGER NOT NULL DEFAULT 70")
    ensure_column(db, "demands", "review_status", "TEXT NOT NULL DEFAULT 'pending'")
    ensure_column(db, "barriers", "review_status", "TEXT NOT NULL DEFAULT 'pending'")
    ensure_column(db, "reports", "body", "TEXT NOT NULL DEFAULT ''")
    ensure_column(db, "knowledge_tags", "confidence", "INTEGER NOT NULL DEFAULT 70")

    if db.execute("SELECT COUNT(*) FROM brands").fetchone()[0] == 0:
        row = rowdict(db.execute("SELECT data FROM brand_profile WHERE id = 1").fetchone())
        profile = {}
        if row:
            try:
                profile = json.loads(row["data"])
            except json.JSONDecodeError:
                profile = {}
        db.execute(
            """
            INSERT INTO brands (id, name, industry, slogan, positioning, categories, is_active, created_at, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                profile.get("name") or "默认品牌",
                profile.get("industry") or "未设置行业",
                profile.get("slogan") or "",
                profile.get("positioning") or "",
                json.dumps(["护肤", "内容策略"], ensure_ascii=False),
                now(),
                now(),
            ),
        )
        set_active_brand(db, 1)

    for table in BRAND_SCOPED_TABLES:
        db.execute(f"UPDATE {table} SET brand_id = 1 WHERE brand_id IS NULL OR brand_id = 0")
    db.execute("UPDATE comments SET dedupe_key = COALESCE(NULLIF(dedupe_key, ''), COALESCE(external_id, '') || '|' || author || '|' || content || '|' || COALESCE(comment_time, ''))")

    if db.execute("SELECT COUNT(*) FROM review_items").fetchone()[0] == 0:
        for table, title_col, summary_col, confidence in [
            ("strategies", "title", "body", 76),
            ("demands", "text", "action", 72),
            ("barriers", "text", "solution", 70),
        ]:
            for row in db.execute(f"SELECT id, brand_id, {title_col} AS title, {summary_col} AS summary FROM {table} ORDER BY id DESC LIMIT 20"):
                db.execute(
                    """
                    INSERT INTO review_items (brand_id, source_table, source_id, title, summary, status, confidence, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'pending', ?, '', ?, ?)
                    """,
                    (row["brand_id"], table, row["id"], row["title"], row["summary"], confidence, now(), now()),
                )


def seed(db):
    if db.execute("SELECT COUNT(*) FROM brand_profile").fetchone()[0] == 0:
        db.execute(
            "INSERT INTO brand_profile (id, data, updated_at) VALUES (1, ?, ?)",
            (json.dumps(DEFAULT_BRAND, ensure_ascii=False), now()),
        )

    if db.execute("SELECT COUNT(*) FROM demands").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO demands (category, text, frequency, trend, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_DEMANDS],
        )

    if db.execute("SELECT COUNT(*) FROM barriers").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO barriers (type, text, severity, count, solution, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_BARRIERS],
        )

    if db.execute("SELECT COUNT(*) FROM strategies").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO strategies (title, subtitle, priority, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_STRATEGIES],
        )

    if db.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0:
        sample = ROOT.parent / "sample_comments.csv"
        if sample.exists():
            with sample.open("r", encoding="utf-8-sig", newline="") as f:
                rows = list(csv.DictReader(f))
            insert_comments(db, rows[:80])

    if db.execute("SELECT COUNT(*) FROM competitor_opps").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO competitor_opps (competitor, strength, weakness, opportunity, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_COMPETITOR_OPPS],
        )

    if db.execute("SELECT COUNT(*) FROM content_items").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO content_items (platform, title, content_type, summary, is_analyzed, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_CONTENT_ITEMS],
        )

    if db.execute("SELECT COUNT(*) FROM test_plans").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO test_plans (objective, strategy_title, variants, budget, success_rule, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_TEST_PLANS],
        )

    if db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO reviews (title, result, attribution, next_action, created_at) VALUES (?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_REVIEWS],
        )

    if db.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO reports (title, audience, scope, cadence, created_at) VALUES (?, ?, ?, ?, ?)",
            [(*item, now()) for item in SEED_REPORTS],
        )

    if db.execute("SELECT COUNT(*) FROM knowledge_tags").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO knowledge_tags (dimension, tag, note, created_at) VALUES (?, ?, ?, ?)",
            [(*item, now()) for item in SEED_KNOWLEDGE_TAGS],
        )


def map_value(row, *names, default=""):
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
    for name in names:
        if name in row and row[name] not in (None, ""):
            return str(row[name]).strip()
        key = name.lower()
        if key in lowered and lowered[key] not in (None, ""):
            return str(lowered[key]).strip()
    return default


def classify_comment(content):
    text = content.lower()
    if any(k in text for k in ["贵", "价格", "多少钱", "智商税", "不值"]):
        return "barrier", "negative", ["价格"]
    if any(k in text for k in ["哪里买", "怎么买", "链接", "购买"]):
        return "intent", "neutral", ["购买意图"]
    if any(k in text for k in ["能不能", "可以", "吗", "适合", "怎么用"]):
        return "demand", "neutral", ["使用疑问"]
    if any(k in text for k in ["好用", "有效", "喜欢"]):
        return "praise", "positive", ["好评"]
    return "demand", "neutral", []


def normalize_row(row):
    content = map_value(row, "content", "评论内容", "comment", "text", "内容")
    if not content:
        return None

    ctype = map_value(row, "type", "评论类型", "intent")
    sentiment = map_value(row, "sentiment", "情感", "emotion")
    labels = map_value(row, "labels", "标签", "tags")
    if not ctype or not sentiment:
        ctype, sentiment, guessed = classify_comment(content)
        labels = labels or ",".join(guessed)

    return {
        "external_id": map_value(row, "external_id", "评论ID", "id"),
        "content": content,
        "platform": map_value(row, "platform", "平台", "source", default="抖音"),
        "category": map_value(row, "category", "分类", default="content"),
        "type": ctype,
        "sentiment": sentiment,
        "labels": json.dumps([x.strip() for x in re.split(r"[,，]", labels) if x.strip()], ensure_ascii=False),
        "author": map_value(row, "author", "用户名称", "userName", "用户", default="匿名用户"),
        "douyin_id": map_value(row, "douyin_id", "抖音号", "douyinId"),
        "likes": int(map_value(row, "likes", "点赞量", "点赞数", default="0") or 0),
        "comment_time": map_value(row, "comment_time", "评论时间", "date"),
        "ip_address": map_value(row, "ip_address", "IP地址", "ip属地"),
        "is_competitor": 1 if map_value(row, "is_competitor", "isCompetitor", "是否竞品").lower() in ("true", "yes", "1", "是") else 0,
    }


def comment_dedupe_key(item):
    external = (item.get("external_id") or "").strip()
    if external:
        return "external:" + external
    parts = [item.get("author") or "", item.get("content") or "", item.get("comment_time") or ""]
    return "content:" + "|".join(parts).strip().lower()


def insert_comments(db, rows, brand_id=None, import_batch_id=None, dedupe=True):
    brand_id = brand_id or active_brand_id(db)
    normalized = [normalize_row(r) for r in rows]
    normalized = [r for r in normalized if r]
    inserted = 0
    duplicates = 0
    for item in normalized:
        key = comment_dedupe_key(item)
        if dedupe:
            exists = db.execute("SELECT id FROM comments WHERE brand_id = ? AND dedupe_key = ? LIMIT 1", (brand_id, key)).fetchone()
            if exists:
                duplicates += 1
                continue
        db.execute(
            """
            INSERT INTO comments
            (brand_id, external_id, content, platform, category, type, sentiment, labels, author, douyin_id, likes, comment_time, ip_address, is_competitor, dedupe_key, import_batch_id, created_at)
            VALUES
            (:brand_id, :external_id, :content, :platform, :category, :type, :sentiment, :labels, :author, :douyin_id, :likes, :comment_time, :ip_address, :is_competitor, :dedupe_key, :import_batch_id, :created_at)
            """,
            {**item, "brand_id": brand_id, "dedupe_key": key, "import_batch_id": import_batch_id, "created_at": now()},
        )
        inserted += 1
    return {"inserted": inserted, "duplicates": duplicates, "total": len(normalized)}


def dashboard(db):
    brand_id = active_brand_id(db)
    brand = rowdict(db.execute("SELECT * FROM brands WHERE id = ?", (brand_id,)).fetchone())
    total = db.execute("SELECT COUNT(*) FROM comments WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    demands = db.execute("SELECT COUNT(*) FROM demands WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    barriers = db.execute("SELECT COUNT(*) FROM barriers WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    strategies = db.execute("SELECT COUNT(*) FROM strategies WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    content = db.execute("SELECT COUNT(*) FROM content_items WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    tests = db.execute("SELECT COUNT(*) FROM test_plans WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    reviews = db.execute("SELECT COUNT(*) FROM reviews WHERE brand_id = ?", (brand_id,)).fetchone()[0]
    latest = [rowdict(r) for r in db.execute("SELECT * FROM strategies WHERE brand_id = ? ORDER BY id DESC LIMIT 5", (brand_id,))]
    actions = [rowdict(r) for r in db.execute("SELECT * FROM strategies WHERE brand_id = ? ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, id DESC LIMIT 5", (brand_id,))]
    return {
        "brand": brand,
        "metrics": {
            "comments": total,
            "demands": demands,
            "barriers": barriers,
            "strategies": strategies,
            "content": content,
            "tests": tests,
            "reviews": reviews,
            "avgCtr": "3.2%",
            "avgCvr": "1.8%",
        },
        "actions": actions,
        "latestStrategies": latest,
    }


def list_table(db, table, order="id DESC", limit=100):
    return [rowdict(r) for r in db.execute(f"SELECT * FROM {table} ORDER BY {order} LIMIT ?", (limit,))]


def list_brand_table(db, table, order="id DESC", limit=100):
    return [rowdict(r) for r in db.execute(f"SELECT * FROM {table} WHERE brand_id = ? ORDER BY {order} LIMIT ?", (active_brand_id(db), limit))]


AGENT_SPECS = [
    {"id": "comments", "layer": "数据层", "name": "评论分析 Agent", "depends_on": [], "writes": ["comments"]},
    {"id": "content", "layer": "数据层", "name": "内容分析 Agent", "depends_on": [], "writes": ["content_items"]},
    {"id": "demands", "layer": "洞察层", "name": "需求洞察 Agent", "depends_on": ["comments"], "writes": ["demands"]},
    {"id": "barriers", "layer": "洞察层", "name": "障碍分析 Agent", "depends_on": ["comments"], "writes": ["barriers"]},
    {"id": "competitors", "layer": "洞察层", "name": "竞品洞察 Agent", "depends_on": ["comments"], "writes": ["competitor_opps"]},
    {"id": "xhs", "layer": "策略层", "name": "小红书策略 Agent", "depends_on": ["demands", "barriers"], "writes": ["strategies"]},
    {"id": "douyin", "layer": "策略层", "name": "抖音策略 Agent", "depends_on": ["demands", "barriers"], "writes": ["strategies"]},
    {"id": "lab", "layer": "策略层", "name": "素材测试 Agent", "depends_on": ["strategies"], "writes": ["test_plans"]},
    {"id": "dashboard", "layer": "决策层", "name": "决策汇总 Agent", "depends_on": ["xhs", "douyin", "lab"], "writes": ["strategies"]},
    {"id": "reviews", "layer": "决策层", "name": "复盘归因 Agent", "depends_on": ["test_plans"], "writes": ["reviews"]},
]


def module_matrix(db):
    return [
        {"group": "决策", "module": "本周决策台", "input": "全部 Agent 结果", "output": "优先级动作卡片", "count": db.execute("SELECT COUNT(*) FROM strategies").fetchone()[0]},
        {"group": "洞察", "module": "评论信号池", "input": "导入原始评论", "output": "分类标签表格", "count": db.execute("SELECT COUNT(*) FROM comments").fetchone()[0]},
        {"group": "洞察", "module": "用户需求地图", "input": "评论分析 Agent", "output": "频率/趋势/建议动作", "count": db.execute("SELECT COUNT(*) FROM demands").fetchone()[0]},
        {"group": "洞察", "module": "购买障碍地图", "input": "障碍分析 Agent", "output": "分布统计+解决方案", "count": db.execute("SELECT COUNT(*) FROM barriers").fetchone()[0]},
        {"group": "洞察", "module": "竞品机会地图", "input": "竞品洞察 Agent", "output": "SWOT+切入机会", "count": db.execute("SELECT COUNT(*) FROM competitor_opps").fetchone()[0]},
        {"group": "策略", "module": "小红书策略卡", "input": "小红书策略 Agent", "output": "可执行内容卡", "count": db.execute("SELECT COUNT(*) FROM strategies WHERE subtitle LIKE '%小红书%' OR title LIKE '%小红书%'").fetchone()[0]},
        {"group": "策略", "module": "抖音策略卡", "input": "抖音策略 Agent", "output": "可执行脚本卡", "count": db.execute("SELECT COUNT(*) FROM strategies WHERE subtitle LIKE '%抖音%' OR title LIKE '%抖音%'").fetchone()[0]},
        {"group": "执行", "module": "内容实验室", "input": "策略 Agent 输出", "output": "测试组+预算+规则", "count": db.execute("SELECT COUNT(*) FROM test_plans").fetchone()[0]},
        {"group": "执行", "module": "复盘归因中心", "input": "投放数据", "output": "归因结论+下一步", "count": db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]},
        {"group": "执行", "module": "报告中心", "input": "全模块数据", "output": "角色化报告", "count": db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]},
        {"group": "资产", "module": "品牌中心", "input": "手动编辑+AI生成", "output": "品牌档案+产品+关键词", "count": 1},
        {"group": "资产", "module": "对标中心", "input": "竞品资料+评论", "output": "SWOT+产品对标", "count": db.execute("SELECT COUNT(*) FROM competitor_opps").fetchone()[0]},
        {"group": "资产", "module": "品类知识库", "input": "自动聚类沉淀", "output": "标签体系", "count": db.execute("SELECT COUNT(*) FROM knowledge_tags").fetchone()[0]},
        {"group": "引擎", "module": "AI分析引擎", "input": "API配置+全库上下文", "output": "Agent链路+执行记录", "count": db.execute("SELECT COUNT(*) FROM ai_runs").fetchone()[0]},
    ]


def module_matrix(db):
    brand_id = active_brand_id(db)
    return [
        {"group": "决策", "module": "本周决策台", "input": "全部 Agent 结果", "output": "优先级动作卡片", "count": db.execute("SELECT COUNT(*) FROM strategies WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "洞察", "module": "评论信号池", "input": "导入原始评论", "output": "分类标签表格", "count": db.execute("SELECT COUNT(*) FROM comments WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "洞察", "module": "用户需求地图", "input": "评论分析 Agent", "output": "频率/趋势/建议动作", "count": db.execute("SELECT COUNT(*) FROM demands WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "洞察", "module": "购买障碍地图", "input": "障碍分析 Agent", "output": "分布统计+解决方案", "count": db.execute("SELECT COUNT(*) FROM barriers WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "洞察", "module": "竞品机会地图", "input": "竞品洞察 Agent", "output": "SWOT+切入机会", "count": db.execute("SELECT COUNT(*) FROM competitor_opps WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "策略", "module": "小红书策略卡", "input": "小红书策略 Agent", "output": "可执行内容卡", "count": db.execute("SELECT COUNT(*) FROM strategies WHERE brand_id = ? AND (subtitle LIKE '%小红书%' OR title LIKE '%小红书%')", (brand_id,)).fetchone()[0]},
        {"group": "策略", "module": "抖音策略卡", "input": "抖音策略 Agent", "output": "可执行脚本卡", "count": db.execute("SELECT COUNT(*) FROM strategies WHERE brand_id = ? AND (subtitle LIKE '%抖音%' OR title LIKE '%抖音%')", (brand_id,)).fetchone()[0]},
        {"group": "执行", "module": "内容实验室", "input": "策略 Agent 输出", "output": "测试组+预算+规则", "count": db.execute("SELECT COUNT(*) FROM test_plans WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "执行", "module": "复盘归因中心", "input": "投放数据", "output": "归因结论+下一步", "count": db.execute("SELECT COUNT(*) FROM reviews WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "执行", "module": "报告中心", "input": "全模块数据", "output": "角色化报告", "count": db.execute("SELECT COUNT(*) FROM reports WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "资产", "module": "品牌中心", "input": "多品牌档案", "output": "独立工作区+品类标签", "count": db.execute("SELECT COUNT(*) FROM brands").fetchone()[0]},
        {"group": "资产", "module": "对标中心", "input": "竞品资料+评论", "output": "SWOT+产品对标", "count": db.execute("SELECT COUNT(*) FROM competitor_opps WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "资产", "module": "品类知识库", "input": "自动聚类沉淀", "output": "标签体系", "count": db.execute("SELECT COUNT(*) FROM knowledge_tags WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
        {"group": "引擎", "module": "AI分析引擎", "input": "API配置+品牌上下文", "output": "Agent链路+执行记录", "count": db.execute("SELECT COUNT(*) FROM ai_runs WHERE brand_id = ?", (brand_id,)).fetchone()[0]},
    ]


def agent_flow(db):
    brand_id = active_brand_id(db)
    latest_runs = [rowdict(r) for r in db.execute("SELECT * FROM ai_runs WHERE brand_id = ? ORDER BY id DESC LIMIT 10", (brand_id,))]
    latest_steps = [rowdict(r) for r in db.execute("SELECT * FROM ai_run_steps WHERE brand_id = ? ORDER BY id DESC LIMIT 30", (brand_id,))]
    return {"agents": AGENT_SPECS, "runs": latest_runs, "steps": latest_steps}


def list_comments(db, query):
    params = parse_qs(query)
    limit = min(int(params.get("limit", ["80"])[0]), 500)
    search = params.get("search", [""])[0].strip()
    ctype = params.get("type", [""])[0].strip()
    sql = "SELECT * FROM comments"
    values = [active_brand_id(db)]
    clauses = ["brand_id = ?"]
    if search:
        clauses.append("(content LIKE ? OR author LIKE ? OR labels LIKE ?)")
        values.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    if ctype:
        clauses.append("type = ?")
        values.append(ctype)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT ?"
    values.append(limit)
    rows = [rowdict(r) for r in db.execute(sql, values)]
    for row in rows:
        try:
            row["labels"] = json.loads(row["labels"])
        except json.JSONDecodeError:
            row["labels"] = []
    return rows


def parse_csv_payload(text):
    reader = csv.DictReader(text.splitlines())
    return [dict(r) for r in reader]


def heuristic_insights(db):
    comments = [rowdict(r) for r in db.execute("SELECT * FROM comments ORDER BY id DESC LIMIT 200")]
    buckets = {
        "price": ["贵", "价格", "多少钱", "智商税", "不值"],
        "trust": ["有用", "效果", "骗人", "踩雷", "真假"],
        "usage": ["怎么用", "能不能", "可以", "早上", "晚上"],
        "audience": ["敏感肌", "油皮", "干皮", "孕妇"],
        "competitor": ["比", "竞品", "平替"],
    }
    counts = {k: 0 for k in buckets}
    examples = {k: "" for k in buckets}
    for c in comments:
        text = c["content"]
        for key, words in buckets.items():
            if any(w in text for w in words):
                counts[key] += 1
                examples[key] = examples[key] or text

    created = 0
    if counts["usage"]:
        db.execute(
            "INSERT INTO demands (category, text, frequency, trend, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("使用教育", "用户需要更明确的使用步骤和适用边界", counts["usage"], "rising", "生成早晚使用、肤质适配和注意事项内容", now()),
        )
        created += 1
    if counts["audience"]:
        db.execute(
            "INSERT INTO demands (category, text, frequency, trend, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("人群适配", "不同肤质用户在确认自己是否适合", counts["audience"], "stable", "按肤质拆分内容矩阵", now()),
        )
        created += 1
    for key, label in [("price", "价格障碍"), ("trust", "信任障碍"), ("competitor", "竞品障碍")]:
        if counts[key]:
            db.execute(
                "INSERT INTO barriers (type, text, severity, count, solution, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (key, label + "：" + (examples[key] or "评论集中出现相关疑问"), "high" if counts[key] > 5 else "medium", counts[key], "用评论证据反推内容主题，并补充验证材料", now()),
            )
            created += 1

    db.execute(
        "INSERT INTO strategies (title, subtitle, priority, status, body, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            "基于新增评论生成一轮内容解释链路",
            "后端启发式策略",
            "P1",
            "draft",
            "围绕价格、信任、适用人群和使用方法制作连续内容，并用评论原话做开头。",
            json.dumps([c["content"] for c in comments[:3]], ensure_ascii=False),
            now(),
        ),
    )
    created += 1
    return {"created": created, "commentSample": len(comments)}


def ai_settings(db):
    row = rowdict(db.execute("SELECT provider, model, base_url, api_key FROM ai_settings WHERE id = 1").fetchone())
    env_key = os.environ.get("VOC_AI_API_KEY", "")
    if not row:
        return {"provider": "deepseek", "model": "deepseek-chat", "base_url": "", "has_key": bool(env_key)}
    row["has_key"] = bool(row.pop("api_key") or env_key)
    return row


def save_ai_settings(db, payload):
    db.execute(
        """
        INSERT INTO ai_settings (id, provider, model, base_url, api_key, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          provider=excluded.provider, model=excluded.model, base_url=excluded.base_url,
          api_key=CASE WHEN excluded.api_key = '' THEN ai_settings.api_key ELSE excluded.api_key END,
          updated_at=excluded.updated_at
        """,
        (
            payload.get("provider", "deepseek"),
            payload.get("model", "deepseek-chat"),
            payload.get("base_url", ""),
            payload.get("api_key", ""),
            now(),
        ),
    )
    return ai_settings(db)


def get_llm_config(db):
    row = rowdict(db.execute("SELECT * FROM ai_settings WHERE id = 1").fetchone()) or {}
    provider = row.get("provider") or os.environ.get("VOC_AI_PROVIDER", "deepseek")
    model = row.get("model") or os.environ.get("VOC_AI_MODEL", "deepseek-chat")
    api_key = os.environ.get("VOC_AI_API_KEY") or row.get("api_key", "")
    base_url = row.get("base_url") or ""
    if provider == "openai":
        endpoint = "https://api.openai.com/v1/chat/completions"
    elif provider == "custom":
        endpoint = (base_url.rstrip("/") or "https://api.openai.com/v1") + "/chat/completions"
    else:
        endpoint = "https://api.deepseek.com/v1/chat/completions"
    return endpoint, model, api_key


def call_llm(db, messages, max_tokens=2500):
    endpoint, model, api_key = get_llm_config(db)
    if not api_key:
        raise RuntimeError("AI API Key is not configured")
    body = json.dumps({"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key},
        method="POST",
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"AI HTTP {e.code}: {detail[:500]}")
    latency = int((time.time() - started) * 1000)
    return data["choices"][0]["message"]["content"], data.get("usage", {}).get("total_tokens", 0), latency


def parse_model_json(content):
    if isinstance(content, dict):
        return content
    match = re.search(r"```json\s*(.*?)```", content or "", re.S)
    raw = match.group(1) if match else content
    if not raw:
        return {}
    return json.loads(raw)


def collect_agent_context(db):
    brand_id = active_brand_id(db)
    return {
        "brand": rowdict(db.execute("SELECT * FROM brands WHERE id = ?", (brand_id,)).fetchone()),
        "comments": [rowdict(r) for r in db.execute("SELECT id, content, type, sentiment, labels, author, likes FROM comments WHERE brand_id = ? ORDER BY id DESC LIMIT 80", (brand_id,))],
        "content": list_brand_table(db, "content_items", "id DESC", 30),
        "demands": list_brand_table(db, "demands", "frequency DESC, id DESC", 30),
        "barriers": list_brand_table(db, "barriers", "count DESC, id DESC", 30),
        "competitors": list_brand_table(db, "competitor_opps", "id DESC", 20),
        "strategies": list_brand_table(db, "strategies", "id DESC", 30),
        "tests": list_brand_table(db, "test_plans", "id DESC", 20),
        "reviews": list_brand_table(db, "reviews", "id DESC", 20),
    }


def input_summary(ctx):
    return (
        f"comments={len(ctx['comments'])}, content={len(ctx['content'])}, "
        f"demands={len(ctx['demands'])}, barriers={len(ctx['barriers'])}, "
        f"competitors={len(ctx['competitors'])}, strategies={len(ctx['strategies'])}"
    )


def build_agent_prompt(agent_id, ctx):
    brief = json.dumps(ctx, ensure_ascii=False)[:9000]
    schemas = {
        "comments": '{"analyses":[{"id":1,"type":"demand|barrier|intent|praise|complaint|comparison","sentiment":"positive|neutral|negative","labels":["关键词"]}]}',
        "content": '{"items":[{"id":1,"content_type":"教程|对比|测评|口播","summary":"分析摘要"}]}',
        "demands": '{"demands":[{"category":"人群适配|场景需求|效果验证|使用教育|竞品替代|成分安全|价格替代","text":"需求描述","frequency":10,"trend":"rising|stable","action":"建议动作"}]}',
        "barriers": '{"barriers":[{"type":"price|trust|effect|audience|usage|competitor|risk","text":"障碍描述","severity":"high|medium|low","count":10,"solution":"解决方案"}]}',
        "competitors": '{"competitor_opps":[{"competitor":"竞品名","strength":"优势","weakness":"弱点","opportunity":"机会","action":"动作"}]}',
        "xhs": '{"strategies":[{"title":"小红书策略标题","subtitle":"小红书策略","priority":"P0|P1|P2","body":"封面/标题/正文/标签/发布时间","evidence":["证据"]}]}',
        "douyin": '{"strategies":[{"title":"抖音策略标题","subtitle":"抖音策略","priority":"P0|P1|P2","body":"钩子/分镜/BGM/达人/人群定向","evidence":["证据"]}]}',
        "lab": '{"test_plans":[{"objective":"测试目标","strategy_title":"关联策略","variants":"A/B/C变量","budget":"预算","success_rule":"放大规则","status":"planned"}]}',
        "dashboard": '{"top_actions":[{"title":"本周动作","subtitle":"决策汇总","priority":"P0|P1|P2","body":"为什么做/怎么做/看什么指标","evidence":["证据"]}]}',
        "reviews": '{"reviews":[{"title":"复盘主题","result":"结果摘要","attribution":"归因结论","next_action":"下一步"}]}',
    }
    return (
        f"你是 VOS 系统里的 {agent_id} Agent。只返回 JSON，不要解释。\n"
        f"目标 schema: {schemas[agent_id]}\n"
        f"当前上下文: {brief}"
    )


def fallback_agent_output(agent_id, ctx):
    comments = ctx["comments"]
    sample = comments[:3]
    if agent_id == "comments":
        analyses = []
        for c in comments[:30]:
            ctype, sentiment, labels = classify_comment(c["content"])
            analyses.append({"id": c["id"], "type": ctype, "sentiment": sentiment, "labels": labels})
        return {"analyses": analyses}
    if agent_id == "content":
        return {"items": [{"id": item["id"], "content_type": item.get("content_type") or "策略素材", "summary": item.get("summary") or "待结合评论洞察优化"} for item in ctx["content"][:10]]}
    if agent_id == "demands":
        return {"demands": [
            {"category": "使用教育", "text": "用户需要更明确的使用步骤和适用边界", "frequency": max(1, len(comments) // 3), "trend": "rising", "action": "制作早晚使用、肤质适配和注意事项内容"},
            {"category": "效果验证", "text": "用户希望看到真实效果证据", "frequency": max(1, len(comments) // 4), "trend": "stable", "action": "沉淀评论证据、周期对比和第三方验证"},
        ]}
    if agent_id == "barriers":
        return {"barriers": [
            {"type": "price", "text": "价格价值解释不足", "severity": "high", "count": max(1, len(comments) // 4), "solution": "拆解成分、工艺、单次使用成本和效果证据"},
            {"type": "trust", "text": "用户担心无效或踩雷", "severity": "high", "count": max(1, len(comments) // 5), "solution": "用真实评论和长期使用记录降低信任风险"},
        ]}
    if agent_id == "competitors":
        return {"competitor_opps": [{"competitor": "重点竞品", "strength": "已有心智强", "weakness": "价格和体验存在争议", "opportunity": "用清晰证据和低试错成本切入", "action": "制作不拉踩的客观对比内容"}]}
    if agent_id == "xhs":
        return {"strategies": [{"title": "小红书：敏感肌能不能用，一篇讲清", "subtitle": "小红书策略", "priority": "P1", "body": "封面突出肤质疑问；标题用问句；正文按适用人群、使用方法、注意事项、评论证据展开；标签覆盖敏感肌/修护/成分党。", "evidence": [c["content"] for c in sample]}]}
    if agent_id == "douyin":
        return {"strategies": [{"title": "抖音：贵在哪里 30 秒解释", "subtitle": "抖音策略", "priority": "P0", "body": "前三秒引用价格质疑评论，随后用成分成本、单次使用成本、效果证据三段式解释，结尾引导评论区提问。", "evidence": [c["content"] for c in sample]}]}
    if agent_id == "lab":
        return {"test_plans": [{"objective": "验证价格解释内容能否降低转化阻力", "strategy_title": "抖音：贵在哪里 30 秒解释", "variants": "A: 成分成本; B: 单次使用成本; C: 用户证据", "budget": "3000", "success_rule": "CTR 提升 20% 且价格质疑评论下降", "status": "planned"}]}
    if agent_id == "dashboard":
        return {"top_actions": [{"title": "本周优先补齐价格解释和敏感肌适配内容", "subtitle": "决策汇总", "priority": "P0", "body": "先解决高频价格和适用人群疑问，再用 A/B 测试验证素材方向。", "evidence": [c["content"] for c in sample]}]}
    if agent_id == "reviews":
        return {"reviews": [{"title": "Agent 链路执行复盘", "result": "已生成需求、障碍、策略和测试方案", "attribution": "新增结果来自评论信号和已有策略上下文", "next_action": "选择 P0 策略进入投放测试"}]}
    return {}


def apply_agent_output(db, agent_id, data):
    written = 0
    if agent_id == "comments":
        for item in data.get("analyses", [])[:80]:
            labels = json.dumps(item.get("labels", []), ensure_ascii=False)
            db.execute(
                "UPDATE comments SET type = ?, sentiment = ?, labels = ? WHERE id = ?",
                (item.get("type", "demand"), item.get("sentiment", "neutral"), labels, int(item.get("id", 0) or 0)),
            )
            written += 1
    elif agent_id == "content":
        for item in data.get("items", [])[:30]:
            db.execute(
                "UPDATE content_items SET content_type = ?, summary = ?, is_analyzed = 1 WHERE id = ?",
                (item.get("content_type", "策略素材"), item.get("summary", ""), int(item.get("id", 0) or 0)),
            )
            written += 1
    elif agent_id == "demands":
        for d in data.get("demands", [])[:8]:
            db.execute(
                "INSERT INTO demands (category, text, frequency, trend, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (d.get("category", "未分类"), d.get("text", ""), int(d.get("frequency", 0) or 0), d.get("trend", "stable"), d.get("action", ""), now()),
            )
            written += 1
    elif agent_id == "barriers":
        for b in data.get("barriers", [])[:8]:
            db.execute(
                "INSERT INTO barriers (type, text, severity, count, solution, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (b.get("type", "trust"), b.get("text", ""), b.get("severity", "medium"), int(b.get("count", 0) or 0), b.get("solution", ""), now()),
            )
            written += 1
    elif agent_id == "competitors":
        for c in data.get("competitor_opps", [])[:8]:
            db.execute(
                "INSERT INTO competitor_opps (competitor, strength, weakness, opportunity, action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (c.get("competitor", "竞品"), c.get("strength", ""), c.get("weakness", ""), c.get("opportunity", ""), c.get("action", ""), now()),
            )
            written += 1
    elif agent_id in ("xhs", "douyin"):
        for s in data.get("strategies", [])[:6]:
            db.execute(
                "INSERT INTO strategies (title, subtitle, priority, status, body, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (s.get("title", "平台策略"), s.get("subtitle", "小红书策略" if agent_id == "xhs" else "抖音策略"), s.get("priority", "P2"), "draft", s.get("body", ""), json.dumps(s.get("evidence", []), ensure_ascii=False), now()),
            )
            written += 1
    elif agent_id == "lab":
        for p in data.get("test_plans", [])[:6]:
            db.execute(
                "INSERT INTO test_plans (objective, strategy_title, variants, budget, success_rule, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (p.get("objective", ""), p.get("strategy_title", ""), p.get("variants", ""), p.get("budget", ""), p.get("success_rule", ""), p.get("status", "planned"), now()),
            )
            written += 1
    elif agent_id == "dashboard":
        for s in data.get("top_actions", [])[:5]:
            db.execute(
                "INSERT INTO strategies (title, subtitle, priority, status, body, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (s.get("title", "本周动作"), s.get("subtitle", "决策汇总"), s.get("priority", "P1"), "active", s.get("body", ""), json.dumps(s.get("evidence", []), ensure_ascii=False), now()),
            )
            written += 1
    elif agent_id == "reviews":
        for r in data.get("reviews", [])[:5]:
            db.execute(
                "INSERT INTO reviews (title, result, attribution, next_action, created_at) VALUES (?, ?, ?, ?, ?)",
                (r.get("title", "复盘"), r.get("result", ""), r.get("attribution", ""), r.get("next_action", ""), now()),
            )
            written += 1
    return written


def create_review_item(db, source_table, source_id, title, summary="", confidence=70):
    db.execute(
        """
        INSERT INTO review_items (brand_id, source_table, source_id, title, summary, status, confidence, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, '', ?, ?)
        """,
        (active_brand_id(db), source_table, source_id, title, summary, confidence, now(), now()),
    )


def apply_agent_output(db, agent_id, data):
    brand_id = active_brand_id(db)
    written = 0
    if agent_id == "comments":
        for item in data.get("analyses", [])[:80]:
            labels = json.dumps(item.get("labels", []), ensure_ascii=False)
            db.execute(
                "UPDATE comments SET type = ?, sentiment = ?, labels = ? WHERE id = ? AND brand_id = ?",
                (item.get("type", "demand"), item.get("sentiment", "neutral"), labels, int(item.get("id", 0) or 0), brand_id),
            )
            written += 1
    elif agent_id == "content":
        for item in data.get("items", [])[:30]:
            db.execute(
                "UPDATE content_items SET content_type = ?, summary = ?, is_analyzed = 1 WHERE id = ? AND brand_id = ?",
                (item.get("content_type", "策略素材"), item.get("summary", ""), int(item.get("id", 0) or 0), brand_id),
            )
            written += 1
    elif agent_id == "demands":
        for d in data.get("demands", [])[:8]:
            db.execute(
                "INSERT INTO demands (brand_id, category, text, frequency, trend, action, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (brand_id, d.get("category", "未分类"), d.get("text", ""), int(d.get("frequency", 0) or 0), d.get("trend", "stable"), d.get("action", ""), "pending", now()),
            )
            new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            create_review_item(db, "demands", new_id, d.get("text", "需求洞察"), d.get("action", ""), 75)
            written += 1
    elif agent_id == "barriers":
        for b in data.get("barriers", [])[:8]:
            db.execute(
                "INSERT INTO barriers (brand_id, type, text, severity, count, solution, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (brand_id, b.get("type", "trust"), b.get("text", ""), b.get("severity", "medium"), int(b.get("count", 0) or 0), b.get("solution", ""), "pending", now()),
            )
            new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            create_review_item(db, "barriers", new_id, b.get("text", "购买障碍"), b.get("solution", ""), 72)
            written += 1
    elif agent_id == "competitors":
        for c in data.get("competitor_opps", [])[:8]:
            db.execute(
                "INSERT INTO competitor_opps (brand_id, competitor, strength, weakness, opportunity, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (brand_id, c.get("competitor", "竞品"), c.get("strength", ""), c.get("weakness", ""), c.get("opportunity", ""), c.get("action", ""), now()),
            )
            written += 1
    elif agent_id in ("xhs", "douyin"):
        for s in data.get("strategies", [])[:6]:
            subtitle = s.get("subtitle") or ("小红书策略" if agent_id == "xhs" else "抖音策略")
            db.execute(
                "INSERT INTO strategies (brand_id, title, subtitle, priority, status, body, evidence, review_status, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (brand_id, s.get("title", "平台策略"), subtitle, s.get("priority", "P2"), "draft", s.get("body", ""), json.dumps(s.get("evidence", []), ensure_ascii=False), "pending", 78, now()),
            )
            new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            create_review_item(db, "strategies", new_id, s.get("title", "平台策略"), s.get("body", ""), 78)
            written += 1
    elif agent_id == "lab":
        for p in data.get("test_plans", [])[:6]:
            db.execute(
                "INSERT INTO test_plans (brand_id, objective, strategy_title, variants, budget, success_rule, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (brand_id, p.get("objective", ""), p.get("strategy_title", ""), p.get("variants", ""), p.get("budget", ""), p.get("success_rule", ""), p.get("status", "planned"), now()),
            )
            written += 1
    elif agent_id == "dashboard":
        for s in data.get("top_actions", [])[:5]:
            db.execute(
                "INSERT INTO strategies (brand_id, title, subtitle, priority, status, body, evidence, review_status, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (brand_id, s.get("title", "本周动作"), s.get("subtitle", "决策汇总"), s.get("priority", "P1"), "active", s.get("body", ""), json.dumps(s.get("evidence", []), ensure_ascii=False), "pending", 82, now()),
            )
            new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            create_review_item(db, "strategies", new_id, s.get("title", "本周动作"), s.get("body", ""), 82)
            written += 1
    elif agent_id == "reviews":
        for r in data.get("reviews", [])[:5]:
            db.execute(
                "INSERT INTO reviews (brand_id, title, result, attribution, next_action, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (brand_id, r.get("title", "复盘"), r.get("result", ""), r.get("attribution", ""), r.get("next_action", ""), now()),
            )
            written += 1
    return written


def agents_for_mode(mode):
    if mode == "insight":
        ids = {"comments", "content", "demands", "barriers", "competitors"}
    elif mode == "strategy":
        ids = {"xhs", "douyin", "lab", "dashboard", "reviews"}
    else:
        ids = {a["id"] for a in AGENT_SPECS}
    return [a for a in AGENT_SPECS if a["id"] in ids]


def run_ai_orchestration(db, mode):
    started_run = time.time()
    brand_id = active_brand_id(db)
    db.execute(
        "INSERT INTO ai_runs (brand_id, mode, status, summary, tokens, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (brand_id, mode, "running", "Agent pipeline started", 0, 0, now()),
    )
    run_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    total_tokens = 0
    completed = 0
    failed = 0
    used_fallback = False

    for agent in agents_for_mode(mode):
        step_started = time.time()
        ctx = collect_agent_context(db)
        summary = input_summary(ctx)
        db.execute(
            "INSERT INTO ai_run_steps (brand_id, run_id, agent_id, agent_name, layer, status, input_summary, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (brand_id, run_id, agent["id"], agent["name"], agent["layer"], "running", summary, now()),
        )
        step_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        tokens = 0
        try:
            try:
                prompt = build_agent_prompt(agent["id"], ctx)
                content, tokens, _ = call_llm(db, [{"role": "user", "content": prompt}], 2500)
                output = parse_model_json(content)
            except Exception as llm_exc:
                used_fallback = True
                output = fallback_agent_output(agent["id"], ctx)
                output["_fallback_reason"] = str(llm_exc)
            written = apply_agent_output(db, agent["id"], output)
            latency = int((time.time() - step_started) * 1000)
            db.execute(
                """
                UPDATE ai_run_steps
                SET status = ?, output_json = ?, records_written = ?, tokens = ?, latency_ms = ?, finished_at = ?
                WHERE id = ?
                """,
                ("fallback" if "_fallback_reason" in output else "success", json.dumps(output, ensure_ascii=False), written, tokens, latency, now(), step_id),
            )
            completed += 1
            total_tokens += tokens
        except Exception as exc:
            latency = int((time.time() - step_started) * 1000)
            db.execute(
                "UPDATE ai_run_steps SET status = ?, error = ?, latency_ms = ?, finished_at = ? WHERE id = ?",
                ("error", str(exc), latency, now(), step_id),
            )
            failed += 1

    run_latency = int((time.time() - started_run) * 1000)
    status = "error" if failed and not completed else "fallback" if used_fallback else "success"
    summary = f"Agent pipeline completed: {completed} succeeded, {failed} failed"
    db.execute(
        "UPDATE ai_runs SET status = ?, summary = ?, tokens = ?, latency_ms = ? WHERE id = ?",
        (status, summary, total_tokens, run_latency, run_id),
    )
    steps = [rowdict(r) for r in db.execute("SELECT * FROM ai_run_steps WHERE run_id = ? ORDER BY id", (run_id,))]
    return {"id": run_id, "status": status, "summary": summary, "tokens": total_tokens, "latency_ms": run_latency, "steps": steps}


def brands_payload(db):
    brands = [rowdict(r) for r in db.execute("SELECT * FROM brands ORDER BY is_active DESC, id DESC")]
    for brand in brands:
        try:
            brand["categories"] = json.loads(brand.get("categories") or "[]")
        except json.JSONDecodeError:
            brand["categories"] = []
    return {"active_brand_id": active_brand_id(db), "items": brands}


def save_brand(db, payload):
    brand_id = payload.get("id")
    categories = payload.get("categories", [])
    if isinstance(categories, str):
        categories = [x.strip() for x in re.split(r"[,，\n]", categories) if x.strip()]
    values = (
        payload.get("name") or "未命名品牌",
        payload.get("industry", ""),
        payload.get("slogan", ""),
        payload.get("positioning", ""),
        json.dumps(categories, ensure_ascii=False),
        now(),
    )
    if brand_id:
        db.execute(
            "UPDATE brands SET name = ?, industry = ?, slogan = ?, positioning = ?, categories = ?, updated_at = ? WHERE id = ?",
            (*values, int(brand_id)),
        )
        return rowdict(db.execute("SELECT * FROM brands WHERE id = ?", (int(brand_id),)).fetchone())
    db.execute(
        "INSERT INTO brands (name, industry, slogan, positioning, categories, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        (values[0], values[1], values[2], values[3], values[4], now(), now()),
    )
    return rowdict(db.execute("SELECT * FROM brands WHERE id = last_insert_rowid()").fetchone())


def switch_brand(db, brand_id):
    brand = rowdict(db.execute("SELECT * FROM brands WHERE id = ?", (brand_id,)).fetchone())
    if not brand:
        raise ValueError("Brand not found")
    db.execute("UPDATE brands SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END", (brand_id,))
    set_active_brand(db, brand_id)
    profile = {
        "name": brand["name"],
        "industry": brand["industry"],
        "slogan": brand["slogan"],
        "positioning": brand["positioning"],
        "categories": json.loads(brand.get("categories") or "[]"),
    }
    db.execute("UPDATE brand_profile SET data = ?, updated_at = ? WHERE id = 1", (json.dumps(profile, ensure_ascii=False), now()))
    return brands_payload(db)


def import_history(db):
    return {"items": [rowdict(r) for r in db.execute("SELECT * FROM import_batches WHERE brand_id = ? ORDER BY id DESC LIMIT 100", (active_brand_id(db),))]}


def review_workbench(db):
    return {
        "items": [rowdict(r) for r in db.execute("SELECT * FROM review_items WHERE brand_id = ? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC LIMIT 200", (active_brand_id(db),))],
        "counts": {
            row["status"]: row["count"]
            for row in db.execute("SELECT status, COUNT(*) AS count FROM review_items WHERE brand_id = ? GROUP BY status", (active_brand_id(db),))
        },
    }


def update_review_item(db, payload):
    item_id = int(payload.get("id", 0) or 0)
    status = payload.get("status", "pending")
    if status not in {"pending", "approved", "rejected"}:
        raise ValueError("Invalid review status")
    notes = payload.get("notes", "")
    confidence = int(payload.get("confidence", 70) or 70)
    db.execute(
        "UPDATE review_items SET status = ?, notes = ?, confidence = ?, updated_at = ? WHERE id = ? AND brand_id = ?",
        (status, notes, confidence, now(), item_id, active_brand_id(db)),
    )
    item = rowdict(db.execute("SELECT * FROM review_items WHERE id = ? AND brand_id = ?", (item_id, active_brand_id(db))).fetchone())
    if item and item["source_table"] in {"strategies", "demands", "barriers"}:
        db.execute(f"UPDATE {item['source_table']} SET review_status = ? WHERE id = ? AND brand_id = ?", (status, item["source_id"], active_brand_id(db)))
    return item


def create_brief_from_strategy(db, payload):
    brand_id = active_brand_id(db)
    strategy_id = int(payload.get("strategy_id", 0) or 0)
    strategy = rowdict(db.execute("SELECT * FROM strategies WHERE id = ? AND brand_id = ?", (strategy_id, brand_id)).fetchone())
    if not strategy:
        raise ValueError("Strategy not found")
    platform = "小红书" if "小红书" in (strategy["title"] + strategy["subtitle"]) else "抖音" if "抖音" in (strategy["title"] + strategy["subtitle"]) else "通用"
    db.execute(
        """
        INSERT INTO briefs (brand_id, strategy_id, title, platform, objective, audience, key_message, content_outline, kpi, budget, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
        """,
        (
            brand_id,
            strategy_id,
            "Brief - " + strategy["title"][:80],
            platform,
            payload.get("objective") or "将策略卡转化为可执行内容任务",
            payload.get("audience") or "内容/投放/达人协作团队",
            strategy["subtitle"],
            strategy["body"],
            payload.get("kpi") or "CTR、CVR、互动率、负面评论占比",
            payload.get("budget") or "",
            now(),
        ),
    )
    return rowdict(db.execute("SELECT * FROM briefs WHERE id = last_insert_rowid()").fetchone())


def export_briefs_csv(db):
    rows = [rowdict(r) for r in db.execute("SELECT title, platform, objective, audience, key_message, content_outline, kpi, budget, status, created_at FROM briefs WHERE brand_id = ? ORDER BY id DESC", (active_brand_id(db),))]
    headers = ["title", "platform", "objective", "audience", "key_message", "content_outline", "kpi", "budget", "status", "created_at"]
    lines = [",".join(headers)]
    for row in rows:
        values = []
        for header in headers:
            value = str(row.get(header, "")).replace('"', '""')
            values.append(f'"{value}"')
        lines.append(",".join(values))
    return "\ufeff" + "\n".join(lines)


def global_search(db, query):
    q = f"%{query.strip()}%"
    if not query.strip():
        return {"items": []}
    brand_id = active_brand_id(db)
    searches = [
        ("评论", "comments", "content", "author"),
        ("需求", "demands", "text", "action"),
        ("障碍", "barriers", "text", "solution"),
        ("策略", "strategies", "title", "body"),
        ("报告", "reports", "title", "scope"),
        ("知识", "knowledge_tags", "tag", "note"),
    ]
    items = []
    for label, table, title_col, body_col in searches:
        for row in db.execute(f"SELECT id, {title_col} AS title, {body_col} AS body FROM {table} WHERE brand_id = ? AND ({title_col} LIKE ? OR {body_col} LIKE ?) ORDER BY id DESC LIMIT 10", (brand_id, q, q)):
            items.append({"type": label, "source": table, "id": row["id"], "title": row["title"], "body": row["body"]})
    return {"items": items[:50]}


def generate_report(db, payload):
    brand_id = active_brand_id(db)
    audience = payload.get("audience", "老板/管理层")
    data = dashboard(db)
    top_actions = "\n".join([f"- {x['priority']} {x['title']}: {x.get('body', '')}" for x in data["actions"][:5]])
    body = f"目标读者：{audience}\n\n核心指标：{json.dumps(data['metrics'], ensure_ascii=False)}\n\n本周优先动作：\n{top_actions}"
    db.execute(
        "INSERT INTO reports (brand_id, title, audience, scope, cadence, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (brand_id, payload.get("title") or f"{audience}报告", audience, "自动汇总全模块数据", payload.get("cadence", "weekly"), body, now()),
    )
    return rowdict(db.execute("SELECT * FROM reports WHERE id = last_insert_rowid()").fetchone())


def infer_knowledge(db):
    brand_id = active_brand_id(db)
    inserted = 0
    for row in db.execute("SELECT category AS dimension, text AS tag, action AS note FROM demands WHERE brand_id = ? ORDER BY id DESC LIMIT 8", (brand_id,)):
        db.execute(
            "INSERT INTO knowledge_tags (brand_id, dimension, tag, note, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (brand_id, row["dimension"], row["tag"][:80], row["note"], 76, now()),
        )
        inserted += 1
    return {"inserted": inserted}


def create_weekly_snapshot(db):
    brand_id = active_brand_id(db)
    metrics = dashboard(db)["metrics"]
    week_start = datetime.now().strftime("%Y-W%U")
    summary = f"评论 {metrics['comments']} 条，需求 {metrics['demands']} 条，策略 {metrics['strategies']} 张。"
    db.execute(
        "INSERT INTO weekly_snapshots (brand_id, week_start, metrics, summary, created_at) VALUES (?, ?, ?, ?, ?)",
        (brand_id, week_start, json.dumps(metrics, ensure_ascii=False), summary, now()),
    )
    return rowdict(db.execute("SELECT * FROM weekly_snapshots WHERE id = last_insert_rowid()").fetchone())


def clear_demo_data(db):
    brand_id = active_brand_id(db)
    for table in ["comments", "demands", "barriers", "strategies", "competitor_opps", "content_items", "test_plans", "reviews", "reports", "knowledge_tags", "ai_runs", "import_batches", "review_items", "briefs", "weekly_snapshots"]:
        db.execute(f"DELETE FROM {table} WHERE brand_id = ?", (brand_id,))
    return {"ok": True, "brand_id": brand_id}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_text(self, text, content_type="text/plain; charset=utf-8", status=200):
        raw = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return super().do_GET()
        try:
            with connect() as db:
                if parsed.path == "/api/health":
                    return self.send_json({"ok": True, "db": str(DB_PATH), "time": now()})
                if parsed.path == "/api/dashboard":
                    return self.send_json(dashboard(db))
                if parsed.path == "/api/brands":
                    return self.send_json(brands_payload(db))
                if parsed.path == "/api/comments":
                    return self.send_json({"items": list_comments(db, parsed.query)})
                if parsed.path == "/api/demands":
                    return self.send_json({"items": list_brand_table(db, "demands", "frequency DESC, id DESC", 100)})
                if parsed.path == "/api/barriers":
                    return self.send_json({"items": list_brand_table(db, "barriers", "count DESC, id DESC", 100)})
                if parsed.path == "/api/competitors":
                    return self.send_json({"items": list_brand_table(db, "competitor_opps", "id DESC", 100)})
                if parsed.path == "/api/strategies":
                    return self.send_json({"items": list_brand_table(db, "strategies", "id DESC", 100)})
                if parsed.path == "/api/content":
                    return self.send_json({"items": list_brand_table(db, "content_items", "id DESC", 100)})
                if parsed.path == "/api/lab":
                    return self.send_json({"items": list_brand_table(db, "test_plans", "id DESC", 100)})
                if parsed.path == "/api/reviews":
                    return self.send_json({"items": list_brand_table(db, "reviews", "id DESC", 100)})
                if parsed.path == "/api/reports":
                    return self.send_json({"items": list_brand_table(db, "reports", "id DESC", 100)})
                if parsed.path == "/api/knowledge":
                    return self.send_json({"items": list_brand_table(db, "knowledge_tags", "dimension ASC, id DESC", 200)})
                if parsed.path == "/api/imports":
                    return self.send_json(import_history(db))
                if parsed.path == "/api/review":
                    return self.send_json(review_workbench(db))
                if parsed.path == "/api/briefs":
                    return self.send_json({"items": list_brand_table(db, "briefs", "id DESC", 100)})
                if parsed.path == "/api/briefs/export":
                    return self.send_text(export_briefs_csv(db), "text/csv; charset=utf-8")
                if parsed.path == "/api/search":
                    return self.send_json(global_search(db, parse_qs(parsed.query).get("q", [""])[0]))
                if parsed.path == "/api/snapshots":
                    return self.send_json({"items": list_brand_table(db, "weekly_snapshots", "id DESC", 100)})
                if parsed.path == "/api/modules":
                    return self.send_json({"items": module_matrix(db)})
                if parsed.path == "/api/agents":
                    return self.send_json(agent_flow(db))
                if parsed.path == "/api/brand":
                    brand = rowdict(db.execute("SELECT * FROM brands WHERE id = ?", (active_brand_id(db),)).fetchone())
                    brand["categories"] = json.loads(brand.get("categories") or "[]")
                    return self.send_json({"data": brand, "updated_at": brand["updated_at"]})
                if parsed.path == "/api/ai/settings":
                    return self.send_json(ai_settings(db))
                if parsed.path == "/api/ai/runs":
                    return self.send_json({"items": list_brand_table(db, "ai_runs", "id DESC", 30)})
                if parsed.path == "/api/ai/steps":
                    params = parse_qs(parsed.query)
                    run_id = params.get("run_id", [""])[0]
                    if run_id:
                        rows = [rowdict(r) for r in db.execute("SELECT * FROM ai_run_steps WHERE run_id = ? AND brand_id = ? ORDER BY id", (run_id, active_brand_id(db)))]
                    else:
                        rows = list_brand_table(db, "ai_run_steps", "id DESC", 50)
                    return self.send_json({"items": rows})
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)
        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return self.send_json({"error": "Not found"}, 404)
        try:
            payload = self.read_json()
            with connect() as db:
                if parsed.path == "/api/brands":
                    return self.send_json(save_brand(db, payload))
                if parsed.path == "/api/brands/switch":
                    return self.send_json(switch_brand(db, int(payload.get("id", 1))))
                if parsed.path == "/api/brands/delete":
                    brand_id = int(payload.get("id", 0) or 0)
                    if brand_id == 1 or brand_id == active_brand_id(db):
                        return self.send_json({"error": "Cannot delete default or active brand"}, 400)
                    db.execute("DELETE FROM brands WHERE id = ?", (brand_id,))
                    return self.send_json(brands_payload(db))
                if parsed.path == "/api/comments/import":
                    fmt = payload.get("format", "csv")
                    rows = payload.get("rows")
                    if rows is None:
                        text = payload.get("text", "")
                        rows = json.loads(text) if fmt == "json" else parse_csv_payload(text)
                    brand_id = active_brand_id(db)
                    db.execute(
                        "INSERT INTO import_batches (brand_id, source, mode, total_rows, inserted_rows, duplicate_rows, status, created_at) VALUES (?, ?, ?, ?, 0, 0, 'running', ?)",
                        (brand_id, payload.get("source", "manual"), payload.get("mode", "manual"), len(rows), now()),
                    )
                    batch_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
                    result = insert_comments(db, rows, brand_id=brand_id, import_batch_id=batch_id, dedupe=payload.get("dedupe", True))
                    run = None
                    if payload.get("incremental"):
                        run = run_ai_orchestration(db, "insight")
                    db.execute(
                        "UPDATE import_batches SET inserted_rows = ?, duplicate_rows = ?, status = 'success', run_id = ? WHERE id = ?",
                        (result["inserted"], result["duplicates"], run["id"] if run else None, batch_id),
                    )
                    return self.send_json({"batch_id": batch_id, "imported": result["inserted"], "duplicates": result["duplicates"], "total": result["total"], "run": run, "dashboard": dashboard(db)})
                if parsed.path == "/api/review/update":
                    return self.send_json(update_review_item(db, payload))
                if parsed.path == "/api/briefs/from-strategy":
                    return self.send_json(create_brief_from_strategy(db, payload))
                if parsed.path == "/api/reports/generate":
                    return self.send_json(generate_report(db, payload))
                if parsed.path == "/api/knowledge/infer":
                    return self.send_json(infer_knowledge(db))
                if parsed.path == "/api/snapshots/weekly":
                    return self.send_json(create_weekly_snapshot(db))
                if parsed.path == "/api/system/clear-demo":
                    return self.send_json(clear_demo_data(db))
                if parsed.path == "/api/ai/settings":
                    return self.send_json(save_ai_settings(db, payload))
                if parsed.path == "/api/ai/run":
                    return self.send_json(run_ai_orchestration(db, payload.get("mode", "full")))
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)
        self.send_json({"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/brand":
            return self.send_json({"error": "Not found"}, 404)
        try:
            payload = self.read_json()
            with connect() as db:
                payload["id"] = active_brand_id(db)
                brand = save_brand(db, payload)
                switch_brand(db, int(brand["id"]))
                db.execute("UPDATE brand_profile SET data = ?, updated_at = ? WHERE id = 1", (json.dumps(payload, ensure_ascii=False), now()))
            return self.send_json({"ok": True})
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)


def main():
    load_env_file()
    init_db()
    host = os.environ.get("VOC_HOST", "127.0.0.1")
    port = int(os.environ.get("VOC_PORT", "8090"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Voice of Consumer OS fullstack running at http://{host}:{port}")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
