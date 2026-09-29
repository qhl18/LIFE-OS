from PIL import Image, ImageDraw, ImageFont
import os

OUT = "C:/Users/qiand/WorkBuddy/2026-09-28-11-49-41"
SHOT = "C:/Users/qiand/WorkBuddy/2026-09-28-11-49-41/shots"
FONT_BOLD = "C:/windows/fonts/NotoSansSC-VF.ttf"
FONT_REG = "C:/windows/fonts/NotoSansSC-VF.ttf"

def load_font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

main = Image.open(f"{SHOT}/04-finance-board.png")
cards = Image.open(f"{SHOT}/06-custom-cards.png")

W, H = 1200, 2600
img = Image.new('RGB', (W, H), hex_to_rgb('#0b0b0b'))
draw = ImageDraw.Draw(img)

for y in range(H):
    r = int(11 + (22-11) * y / H)
    draw.line([(0, y), (W, y)], fill=(r, r, r))

title_font = load_font(72, True)
sub_font = load_font(34)
sec_font = load_font(32, True)
tag_font = load_font(26)
stat_font = load_font(30, True)
stat_small = load_font(24)
footer_font = load_font(22)
accent = hex_to_rgb('#d4af37')
text = hex_to_rgb('#f0f0f0')
muted = hex_to_rgb('#999999')

# Header
draw.text((W//2, 70), "D1  →  D6", font=title_font, fill=accent, anchor="mt")
draw.text((W//2, 160), "6天，我把 LifeOS 从毛坯房改成了精装", font=sub_font, fill=text, anchor="mt")
draw.text((W//2, 210), "记录即存在 · 不赶工，只把它做对", font=tag_font, fill=muted, anchor="mt")
draw.line([(420, 242), (780, 242)], fill=accent, width=2)

# Main dashboard screenshot, full width for readability
main_w = 1000
main_h = int(main.height * main_w / main.width)
main_r = main.resize((main_w, main_h), Image.LANCZOS)
frame_pad = 20
frame_x = (W - main_w - frame_pad*2)//2
frame_y = 280
img.paste(hex_to_rgb('#1f1f1f'), [frame_x, frame_y, frame_x+main_w+frame_pad*2, frame_y+main_h+frame_pad*2])
img.paste(main_r, (frame_x+frame_pad, frame_y+frame_pad))

mx, my = frame_x+frame_pad, frame_y+frame_pad

def draw_badge(x, y, text, align='left'):
    pad_x, pad_y = 16, 9
    bbox = draw.textbbox((0,0), text, font=tag_font)
    bw = bbox[2]-bbox[0] + pad_x*2
    bh = bbox[3]-bbox[1] + pad_y*2
    if align == 'right':
        x -= bw
    draw.rounded_rectangle([x, y, x+bw, y+bh], radius=8, fill=accent)
    draw.text((x+bw//2, y+bh//2), text, font=tag_font, fill=hex_to_rgb('#0b0b0b'), anchor="mm")

# Feature badges on main screenshot
draw_badge(mx+main_w-20, my+main_h*0.60, "新增：7天睡眠趋势", align='right')
draw_badge(mx+main_w-20, my+main_h*0.88, "新增：存款上锁 + 记一笔", align='right')
draw_badge(mx+20, my+main_h*0.88, "新增：自定义卡片")

# Section title with clear background
sec_y = frame_y + main_h + frame_pad*2 + 70
band_h = 60
img.paste(hex_to_rgb('#0b0b0b'), [0, sec_y-band_h//2, W, sec_y+band_h//2])
draw.text((W//2, sec_y), "从「自定义记录」占位，到能挂目标、能预测周期", font=sec_font, fill=text, anchor="mm")

# Custom cards close-up
cards_w = 680
cards_h = int(cards.height * cards_w / cards.width)
cards_r = cards.resize((cards_w, cards_h), Image.LANCZOS)
cx = (W - cards_w)//2
cy = sec_y + 70
img.paste(hex_to_rgb('#1f1f1f'), [cx-20, cy-20, cx+cards_w+20, cy+cards_h+20])
img.paste(cards_r, (cx, cy))

draw_badge(cx+cards_w-20, cy+20, "周期预测", align='right')
draw_badge(cx+cards_w-20, cy+cards_h*0.55, "反向追踪目标", align='right')

# Stats
stats_y = cy + cards_h + 100
items = [
    ("4 大看板", "从占位文案变成真实功能"),
    ("5 项新能力", "记账 · PIN锁 · 睡眠曲线 · 目标挂钩 · 周期预测"),
    ("0 外部依赖", "本地优先，数据只留在自己手里"),
]
for i, (head, desc) in enumerate(items):
    y = stats_y + i*92
    draw.text((W//2, y), head, font=stat_font, fill=accent, anchor="mt")
    draw.text((W//2, y+42), desc, font=stat_small, fill=muted, anchor="mt")

# Footer
draw.text((W//2, H-60), "下阶段：OCR 提醒 · 数据备份 · 看板锁", font=footer_font, fill=muted, anchor="mb")

poster_path = f"{OUT}/lifeos_d1_to_d6_poster.png"
img.save(poster_path, quality=95)
print(f"Poster saved: {poster_path}")
