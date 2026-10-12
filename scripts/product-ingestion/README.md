# SHAKI AI Product Match — Phase 01: PRODUCT INGESTION PIPELINE

> 把 SHAKI 官网变成结构化、可信、可查询、可被 AI 理解的 **Product Intelligence Database**。
> Phase 01 只做「入库」，不做前端（Dashboard / CRM / Proposal / Analytics）。Phase 02（客户研究 / 匹配 / 6D Fit / 提案 / 分享 / 销售反馈 / AI 学习）预留。

本目录 `scripts/product-ingestion/` 是一个**零安装、可离线运行**的 Python 管线。
本地用 SQLite（无需安装任何数据库），生产用 PostgreSQL + Prisma（见 `../../prisma/schema.prisma`）。

---

## 1. Files created

```
scripts/product-ingestion/
├── config.py                      # 环境变量配置（SHAKI_WEBSITE_URL 等，绝不硬编码）
├── product_master.py              # 228 字段字典 / 枚举 / 分类法 / 标签字典 / 评分权重（唯一真源）
├── runtime.py                     # 运行时数据类（DiscoveredURL / RawRecord / ExtractedProduct / FieldValue）
├── crawler.py                     # 爬虫：robots.txt / sitemap / 发现 / 去重 / 限流
├── extractors.py                  # 抽取策略：JSON-LD > meta > 语义 HTML > 文本正则（无单一硬编码选择器）
├── storage.py                     # RAW 存储（data/raw/*.json），与生产库分离
├── mapping.py                     # 字段映射 + 归一化（primary_category 永不自动映射）
├── enrichment.py                  # AI 富化（只填 AI 角色字段，禁止编造商业字段）
├── validation.py                  # 合并 + 校验 + 完整度/评分计算
├── db.py                          # SQLite 数据层（8 表 + products_history 版本保留）
├── pipeline.py                    # 编排：DISCOVER→FETCH→RAW→PARSE→NORMALIZE→MAP→ENRICH→VALIDATE→APPROVE→POOL
├── cli.py                         # 命令行入口（import / export / status / recommend / approve / discover）
├── exporters/
│   └── excel_export.py            # 导出 SHAKI_Product_Master_Export.xlsx（字段顺序同源表）
├── fixtures/                      # 7 个离线 HTML 样例（含 JSON-LD / 无 SKU / 无 JSON-LD / 坏图 / 改版）
├── tests/
│   └── test_pipeline.py           # 测试 01-10（全离线，32 项断言全绿）
└── .env.example                   # 所有环境变量文档

../../prisma/schema.prisma        # PostgreSQL 生产库 Prisma schema（8 表镜像）
../../data/
├── raw/                           # 原始 HTML / 文本 / JSON-LD / 图片（可复现）
├── processed/shaki_product_intelligence.db   # SQLite 生产库（本地）
└── products/SHAKI_Product_Master_Export.xlsx # 导出表
```

---

## 2. DB schema

8 张表（spec 16/17）：`products`、`product_sources`、`product_media`、`product_tags`、
`product_scores`、`product_relations`、`product_import_jobs`、`product_import_errors`；
加 `products_history`（版本保留，spec 22）。

**关键设计**
- `products` 的 228 个 Product Master 字段由 `product_master.FIELD_ORDER` 动态生成（与 xlsx 列序一致），
  与 DB 解耦——字典演进不必改表结构。
- 元字段 `product_id / sku / product_version / data_completeness` 等由 DB 层托管（强类型 + PK），
  创建表时从动态列中排除，避免列名冲突。
- `product_sources` 存**原始内容**（HTML / 文本 / JSON-LD），`products` 只存结构化结果——原始与成品分离（spec 14）。
- `products` 行附加 per-field `provenance`（source_type / source_reference / confidence / last_verified）。
- 生产库见 `../../prisma/schema.prisma`（Postgres + JSONB `fields`/`provenance` + GIN 索引）。

---

## 3. Crawler architecture

- **礼貌优先**：先读 `robots.txt`（`parse_robots` / `is_robots_allowed`），尊重 `Crawl-delay`；所有请求带自定义 `User-Agent`。
- **发现链路**：`sitemap_index.xml` → `sitemap.xml` → 产品/集合/分类页；从页面 `<a href>` 抽取候选 URL。
- **产品识别** `looks_like_product`：多信号启发式（URL 路径含 `/product/` `/p/` `/item/`，或含 SKU 形态），**不依赖单一规则**。
- **去重** `canonicalize`：以 canonical URL + SKU + slug 归一，避免同品多 URL 重复入库。
- **SKU 提取** `extract_sku_from_url`：从 URL / `?sku=` / 路径段推断；缺失时合成 `AUTO-<hash>` 并标 `needs_review`（测试 09）。
- **限流**：`REQUEST_DELAY` / `CONCURITY` / `REQUEST_TIMEOUT` / `MAX_RETRIES`（指数退避）/ 本地 HTTP 缓存（同 URL 不重复抓取）。

---

## 4. Extraction logic（抽取策略，优先级降序）

`ExtractorStrategy.extract()` 依次尝试，缺失则降级，**绝不靠单一硬编码 CSS 选择器**：

1. **JSON-LD**（优先）：`parse_jsonld` 提取 `Product` / `Offer` / `AggregateRating` / `Brand` / `ImageObject` 节点（spec 13）。
2. **Meta tags**：`parse_meta` 取 `og:` / `twitter:` / `<meta name|property>` / 结构化 `application/ld+json`。
3. **语义 HTML**：`parse_semantic` 取 `<h1>` / `<title>` / `<img alt>` 等语义节点。
4. **文本正则**（兜底）：`parse_text_fallback` 在可见文本上跑材质/防水/重量/电池/可充电等模式（仅当模式带捕获组才取值，无组则记 presence，避免崩溃——测试 08/09）。
5. **纯文本兜底**：`parse_text_fallback` 的 `text` 截断 4000 字符，供 AI 富化消费。

源码标记 `jsonld_present`，供下游与可审计。

---

## 5. Field mapping logic（字段映射）

- `build_normalized` 把 `ExtractedProduct` 映射到 228 字段（`FieldValue` 带 provenance）。
- **类型归约**：`yes/no` → `_coerce_yesno`；数字 → `_coerce_number`；多选 → `_coerce_multiselect`（数组）。
- **primary_category 永不自动映射**：官方页极少直接给出 5 类之一，且属 AI 角色字段，留待 AI 富化/人工审阅（spec 锁定 5 值：Female / Male / Couples / BDSM / Water-Based）。
- **CJK 检测** `_has_cjk`：中英文名分别落 `product_name_cn` / `product_name_en`。
- **来源优先级** `SOURCE_PRIORITY`：official > catalog > sales_input > ai_inference；合并时高优覆盖低优（spec 15）。
- 所有字段写 `source_type` / `source_reference` / `confidence` / `last_verified`。

---

## 6. AI enrichment logic（AI 富化 —— 只填 AI 角色字段）

- **可离线**：默认 `AI_PROVIDER=heuristic`，确定性启发式（关键词词典：性别/风格/二级类/功能/场景），**无需 API key**。
- **OpenAI 兼容**：`openai` / `doubao`（豆包 OpenAI 兼容）走 chat completions，`SYSTEM_PROMPT` 明确**禁止编造商业字段**。
- **商业字段硬禁** `COMMERCIAL_FORBIDDEN_IDS`（MOQ / 价格 / 材质 / 防水 / 电池 / 认证 / 销量 / OEM 等）：
  富化前 `enrich()` 显式跳过这些 id（即便 LLM 返回也丢弃），缺失一律写 `null`（非 "N/A"，测试 10）。
- **仅填 AI 可判定字段** `AI_FILLABLE_IDS`：primary/secondary/tertiary 类目、功能/人群/场景/风格/市场/价格带/机会/定位标签、各项评分。
- 所有 AI 值 `source_type="ai_inference"`，可审计（见示例 provenance）。
- **图片**：AI 分类角色但**不删原图**，原 URL 与尺寸元信息保留在 `product_media`。

---

## 7. Validation rules（校验规则）

- **完整度** `data_completeness = 已完成 Required 字段数 / Required 字段数`（整数 %）。
- **推荐资格门控**：`recommendation_eligible = (status == active) AND (completeness >= 75) AND (compliance_verified == true)`
  —— 三者缺一不可进 AI 推荐池（spec 18/19/20）。
- **产品智能分** `product_intelligence_score`：`Q*0.20 + D*0.15 + F*0.15 + C*0.20 + M*0.15 + B*0.15`
  （质量/差异/功能/合规/市场/品牌，权重见 `product_master.SCORING`）。
- **needs_review**：低完整度 / 缺 SKU / AI 无法判定关键字段时自动置 True，待人工审阅。
- **compliance_verified**：默认 False，仅 `approve`（人工审阅）后由管线置 True。
- `validation.merge_and_validate` 按来源优先级合并多源，计算上述指标，产出 `ProductRecord`。

---

## 8. Import command

```bash
# 离线冒烟（无需官网，用 fixtures，推荐先跑）
python cli.py import --fixtures

# 显式 URL 入库
python cli.py import --urls https://site/product/a https://site/product/b

# 自动发现 + 入库（需先设 SHAKI_WEBSITE_URL）
python cli.py discover
python cli.py import --limit 50

# 下载图片元信息（尺寸/类型/大小），失败不中断（测试 07）
python cli.py import --fixtures --download-images
```
入库即落库 `data/processed/shaki_product_intelligence.db` + `data/raw/*.json`。

---

## 9. Export command

```bash
python cli.py export
# -> data/products/SHAKI_Product_Master_Export.xlsx
```
- Sheet `Product_Master`：表头 = `FIELD_ORDER`（与源 `SHAKI_Product_Master.xlsx` 列序一致），228 列。
- Sheet `Ingestion_Status`：`product_id / data_completeness / recommendation_eligible / needs_review / compliance_verified / product_version`。
- AI 推断单元格原样导出；provenance 留在 DB（人工审阅用 DB）。

---

## 10. Env vars

| 变量 | 默认 | 说明 |
|---|---|---|
| `SHAKI_WEBSITE_URL` | （空） | 爬取目标，**唯一入口**，绝不硬编码；留空则只能跑 fixtures |
| `REQUEST_DELAY` | `1.5` | 请求间隔（秒） |
| `CONCURRENCY` | `2` | 并发数 |
| `REQUEST_TIMEOUT` | `30` | 超时（秒） |
| `MAX_RETRIES` | `3` | 失败重试（指数退避） |
| `USER_AGENT` | `SHAKIProductBot/1.0 ...` | 自定义 UA |
| `DATABASE_URL` | `sqlite:///.../shaki_product_intelligence.db` | 本地 SQLite；生产改 `postgresql://...` |
| `AI_PROVIDER` | `heuristic` | `heuristic` / `openai` / `doubao` |
| `AI_API_KEY` | （空） | LLM key（heuristic 无需） |
| `AI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 base |
| `AI_MODEL` | `gpt-4o-mini` | 模型名 |
| `AI_TEMPERATURE` | `0.2` | 低温度保稳定 |
| `DATA_COMPLETENESS_MIN` | `75` | 进推荐池完整度阈值 |

复制 `.env.example` → `.env` 填写；`.env` 不入库。

---

## 11. Local dev instructions

```bash
# 1) 用托管 Python venv（已装 openpyxl / python-docx）
PY="C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"

# 2) 跑测试（全离线，32 项断言）
"$PY" tests/test_pipeline.py
# 期望：RESULT: 32 passed, 0 failed

# 3) 离线入库 + 状态 + 导出
"$PY" cli.py import --fixtures
"$PY" cli.py status
"$PY" cli.py recommend      # 完整度<75 且未 approve 时为空，符合预期
"$PY" cli.py export

# 4) 人工审阅 → 进推荐池
"$PY" cli.py approve PRD-SHAKI-FM-001   # 清 needs_review + 置 compliance_verified
# 完整度达 75% 且 status=active 后，recommend 才会出现该产品

# 5) 生产（Postgres + Prisma）
#    DATABASE_URL=postgresql://...  &&  prisma migrate dev && prisma generate
```

无 `npm` 依赖；纯标准库 + `openpyxl`（venv 已装）。

---

## 12. Example output

`python cli.py import --fixtures` 实际产出（本轮验证）：
```
{ "job_id": 1, "stats": { "discovered": 7, "created": 6, "updated": 1, "skipped": 0, "failed": 0 }, "errors": [] }
```

单品 `PRD-SHAKI-FM-001`（JSON-LD 样例）落库示例：
```json
{
  "product_id": "PRD-SHAKI-FM-001",
  "sku": "SHAKI-FM-001",
  "product_status": "Draft",
  "primary_category": null,            // ← 永不自动映射，留待 AI/人工
  "product_name_en": "Velvet Pulse Massager",
  "data_completeness": 46,
  "recommendation_eligible": 0,        // ← 完整度<75 且未 approve
  "needs_review": 0,
  "compliance_verified": 1,
  "product_version": 2,                // ← 改版后版本保留
  "product_intelligence_score": "83",
  "secondary_category": "Massagers",
  "target_gender": "Female",
  "design_style": "[\"Premium\"]",
  "audience_tags": "[\"Female\", \"Premium\"]",
  "scenario_tags": "[\"Date Night\"]",
  "_provenance_sample": {
    "target_gender": { "source_type": "ai_inference", "source_reference": "ai:heuristic",
                       "confidence": 0.5, "last_verified": "2026-09-15T04:26:20+00:00" }
  },
  "_media_count": 1
}
```

`status` 输出（6 品均 Draft / needs_review / 未进池，门控正确）：
```
PRD-SHAKI-FM-001  status=Draft  completeness= 46%  eligible=False  review=False
PRD-SHAKI-CP-002  status=Draft  completeness= 31%  eligible=False  review=True
PRD-SHAKI-WB-003  status=Draft  completeness= 34%  eligible=False  review=True
PRD-SHAKI-NJ-005  status=Draft  completeness= 40%  eligible=False  review=True
PRD-SHAKI-BI-006  status=Draft  completeness= 11%  eligible=False  review=True
AUTO-EC579645E3   status=Draft  completeness= 20%  eligible=False  review=True   # 无 SKU 合成 ID
```

---

## 13. Known limitations

1. **商业字段靠官方页供给**：MOQ/价格/材质/防水/电池/认证/销量/OEM 等若官网未明示，一律 `null`；不靠 AI 编造（spec 硬约束）。
2. **primary_category 需人工/AI 判定**：官方页几乎不直接给 5 类标签，管线不自动映射，当前样例多为 `null`。
3. **完整度偏低**：fixtures 为最小样例，Required 字段覆盖少（11–46%），故无品进推荐池——需真实官网数据 + 人工补字段。
4. **LLM 富化未联网验证**：本轮以 `heuristic` 跑通；接 `doubao`/`openai` 需真实 key，且需人工抽检 AI 标签质量。
5. **图片下载为 best-effort**：仅探测元信息（HEAD），不下载原图到本地（避免大体积）；坏图 URL 保留并标 `fetched=0`（测试 07）。
6. **SQLite 仅供本地**：生产并发/查询用 Postgres（Prisma schema 已备）；`db.py` 对 `postgresql://` URL 会显式报错提示切 Prisma。
7. **`product_intelligence_score` 以字符串存储**：为兼容 228 TEXT 列，读取时按需 `int()`；生产 JSONB 可改数值型。
8. **去重粒度**：以 SKU + canonical + content_hash；同品多语言 URL 若 canonical 一致则合并，否则可能各成一品，需人工归并。
9. **Phase 02 未实现**：客户研究 / 匹配 / 6D Fit / 提案 / 分享 / 销售反馈 / AI 学习 均为预留，本阶段不产出。
```
