"""
SHAKI Product Master — canonical field model (the single source of truth).

Encoded directly from /docs/SHAKI_Product_Master.xlsx:
  - Field_Dictionary sheet  -> FIELDS (228 fields, groups A-W)
  - Validation_Lists sheet  -> ENUMS
  - Category_Taxonomy sheet -> CATEGORY_TAXONOMY (L1/L2)
  - Tag_Dictionary sheet    -> TAG_DICTS
  - Scoring sheet           -> SCORING weights

IMPORTANT RULES (from the long-text spec + Field_Dictionary):
  * primary_category is LOCKED to 5 values, set by Product Manager, NOT AI.
  * A field is AI-fillable only when its `ai_role` in {AI, AI assist, AI vision, AI polish}.
  * COMMERCIAL_FORBIDDEN fields must NEVER be fabricated by AI — null if absent.
  * source_type / confidence are tracked per field (see db.py / mapping.py).
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Enumerations (from Validation_Lists sheet)
# ---------------------------------------------------------------------------
ENUMS = {
    "ProductStatus": ["Draft", "Active", "New", "Best Seller", "Strategic",
                       "Seasonal", "Discontinued", "Coming Soon"],
    "PrimaryCategory": ["Female", "Male", "Couples", "BDSM", "Water-Based"],
    "SecondaryCategory": [
        "Massagers", "Suction", "Vibrators", "Wearables", "Insertable", "External",
        "Multifunctional", "Smart Devices", "Accessories", "Male Massagers",
        "Masturbators", "Rings", "Performance", "Prostate", "Couple Play",
        "Couples Wearables", "Remote Play", "Couples Massagers", "Couple Toys",
        "Couple Games", "Gift Sets", "Blindfolds", "Restraints", "Collars",
        "Roleplay", "Sensory Play", "Control Products", "BDSM Sets", "Lubricants",
        "Feminine Care", "Intimate Cleansing", "Applicator Products", "Massage Products",
        "Functional Liquids", "Travel Size",
    ],
    "PriceLevel": ["Entry", "Mid", "Mid-Premium", "Premium", "Luxury"],
    "TargetGender": ["Female", "Male", "Couples", "All Genders"],
    "DesignStyle": ["Minimal", "Premium", "Luxury", "Feminine", "Modern", "Technology",
                    "Soft", "Cute", "Fashion", "Artistic", "Discreet", "Bold",
                    "Playful", "Medical", "Wellness", "Elegant"],
    "Material": ["Silicone", "ABS", "PC", "TPE", "TPR", "Metal", "Glass",
                 "Aluminum", "Fabric", "Other"],
    "Waterproof": ["No Waterproof", "Splash Resistant", "IPX4", "IPX5", "IPX6",
                   "IPX7", "IPX8"],
    "TargetMarket": ["US", "UK", "EU", "Australia", "Japan", "Korea",
                     "Southeast Asia", "Middle East", "Global"],
    "YesNo": ["Yes", "No"],
    "ProductPosition": ["Bestseller", "New", "Hero Product", "Entry Product",
                        "Premium Product", "Margin Product", "Traffic Product",
                        "Giftable", "Strategic Product", "Innovation"],
}

# ---------------------------------------------------------------------------
# Category taxonomy (L1 -> L2) from Category_Taxonomy sheet
# ---------------------------------------------------------------------------
CATEGORY_TAXONOMY = {
    "Female": ["Massagers", "Suction", "Vibrators", "Wearables", "Insertable",
               "External", "Multifunctional", "Smart Devices", "Accessories"],
    "Male": ["Male Massagers", "Masturbators", "Rings", "Performance", "Prostate",
             "Multifunctional", "Smart Devices", "Accessories"],
    "Couples": ["Couple Play", "Couples Wearables", "Remote Play", "Couples Massagers",
                "Couple Toys", "Couple Games", "Gift Sets", "Multifunctional"],
    "BDSM": ["Blindfolds", "Restraints", "Collars", "Roleplay", "Sensory Play",
             "Control Products", "BDSM Sets", "Accessories"],
    "Water-Based": ["Lubricants", "Feminine Care", "Intimate Cleansing",
                    "Applicator Products", "Massage Products", "Functional Liquids",
                    "Couples", "Travel Size", "Gift Sets"],
}

PRIMARY_CATEGORY_EN = {
    "Female": "女用", "Male": "男用", "Couples": "夫妻",
    "BDSM": "BDSM", "Water-Based": "水剂",
}

# ---------------------------------------------------------------------------
# Tag dictionaries (Tag_Dictionary sheet)
# ---------------------------------------------------------------------------
TAG_DICTS = {
    "Audience": ["Female", "Male", "Couples", "Beginner", "Advanced", "Premium",
                 "Mass Market", "Wellness"],
    "Style": ["Minimal", "Premium", "Luxury", "Feminine", "Modern", "Technology",
              "Soft", "Cute", "Fashion", "Artistic", "Discreet", "Bold", "Playful",
              "Medical", "Wellness"],
    "Scenario": ["Self Care", "Solo", "Couples", "Bedroom", "Travel", "Gift",
                 "Date Night", "Long Distance", "Premium Lifestyle"],
    "Positioning": ["Bestseller", "New", "Hero Product", "Entry Product",
                    "Premium Product", "Margin Product", "Traffic Product",
                    "Giftable", "Strategic Product", "Innovation"],
    "Opportunity": ["Portfolio Expansion", "Premium Opportunity", "New Category",
                    "Cross Sell", "Upsell"],
}

# ---------------------------------------------------------------------------
# Scoring weights (Scoring sheet)
# Product Intelligence = ROUND(Q*0.20 + D*0.15 + F*0.15 + C*0.20 + M*0.15 + B*0.15)
# (Phase 02 Client Fit / Potential / Recommendation weights are reserved here.)
# ---------------------------------------------------------------------------
SCORING = {
    "product_intelligence": {
        "product_quality_score": 0.20,
        "design_value_score": 0.15,
        "functional_diff_score": 0.15,
        "commercial_potential_score": 0.20,
        "market_adaptability_score": 0.15,
        "brand_value_score": 0.15,
    },
    "client_fit": {  # reserved for Phase 02
        "category_fit": 0.20, "audience_fit": 0.20, "brand_fit": 0.15,
        "price_fit": 0.15, "portfolio_fit": 0.15, "market_fit": 0.15,
    },
    "potential": {  # reserved for Phase 02
        "portfolio_gap": 0.25, "market_opportunity": 0.25, "differentiation": 0.20,
        "price_expansion": 0.15, "strategic_value": 0.15,
    },
    "recommendation": {  # reserved for Phase 02
        "fit": 0.40, "product_intelligence": 0.20, "market": 0.15,
        "portfolio_gap": 0.10, "sales": 0.10, "strategic": 0.05,
    },
}

# Source-type priority (official > catalog > sales_input > ai_inference)
SOURCE_PRIORITY = {"official": 4, "catalog": 3, "sales_input": 2, "ai_inference": 1, "manual": 4}

# ---------------------------------------------------------------------------
# FIELDS — the 228-field dictionary (order == Product_Master column order)
# tuple: (id, group, en, cn, type, required, source, ai_role, enum_or_None)
# ---------------------------------------------------------------------------
_RAW = [
    ("product_id", "A", "Product ID", "产品ID", "String", True, "System", "No", None),
    ("sku", "A", "SKU", "SKU编码", "String", True, "Official Product Data", "No", None),
    ("model_number", "A", "Model Number", "型号", "String", False, "Official Product Data", "No", None),
    ("product_name_cn", "A", "Product Name CN", "中文产品名", "String", True, "Official Product Data", "No", None),
    ("product_name_en", "A", "Product Name EN", "英文产品名", "String", True, "Official Product Data", "No", None),
    ("short_name", "A", "Short Name", "产品简称", "String", False, "Official Product Data", "No", None),
    ("series_name", "A", "Series Name", "系列名称", "String", False, "Official Product Data", "No", None),
    ("product_version", "A", "Product Version", "产品版本", "String", False, "Official Product Data", "No", None),
    ("product_status", "A", "Product Status", "产品状态", "Enum", True, "Product Manager", "No", "ProductStatus"),
    ("launch_date", "A", "Launch Date", "上市日期", "Date", False, "Official Product Data", "No", None),
    ("update_date", "A", "Update Date", "最后更新时间", "Date", False, "System", "No", None),
    ("primary_category", "B", "Primary Category", "一级品类", "Enum", True, "Product Manager", "No", "PrimaryCategory"),
    ("secondary_category", "B", "Secondary Category", "二级品类", "Enum", True, "Product Manager", "AI assist", "SecondaryCategory"),
    ("tertiary_category", "B", "Tertiary Category", "三级品类", "String", False, "Product Manager", "AI assist", None),
    ("functional_category", "B", "Functional Category", "功能分类", "Multi-select", False, "Product Manager", "AI assist", None),
    ("usage_category", "B", "Usage Category", "使用分类", "Multi-select", False, "Product Manager", "AI assist", None),
    ("scenario_category", "B", "Scenario Category", "场景分类", "Multi-select", False, "Product Manager", "AI assist", None),
    ("description_cn", "C", "Description CN", "中文产品描述", "Long Text", False, "Product Manager", "AI polish", None),
    ("description_en", "C", "Description EN", "英文产品描述", "Long Text", False, "Product Manager", "AI polish", None),
    ("short_description_cn", "C", "Short Description CN", "中文短描述", "Long Text", False, "Product Manager", "AI polish", None),
    ("short_description_en", "C", "Short Description EN", "英文短描述", "Long Text", False, "Product Manager", "AI polish", None),
    ("product_story_cn", "C", "Product Story CN", "中文产品故事", "Long Text", False, "Brand/Product", "AI polish", None),
    ("product_story_en", "C", "Product Story EN", "英文产品故事", "Long Text", False, "Brand/Product", "AI polish", None),
    ("key_selling_point_cn", "C", "Key Selling Points CN", "中文核心卖点", "Multi-line", True, "Product Manager", "AI polish", None),
    ("key_selling_point_en", "C", "Key Selling Points EN", "英文核心卖点", "Multi-line", True, "Product Manager", "AI polish", None),
    ("product_highlights", "C", "Product Highlights", "产品亮点", "Multi-line", False, "Product Manager", "AI assist", None),
    ("differentiation", "C", "Differentiation", "差异化优势", "Long Text", True, "Product Manager", "AI assist", None),
    ("primary_function", "D", "Primary Function", "核心功能", "String", True, "Product Manager", "AI assist", None),
    ("secondary_functions", "D", "Secondary Functions", "次要功能", "Multi-select", False, "Product Manager", "AI assist", None),
    ("vibration", "D", "Vibration", "震动", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("suction", "D", "Suction", "吸吮", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("rotation", "D", "Rotation", "旋转", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("heating", "D", "Heating", "加热", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("cooling", "D", "Cooling", "冷感", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("pressure", "D", "Pressure", "压力", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("pulsation", "D", "Pulsation", "脉冲", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("massage", "D", "Massage", "按摩", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("movement", "D", "Movement", "运动方式", "String", False, "Official Product Data", "AI assist", None),
    ("remote_control", "D", "Remote Control", "远程控制", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("app_control", "D", "App Control", "APP控制", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("smart_control", "D", "Smart Control", "智能控制", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("multi_function", "D", "Multi-function", "多功能", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("dual_motor", "D", "Dual Motor", "双马达", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("motor_type", "D", "Motor Type", "马达类型", "String", False, "Official Product Data", "AI assist", None),
    ("mode_count", "D", "Mode Count", "模式数量", "Number", False, "Official Product Data", "No", None),
    ("intensity_levels", "D", "Intensity Levels", "强度档位", "Number", False, "Official Product Data", "No", None),
    ("usage_type", "E", "Usage Type", "使用方式", "Multi-select", False, "Product Manager", "AI assist", None),
    ("external_use", "E", "External Use", "外部使用", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("internal_use", "E", "Internal Use", "内部使用", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("wearable", "E", "Wearable", "穿戴式", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("hands_free", "E", "Hands Free", "解放双手", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("solo_use", "E", "Solo Use", "单人使用", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("couples_use", "E", "Couples Use", "夫妻使用", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("beginner_friendly", "E", "Beginner Friendly", "新手友好", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("travel_friendly", "E", "Travel Friendly", "旅行友好", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("portable", "E", "Portable", "便携", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("discreet", "E", "Discreet", "隐私友好", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("easy_to_clean", "E", "Easy to Clean", "易清洁", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("rechargeable", "E", "Rechargeable", "可充电", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("disposable", "E", "Disposable", "一次性", "Yes/No", False, "Official Product Data", "AI assist", "YesNo"),
    ("target_gender", "F", "Target Gender", "目标性别", "Enum", True, "Product Manager", "AI assist", "TargetGender"),
    ("target_age", "F", "Target Age", "目标年龄", "String", False, "Product Manager", "AI assist", None),
    ("target_segment", "F", "Target Segment", "目标人群", "Multi-select", True, "Product Manager", "AI assist", None),
    ("beginner", "F", "Beginner", "新手", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("advanced_user", "F", "Advanced User", "进阶用户", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("premium_user", "F", "Premium User", "高端用户", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("mass_market", "F", "Mass Market", "大众市场", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("gift_buyer", "F", "Gift Buyer", "礼品购买者", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("couple_user", "F", "Couple User", "夫妻用户", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("wellness_user", "F", "Wellness User", "健康生活方式用户", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("design_style", "G", "Design Style", "设计风格", "Multi-select", True, "Product Manager", "AI vision", "DesignStyle"),
    ("visual_style", "G", "Visual Style", "视觉风格", "Multi-select", True, "Product Manager", "AI vision", "DesignStyle"),
    ("form_language", "G", "Form Language", "造型语言", "String", False, "Designer", "AI vision", None),
    ("color_style", "G", "Color Style", "色彩风格", "String", False, "Designer", "AI vision", None),
    ("packaging_style", "G", "Packaging Style", "包装风格", "Multi-select", False, "Designer", "AI vision", "DesignStyle"),
    ("design_keywords", "G", "Design Keywords", "设计关键词", "Multi-select", False, "Designer", "AI vision", None),
    ("aesthetic_positioning", "G", "Aesthetic Positioning", "审美定位", "String", False, "Brand/Designer", "AI assist", None),
    ("brand_expression", "G", "Brand Expression", "品牌表达", "String", False, "Brand", "AI assist", None),
    ("visual_complexity", "G", "Visual Complexity", "视觉复杂度", "Number 1-5", False, "Designer", "AI assist", None),
    ("perceived_value", "G", "Perceived Value", "感知价值", "Number 1-100", False, "Product Manager", "AI assist", None),
    ("main_material", "H", "Main Material", "主要材质", "Enum", True, "Official Product Data", "No", "Material"),
    ("surface_material", "H", "Surface Material", "表面材质", "String", False, "Official Product Data", "No", None),
    ("silicone_type", "H", "Silicone Type", "硅胶类型", "String", False, "Official Product Data", "No", None),
    ("hardness", "H", "Hardness", "硬度", "String", False, "Official Product Data", "No", None),
    ("texture", "H", "Texture", "表面触感", "String", False, "Official Product Data", "AI assist", None),
    ("coating", "H", "Coating", "表面处理", "String", False, "Official Product Data", "No", None),
    ("material_certification", "H", "Material Certification", "材质认证", "String", False, "Certified Document", "No", None),
    ("product_length", "I", "Product Length", "产品长度", "Number", False, "Official Product Data", "No", None),
    ("product_width", "I", "Product Width", "产品宽度", "Number", False, "Official Product Data", "No", None),
    ("product_height", "I", "Product Height", "产品高度", "Number", False, "Official Product Data", "No", None),
    ("product_diameter", "I", "Product Diameter", "产品直径", "Number", False, "Official Product Data", "No", None),
    ("net_weight", "I", "Net Weight", "净重", "Number", False, "Official Product Data", "No", None),
    ("gross_weight", "I", "Gross Weight", "毛重", "Number", False, "Official Product Data", "No", None),
    ("package_length", "I", "Package Length", "包装长度", "Number", False, "Official Product Data", "No", None),
    ("package_width", "I", "Package Width", "包装宽度", "Number", False, "Official Product Data", "No", None),
    ("package_height", "I", "Package Height", "包装高度", "Number", False, "Official Product Data", "No", None),
    ("technology", "J", "Technology", "技术类型", "String", False, "Official Product Data", "AI assist", None),
    ("motor_system", "J", "Motor System", "马达系统", "String", False, "Official Product Data", "No", None),
    ("control_system", "J", "Control System", "控制系统", "String", False, "Official Product Data", "AI assist", None),
    ("control_distance", "J", "Control Distance", "控制距离", "Number", False, "Official Product Data", "No", None),
    ("frequency", "J", "Frequency", "频率", "String", False, "Official Product Data", "No", None),
    ("amplitude", "J", "Amplitude", "振幅", "String", False, "Official Product Data", "No", None),
    ("noise_level", "J", "Noise Level", "噪音", "String", False, "Official Product Data", "No", None),
    ("working_time", "J", "Working Time", "工作时间", "String", False, "Official Product Data", "No", None),
    ("charging_time", "J", "Charging Time", "充电时间", "String", False, "Official Product Data", "No", None),
    ("standby_time", "J", "Standby Time", "待机时间", "String", False, "Official Product Data", "No", None),
    ("display", "J", "Display", "显示方式", "String", False, "Official Product Data", "No", None),
    ("indicator", "J", "Indicator", "指示方式", "String", False, "Official Product Data", "No", None),
    ("battery_type", "K", "Battery Type", "电池类型", "String", False, "Official Product Data", "No", None),
    ("battery_capacity", "K", "Battery Capacity", "电池容量", "Number", False, "Official Product Data", "No", None),
    ("voltage", "K", "Voltage", "电压", "String", False, "Official Product Data", "No", None),
    ("input_voltage", "K", "Input Voltage", "输入电压", "String", False, "Official Product Data", "No", None),
    ("charging_type", "K", "Charging Type", "充电方式", "String", False, "Official Product Data", "No", None),
    ("charging_port", "K", "Charging Port", "充电接口", "String", False, "Official Product Data", "No", None),
    ("usb", "K", "USB", "USB", "Yes/No", False, "Official Product Data", "No", "YesNo"),
    ("wireless_charging", "K", "Wireless Charging", "无线充电", "Yes/No", False, "Official Product Data", "No", "YesNo"),
    ("power", "K", "Power", "功率", "String", False, "Official Product Data", "No", None),
    ("waterproof_rating", "L", "Waterproof Rating", "防水等级", "Enum", False, "Official Product Data", "No", "Waterproof"),
    ("packaging_type", "M", "Packaging Type", "包装类型", "String", True, "Official Product Data", "AI vision", None),
    ("box_material", "M", "Box Material", "包装材料", "String", False, "Official Product Data", "AI vision", None),
    ("box_color", "M", "Box Color", "包装颜色", "String", False, "Designer", "AI vision", None),
    ("box_size", "M", "Box Size", "包装尺寸", "String", False, "Official Product Data", "No", None),
    ("inner_packaging", "M", "Inner Packaging", "内包装", "String", False, "Official Product Data", "No", None),
    ("outer_packaging", "M", "Outer Packaging", "外包装", "String", False, "Official Product Data", "No", None),
    ("gift_packaging", "M", "Gift Packaging", "礼盒包装", "Yes/No", False, "Product Manager", "AI assist", "YesNo"),
    ("custom_packaging", "M", "Custom Packaging", "定制包装", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("language_packaging", "M", "Language Packaging", "包装语言", "Multi-select", False, "Product Manager", "No", None),
    ("manual_language", "M", "Manual Language", "说明书语言", "Multi-select", False, "Product Manager", "No", None),
    ("factory_price", "N", "Factory Price", "工厂价格", "Currency", False, "Sales/Product", "No", None),
    ("wholesale_price", "N", "Wholesale Price", "批发价格", "Currency", False, "Sales/Product", "No", None),
    ("suggested_retail_price", "N", "Suggested Retail Price", "建议零售价", "Currency", False, "Product/Market", "No", None),
    ("target_retail_price", "N", "Target Retail Price", "目标零售价", "Currency", False, "Sales/Product", "No", None),
    ("price_level", "N", "Price Level", "价格等级", "Enum", True, "Product Manager", "AI assist", "PriceLevel"),
    ("margin_level", "N", "Margin Level", "利润等级", "String", False, "Finance/Sales", "No", None),
    ("moq", "N", "MOQ", "起订量", "Number", True, "Sales/Product", "No", None),
    ("sample_price", "N", "Sample Price", "样品价格", "Currency", False, "Sales/Product", "No", None),
    ("lead_time", "N", "Lead Time", "交期", "String", True, "Production", "No", None),
    ("production_capacity", "N", "Production Capacity", "产能", "String", False, "Production", "No", None),
    ("stock_status", "N", "Stock Status", "库存状态", "String", False, "Operations", "No", None),
    ("target_market", "O", "Target Market", "目标市场", "Multi-select", True, "Product Manager", "AI assist", "TargetMarket"),
    ("market_priority", "O", "Market Priority", "市场优先级", "String", False, "Product Manager", "AI assist", None),
    ("market_fit", "O", "Market Fit", "市场适配", "Number 1-100", False, "Product Manager", "AI assist", None),
    ("market_status", "O", "Market Status", "市场状态", "String", False, "Product Manager", "No", None),
    ("market_demand", "O", "Market Demand", "市场需求", "String", False, "Research", "AI assist", None),
    ("market_trend", "O", "Market Trend", "市场趋势", "String", False, "Research", "AI assist", None),
    ("competitor_density", "O", "Competitor Density", "竞品密度", "String", False, "Research", "AI assist", None),
    ("market_opportunity", "O", "Market Opportunity", "市场机会", "Number 1-100", False, "Research", "AI assist", None),
    ("brand_positioning", "P", "Brand Positioning", "品牌定位", "String", False, "Brand", "AI assist", None),
    ("brand_level", "P", "Brand Level", "品牌等级", "Enum", False, "Brand", "AI assist", "PriceLevel"),
    ("brand_style", "P", "Brand Style", "品牌风格", "Multi-select", False, "Brand", "AI vision", "DesignStyle"),
    ("brand_story", "P", "Brand Story", "品牌故事", "Long Text", False, "Brand", "AI polish", None),
    ("design_language", "P", "Design Language", "设计语言", "Multi-select", False, "Designer/Brand", "AI vision", "DesignStyle"),
    ("brand_keywords", "P", "Brand Keywords", "品牌关键词", "Multi-select", False, "Brand", "AI assist", None),
    ("oem_available", "Q", "OEM Available", "是否支持OEM", "Yes/No", True, "Product Manager", "No", "YesNo"),
    ("odm_available", "Q", "ODM Available", "是否支持ODM", "Yes/No", True, "Product Manager", "No", "YesNo"),
    ("logo_customization", "Q", "Logo Customization", "Logo定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("color_customization", "Q", "Color Customization", "颜色定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("material_customization", "Q", "Material Customization", "材料定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("packaging_customization", "Q", "Packaging Customization", "包装定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("function_customization", "Q", "Function Customization", "功能定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("mold_customization", "Q", "Mold Customization", "模具定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("app_customization", "Q", "App Customization", "APP定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("firmware_customization", "Q", "Firmware Customization", "固件定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("structure_customization", "Q", "Structure Customization", "结构定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("surface_customization", "Q", "Surface Customization", "外观定制", "Yes/No", False, "Product Manager", "No", "YesNo"),
    ("custom_moq", "Q", "Custom MOQ", "定制MOQ", "Number", False, "Sales/Product", "No", None),
    ("custom_lead_time", "Q", "Custom Lead Time", "定制交期", "String", False, "Sales/Product", "No", None),
    ("hero_image_url", "R", "Hero Image URL", "主图URL", "URL", True, "Media", "No", None),
    ("front_image_url", "R", "Front Image URL", "正面图URL", "URL", False, "Media", "No", None),
    ("side_image_url", "R", "Side Image URL", "侧面图URL", "URL", False, "Media", "No", None),
    ("detail_image_url", "R", "Detail Image URL", "细节图URL", "URL", False, "Media", "No", None),
    ("packaging_image_url", "R", "Packaging Image URL", "包装图URL", "URL", False, "Media", "No", None),
    ("lifestyle_image_url", "R", "Lifestyle Image URL", "场景图URL", "URL", False, "Media", "No", None),
    ("feature_image_url", "R", "Feature Image URL", "卖点图URL", "URL", False, "Media", "No", None),
    ("size_image_url", "R", "Size Image URL", "尺寸图URL", "URL", False, "Media", "No", None),
    ("instruction_image_url", "R", "Instruction Image URL", "说明图URL", "URL", False, "Media", "No", None),
    ("video_url", "R", "Video URL", "产品视频URL", "URL", False, "Media", "No", None),
    ("image_count", "R", "Image Count", "图片数量", "Number", False, "System", "No", None),
    ("media_quality", "R", "Media Quality", "媒体质量", "Number 1-100", False, "Media", "AI vision", None),
    ("category_tags", "S", "Category Tags", "品类标签", "Multi-select", True, "AI", "AI", None),
    ("function_tags", "S", "Function Tags", "功能标签", "Multi-select", True, "AI", "AI", None),
    ("audience_tags", "S", "Audience Tags", "受众标签", "Multi-select", True, "AI", "AI", None),
    ("style_tags", "S", "Style Tags", "风格标签", "Multi-select", True, "AI", "AI", None),
    ("scenario_tags", "S", "Scenario Tags", "场景标签", "Multi-select", True, "AI", "AI", None),
    ("market_tags", "S", "Market Tags", "市场标签", "Multi-select", True, "AI", "AI", None),
    ("price_tags", "S", "Price Tags", "价格标签", "Multi-select", True, "AI", "AI", None),
    ("opportunity_tags", "S", "Opportunity Tags", "机会标签", "Multi-select", False, "AI", "AI", None),
    ("positioning_tags", "S", "Positioning Tags", "产品定位标签", "Multi-select", True, "AI", "AI", "ProductPosition"),
    ("data_completeness", "T", "Data Completeness", "数据完整度", "Number 0-100", True, "System", "No", None),
    ("product_quality_score", "T", "Product Quality Score", "产品力评分", "Number 0-100", False, "Product Manager", "AI assist", None),
    ("design_value_score", "T", "Design Value Score", "设计价值评分", "Number 0-100", False, "Product/Design", "AI assist", None),
    ("functional_diff_score", "T", "Functional Differentiation Score", "功能差异化评分", "Number 0-100", False, "Product Manager", "AI assist", None),
    ("commercial_potential_score", "T", "Commercial Potential Score", "商业潜力评分", "Number 0-100", False, "Sales/Product", "AI assist", None),
    ("market_adaptability_score", "T", "Market Adaptability Score", "市场适配评分", "Number 0-100", False, "Research/Product", "AI assist", None),
    ("brand_value_score", "T", "Brand Value Score", "品牌价值评分", "Number 0-100", False, "Brand/Product", "AI assist", None),
    ("product_intelligence_score", "T", "Product Intelligence Score", "产品智能评分", "Formula", True, "System", "No", None),
    ("strategic_value_score", "T", "Strategic Value Score", "战略价值评分", "Number 0-100", False, "Management/Product", "AI assist", None),
    ("product_priority_score", "T", "Product Priority Score", "产品优先级评分", "Formula", True, "System", "No", None),
    ("view_count", "U", "View Count", "浏览次数", "Number", False, "System", "No", None),
    ("recommend_count", "U", "Recommend Count", "推荐次数", "Number", False, "System", "No", None),
    ("proposal_count", "U", "Proposal Count", "提案次数", "Number", False, "System", "No", None),
    ("share_count", "U", "Share Count", "分享次数", "Number", False, "System", "No", None),
    ("client_interest_count", "U", "Client Interest Count", "客户兴趣次数", "Number", False, "System", "No", None),
    ("sample_request_count", "U", "Sample Request Count", "样品申请次数", "Number", False, "System", "No", None),
    ("quotation_count", "U", "Quotation Count", "报价次数", "Number", False, "System", "No", None),
    ("order_count", "U", "Order Count", "订单次数", "Number", False, "System", "No", None),
    ("sales_amount", "U", "Sales Amount", "销售金额", "Currency", False, "System", "No", None),
    ("conversion_rate", "U", "Conversion Rate", "转化率", "Formula", False, "System", "No", None),
    ("certification", "V", "Certification", "认证", "String", False, "Certified Document", "No", None),
    ("certificate_number", "V", "Certificate Number", "证书编号", "String", False, "Certified Document", "No", None),
    ("test_report", "V", "Test Report", "测试报告", "URL", False, "Certified Document", "No", None),
    ("material_certification_url", "V", "Material Certification URL", "材料认证URL", "URL", False, "Certified Document", "No", None),
    ("market_compliance", "V", "Market Compliance", "市场合规", "Multi-select", False, "Compliance", "No", None),
    ("warning", "V", "Warning", "警告信息", "Long Text", False, "Compliance", "No", None),
    ("usage_instruction", "V", "Usage Instruction", "使用说明", "Long Text", False, "Official Product Data", "No", None),
    ("age_requirement", "V", "Age Requirement", "年龄要求", "String", False, "Compliance", "No", None),
    ("recommended_customer_type", "W", "Recommended Customer Type", "推荐客户类型", "Multi-select", False, "AI", "AI", None),
    ("recommended_brand_style", "W", "Recommended Brand Style", "推荐品牌风格", "Multi-select", False, "AI", "AI", None),
    ("recommended_market", "W", "Recommended Market", "推荐市场", "Multi-select", False, "AI", "AI", None),
    ("recommended_price_segment", "W", "Recommended Price Segment", "推荐价格段", "Enum", False, "AI", "AI", "PriceLevel"),
    ("recommended_category", "W", "Recommended Category", "推荐品类", "Multi-select", False, "AI", "AI", None),
    ("recommended_product_gap", "W", "Recommended Product Gap", "适合填补的产品空缺", "Long Text", False, "AI", "AI", None),
    ("recommended_reason_cn", "W", "Recommended Reason CN", "推荐理由中文", "Long Text", False, "AI", "AI", None),
    ("recommended_reason_en", "W", "Recommended Reason EN", "推荐理由英文", "Long Text", False, "AI", "AI", None),
    ("recommended_scenario", "W", "Recommended Scenario", "推荐场景", "Multi-select", False, "AI", "AI", None),
    ("cross_sell_products", "W", "Cross Sell Products", "交叉销售产品", "Multi-select", False, "AI", "AI", None),
    ("upsell_products", "W", "Upsell Products", "升级推荐产品", "Multi-select", False, "AI", "AI", None),
    ("alternative_products", "W", "Alternative Products", "替代产品", "Multi-select", False, "AI", "AI", None),
]

# Build structured field records
FIELDS = []
for _r in _RAW:
    fid, grp, en, cn, ftype, req, src, ai, enum = _r
    FIELDS.append({
        "id": fid,
        "group": grp,
        "en": en,
        "cn": cn,
        "type": ftype,
        "required": req,
        "source": src,
        "ai_role": ai,
        "enum": enum,
        "ai_fillable": ai in ("AI", "AI assist", "AI vision", "AI polish"),
    })

FIELD_BY_ID = {f["id"]: f for f in FIELDS}
FIELD_ORDER = [f["id"] for f in FIELDS]  # == Product_Master column order

REQUIRED_FIELD_IDS = [f["id"] for f in FIELDS if f["required"]]
AI_FILLABLE_IDS = [f["id"] for f in FIELDS if f["ai_fillable"]]

# Fields AI must NEVER fabricate (spec section 14 + commercial groups)
_COMMERCIAL_SET = {
    # commercial / specs / compliance / sales — never invented
    "moq", "factory_price", "wholesale_price", "suggested_retail_price",
    "target_retail_price", "main_material", "surface_material", "silicone_type",
    "waterproof_rating", "battery_capacity", "battery_type", "certification",
    "certificate_number", "test_report", "material_certification",
    "market_trend", "oem_available", "odm_available",
    # Sales Data group (U)
    "view_count", "recommend_count", "proposal_count", "share_count",
    "client_interest_count", "sample_request_count", "quotation_count",
    "order_count", "sales_amount", "conversion_rate",
}
COMMERCIAL_FORBIDDEN_IDS = _COMMERCIAL_SET

# Image roles (Media_Standard sheet + spec section 23)
IMAGE_ROLES = ["HERO", "FRONT", "SIDE", "DETAIL", "PACKAGING",
               "LIFESTYLE", "FEATURE", "SIZE", "INSTRUCTION", "OTHER"]


def get_field(fid: str) -> dict | None:
    return FIELD_BY_ID.get(fid)


def is_required(fid: str) -> bool:
    f = FIELD_BY_ID.get(fid)
    return bool(f and f["required"])


def is_ai_fillable(fid: str) -> bool:
    f = FIELD_BY_ID.get(fid)
    return bool(f and f["ai_fillable"])


def is_commercial_forbidden(fid: str) -> bool:
    return fid in COMMERCIAL_FORBIDDEN_IDS


def enum_values(fid: str):
    f = FIELD_BY_ID.get(fid)
    if f and f["enum"]:
        return ENUMS.get(f["enum"], [])
    return []


def is_primary_category_allowed(value: str) -> bool:
    return value in ENUMS["PrimaryCategory"]
