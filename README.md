# SHAKI AI Product Match

面向 SHAKI 外贸团队的 **AI 客户研究 · 产品匹配 · 销售提案生成** 平台（B2B AI Sales Intelligence）。中英双语，纯静态部署。

## 目录结构

```
shaki-ai-product-match/
├── docs/                                   # 产品规范来源（唯一权威）
│   ├── SHAKI_Product_Master.xlsx           #   产品主数据 / SKU 总表
│   ├── SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx   # 匹配引擎技术 PRD
│   └── SHAKI_AI_Product_Match_UI_UX_Design_Spec_V4.0.docx # UI/UX 设计规范
├── apps/
│   └── web/                                # Next.js 14 应用（静态导出）
├── packages/                               # 未来可抽出的共享包（暂空）
├── scripts/                                # 构建/数据处理脚本（暂空）
├── data/
│   ├── raw/                                # 原始数据（暂空）
│   ├── processed/                          # 清洗后数据（暂空）
│   └── products/                           # 产品数据导出（暂空）
└── README.md
```

## ⚠️ 产品规范来源约定（最重要）

**以后任何修改「产品逻辑 / 匹配引擎 / 产品库 / UI 呈现」的工作，统一以 `docs/` 下的三个文件为唯一权威来源**：

1. `docs/SHAKI_Product_Master.xlsx` — 产品主数据、SKU 字段、价格/MOQ/认证
2. `docs/SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx` — 六维匹配评分、AI 画像、推荐逻辑
3. `docs/SHAKI_AI_Product_Match_UI_UX_Design_Spec_V4.0.docx` — 视觉规范、交互、文案口径

> 给 Codex / 任何 Agent 的指令：**改产品逻辑前，先读取 `docs/` 这三个文件**，以其中的字段、权重、口径为准；不要凭记忆、不要引用已被本仓库移除的旧 `PRD` / `SHAKI PRODUCT INTELLIGENCE` 文本。改完同步回写对应文档，保持代码与规范一致。

## 应用（apps/web）

Next.js 14.2 + TypeScript + Tailwind CSS，`output: 'export'` 纯静态。

```bash
cd apps/web
npm install
npm run build          # 预渲染到 .next/server/app（沙箱会拦截末尾的 .next 清理，忽略即可）
node assemble-out.mjs  # 手动拼装静态产物到 out/（规避沙箱 bulk-delete 守卫）
```

静态产物在 `apps/web/out/`，可直接托管或部署到 WorkBuddy Sites。

## 部署

`apps/web/out/` → WorkBuddy Sites 静态托管（已上线：https://565fc6d099714e64b526ca197fe127ff.app.workbuddy.host）。
