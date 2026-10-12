"""Build the real-catalogue CSV: 42 products that exist on shaki.com, with what is real and what is not.

Columns are deliberately split into "verified from the site" and "needs a human". The PM should not
have to guess which is which.
"""
import csv, io, json, re

site = json.load(io.open('scripts/.site-products.json', encoding='utf-8'))['rows']
alive = {}
for line in io.open('.imgcheck.txt', encoding='utf-8'):
    parts = line.split()
    if len(parts) >= 2:
        url, code = parts[0], parts[1]
        alive[url] = code

# Category suggestions derived from the product NAME only, and labelled as such in the header.
RULES = [
    ('FEMALE', ['跳蛋', '震动', '吸吮', '女用', '飞机杯', '乳夹']),
    ('MALE', ['前列腺', '阴茎', '男用', '口球', '真空', '自慰器']),
    ('COUPLES', ['情侣', '双人', '可爱情趣', '绑带', '手铐', '脚铐', '脖套', '眼罩', '乳夹']),
    ('BDSM', ['束缚', '绑束', '皮鞭', '惩罚', '颈枷', '口球', '滴蜡', '拍', '情趣礼盒', '乳夹']),
    ('WATER_BASED', ['润滑', '慕斯', '清洗', '护理', '按摩蜡', '滴蜡']),
]


def guess(name):
    for code, kws in RULES:
        if any(k in name for k in kws):
            return code
    return ''


out = r'D:\workbuddy_outputs\SHAKI_真实货盘_42款.csv'
with io.open(out, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow([
        'product_id', '产品名称(站内真实名)', '站内编号', '产品页链接', '产品图总数', '首图可用',
        '一级品类(按名称推断·待确认)', '价格带(待填: Entry/Mid/Mid-Premium/Premium/Luxury)',
        '目标市场(待填: US/UK/EU/AU/JP/KR/SEA/ME/Global)', '产品状态(待填: Active/New/Best Seller/Strategic)',
        '目标客群(待填)', '卖点(待填)', '产品描述(待填)', '材质(待填)', '备注',
    ])
    n_alive = 0
    for r in site:
        img = r['images'][0] if r['images'] else ''
        ok = alive.get(img, '') == '200'
        if ok:
            n_alive += 1
        note = ''
        if not r['sku']:
            note = '站内无编号'
        if not ok:
            note += ('; ' if note else '') + '首图 404，图片不可用'
        w.writerow([
            r['product_id'], r['name_cn'], r['sku'], r['url'], len(r['images']),
            '是' if ok else '否', guess(r['name_cn']), '', '', '', '', '', '', '', note,
        ])

print(f'written: {out}')
print(f'rows: {len(site)} | 首图可用: {n_alive} | 首图 404: {len(site) - n_alive}')
print(f'有站内编号: {sum(1 for r in site if r["sku"])}/{len(site)}')