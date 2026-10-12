import { Lang, LocalizedText, OpportunityItem, OpportunityKind } from './types';

export const dictionary: Record<string, Record<Lang, string>> = {
  appTitle: { zh: 'SHAKI AI 产品匹配', en: 'SHAKI AI Product Match' },
  appSubtitle: { zh: 'AI 客户研究与产品推荐平台', en: 'AI Client Intelligence & Product Matching Platform' },
  login: { zh: '登录', en: 'Login' },
  dashboard: { zh: '工作台', en: 'Dashboard' },
  dashboardNav: { zh: '工作台', en: 'Dashboard' },
  newClient: { zh: '新建客户', en: 'New Client' },
  newClientNav: { zh: '新客户', en: 'New Client' },
  analyzeClient: { zh: '分析客户', en: 'Analyze Client' },
  clientIntelligence: { zh: '客户情报', en: 'Client Intelligence' },
  recommendedProducts: { zh: '推荐产品', en: 'Recommended Products' },
  productDetail: { zh: '产品详情', en: 'Product Detail' },
  proposalBuilder: { zh: '方案生成', en: 'Proposal Builder' },
  proposalPreview: { zh: '方案预览', en: 'Proposal Preview' },
  sharePage: { zh: '分享页面', en: 'Share Page' },
  productLibrary: { zh: '产品库', en: 'Product Library' },
  libraryNav: { zh: '产品库', en: 'Product Library' },
  proposalsNav: { zh: '方案', en: 'Proposals' },
  clients: { zh: '客户', en: 'Clients' },
  analyzed: { zh: '已分析', en: 'Analyzed' },
  proposals: { zh: '方案', en: 'Proposals' },
  shared: { zh: '已发送', en: 'Shared' },
  responses: { zh: '客户回复', en: 'Responses' },
  samples: { zh: '样品需求', en: 'Samples' },
  orders: { zh: '成交订单', en: 'Orders' },
  findRightProducts: { zh: '找到真正适合每一个客户的产品', en: 'Find the Right Products for Every Client' },
  heroDescription: { zh: '输入客户信息，让 AI 研究客户，并从 SHAKI 产品库中找到最适合的产品。', en: 'Let AI research your client and discover the SHAKI products that fit their business, brand and market.' },
  mainCategories: { zh: '客户主营品类', en: 'Main Business Categories' },
  mainCategoriesPlaceholder: { zh: '例如：女性健康、情趣用品、美容护理、生活方式', en: 'e.g. Women\'s Wellness, Intimate Care, Beauty, Lifestyle' },
  clientWebsite: { zh: '客户网站', en: 'Client Website' },
  clientWebsitePlaceholder: { zh: 'https://www.example.com', en: 'https://www.example.com' },
  socialMedia: { zh: '社交媒体', en: 'Social Media' },
  socialMediaPlaceholder: { zh: '粘贴社交媒体链接', en: 'Paste social media URL' },
  advancedOptions: { zh: '高级筛选', en: 'Advanced Options' },
  targetMarket: { zh: '目标市场', en: 'Target Market' },
  customerType: { zh: '客户类型', en: 'Customer Type' },
  recommendationGoal: { zh: '推品目标', en: 'Recommendation Goal' },
  startAnalyzing: { zh: '开始分析客户', en: 'Analyze Client' },
  // Step labels for the analyze progress walk live as data in app/analyze/page.tsx (they pair a
  // zh/en string with the pipeline stage they describe). The six `analyzing*`/`matching*` keys that
  // used to sit here were a never-referenced second copy, and they still described fetching the
  // client's website and social accounts — work this build never does. Removed rather than kept as
  // a misleading duplicate.
  brand: { zh: '品牌名称', en: 'Brand' },
  market: { zh: '目标市场', en: 'Market' },
  businessType: { zh: '客户类型', en: 'Business Type' },
  pricePosition: { zh: '价格定位', en: 'Price Position' },
  brandDna: { zh: '品牌 DNA', en: 'Brand DNA' },
  brandPositioning: { zh: '品牌定位', en: 'Brand Positioning' },
  visualStyle: { zh: '视觉风格', en: 'Visual Style' },
  targetAudience: { zh: '目标人群', en: 'Target Audience' },
  customerProductPortfolio: { zh: '客户产品结构', en: 'Customer Product Portfolio' },
  productLineMap: { zh: '产品线地图', en: 'Product Line Map' },
  portfolioMap: { zh: '产品线地图', en: 'Product Line Map' },
  clientOpportunities: { zh: '客户机会', en: 'Client Opportunities' },
  clientSummary: { zh: '客户概览', en: 'Client Summary' },
  missingCategory: { zh: '缺失品类', en: 'Missing Category' },
  priceGap: { zh: '价格带空缺', en: 'Price Gap' },
  functionalGap: { zh: '功能空缺', en: 'Functional Gap' },
  premiumOpportunity: { zh: '高端产品机会', en: 'Premium Opportunity' },
  newCategoryOpportunity: { zh: '新品类机会', en: 'New Category Opportunity' },
  selectedBasedOn: { zh: '基于客户品牌、产品结构、用户群体和市场定位，为您筛选出的 SHAKI 产品。', en: 'SHAKI products selected based on the client\'s brand, portfolio, audience and market positioning.' },
  bestMatch: { zh: '最佳匹配', en: 'Best Match' },
  growthOpportunity: { zh: '增长机会', en: 'Growth Opportunity' },
  productLineExpansion: { zh: '产品线扩展', en: 'Product Line Expansion' },
  strategicProducts: { zh: '战略产品', en: 'Strategic Products' },
  sixDimensionScore: { zh: '六维适配评分', en: 'Six-Dimension Fit Score' },
  excellentMatch: { zh: '高度匹配', en: 'Excellent Match' },
  strongMatch: { zh: '强匹配', en: 'Strong Match' },
  potentialMatch: { zh: '潜力匹配', en: 'Potential Match' },
  moderateMatch: { zh: '一般匹配', en: 'Moderate Match' },
  lowMatch: { zh: '低匹配', en: 'Low Match' },
  categoryFit: { zh: '品类适配', en: 'Category Fit' },
  audienceFit: { zh: '用户适配', en: 'Audience Fit' },
  brandFit: { zh: '品牌风格适配', en: 'Brand Fit' },
  priceFit: { zh: '价格带适配', en: 'Price Fit' },
  portfolioFit: { zh: '产品线适配', en: 'Portfolio Fit' },
  marketFit: { zh: '市场潜力', en: 'Market Fit' },
  potentialScore: { zh: '潜力分', en: 'Potential Score' },
  whyRecommend: { zh: '为什么推荐', en: 'Why We Recommend' },
  viewProduct: { zh: '查看产品', en: 'View Product' },
  addToProposal: { zh: '加入方案', en: 'Add to Proposal' },
  removeFromProposal: { zh: '移除方案', en: 'Remove' },
  productOverview: { zh: '产品概述', en: 'Product Overview' },
  keyFeatures: { zh: '核心卖点', en: 'Key Features' },
  technicalSpecifications: { zh: '技术规格', en: 'Technical Specifications' },
  clientFit: { zh: '客户适配', en: 'Client Fit' },
  suggestedPositioning: { zh: '建议定位', en: 'Suggested Positioning' },
  suggestedSegment: { zh: '建议客户群', en: 'Suggested Customer Segment' },
  marketOpportunity: { zh: '市场机会', en: 'Market Opportunity' },
  oemOdmCapability: { zh: 'OEM / ODM 能力', en: 'OEM / ODM Capability' },
  moq: { zh: 'MOQ', en: 'MOQ' },
  leadTime: { zh: '交期', en: 'Lead Time' },
  askAi: { zh: 'AI 助手', en: 'Ask AI' },
  compareProducts: { zh: '产品对比', en: 'Compare Products' },
  createProposal: { zh: '创建产品方案', en: 'Create Proposal' },
  singleProduct: { zh: '单品推荐', en: 'Single Product' },
  productCollection: { zh: '产品组合', en: 'Product Collection' },
  productLineProposal: { zh: '产品线方案', en: 'Product Line Proposal' },
  proposalCover: { zh: '产品推荐方案', en: 'Product Recommendation' },
  more: { zh: '更多', en: 'More' },
  topFit: { zh: '最高适配分', en: 'Top Fit' },
  loading: { zh: '加载中…', en: 'Loading…' },
  proposalNotFound: { zh: '未找到该方案', en: 'Proposal not found' },
  preparedFor: { zh: '为', en: 'Prepared for' },
  curatedBy: { zh: '定制', en: 'Curated by SHAKI' },
  aboutYourBrand: { zh: '关于您的品牌', en: 'About Your Brand' },
  whyWeSelectedIt: { zh: '选择理由', en: 'Why We Selected It' },
  productSpecifications: { zh: '产品规格', en: 'Product Specifications' },
  nextStep: { zh: '下一步', en: 'Next Step' },
  nextStepText: { zh: '如果您对以上产品感兴趣，我们可以进一步提供样品、报价及 OEM/ODM 方案。', en: 'If any of the recommended products are of interest, we would be happy to provide samples, pricing and OEM/ODM options for further discussion.' },
  requestSample: { zh: '索取样品', en: 'Request Sample' },
  discussOem: { zh: '洽谈 OEM/ODM', en: 'Discuss OEM/ODM' },
  shareProposal: { zh: '分享方案', en: 'Share Proposal' },
  downloadPdf: { zh: '下载 PDF', en: 'Download PDF' },
  shareLink: { zh: '分享链接', en: 'Share Link' },
  allProducts: { zh: '全部产品', en: 'All Products' },
  newProducts: { zh: '新品', en: 'New Products' },
  bestSellers: { zh: '爆品', en: 'Best Sellers' },
  search: { zh: '搜索', en: 'Search' },
  productName: { zh: '产品名称', en: 'Product Name' },
  category: { zh: '品类', en: 'Category' },
  sku: { zh: 'SKU', en: 'SKU' },
  feature: { zh: '功能', en: 'Feature' },
  price: { zh: '价格', en: 'Price' },
  status: { zh: '状态', en: 'Status' },
  goBack: { zh: '返回', en: 'Go Back' },
  backToDashboard: { zh: '返回工作台', en: 'Back to Dashboard' },
  save: { zh: '保存', en: 'Save' },
  continue: { zh: '继续', en: 'Continue' },
  submit: { zh: '提交', en: 'Submit' },
  cancel: { zh: '取消', en: 'Cancel' },
  clear: { zh: '清空', en: 'Clear' },
  noData: { zh: '暂无数据', en: 'No data available' },
  basedOn: { zh: '判断依据', en: 'Based on' },
  clientWebsiteSource: { zh: '客户官网', en: 'Client Website' },
  productPortfolio: { zh: '产品结构', en: 'Product Portfolio' },
  socialMediaSource: { zh: '社交媒体', en: 'Social Media' },
  marketSource: { zh: '市场', en: 'Market' },
  brandStyle: { zh: '品牌风格', en: 'Brand Style' },
  whiteLabelBrand: { zh: '白标品牌名（公司名）', en: 'White-label Brand Name' },
  whiteLabelBrandPlaceholder: { zh: '留空则显示 SHAKI；白标模式将以该名替换 SHAKI 呈现给客户', en: 'Leave empty to show SHAKI; white-label replaces SHAKI with this name on the share page' },
  poweredBy: { zh: '由 SHAKI AI Product Match 提供技术支持', en: 'Powered by SHAKI AI Product Match' },
  // --- Login (P01) ---
  email: { zh: '邮箱', en: 'Email' },
  password: { zh: '密码', en: 'Password' },
  forgotPassword: { zh: '忘记密码', en: 'Forgot password' },
  welcome: { zh: '欢迎使用 SHAKI AI Product Match', en: 'Welcome to SHAKI AI Product Match' },
  signIn: { zh: '登录', en: 'Sign in' },
  signingIn: { zh: '登录中', en: 'Signing in' },
  incorrectCredentials: { zh: '邮箱或密码不正确', en: 'Incorrect email or password' },
  signOut: { zh: '退出登录', en: 'Sign out' },
  // Shell chrome that only exists below `lg`, where the sidebar becomes a drawer.
  navMenu: { zh: '打开导航菜单', en: 'Open navigation menu' },
  closeNav: { zh: '关闭导航菜单', en: 'Close navigation menu' },
  // Shown to whoever opens a shared proposal link, i.e. someone with nothing in local storage.
  sharedProposalView: { zh: '您正在查看他人分享的产品方案', en: 'You are viewing a product proposal shared with you' },
  sharedProposalPartial: { zh: '部分产品的评分未能重新计算，仅显示已恢复的产品', en: 'Scores could not be recomputed for every product; only recovered products are shown' },
  // --- New Client right panel (P03) ---
  whatAiAnalyzes: { zh: 'AI 将分析以下内容', en: 'What AI will analyze' },
  enterWebsiteToBegin: { zh: '输入一个官网即可开始', en: 'Enter a website to begin' },
  enterValidUrl: { zh: '请输入有效网址', en: 'Enter a valid URL' },
  // --- Client Intelligence (P05) ---
  confidence: { zh: '可信度', en: 'Confidence' },
  highConfidence: { zh: '高可信', en: 'High Confidence' },
  mediumConfidence: { zh: '中可信', en: 'Medium Confidence' },
  lowConfidence: { zh: '低可信', en: 'Low Confidence' },
  // Score bands — keys are referenced by `config/matching.ts` `scoreBands` and rendered by
  // `components/scoreBand.ts`. The old `FitBadge` hard-coded the English side of these.
  bandExcellent: { zh: '优秀', en: 'Excellent' },
  bandStrong: { zh: '良好', en: 'Strong' },
  bandFair: { zh: '一般', en: 'Fair' },
  bandWeak: { zh: '偏弱', en: 'Weak' },
  someInferred: { zh: '部分信息为推断', en: 'Some insights are inferred' },
  limitedEvidence: { zh: '暂无足够公开资料', en: 'Limited public evidence' },
  // PRD §16 `related_products`. The note says where these come from, because a rep must not read
  // them as client research — they are catalogue-to-catalogue relations.
  relatedProducts: { zh: '关联产品', en: 'Related products' },
  relatedProductsNote: {
    zh: '根据产品主库字段推导，非客户资料',
    en: 'Derived from Product Master fields, not client research',
  },
  crossSell: { zh: '连带推荐', en: 'Cross-sell' },
  upsell: { zh: '向上推荐', en: 'Upsell' },
  alternative: { zh: '同类替代', en: 'Alternative' },
  // PRD §16 output contract, surfaced on the recommendations page so the contract is live.
  exportAnalysisJson: { zh: '导出分析 JSON', en: 'Export analysis JSON' },
  exportedJson: { zh: '已导出', en: 'Exported' },
  exportAnalysisHint: {
    zh: '按 PRD §16 输出契约导出本次分析结果',
    en: 'Exports this analysis in the PRD §16 output contract',
  },
  viewRecommendations: { zh: '查看推荐产品', en: 'View Recommendations' },
  editClient: { zh: '编辑客户信息', en: 'Edit Client' },
  topMatch: { zh: '最佳匹配', en: 'Best Match' },
  // --- Recommendations (P06) ---
  shortlist: { zh: '候选清单', en: 'Shortlist' },
  inShortlist: { zh: '已加入候选', en: 'In shortlist' },
  removeFromShortlist: { zh: '移出候选', en: 'Remove' },
  filterByCategory: { zh: '按品类筛选', en: 'Filter by category' },
  allCategories: { zh: '全部品类', en: 'All Categories' },
  sortBy: { zh: '排序', en: 'Sort' },
  noStrongMatches: { zh: '暂无高匹配产品', en: 'No strong matches found' },
  limitedCoverage: { zh: '匹配范围有限', en: 'Limited match coverage' },
  matchCoverageNote: {
    zh: '匹配范围受构建时的产品库与销售录入信息所限',
    en: 'Match coverage is limited to the catalog bundled at build time and the details the rep entered',
  },
  researchGateNote: { zh: '请先登录以继续使用', en: 'Please sign in to continue' },
  aiInferred: { zh: 'AI 推断', en: 'AI inferred' },
  whyThisScore: { zh: '为什么是这个分数？', en: 'Why this score?' },
  // --- PRD §16: separate observed facts from inferences ---
  inferenceDisclosure: {
    zh: '以下机会点由销售填写的客户信息推导得出，属于推断，尚未经客户官网或社媒核实。',
    en: 'These opportunities are inferred from the details the rep entered. They are not yet verified against the client website or social channels.',
  },
  // --- PRD §17 fallback: no candidate clears the Fit floor ---
  // The threshold is deliberately NOT written into these strings. It comes from
  // `config/matching.ts` `thresholds.fitMinimumFallback` and is rendered beside this label, because a
  // number baked into the copy starts lying the moment the threshold moves.
  limitedMatchBanner: { zh: '未达到强匹配线', en: 'Below the strong-match threshold' },
  limitedMatchBannerHint: {
    zh: '本次没有任何产品达到强匹配线，以下为相关性最高的候选，请结合低/中置信度谨慎对外沟通。',
    en: 'No product cleared the strong-match line. These are the closest candidates — communicate them as low/medium confidence.',
  },
  // --- The catalogue has nothing in this buyer's categories (see matching.ts) ---
  // A different fact from the strong-match banner: that one is about scores, this one about stock.
  // The rep needs the second one, because "we do not make that" is a conversation with the buyer
  // rather than a ranking problem.
  noStockBanner: { zh: '该客户品类暂无产品', en: 'Nothing in this buyer\'s categories' },
  noStockBannerHint: {
    zh: '我们当前货盘里没有属于该客户品类的产品。下方是相邻品类的候选，仅供扩品沟通参考，不建议作为主推。',
    en: 'Our catalogue holds nothing in these categories. The candidates below are adjacent categories — useful for a range-extension conversation, not as the lead offer.',
  },
  // --- Missing commercial terms (PRD TABLE 10) ---
  // A row can clear the completeness gate and still carry no price or MOQ. Hide the terms instead of
  // printing a label with a dash next to it, and point at the one action that can fill the gap.
  requestQuote: { zh: '索取报价', en: 'Request Quote' },
  requestQuoteHint: {
    zh: '该 SKU 暂无报价与 MOQ 数据，请凭 SKU 向销售索取正式报价。',
    en: 'No price or MOQ on file for this SKU. Ask SHAKI sales for a formal quote.',
  },
  // --- Rows that carry no score at all ---
  // `scoreBand(undefined)` falls through to the lowest band, so an unscored row would otherwise draw
  // a red "weak" ring with no number: absence rendered as a bad score.
  noScoreYet: { zh: '暂无评分', en: 'Not scored yet' },
  noScoreHint: {
    zh: '该 SKU 尚未评分（评分所需参数未补齐），因此不显示分数。',
    en: 'This SKU has not been scored — the parameters it needs are not filled in — so no score is shown.',
  },
  potentialShort: { zh: '潜力', en: 'Pot' },
  recallScore: { zh: '召回分', en: 'Recall' },
  recallCutoff: { zh: '召回线', en: 'Recall cutoff' },
  pipelineTrace: { zh: '分数链路', en: 'Score trace' },
  // --- Evidence sources (PRD §13 priority order) ---
  ev_client_website: { zh: '客户官网', en: 'Client Website' },
  ev_client_product_portfolio: { zh: '客户产品线', en: 'Client Product Portfolio' },
  ev_client_social: { zh: '客户社媒', en: 'Client Social' },
  ev_market_research: { zh: '市场调研', en: 'Market Research' },
  ev_product_master: { zh: '产品主库', en: 'Internal Product Master' },
  ev_sales_input: { zh: '销售录入', en: 'Sales Input' },
  // --- Analysis scope disclosure (this build fetches nothing) ---
  analysisScopeNote: {
    zh: '本平台不会抓取客户官网或社媒内容，分析完全基于你填写的信息，因此置信度最高只到「中」。',
    en: 'This platform does not fetch the client website or social accounts. The analysis rests entirely on what you enter, so confidence is capped at Medium.',
  },
  analysisStepsTitle: { zh: '正在分析你填写的信息', en: 'Analyzing the information you entered' },
  // --- Candidate layer parked (measured, not assumed) ---
  candidateParkedTitle: { zh: '候选层已停用', en: 'Candidate layer parked' },
  candidateParkedBody: {
    zh: '官网抓取的 {n} 行只在货号层面有数据。实测：AI 按证据规则补齐后完整度最高 47%，门槛 75，永远进不了评分池；详情图自 2026-08-15 起上传的那批已失效，规格与价格无法从任何来源还原。当前评分池只有自有货盘。',
    en: 'The crawled rows carry a SKU and little else. Measured: after evidence-gated AI enrichment the best row reaches 47% against a 75 gate, so none can ever score; the detail images uploaded from 2026-08-15 onward are gone, and specs and price cannot be recovered from any source. The scoring pool is the curated catalogue only.',
  },
  candidateParkedPool: { zh: '当前评分池', en: 'Scoring pool now' },
  candidateParkedOnly: { zh: '仅自有货盘 · {n} 款', en: 'Curated catalogue only · {n}' },
  candidateNotScoring: { zh: '不参与推荐', en: 'Not scored' },
  manualFillOptional: { zh: '仍要手动补参数（可选）', en: 'Fill parameters manually (optional)' },
  manualFillHint: {
    zh: '默认收起。只有在确实要让某一行进入评分池时才需要展开——补齐后完整度需达到门槛 {gate}%。',
    en: 'Collapsed by default. Open it only when a specific row really should enter the scoring pool; completeness must reach {gate}%.',
  },
  // --- Official-website fetching (real, since the fetcher service landed) ---
  crawlStep: { zh: '抓取客户官网', en: 'Fetching the client website' },
  analysisScopeNoteLive: {
    zh: '本平台只抓取你填写的那一个官网（不抓社媒、不做市场调研）；抓取失败时分析回退到你填写的信息，置信度上限降为「中」。',
    en: 'This platform fetches only the one website you enter (no social accounts, no market research). If that fetch fails, the analysis falls back to what you enter and confidence is capped at Medium.',
  },
  analysisScopeLive: {
    zh: '分析会先抓取你填写的官网，再结合你填写的信息匹配货盘。',
    en: 'The analysis fetches the website you enter first, then matches the catalog against it and what you entered.',
  },
  // --- Client market labels ---
  mk_Global: { zh: '全球', en: 'Global' },
  mk_US: { zh: '美国', en: 'United States' },
  mk_UK: { zh: '英国', en: 'United Kingdom' },
  mk_EU: { zh: '欧盟', en: 'European Union' },
  mk_Australia: { zh: '澳大利亚', en: 'Australia' },
  mk_Japan: { zh: '日本', en: 'Japan' },
  mk_Korea: { zh: '韩国', en: 'Korea' },
  'mk_Southeast Asia': { zh: '东南亚', en: 'Southeast Asia' },
  'mk_Middle East': { zh: '中东', en: 'Middle East' },
  // --- Client visual-style tags ---
  style_Minimal: { zh: '极简', en: 'Minimal' },
  style_Premium: { zh: '高端', en: 'Premium' },
  style_Luxury: { zh: '奢华', en: 'Luxury' },
  style_Cute: { zh: '可爱趣味', en: 'Cute' },
  style_Medical: { zh: '医疗感', en: 'Medical' },
  style_Wellness: { zh: '健康养护', en: 'Wellness' },
  style_Modern: { zh: '现代', en: 'Modern' },
  style_Feminine: { zh: '女性向', en: 'Feminine' },
  // --- Client business type (stored as an English enum code, must never reach the zh UI raw) ---
  bt_Brand: { zh: '品牌方', en: 'Brand' },
  bt_Distributor: { zh: '经销商', en: 'Distributor' },
  bt_Retailer: { zh: '零售商', en: 'Retailer' },
  bt_Wholesaler: { zh: '批发商', en: 'Wholesaler' },
  'bt_E-commerce': { zh: '电商', en: 'E-commerce' },
  'bt_Amazon Seller': { zh: '亚马逊卖家', en: 'Amazon Seller' },
  'bt_Chain Store': { zh: '连锁门店', en: 'Chain Store' },
  bt_Boutique: { zh: '精品店', en: 'Boutique' },
  'bt_OEM/ODM Buyer': { zh: 'OEM/ODM 采购方', en: 'OEM/ODM Buyer' },
  unset: { zh: '未指定', en: 'Unspecified' },
  // --- Client goal (analyze form) ---
  'goal_New Product': { zh: '新品引入', en: 'New Product' },
  goal_Bestseller: { zh: '爆款打造', en: 'Bestseller' },
  goal_Premium: { zh: '高端升级', en: 'Premium' },
  'goal_High Margin': { zh: '高毛利', en: 'High Margin' },
  'goal_Product Line Expansion': { zh: '产品线扩充', en: 'Product Line Expansion' },
  'goal_OEM/ODM': { zh: 'OEM/ODM 代工', en: 'OEM/ODM' },
  // --- Proposal Editor / Preview / Share (P09–P11) ---
  editProposal: { zh: '编辑方案', en: 'Edit Proposal' },
  aiGenerateCopy: { zh: 'AI 生成文案', en: 'AI Generate Copy' },
  generatingCopy: { zh: '生成中…', en: 'Generating…' },
  proposalTitle: { zh: '方案标题', en: 'Proposal Title' },
  proposalTitlePlaceholder: { zh: '例如：为 XX 精选的秋季新品组合', en: 'e.g. Curated Fall Collection for XX' },
  proposalNarrative: { zh: '方案文案', en: 'Proposal Narrative' },
  proposalNarrativePlaceholder: { zh: '点击「AI 生成文案」自动撰写，或在此手动编辑', en: 'Click "AI Generate Copy" to draft, or edit manually' },
  copyGenerated: { zh: '文案已生成', en: 'Copy generated' },
  addFromRecommendations: { zh: '从推荐补充', en: 'Add from Recommendations' },
  proposalProducts: { zh: '方案产品', en: 'Proposal Products' },
  preview: { zh: '预览', en: 'Preview' },
  openShare: { zh: '打开分享页', en: 'Open Share Page' },
  copyLink: { zh: '复制链接', en: 'Copy Link' },
  linkCopied: { zh: '链接已复制', en: 'Link copied' },
  shareProposalHint: { zh: '生成对外分享链接（客户以白标品牌查看）', en: 'Generate the client-facing share link (white-labeled)' },
  selectProposalToShare: { zh: '选择一个方案以生成分享链接', en: 'Select a proposal to generate a share link' },
  productCount: { zh: '款产品', en: 'products' },
  // --- Compare (P07) ---
  comparePick: { zh: '选择对比产品', en: 'Pick Products to Compare' },
  selectProductsToCompare: { zh: '勾选左侧产品加入对比', en: 'Select products on the left to compare' },
  comparedProducts: { zh: '对比中', en: 'In Comparison' },
  emptyCompare: { zh: '请至少选择 2 款产品进行横向对比', en: 'Select at least 2 products to compare side by side' },
  removeFromCompare: { zh: '移出对比', en: 'Remove from compare' },
  compareFromShortlist: { zh: '对比候选', en: 'Compare Shortlist' },
  sendToProposal: { zh: '生成产品方案', en: 'Create Proposal' },
  compareSummary: { zh: '横向对比', en: 'Side-by-Side Comparison' },
  // --- Matching engine / unified library (PRD V4.0) ---
  curatedTop5: { zh: '策展 Top 5', en: 'Curated Top 5' },
  curatedTop5Hint: {
    zh: '按最终推荐分排序，经多样性重排与角色槽位策展所得',
    en: 'Ranked by Final Recommendation Score, after diversity rerank and role-slot curation',
  },
  moreCandidates: { zh: '其余候选', en: 'Other Candidates' },
  moreCandidatesHint: {
    zh: '已通过硬性过滤但仍留在候选池，未被选入 Top 5',
    en: 'Cleared the hard filter but not curated into the Top 5',
  },
  finalScore: { zh: '最终推荐分', en: 'Final Score' },
  fitScore: { zh: '适配分', en: 'Fit' },
  pipelineTitle: { zh: '匹配流程', en: 'Match Pipeline' },
  pipelineHint: {
    zh: '确定性引擎：同一客户与同一货盘，结果逐位一致，可复算',
    en: 'Deterministic: the same client and library always yield identical, recomputable output',
  },
  libraryLayers: { zh: '货盘构成', en: 'Library Layers' },
  scoringEligible: { zh: '可评分', en: 'scoring-eligible' },
  completeness: { zh: '数据完整度', en: 'Data Completeness' },
  completenessGate: { zh: '评分门槛', en: 'Scoring gate' },
  layerBrand: { zh: '自有货盘', en: 'Brand catalogue' },
  layerCandidate: { zh: '官网抓取', en: 'Crawled' },
  layerAsset: { zh: '供应商媒体包', en: 'Supplier media' },
  evidenceTitle: { zh: '判断依据', en: 'Evidence' },
  enrichmentTitle: { zh: '待补参数队列', en: 'Enrichment Queue' },
  enrichmentHint: {
    zh: '以下为官网抓取货盘中字段最全的 SKU。补齐 PM 参数后会自动升入评分池，无需改代码。',
    en: 'The richest crawled SKUs. Once a PM fills the parameters, they auto-promote into the scoring pool — no code change.',
  },
  pmRequired: { zh: '需 PM 补充', en: 'PM must supply' },
  missingCrawl: { zh: '抓取字段缺口', en: 'Crawl field gaps' },
  slotLabel: { zh: '槽位', en: 'Slot' },
  notCurated: { zh: '候选', en: 'Candidate' },
  curationFallback: { zh: '品类下限已放宽', en: 'Category floor relaxed' },
  curationFallbackHint: {
    zh: '品类相关的货盘不足，该槽位由放宽品类下限后的兜底结果填充——建议向客户说明这是品类拓展机会而非同类替换。',
    en: 'Too few category-relevant SKUs; this slot fell back past the category floor — pitch it as a line-extension play, not a like-for-like swap.',
  },
  // --- Enrichment workbench ---
  enrichmentNav: { zh: '补参数', en: 'Enrichment' },
  enrichmentWorkbench: { zh: '补参数工作台', en: 'Enrichment Workbench' },
  enrichmentIntro: {
    zh: '抓取货盘字段稀疏、进不了评分池。这里补齐参数后，该 SKU 会自动升入评分池——不需要改代码。',
    en: 'Crawled rows are too sparse to score. Fill the parameters here and the SKU auto-promotes into the scoring pool — no code change.',
  },
  scoringPool: { zh: '评分池', en: 'Scoring pool' },
  poolHint: { zh: '当前能参与匹配打分的 SKU 数', en: 'SKUs that can currently be scored' },
  candidateList: { zh: '抓取货盘', en: 'Crawled rows' },
  searchPlaceholder: { zh: '搜索 SKU / 品名…', en: 'Search SKU / name…' },
  pickRow: { zh: '从左侧选一条抓取货盘开始补参数', en: 'Pick a crawled row on the left to start' },
  requiredField: { zh: '必填', en: 'Required' },
  optionalField: { zh: '选填', en: 'Optional' },
  bundle: { zh: '套装', en: 'Bundle' },
  // Headings for the three-part recommendation rationale. The markup hard-coded "Client ·" /
  // "Product ·" / "Business ·", so the Chinese UI showed English section labels above Chinese text.
  factClient: { zh: '客户', en: 'Client' },
  factProduct: { zh: '产品', en: 'Product' },
  factBusiness: { zh: '商业', en: 'Business' },
  alreadyFilled: { zh: '抓取已有', en: 'From crawl' },
  saveToPool: { zh: '保存并入库', en: 'Save to pool' },
  savedToPool: { zh: '已保存', en: 'Saved' },
  promotedNow: { zh: '已进入评分池', en: 'In the scoring pool' },
  // A hand-filled row enters the pool whatever its completeness; the percentage is still shown so the
  // gap is visible, but it no longer blocks the row.
  // Protocol token: identical in both languages, but it goes through the dictionary so the JSX scan
  // stays a reliable signal instead of accumulating exemptions.
  httpStatusLine: { zh: 'HTTP {code}', en: 'HTTP {code}' },
  needCategory: { zh: '需先选择一级品类', en: 'Pick a primary category first' },
  pooledAnyway: { zh: '已入库（完整度低于门槛，人工填写优先）', en: 'In the pool — hand-filled rows bypass the completeness gate' },
  stillShort: { zh: '还差', en: 'Short by' },
  removeFromPool: { zh: '移出评分池', en: 'Remove from pool' },
  bulkImport: { zh: '批量导入', en: 'Bulk import' },
  bulkHint: {
    zh: '从 Excel 直接复制一整块粘贴，第一行是表头。表头支持中文或英文字段名，例如：SKU、一级品类、价格带、目标市场。',
    en: 'Paste a block copied straight from Excel; the first row is the header. Chinese or English field names both work.',
  },
  bulkPreview: { zh: '预览', en: 'Preview' },
  bulkCommit: { zh: '导入', en: 'Import' },
  bulkRows: { zh: '条待导入', en: 'rows ready' },
  bulkSkipped: { zh: '条已跳过（未达门槛）', en: 'skipped (below gate)' },
  bulkDone: { zh: '已导入', en: 'Imported' },
  parseEmpty: { zh: '没有解析到内容', en: 'Nothing parsed' },
  clearAll: { zh: '清空全部', en: 'Clear all' },
  completePct: { zh: '完整度', en: 'Completeness' },
  fieldLabel: { zh: '字段', en: 'Field' },
  // Per-field labels (resolved via enrichFieldLabel()).
  ef_primary_category: { zh: '一级品类', en: 'Primary category' },
  ef_secondary_category: { zh: '二级品类', en: 'Sub-category' },
  ef_product_name_cn: { zh: '中文品名', en: 'Chinese name' },
  ef_description_cn: { zh: '产品描述', en: 'Description' },
  ef_key_selling_point_cn: { zh: '核心卖点', en: 'Key selling points' },
  ef_target_age: { zh: '目标年龄', en: 'Target age' },
  ef_target_segment: { zh: '目标人群', en: 'Target segment' },
  ef_design_style: { zh: '设计风格', en: 'Design style' },
  ef_visual_style: { zh: '视觉风格', en: 'Visual style' },
  ef_price_level: { zh: '价格带', en: 'Price level' },
  ef_target_market: { zh: '目标市场', en: 'Target market' },
  ef_product_status: { zh: '产品状态', en: 'Product status' },
  ef_oem_available: { zh: '可 OEM / ODM', en: 'OEM / ODM available' },
};

export function enrichFieldLabel(key: string, lang: Lang): string {
  return dictionary[`ef_${key}`]?.[lang] || key;
}

export function t(key: string, lang: Lang): string {
  return dictionary[key]?.[lang] || key;
}

/**
 * Localise a field that used to be a plain string.
 *
 * Accepts `string` as well as `LocalizedText` on purpose: clients are persisted to localStorage,
 * so records written before the bilingual migration (PRD §18) still hold an English literal.
 * Indexing a string with a lang key silently yields `undefined`, which used to blank the field —
 * returning the legacy string instead keeps old records legible rather than empty.
 */
export function localize(text: LocalizedText | string | undefined | null, lang: Lang): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[lang] || text.en || text.zh || '';
}

/**
 * Render an opportunity raised before the bilingual migration, which was an English sentence with
 * the kind baked in as a prefix ("Missing Category: ..."). New records are `OpportunityItem`s and
 * keep the kind in a separate field so the UI can show a localised chip.
 */
export function localizeOpportunity(op: OpportunityItem | string, lang: Lang): string {
  return typeof op === 'string' ? op : localize(op.text, lang);
}

function labelWithFallback(prefix: string, value: string, lang: Lang): string {
  const entry = dictionary[`${prefix}${value}`];
  return entry ? entry[lang] : value;
}

/** Market code → localised name, falling back to the code itself. */
export const marketLabel = (value: string, lang: Lang) => labelWithFallback('mk_', value, lang);
/** Client visual-style tag → localised name, falling back to the tag itself. */
export const styleLabel = (value: string, lang: Lang) => labelWithFallback('style_', value, lang);
/** PRD §13 evidence source → localised badge, falling back to the raw key. */
export const evidenceLabel = (value: string, lang: Lang) => labelWithFallback('ev_', value, lang);
/**
 * Opportunity kind → localised chip label.
 *
 * Maps onto the labels that already existed in the dictionary (missingCategory / priceGap / …).
 * They were defined for exactly this purpose but never referenced, because `analyzeClient` baked
 * the English type into the sentence instead — which is why the Chinese UI showed English.
 */
const OPPORTUNITY_LABEL_KEYS: Record<OpportunityKind, string> = {
  missing_category: 'missingCategory',
  price_gap: 'priceGap',
  functional_gap: 'functionalGap',
  premium: 'premiumOpportunity',
  new_category: 'newCategoryOpportunity',
};

export function opportunityLabel(kind: OpportunityKind | string, lang: Lang): string {
  const key = OPPORTUNITY_LABEL_KEYS[kind as OpportunityKind];
  return key ? t(key, lang) : kind;
}
/** Client goal → localised label, falling back to the raw value. */
export const goalLabel = (value: string, lang: Lang) => labelWithFallback('goal_', value, lang);

/**
 * Client business type. Stored as an English enum code ('Distributor'), which used to be printed
 * verbatim into the Chinese UI. Older records may also hold the localised sentinel that
 * `analyzeClient` used before, so both spellings are normalised back to the neutral "unset" label
 * rather than leaking the language the client happened to be created in.
 */
const UNSET_BUSINESS_TYPE = new Set(['', '未指定', 'Unspecified']);
export function businessTypeLabel(value: string, lang: Lang): string {
  if (UNSET_BUSINESS_TYPE.has(value)) return t('unset', lang);
  return labelWithFallback('bt_', value, lang);
}

/**
 * Recommendation role → localised badge label.
 *
 * `Recommendation.type` is a stored English enum ('Best Match', …). `RecommendationCard` already
 * mapped it, but `/compare` printed the raw value, so the Chinese UI showed "Best Match". The map
 * lives here now so the two call sites cannot drift apart again.
 */
const REC_TYPE_LABEL_KEYS: Record<string, string> = {
  'Best Match': 'bestMatch',
  'Growth Opportunity': 'growthOpportunity',
  'Product Line Expansion': 'productLineExpansion',
  'Strategic Product': 'strategicProducts',
};

export function recTypeLabel(value: string, lang: Lang): string {
  const key = REC_TYPE_LABEL_KEYS[value];
  return key ? t(key, lang) : value;
}

/**
 * Proposal type → localised label. Same class of bug: `Proposal.type` is a stored English enum and
 * the `/proposal` + `/share` list rows rendered it verbatim, so a Chinese rep saw
 * "Product Collection" next to a Chinese date.
 */
const PROPOSAL_TYPE_LABEL_KEYS: Record<string, string> = {
  'Single Product': 'singleProduct',
  'Product Collection': 'productCollection',
  'Product Line Proposal': 'productLineProposal',
};

export function proposalTypeLabel(value: string, lang: Lang): string {
  const key = PROPOSAL_TYPE_LABEL_KEYS[value];
  return key ? t(key, lang) : value;
}
