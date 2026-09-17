# BillNext Prism Glass 设计系统

状态：Locked · 2026-08-03

## 设计方向

- 类型：Atmospheric（清透玻璃工作台）
- 产品结构：Workbench；长内容页使用 Long Document；营销页延续 Workbench 的通透层级与棱镜光语言。
- 气质坐标：light / humanist-sans / cool。
- 核心意象：一组悬浮于冷白空间中的清透玻璃板，青蓝表示决策，微量紫色只作为环境折射。内容封面保持高饱和，UI 本身安静、轻盈、边界清楚。
- 不改变功能逻辑。首页内容区允许使用“主卡 + 三张紧凑卡 + 下方推荐画廊”的展示层级；其他内容页继续保持既有密度。玻璃只用于表达层级；文字、按钮和数据不能依赖背景模糊才能看清。

## 颜色

- Paper `oklch(95% 0.025 232)`：冷白环境底色。
- Paper 2 `oklch(91% 0.038 238)`：控件与环境层。
- Paper 3 `oklch(86% 0.055 246)`：交互填充。
- Ink `oklch(24% 0.055 257)`：标题与主要信息。
- Ink 2 `oklch(39% 0.045 255)`：正文。
- Glass `oklch(99% 0.008 232 / 62%)`：常规玻璃表面；强层级使用 78% 不透明度。
- Cyan `oklch(50% 0.18 224)`：仅用于主要决策、当前状态与键盘焦点；控制在可视面积 5% 左右。
- Prism `oklch(66% 0.17 300)`：只进入环境折射，不直接承载文字或按钮。
- 暗色模式使用深海军蓝玻璃；青蓝色相保持一致，并将玻璃边界降到 18% 白色透明度。

## 字体与排版

- 展示标题：BillNext Shanggu，650，紧凑字距；用于页面名、分组标题与设置标题。
- 正文：BillNext Onest + BillNext Shanggu，400–600。
- 元数据：BillNext Onest，启用 tabular numerals；字号小但对比明确，不用过度灰化。
- 标题依靠字重、间距与细线建立层级，不依赖渐变文字、全大写或彩色发光。

## 形状与空间

- 4 / 8 / 12 / 16 / 24 / 40 / 64 / 96 的紧凑编辑尺度。
- 卡片圆角 16px，输入 12px，分段控件 10px，弹窗 22px；头像、开关滑块和计数点允许完全圆形。
- 卡片是一块玻璃内容板：一层高光边界、一张封面、一块说明、一条操作栏。禁止卡中再套无意义玻璃卡。
- 模糊分为 16 / 22 / 32px 三档，只用于卡片、工具层和弹窗；无 `backdrop-filter` 时必须回退为高不透明度实色。
- 阴影只表达高度，内侧 1px 高光表达玻璃边缘；悬停最多上移 2px。

## 动效

- 微交互 100ms，常规 180ms，入场 280ms，复杂过渡 420ms。
- 进入采用 `expo.out`：8px 位移、0.99 缩放，快速收束；退出保持更短。
- 排序重排使用 FLIP，300ms，不弹跳。
- 按下只做 1px 下沉或 0.985 缩放；不使用 overshoot、发光扩散或摇摆。
- `prefers-reduced-motion` 下只保留最长 150ms 的透明度过渡。

## 交互与文案

- 主操作沿用产品现有短动词：“想看”“帮我读”“不想看”。
- CTA 直白、低噪声，不添加营销式感叹号。
- 所有键盘可操作控件必须有立即出现的 2px 青蓝焦点环。
- 禁用态保持可辨认，透明度 0.5；加载态不得改变控件几何尺寸。

## 页面一致性

### 共享

- 冷白环境、深墨字、青蓝主色、紫色折射、字体、玻璃边界、输入控件、分段控件、焦点态和短动效。
- 顶栏、右侧 Dock、工具条和弹窗共享同一套玻璃透明度、模糊与内高光；不使用无边界的透明文字。
- 同一语义组件跨首页、动态和资料库必须共用尺寸、圆角、边框与状态样式；例如“关注 / 取消关注”只能使用一套常驻边框和蓝色悬停态，不允许添加页面级外观覆盖。
- “帮我读”在所有视频操作栏中固定使用蓝色语义样式；三操作布局固定放在中间，不能依赖 `nth-child` 等位置选择器决定颜色。

### 允许不同

- 首页首屏采用一张大主卡与右侧三张紧凑卡，下方接完整推荐画廊；首页操作栏覆盖在缩略图内，仅在悬停或键盘聚焦时显现，不得改变卡片几何尺寸。
- 资料库可在已有的网格/列表信息密度之间切换，但沿用同一装裱卡片。
- 设置页采用 248px 左侧作用域导航 + 右侧单一内容区；分类固定为首页、动态、跨页面、AI、数据入口，并在右侧标题旁明确显示生效范围。一次只显示一个作用域，内部用分隔线组织。窄屏时左栏收为顶部横向分类条。
- 番剧页的海报比例可以不同，但状态、操作与元数据仍用同一套令牌。

## Exports

`tokens.css` 是唯一真源；应用入口在 `fonts.scss` 与视觉样式之前导入它。

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(95% 0.025 232);
  --color-paper-2: oklch(91% 0.038 238);
  --color-paper-3: oklch(86% 0.055 246);
  --color-ink: oklch(24% 0.055 257);
  --color-ink-2: oklch(39% 0.045 255);
  --color-rule: oklch(83% 0.04 240 / 72%);
  --color-rule-2: oklch(92% 0.025 232 / 70%);
  --color-muted: oklch(52% 0.04 252);
  --color-accent: oklch(50% 0.18 224);
  --color-focus: oklch(48% 0.19 224);
  --font-display: "BillNext Shanggu", "BillNext Onest", sans-serif;
  --font-body: "BillNext Onest", "BillNext Shanggu", sans-serif;
  --spacing-xs: 0.5rem;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2.5rem;
  --radius-card: 1rem;
  --radius-input: 0.75rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(95% 0.025 232)", "$type": "color" },
    "paper-2": { "$value": "oklch(91% 0.038 238)", "$type": "color" },
    "paper-3": { "$value": "oklch(86% 0.055 246)", "$type": "color" },
    "ink": { "$value": "oklch(24% 0.055 257)", "$type": "color" },
    "ink-2": { "$value": "oklch(39% 0.045 255)", "$type": "color" },
    "rule": { "$value": "oklch(83% 0.04 240 / 72%)", "$type": "color" },
    "accent": { "$value": "oklch(50% 0.18 224)", "$type": "color" },
    "focus": { "$value": "oklch(48% 0.19 224)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "BillNext Shanggu, BillNext Onest, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "BillNext Onest, BillNext Shanggu, sans-serif", "$type": "fontFamily" }
  },
  "duration": {
    "micro": { "$value": "100ms", "$type": "duration" },
    "short": { "$value": "180ms", "$type": "duration" },
    "long": { "$value": "420ms", "$type": "duration" }
  }
}
```

### shadcn/ui variables

```css
:root {
  --background: 95% 0.025 232;
  --foreground: 24% 0.055 257;
  --card: 99% 0.008 232 / 62%;
  --card-foreground: 24% 0.055 257;
  --popover: 99% 0.006 232 / 78%;
  --popover-foreground: 24% 0.055 257;
  --primary: 50% 0.18 224;
  --primary-foreground: 98% 0.008 232;
  --secondary: 86% 0.055 246;
  --secondary-foreground: 39% 0.045 255;
  --muted: 92% 0.025 232;
  --muted-foreground: 52% 0.04 252;
  --accent: 50% 0.18 224;
  --accent-foreground: 98% 0.008 232;
  --destructive: 50% 0.18 25;
  --destructive-foreground: 97% 0.016 82;
  --border: 83% 0.04 240 / 72%;
  --input: 83% 0.04 240 / 72%;
  --ring: 48% 0.19 224;
  --radius: 1rem;
}
```
