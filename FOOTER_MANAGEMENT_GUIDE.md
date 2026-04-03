# 统一页脚管理系统 - 使用指南

## 📋 概览

建立了一套完整的页脚统一管理系统，确保所有页面的**版权声明保持一致**，同时支持不同页面的**页脚布局定制**。

---

## 🏗️ 系统架构

### 三个核心部分

```
┌─────────────────────────────────────────────────┐
│ 1. lib/footerConfig.ts                          │
│    - 集中管理版权声明                            │
│    - 管理所有库的许可证信息                      │
│    - 管理通用链接和政策                          │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 2. components/Footer.tsx                        │
│    - 可复用的 Footer 组件                       │
│    - 支持多种布局模式                            │
│    - 从 footerConfig 读取配置                   │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 3. pages/*.tsx                                  │
│    - 各页面导入 Footer 组件                     │
│    - 通过 Props 定制布局                         │
└─────────────────────────────────────────────────┘
```

---

## 🎨 Footer 布局模式

### 三种内置布局

#### 1. **`layout="full"` 完整布局**（默认）

适用于：主要内容页面（dashboard, privacy, terms）

特点：
- ✅ 三列网格：关于 | 快速链接 | 联系我们
- ✅ 完整的版权声明
- ✅ 技术栈信息
- ✅ 政策链接

使用方式：
```tsx
import Footer from '../components/Footer';

export default function Page() {
  return (
    <>
      {/* 页面内容 */}
      <Footer layout="full" />
      {/* 或直接使用默认值 */}
      <Footer />
    </>
  );
}
```

#### 2. **`layout="minimal"` 最小布局**

适用于：对页脚空间要求高的页面（首页）

特点：
- ✅ 仅显示版权声明
- ✅ 精简设计
- ✅ 版权信息统一管理

使用方式：
```tsx
<Footer layout="minimal" />
```

#### 3. **`layout="compact"` 紧凑布局**

适用于：需要少量信息的页面

特点：
- ✅ 简化的三列网格
- ✅ 版权声明完整
- ✅ 可选元素

使用方式：
```tsx
<Footer layout="compact" />
```

---

## 🔧 Props 配置

### 完整的 Props 接口

```typescript
interface FooterProps {
  // 布局类型
  layout?: 'full' | 'minimal' | 'compact';      // 默认: 'full'

  // 条件显示
  showAbout?: boolean;                           // 默认: true
  showLinks?: boolean;                           // 默认: true
  showContact?: boolean;                         // 默认: true
  showTechStack?: boolean;                       // 默认: true
  showPolicies?: boolean;                        // 默认: true

  // 自定义链接
  customLinks?: Array<{
    label: string;
    href: string;
  }>;
}
```

### 常见配置示例

#### 示例 1：显示完整页脚
```tsx
<Footer 
  layout="full"
  showAbout={true}
  showLinks={true}
  showContact={true}
/>
```

#### 示例 2：自定义快速链接
```tsx
<Footer 
  layout="full"
  customLinks={[
    { label: '首页', href: '/' },
    { label: '笔记', href: '/dashboard' },
    { label: '支持我们', href: '/contact' },
  ]}
/>
```

#### 示例 3：只显示版权，不显示技术栈
```tsx
<Footer 
  layout="full"
  showTechStack={false}
  showPolicies={false}
/>
```

#### 示例 4：完全自定义
```tsx
<Footer 
  layout="full"
  showAbout={false}
  showLinks={true}
  showContact={false}
  customLinks={[
    { label: '文档', href: '/docs' },
    { label: 'GitHub', href: 'https://github.com/NENWA618/NOTE' },
  ]}
/>
```

---

## 📝 当前页面配置

### 已更新的页面使用情况

| 页面 | 路径 | 布局 | 自定义链接 | 状态 |
|------|------|------|----------|------|
| 首页 | `/` | `minimal` | - | ✅ 已更新 |
| 联系页 | `/contact` | `full` | 是 | ✅ 已更新 |
| 仪表板 | `/dashboard` | `full` | - | ✅ 使用默认 |
| 隐私政策 | `/privacy` | `full` | - | ✅ 使用默认 |
| 使用条款 | `/terms` | `full` | - | ✅ 使用默认 |

---

## 🔄 版权声明同步

### 版权声明来源

所有页面的版权声明都来自 **`lib/footerConfig.ts`**，确保全站统一。

### 修改版权信息的方法

只需修改 `lib/footerConfig.ts` 中的 `FOOTER_CONFIG` 对象，所有页面会自动更新：

```typescript
// 示例：修改版权年份
export const FOOTER_CONFIG = {
  copyright: '© 2027 NOTE. 用心记录每一刻。', // ← 改这里
  
  // ... 其他配置
};
```

### 修改技术栈声明

在 `FOOTER_CONFIG` 中修改相应数组：

```typescript
export const FOOTER_CONFIG = {
  // 核心库
  techStack: [
    { name: 'React', url: '...', license: 'MIT License' },
    // ← 在这里添加或修改
  ],
  
  // 可视化库
  visualization: [
    // ...
  ],
  
  // 其他库
  other: [
    // ...
  ],
};
```

---

## ✨ 新增页面的集成步骤

如果需要在新页面中添加 Footer：

### 步骤 1：导入 Footer 组件
```tsx
import Footer from '../components/Footer';
```

### 步骤 2：根据页面选择布局

| 场景 | 推荐布局 | 示例 |
|------|---------|------|
| 重要内容页面 | `full` | 文档页、FAQ |
| 着陆页/首页 | `minimal` | 营销页 |
| 辅助页面 | `compact` | 帮助页面 |

### 步骤 3：添加 Footer 组件
```tsx
export default function NewPage() {
  return (
    <>
      {/* 页面内容 */}
      <Footer 
        layout="full"  // ← 选择布局
        customLinks={[]} // ← 可选：自定义链接
      />
    </>
  );
}
```

---

## 🛠️ 最佳实践

### ✅ DO（推荐做法）

1. **使用配置文件管理全局信息**
   ```tsx
   // ✅ 好
   import { FOOTER_CONFIG } from '../lib/footerConfig';
   const { copyright } = FOOTER_CONFIG;
   ```

2. **为不同类型的页面使用不同的布局**
   ```tsx
   // ✅ 好 - 首页用最小布局
   <Footer layout="minimal" />
   
   // ✅ 好 - 内容页用完整布局
   <Footer layout="full" />
   ```

3. **通过 Props 进行小幅定制**
   ```tsx
   // ✅ 好 - 有针对性的定制
   <Footer 
     layout="full"
     customLinks={specificLinks}
   />
   ```

### ❌ DON'T（不要做）

1. **避免在每个页面重复定义版权**
   ```tsx
   // ❌ 不好 - 重复代码，难以维护
   <p>© 2026 NOTE. 用心记录每一刻。</p>
   <p>版权信息重复...</p>
   ```

2. **避免硬编码链接和文本**
   ```tsx
   // ❌ 不好
   <a href="/privacy">隐私政策</a>
   
   // ✅ 好
   <Footer /> {/* 自动使用 footerConfig 中的链接 */}
   ```

3. **避免为一个小改动创建新组件**
   ```tsx
   // ❌ 不好 - FooterV2.tsx, FooterV3.tsx, ...
   
   // ✅ 好 - 用 Props 控制显示
   <Footer showTechStack={false} />
   ```

---

## 📊 版权声明完整性检查

### 当前已声明的库

#### MIT License 库（14 个）
- React
- Next.js
- Lunr.js
- Pixi.js
- pixi-live2d-display
- react-markdown
- remark-gfm
- *(以及 package.json 中的其他 MIT 库)*

#### Apache-2.0 License 库
- OpenAI
- react-beautiful-dnd

#### GPL-2.0 License 库
- Live2D 看板娘

### 版权声明来源
- ✅ 配置文件：`lib/footerConfig.ts`
- ✅ Footer 组件：`components/Footer.tsx`
- ✅ 完整许可证：`CREDITS.md`
- ✅ 审计报告：`FOOTER_COPYRIGHT_AUDIT.md`

---

## 🔍 调试与维护

### 检查版权是否同步

要验证所有页面的版权声明是否一致：

```bash
# 检查所有 Footer 使用
grep -r "version=\"Footer\"" pages/

# 检查 FOOTER_CONFIG 是否被正确导入
grep -r "footerConfig" components/
```

### 常见问题

**Q1：我修改了 footerConfig.ts，但页面没有更新**
- A: 重启开发服务器或清除 Next.js 缓存（`.next` 文件夹）

**Q2：某个页面需要不同的版权文本**
- A: 不建议这样做（会破坏一致性）。如果必须，请在 footerConfig 中增加特殊配置

**Q3：我想隐藏某些部分**
- A: 使用 Props：`<Footer showTechStack={false} />`

---

## 📚 相关文件位置

| 文件 | 作用 | 修改频率 |
|------|------|---------|
| [lib/footerConfig.ts](lib/footerConfig.ts) | 配置中心 | 低 |
| [components/Footer.tsx](components/Footer.tsx) | 组件逻辑 | 低 |
| [pages/index.tsx](pages/index.tsx) | 首页集成 | 中 |
| [pages/contact.tsx](pages/contact.tsx) | 联系页集成 | 中 |
| [pages/dashboard.tsx](pages/dashboard.tsx) | 仪表板集成 | 中 |
| [CREDITS.md](CREDITS.md) | 完整许可证索引 | 中 |
| [FOOTER_COPYRIGHT_AUDIT.md](FOOTER_COPYRIGHT_AUDIT.md) | 审计报告 | 低 |

---

## 🎯 总结

✨ **关键特性：**
- 🔐 版权声明统一管理在 `footerConfig.ts`
- 🎨 支持 3 种内置布局 + 自定义 Props
- 📱 所有页面自动同步版权信息
- 🔄 维护成本低，扩展性强
- 📋 完整的审计和文档

✅ **已完成的工作：**
- ✅ 创建 Footer 配置文件
- ✅ 重写 Footer 组件（支持灵活定制）
- ✅ 更新所有页面使用新 Footer
- ✅ 统一版权声明
- ✅ 创建使用指南

🚀 **后续改进方向：**
- 可以添加国际化支持（i18n）
- 可以添加动态版权计算（自动更新年份）
- 可以集成 CMS 系统管理链接
