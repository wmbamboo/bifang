# WorkBuddy → Cursor 交接：模板缺口治理（2026-09-26）

> **通道说明**：本文档由 WorkBuddy 侧写入、**章节累积**（最新任务在最后一章）。
> Cursor 侧经 `.cursor/rules/workbuddy-task.mdc` 自动读**最后一章**并执行；前面的章节是历史留档，不必通读。
> 反向通道（Cursor → WorkBuddy）仍是 `.cursor/rules/workbuddy-review.mdc` → 仓库根 `.workbuddy-handoff.md`。

来源：评审 `pptTemplate-simple.pptx`（47 页）时列出的 4 个结构性缺口，本轮已做掉能做的部分，
剩下「图像类」两条给出落地设计。**未提交，按你的节奏合入。**

---

## 一、已完成（可直接合入）

### 1. 模板残页 → 真实表格版式（缺口：44/45/46 原 deck 残留）

`frontend/public/pptTemplate-simple.pptx`

| 页 | 改前 | 改后 |
|---|---|---|
| 44 | 学术沙龙残页（`{vItem.item1_Desc}` 重复 9 次） | `table` **6 行 × 4 列** |
| 45 | 职业规划指导残页 | `table` **6 行 × 5 列** |
| 46 | 优秀学员分享残页 | `table` **8 行 × 5 列** |

- 做法：以页 42（5×4 正规表格页）为骨架，保留 `{slideTitle}` / `{tableTitle}` 外观，只重写 `<a:tbl>` 的
  列宽/行高/单元格占位符 `{cell_rXcY}`；rels 未动（44/45/46 本就指向 slideLayout5，与 42 同版式）。
- 复现/回滚脚本：`.workbuddy/tools/add_table_pages.py`（含 `--dry-run`）。
- 备份：`.workbuddy/backup/pptTemplate-simple.20260926-211710.pptx`（**改前原件**）；
  `...-after-gapfix.pptx` 是改后副本，别当成原稿。
- 自检：全 zip XML 良构 0 失败；44/45/46 槽位数 24/30/40；残页文本（职业规划/学术沙龙/优秀学员）已清零；
  `docProps/app.xml` 幻灯片标题同步。

### 2. manifest 多表格规格

`frontend/public/template-manifest.json` + `frontend/src/components/DocUtil/template-manifest.json`（逐字节一致）

- 新增 `44:table 6×4`、`45:table 6×5`、`46:table 8×5`；`reserved` 清空；`futureLayouts: ["chart"]`；
  `downgrade.table` 写清选页规则。`slideMax` 仍 47，**页号未重编号**（零索引churn）。

### 3. 选页：按数据行列取「最小够用」

`frontend/src/components/DocUtil/templateManifest.ts`
- 新增 `resolveTableGrid(rows, cols)` → `{page, rows, cols, downgraded}`；`resolveTableGrid` 回传的是
  **模板真实规格**，fill 必须按它生成 cell 变量，否则模板多出来的格子会留空（虽然 `genNewContentByXml`
  会把未填 `{slot}` 清空，但会出现空边框格）。

### 4. 填格动态化

- `frontend/src/components/DocUtil/ViewItem4Ppt.ts`
  `buildTableFillVars(subTitle, vItem, opts?)` → `{vars, rows, cols, page}`；
  行列由 tips 竖线行推得，兼容全角 `｜`；单格上限 28→30 字（5 列时更耐塞）。
- `frontend/src/pages/AiOutlineGenPpt.tsx`、`frontend/src/pages/KbOutlineGenPpt.tsx`
  表格分支改为 `genNewSlideFileDict_Random('table', vars, page, rows, cols)`。

### 5. 闸门/prompt 配套

- `frontend/src/components/DocUtil/outlineJson.ts`
  `capTipsByLayout` 的 table 上限 6→8（此前后 6 行表格会被静默截断，是已存在的丢数据 bug）；
  table 校验认全角 `｜`，并新增「最多 8 行」提示。
- `frontend/src/components/ChatUtil/OutlinePromptComposer.tsx`
  **补上 `PPT_OUTLINE_LAYOUT_RULES.table / .image_grid`**（此前 `layoutRulesFor(['table'])` 查不到键，
  实际注入的是 **list 的 tips 契约**——这是表格行写坏的直接原因之一）；`FillLayoutKey` 扩两键；
  catalog 里补「2～8 行 / 2～5 列 / 4 列维度口径 或 5 列榜单」规格说明。

### 6. 金标

- `frontend/tests/templateTableSpec.test.ts`（新增，10 案）：选页精确/最小够用/超限夹取、
  4 列 20 格 / 5 列 30 格 / 8 行 40 格全覆盖、全角竖线、小项退回、表题与格长受控。
- `frontend/tests/templateTableRender.test.ts`（新增，4 案）：**端到端灌模**——用真实 `PptTemplate`
  读改后的模板，灌 6×4/6×5/8×5 与回归 5×4，断言取到正确页、槽位全填、无残留 `{slot}`。

---

## 一·补 顺手记下的低优先问题（不建议本轮动）

1. `PptTemplate.getTemplatePageContent` 的 `if(!this.templateBuffer) await this.init();` **永远不会触发**
   （构造函数里 `Buffer.alloc(0)` 是**真值**）。页面代码都在前面显式 `await pptTemplate.init()` 才没出事；
   若有人漏调，报错会是难懂的 `Corrupted zip ?`。建议改成显式初始化标志或 `length === 0` 判断。
2. `pptPage.restSlide = [44,45,46]` 注释「暂时不用的页面」已过期（44–46 已启用为表格页）；
   该字段无消费点，可以删或改空数组。
3. `getTemplatePageNumber` 末尾 fallback `pptPage[sType].start` 对 `table/image_grid` 会命中不存在的键
   （tsc TS7053，既有告警）。table 现在恒由 manifest 命中，不会走到；顺手把 fallback 的类型收窄即可。

---

## 二、待你接的：缺口「图表页 / 图鉴换图」（同一能力）

**结论：这两条都卡在「把外部图片注入 pptx」这一个能力上，先做注入，两条一起开。**

好消息：后端已经在抽图了。
`backend/app/services/kb_service.py::_extract_pdf_image_assets()` →
`kb/assets/<doc_stem>/<doc>_p<page>_<i>.png`，返回 `asset_meta = {page_1based: [asset_id, ...]}`，
当前库内已有 **658 个资产**。缺的是「把 asset_id 送到前端 → 灌模时替换 media」。

### 二·补 图资产现状实测（2026-09-26 晚，polo 专项）

**1. polo 已抽完，但粒度是「整页图」**
- `kb/assets/抖音单品爆款分析-商务男士衬衫polo衫/` → 18/18 页，命名 `<doc>_p<页>_0.png`，
  尺寸统一 **3840×2160**，时间戳 09-26 00:33（与重 OCR 同批）。
- 原因已查清：**polo 的 PDF 是纯图片型**——`pypdf` 实测 18/18 页均为 `imageXObject=1 / Do=1`，
  单张 3840×2160 JPEG（`/DCTDecode`），**无文字层**（所以必须走 OCR）。
- 含义：抽出的资产 = 整页版面（含页眉「KEY TREND / 爆款分析 / 采样时间」与底部价格销量条），
  **直接当图鉴配图会带上页眉**。对照：`2024抖音服饰行业趋势报告` / 各白皮书 / 艺恩这类文档
  是真内嵌多图（每页 0～4 张、尺寸各异），抽出来即可直接用。

**2. 元素级 bbox 其实早就有了——藏在 OCR 文本里**
extracts 每页 `snippet` 含 VL 版面检出的图块引用：
- `imgs/img_in_image_box_{x0}_{y0}_{x1}_{y1}.jpg`：polo **79 个**（p7–p17 每页 5 个 = 5 列商品图带；
  p3/p5 每页 10～11 个；p1 封面 1 个；p18 2 个），全库合计 1000+（连衣裙 130、防晒白皮书 134、
  童装 125…）。**polo p10/p14/p17 的 5 个框 x 坐标分别落在 61-454 / 460-855 / 864-1256 /
  1258-1654 / 1663-2051，完美对应 5 列。**
- `imgs/img_in_chart_box_{x0}_{y0}_{x1}_{y1}.jpg`：polo **4 个，全在 p6 属性页**，
  正好是「面料材质 / 图案花纹 / 厚薄 / 袖型」4 个条形图。
- **但图片实体没落盘**：库内无 `imgs/` 目录、全库搜不到 `img_in_image_box_*` 文件
  → 这些只是文本里的引用标记，需要按坐标从整页图裁切才能得到真正的元素图。

**3. ⚠️ 两套坐标空间不一致（实测，必须按此换算，别猜）**

| 引用类型 | 坐标空间 | 换算到 3840×2160 整页图 | 实测 |
|---|---|---|---|
| `img_in_image_box` | ≈ **2110 × 1190**（= PDF 页 1055×595 pt × 2） | × (1.820, 1.815) | polo p10/p14/p17、连衣裙 p3 裁切落位全部正确，**文档无关** |
| `img_in_chart_box` | **3840 × 2160**（像素级） | 直接用 | polo p6 四框裁出的正是「棉 72.18%」「常规 73.63%」条形图 |

验证方式：`pypdf` 读 `mediabox=1055×595`，而 image_box 的 x 最大到 2055、y 到 1102 → 恰好是 pt×2。
后端 `ocr_service.enrich_vl_chart_boxes()` 里是 `page.crop(box)`（page = 传给 VL 的页图字节），
说明 **chart_box 空间 = 那次 VL 输入的页图分辨率**。**实现建议：沿用「同一次渲染的页图」做裁切，
不要跨分辨率硬算系数**——最稳的是把 VL 当时的 page image 落盘，坐标天然对齐。

**4. 落盘改造建议（新增一个小函数即可）**
```
_extract_vl_elements(md: str, page_image_bytes, assets_dir, page_no) -> list[asset_id]
  1) 双正则解析两套引用
  2) 不做任何坐标换算：bbox 的空间就是这份 page_image_bytes 的空间，直接 page.crop(box)
     （⚠️ 上一版这里写的「按文档页尺寸归一化 / 按比值推系数」已作废，理由见 二·补 6）
  3) PIL 裁切 → kb/assets/<doc>/elements/<doc>_p<页>_<box|chart><i>.png（bbox 入名 → 天然幂等）
  4) 返回 id 列表；chunk metadata 加 asset_kind: page|element（现有 asset_ids 存的是整页图 id）
```
注意各文档框的语义略有差异：**polo 的 image_box 只框商品图区（不含价格条），连衣裙的框把
价格条一起框进去了**（样例里带「¥15.90 / 本期销量 9.27万件」）→ 图鉴卡片要不要再写 `item_Desc`，
应看框内是否已含价格。另外每个元素图与「款」的语义（价格/销量）可借 `page` + 组内序号与
metrics 对齐（p10 正好 5 组价格+销量）。

**5. 本轮验证样例（可直接看）**
- 脚本：`.workbuddy/tools/crop_assets_by_bbox.py`（polo 按 bbox 裁，输出 79 张 + `_index.json`）
- 样例图：`.workbuddy/tools/sample_crops/`（`polo_p10_img2.png` 商品图、`polo_p6_chart1.png`
  属性条图、`dress_p3_img7.png` 带价格条的商品图）
- 结论：**「整页图 + VL bbox」已足以产出图鉴页要的商品图，无需重 OCR、无需装新库**（PIL 即可）。

### 二·补·6 裁切放哪：**必须内联进 OCR 阶段**，独立程序只做存量回填

先摆三条代码事实（都已核对）：
- `ocr_dpi_scale = 2.0`（`config.py` L63，**可配**）→ 页图 = PDF pt × 2。polo 页 1055×595 pt
  → **2110×1190**，**这就是 image_box 的坐标空间**。
- 页图在 `extract_pdf_text`（`ocr_service.py` L407-409）里是
  `pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))` → `pix.tobytes("png")`，
  **内存 bytes、用完即弃、不落盘**。
- 落盘的 assets 是 `page.get_images()` 抽的**内嵌原图**（3840×2160）——**与 bbox 空间不同源**。

**所以这不是偏好问题，是正确性问题**：bbox 只在「那一次 get_pixmap」里成立。事后裁切只有两条路，
都有坑——① 复现 scale：`ocr_dpi_scale` 一改、或换一份页尺寸不同的 PDF，历史 bbox 全部失效；
② 拿落盘的整页图当底图乘系数 1.820/1.815：该系数 = 内嵌图分辨率 ÷ (页 pt × scale)，
**它不是常数**，换一份内嵌图分辨率不同的 PDF（如竖版扫描 1200×1600）就崩；
polo 与连衣裙一致，只是因为碰巧都是 16:9 纯图片型。
**内联则零换算、零误差，且重 OCR 自动同步**（新 bbox 配新页图，不会出现「新坐标配旧底图」）。

**成本也不支持外置**：PIL crop+save 单张 10～30ms，polo 79 张 < 2s；对比 OCR 是分钟级 → 内联的
机会成本 ≈ 0。反过来独立程序得重渲染整本页图，纯白做。

**落在哪一行**：`extract_pdf_text` 的 OCR 分支内、`ocr_text = ocr_image_bytes(png)` 之后（`png`
还在作用域里），把 `img_in_image_box_* / img_in_chart_box_*` 解析出来就地裁切落盘；
或把 `ocr_image_bytes` 的返回值从 `str` 上抛成 `(text, elements)`。
`enrich_vl_chart_boxes()` 已经在做「同一份 `page_image_bytes` 直接 crop」——**沿用这个范式，
别另开一条跨分辨率的路**。

**⚠️ 最大陷阱：抽图现在有两份拷贝，新增步骤必须三入口同步**
- `upload_task_service._vectorize_one` L471（上传任务链路）
- `kb_service.vectorize_files` L471（直接向量化；`/upload_tasks/revectorize` 大概率复用它）
现状是「抽整页图」这个动作已经复制了两遍。任何新步骤都要三处一致，否则会出现
「走上传的有元素图、走 revectorize 的没有」这种隐性不一致。
**建议把「抽整页图 + 裁元素图」收成单个 `kb_service.extract_page_assets(path, kb, name)`，三处只调它。**

**独立程序仍需要，但只承担两件事**（且必须共用底层）：
- 存量回填：库内已有 658 张整页图 + 1000+ 条已入库 bbox 引用，不值得为它们全库重 OCR；
- 人工重裁 / 抽查。
硬要求：把 `page.get_pixmap(matrix=fitz.Matrix(scale, scale))` 抽成公共
`render_page_png(path, page_no, scale)`，CLI 与流水线共用；**CLI 里不许自己写 `Image.resize`**，
否则等于把刚消灭的坐标系问题又请回来。

**附带建议（顺手就赚）**：既然页图就在内存里，内联时**顺手落盘一份整页图**
`assets/<doc>/whole/page_N.png`，成本极低。好处是整页图与元素图**同源同分辨率**，
前端做「整页预览 + 框选高亮」时不用再管两套坐标；长期也能把 `_extract_pdf_image_assets`
那套内嵌原图逻辑简并掉（内嵌原图的唯一独有优势是分辨率更高 3840 vs 2110，图鉴卡片
694×909 完全够用）。

落地建议（按顺序）：

0. **先裁元素图**（成本最低收益最大）——拆成两半，别只做一半：
   0a. **内联进 OCR 阶段**（主链路，设计见「二·补 6」）：polo 一家立得 74 张商品图 + 4 张属性条图，
       之后所有新入库文档自动带元素图；顺手把页图落盘到 `whole/`。
   0b. **独立回填命令**（一次性运维）：给已入库的存量文档补元素图，**复用同一个 `render_page_png`**。
   不做的后果：图鉴页只能引用「整页图」，观感上等于贴了一张带页眉的报告页。
1. **后端 expose**：`GET /kb/assets?kb=<name>&doc=<stem>` → `[{asset_id, page, url, kind}]`（或直接把
   `asset_meta` 挂进已有文档列表接口）。注意已有 `assets/` 目录的静态服务路径。
2. **前端选图**：大纲阶段对 `chart` / `image_grid` 页给候选图（最简单：`page_1based` 与源文档页号对齐，
   或让模型从候选 asset_id 里选 2～4 个，禁止编造 id）。
3. **灌模注入**（`PptTemplate.ts` 新方法，约 40～60 行）：
   - 写 `ppt/media/imageN.<ext>`（KB 可能重复用，需内容哈希去重）
   - 追加/改写 `ppt/slides/_rels/slideN.xml.rels` 的 image relationship
   - 改写 slide XML 里 `<a:blip r:embed="rIdX">` 指向新 rId（图鉴页 43 已有 4 个 `<p:pic>` 可直接换；
     图表页需新建页）
   - `[Content_Types].xml` 如出现新扩展名（jpg/png）需补 Default
4. **图表页模板**：新增 1 页 `chart`（大图位 + `{slideTitle}` + 2～4 图注槽），manifest 登记为
   `futureLayouts` 之外再进 `pages`，同时把 `futureLayouts` 里 chart 去掉。
   —— 我**故意没有**先塞一个「图位引用模板内固定 jpeg」的图表页：那样模型一旦选中就会输出一张无关图，
   比没有图表页更糟。等注入能力到位再加。

**临时止血（建议本轮就做，不依赖上面）**：提示词层禁止「趋势图/走势/图表」类页题，要求
图表类内容改写成 `table`（5 列时间序列：周期|销量|占比|同比|环比）或 `metric`。
现在表格规格已扩到 8×5，承接趋势对照够用。

---

### 二·补·7 体积实测（你 22:45 的 0a/0b 落地后复核）

已实测你的产物（`assets/polo/`，22:45-22:46 落盘）：

| 类别 | polo 张数 | 体积 | 单张均 |
|---|---|---|---|
| 内嵌原图（原有） | 18 | 99.5 MB | **5.53 MB** |
| `whole/`（新增） | 16 | 25 MB | **1.56 MB** |
| `elements/`（新增） | 82 | 20 MB | **244 KB** |
| 目录合计 | 116 | 144 MB | — |

**结论：元素图很便宜，`whole/` 才是大头。** 全库外推（744 张整页图 / 936 个 bbox 引用）：
- `elements/` ≈ 936 × 244KB ≈ **223 MB**（占现有 2.0 GB 的 **11%**）
- `whole/` ≈ 660 页 × 1.56MB ≈ **1.0 GB**（占现有 **50%**）
- 全库 → **2.0 GB ≈ 3.2 GB（+60%）**

优化建议按性价比排序（前两条几乎零成本）：

1. **`whole/` 改存 JPEG（q85）而不是 PNG** —— 整页图是照片性质，PNG 无损压缩极差
   （这就是为什么它是元素图的 6.4 倍）。换 JPEG 后约 1.56MB → 200KB，**全库 +1.0GB 降到 +130MB**。
   裁剪逻辑完全不用改，只换 `page.save(..., format=...)` 与文件后缀/`asset_id`。
2. **0a 内联路径可考虑 `save_whole=False`** —— 内联时页图就在内存里，裁切本不需要落盘
   （「二·补 6」的原始设计就是内存直裁）。若前端不需要"整页预览"，直接省掉 1.0GB；
   若需要，走第 1 条或存 1280 宽缩略图（~120KB/张）。
3. **`elements/` 同样可转 JPEG**：244KB → ~80KB（全库 223MB → ~73MB）。商品图是照片，
   无损收益低；**但若有抠图/透明需求则保持 PNG**，按需决定，不急。
4. **纯图片型 PDF 可跳过内嵌原图抽取**：polo 这类（每页仅 1 张整页大图）抽出的内嵌原图
   与 `whole/` 是同一张画面的两个分辨率，属纯重复占用，**一家就 99.5 MB**。
   判据：`page.get_images()` 每页 ≤1 张且尺寸 ≈ 页尺寸 × N。真内嵌多图的文档（趋势报告、
   白皮书）不受影响，仍然保留。

**两个契约问题（比体积更要紧，建议顺手确认）**：

- ⚠️ **`whole/` 只覆盖「有 bbox 引用的页」**：polo 缺 `p2`、`p4`（这两页 VL 没检出图块）。
  代码里 `save_whole` 是在解析 bbox **之前**无条件执行的，所以缺页只可能来自「该页根本没进裁切函数」。
  **若前端把它当"整页预览"按页取图，会静默缺页** → 要么在渲染阶段无条件落 whole，
  要么在文档里把它明确为"裁切底图"、不作为页预览用。
- **`asset_id` 现在带路径前缀**（`elements/<stem>_pN_imgK.png` / `whole/page_N.png`），
  不再是裸文件名。你的 handoff 风险点已提到，前端消费 + `asset_meta` 出口要跟着认；
  建议统一约定成"相对 `assets/<doc>/` 的路径"，避免前端拼路径两套写法。

---

## 三、冲突提示（我的改动落在你 M 状态的文件里）
你工作区当前未提交改动涉及：`outlineJson.ts`、`outlineEvidenceValidate.ts`、`outlineCoverage.ts`、
`PptProductGate.ts`、`PptTemplate.ts`、`ViewItem4Ppt.ts`、`ChatWithSpeech4Ppt.tsx`、
`OutlinePromptComposer.tsx`（另 backend 若干）。我在其中 **4 个**文件上做了**增量**改动：
`outlineJson.ts`（capTipsByLayout 6→8、table 校验）、`ViewItem4Ppt.ts`（表格填格）、
`OutlinePromptComposer.tsx`（补 table/image_grid 契约、FillLayoutKey）、
`PptTemplate.ts`（**未改**，仅建议）。rebase 时请以「保留你的四段改动 + 我的增量」为准。

## 四、验证

- `fidelityGold` + `outlineMetaCoverage` + `templateTableSpec` + `templateTableRender`：
  **32/32 通过**（`.workbuddy/tools/jest_all.txt`）。
- `templateTableRender` 是端到端：用真实 `PptTemplate` 读**改后的 pptx**（JSZip 能正常解析新 zip）、
  按数据行列灌 6×4/6×5/8×5 与回归 5×4，断言「取到正确页 + 槽位全填 + 无残留 `{slot}`」——
  这条同时守住了「模板改了但 manifest/填格没跟上」的漂移。
- 顺带确认：灌模产出把中文写成数字字符引用（`&#x5e97;&#x94fa;`），断言/闸门都要先解码
  （你在 08:59 已修好成品闸的解码，这里只是印证）。
- CI：已把 `templateTable` 加进 `.github/workflows/ci.yml` 的「金标专项」pattern。
- **未能做的验证**：本机没有 LibreOffice（`wsl.exe` 被安全策略拦），无法把 44/45/46 渲染成图目检；
  建议你在 PowerPoint 里打开模板翻到 44–46 页确认行高/字号观感（8 行页正文 10.5pt、行高 45pt，应不挤）。
- 运行方式（Windows 侧 node 直跑 WSL 内 jest）：
  `node frontend/node_modules/jest/bin/jest.js --config jest.config.js --ci tests/... --runInBand`

---

# 五、成品评审（v2026826 第三次生成，2026-09-27）——问题全在接入层

## 五·0 结论
- **数据层已基本可信**：87 个数字 85 个逐字可溯（解包抽文本解实体 + 千分位归一化后比对向量库）；
  上一版的三个老问题（属性页数据入库、袖型不再挂厚薄、价带按品类拆页）都已修好。
- **问题全部集中在接入层**：图片绑定、列语义、卡片落位。
- 仅 2 处数字无本页来源：`54.8%`（跨文档——全库唯一命中 `2024抖音服饰行业趋势报告.pdf` p32 视频数量指标，
  P17 全页无来源标注）、「珠地」（全库 0 命中，原页卖点是「网眼透气」）。

## 五·1 【P0-1】图片按「位置」取图，而非按 asset_id 绑定

**现象**：图鉴灌模跑通了（成品 slide 8/9/10 各 4 张真图进了 media+rels），但内容全错：
- **P8**（polo 款式页，卡文来自 p16）注入的图实测来自 **p5 衬衫店铺榜**（图1 = 罗蒙 ¥129.00 / 5.3万件 / 大肚人群）；
- **P9**（衬衫页）混进深蓝翻领 polo 商品图；
- **P10**（立领衬衫）的图**是对的**（绿立领 = 6771）→ 说明不是"全乱"，是按下标取图。

**根因链（三处，缺一不可）**：
1. `frontend/src/pages/AiOutlineGenPpt.tsx` L349 / `KbOutlineGenPpt.tsx` L393：调用
   `loadImageGridBytes(kbName, 4, usedAssetIds, {title, captions, manual})` —— **没传 `fileName`**。
   → `kbImageAssets.ts` L49 `file_name: opts?.fileName || ""` 退化为「扫全库资产」，于是跨文档取图。
2. 选图走**文案相似度**（`selectImageGridByCaptions`），而不是该页证据 chunk 的 `asset_ids`。
   **KB chunk metadata 已经带了 `asset_ids`**（`backend/app/services/kb_service.py` L712 挂载、
   L862 从检索出口返回 `ref_docs[].asset_ids`），但 `grep -rn asset_ids frontend/src` = **0 命中**
   —— 链路就断在这里。
3. `frontend/src/components/DocUtil/PptTemplate.ts` L626-653 `_bindSlideImages`：按 rels 里
   `<Relationship Type=.../image>` 的**下标顺序** i 绑 buffer → `gen_p{页}_i{i+1}.png`。位置语义 = 无绑定。

**改法（按收益排序）**：
- **(a) 先把 `fileName` 传下去**（一行改动）：调用点传该页证据的来源文档名，直接挡住 P8 那类跨文档串图。
- **(b) 按 chunk `asset_ids` 绑定**：image_grid 页生成时用该页证据 chunk 的 `asset_ids`
  （条目已带 `page`/`kind`/`idx`）过滤候选，槽位 ↔ asset_id 显式映射，文案相似度只作兜底。
  注意当前是**页级**粒度（同页全部元素挂在同一 chunk 上，见 kb_service L708 注释「bbox 暂用整页标记」）——
  页级已足够修 P8；要卡级精度需 VL bbox 细粒度化。
- **(c) 失败别静默**：`kbImageAssets.ts` L73 现在是 `console.warn` 丢图，空槽位表现为"模板占位图没换"，评审极易漏。至少上报到 UI/大纲。

**同时暴露两个资产契约 bug（不修则 (b) 也修不好）**：
- ⚠️ **`_collect_element_asset_ids`（kb_service.py L448）用字符串排序**：`sorted(elem.glob(...))`
  → `_p3_img1, _p3_img10, _p3_img2, ...`。向量库里 p3 的 `asset_ids` 实测顺序就是
  `img1, img10, img2, img3…`。**按下标取图必然错位**（第 2 槽拿到 img10）。
  改法：`sorted(key=lambda p: (页号, 类型, int(序号)))`。
- ⚠️ **asset_id 前缀不一致**：p1/p3/p5–p18 是 `elements/<stem>_pN_imgK.png`，但 **p2/p4 是裸文件名**
  `..._p2_0.png`（回填路径与新流水线两条产物格式不同）。前端 `fetchAssetBytes` 按 asset_id 查会 404 → 静默丢图。
  统一为「相对 `assets/<doc>/` 的路径」，并在取图接口做一次归一化（与「二·补 7」结尾提的同一条，此处有实锤）。

## 五·2 【P0-2】12 张图全部无 `srcRect`，全部横向拉伸

**实测**：模板 image_grid 页 = **slide43**，4 槽位各 `5.60 × 2.00 in`（**2.80:1**），rels rId2–rId5，
`<p:pic>` 内**无 `<a:srcRect>`**；`grep -rn srcRect frontend/src` = **0 命中**。
→ 近 1:1 源图被硬拉 2.8 倍；P9 那张 692×1584 的竖图拉伸 **6.4 倍**。

**改法**：灌模按槽位比例写 cover 裁剪。注意落点**不只是** `_bindSlideImages`（L626）——它只改 rels；
`<a:srcRect>` 必须写进 **slideN.xml 的 `<p:pic>`**（在该页内容生成之后，按该 pic 的 `<a:ext cx cy>`
与源图宽高比算 l/t/r/b，单位为千分之一百分比，`100000` = 100%）。
另加断言：宽高比偏差 > 15% 且无 srcRect → 拒/报警。
图片宽高比建议在 `list_doc_assets` 出口直接补 `w`/`h`（省一次前端 round-trip）。

## 五·3 【P1】五处内容缺陷（都是归属/落位错，不是编造）
1. **P12 列语义错位**：面料列混进图案首项「纯色 70.07%」、丢了「锦纶 1.49%」；图案列「动物图案 2.01%」**重复两次**。模板 5 槽位 > 数据 5 条时发生**复制填充**而非留空。
2. **P13 漏掉主力项**：袖型只列 4 个尾项，**丢了占比最高的「常规 79.76%」**。高度怀疑短标签去重把「常规(79.76)」判成「常规袖(1.50)」的重复，**删掉了值更大的那条**。→ 改为「保留数值更大者」，或仅对完全同名生效。
3. **P9 张冠李戴**：卡2「郗思昙百货店 1.4万件」错（原页郗思昙是 2.6万/2.3万件；1.4万件属啄木鳥/简霸/衬衫老罗）。卡1「罗蒙 5.3万件」核对**正确**。
4. **P17 卡文重复**：「高弹加宽与翻领商务」卡正文 = 「衬衫优先polo跟进」卡正文的**完整复制**，且那句正是跨文档 54.8% 的载体。
5. **P5 空卡**：右上角 03 位卡片标题与正文**全空**（页面应有 3 张位次卡）。

另有两处口径不一：**P6** 衬衫只给 3 行（漏 ¥200-300 12.9万、¥300-400 4.9万），同表 polo 给 4 行、P15 衬衫给 5 行——同一份数据三处口径不同，8×5 表本可容纳 4+4。**P8** 四卡标题全同「编织肌理Polo衫」，丢掉唯一区分维度（¥119.9 / ¥99 / ¥65.8-68.8 / ¥29.9）与原页卖点。

## 五·4 【P1】建议新增三条「结构可判」断言（域无关，不靠词表）
1. **列内标签必须与列头同轴**——面料列出现图案标签即拒。
2. **模板槽位 > 数据条数 → 留空而非复制**。
3. **图片与数据行 `asset_id` 同源 + 宽高比校验**（>15% 偏差必须裁切）。

这三条都在结构契约层，换域不失效——比再加词面规则划算得多（呼应闸门鲁棒性那笔账）。

## 五·5 【P2】顺手可省的钱
`whole/` 现状 34 文件：18 张 jpg（4.8MB，**已覆盖全部 18 页**）+ 16 张 png（**24.2MB**，缺 p2/p4）。
JPEG 版已落地说明优化生效，但 **PNG 是纯冗余**（同画面两份）→ 删 PNG 直接省 ~24MB/文档；
若前端确需 png，改懒生成或只存缩略图。

## 五·6 验收清单
- 重生成后 **P8 四张图来自 p16 元素图且顺序 = 卡文顺序**（¥119.9 / ¥99 / ¥65.8-68.8 / ¥29.9）；
- 所有 `<p:pic>` 带 `<a:srcRect>`，目检无横向拉伸；
- 数据层重跑「逐字可溯」脚本（方法：解包 → 抽文本先解 `&#xNNNN;` 实体 → 去千分位/空格归一化 → 比对向量库 chunk）；
- 五·4 三条断言各配金标。

---

# 六、模板数量维度程序化：一个样式单元 + 运行时克隆（2026-09-28）

> 用户已重排模板：`pptTemplate-simple.pptx` 现为 **50 页**（mtime 2026-09-28 17:42，2.05MB）。
> 本章数据全部由我实测该文件得出（占位符计数 + 形状树几何）。

## 六·0 【P0·开工前必做】manifest 与 pptx 已错位，必须先重建

**现状**：模板已变 50 页且页号全面重排，但**两份 manifest 都还是 2026-09-26 21:18 的 47 页旧映射**
（`frontend/public/template-manifest.json` 3918B + `frontend/src/components/DocUtil/template-manifest.json` 3918B，二者逐字节一致 ✓）。
→ 现在任何取页都是错的，克隆工作无从谈起。**第一步必须是重建 manifest。**

**权威页表**（实测占位符计数得出，做生成的 ground truth 用）：

| 页 | 版式（layout） | 单元维度 | 备注 |
|---|---|---|---|
| 1 / 2 | cover / chapterCover | — | |
| 3–5 | catalog | cards 3/4/5 | 槽 `{chapterTitleK}` |
| **6–14** | **progress（新版式名）** | 3 类型 × N=3/4/5 | 6-8=型1、9-11=型2、12-14=型3 |
| 15–26 | list | 4 类型 × N=3/4/5 | 15-17 / 18-20 / 21-23 / 24-26 |
| 27–30 | metric | N=2/3/4/5 | |
| 31–34 | columns | cols 2/3/4/5 | 槽 `{colKTitle}/{colKSub}/{colK.itemM}` |
| 35–39 | metric_columns | (cards,cols)=(2,2)(3,2)(4,2)(5,2)(5,3) | |
| 40–44 | metric_list | (vItem,vItem2)=(2,2)(3,2)(4,2)(5,2)(5,3) | 双区版式 |
| 45–48 | table | 5×4 / 6×4 / 6×5 / 8×5 | 槽 `{cell_rXcY}` |
| 49 | image_grid | 4 槽 | pic 5.60×2.00in ×4 + cap ×4 |
| 50 | tail | — | |

**manifest 必须用脚本生成，不要手写**。生成算法（数十行）：

1. 读 `pptTemplate-simple.pptx`，对每页 `slideN.xml`：统计 `{vItem.itemK}` 的 max K（数量）、
   `{vItem2.itemK}`（第二区）、`{colKTitle}` 的 K 数（列数）、`{cell_rXcY}` 的 max R/C（表规格）；
2. `page` 直接取文件名数字（页号==文件名，这条约定没变）；
3. `skin` 用「同 layout 内按 page 升序、每遇到 count 回绕一次就 +1」推导（list 的 4 个类型即 skin 0–3）；
4. 输出**两份** manifest，写完立刻 `copyfile` 同步并断言逐字节一致。

**⚠️ 不要用页内小字标记（`progress1-4`/`List3-5`/`imageList1-4`）当数据源**——我实测它们大面积复制未改：
- p20 实为 5 槽却标 `imageList1-4`；p21/22/23 三种不同数量全标 `imageList1-4`；
- p27–30 四个不同数量全标 `progress1-3`；p31–44 全部标 `progress2-5`。

这些标记文字是 PptProductGate 的 `PROGRESS_MARKER_RE` 事后要清掉的伪槽，**不能反过来当 manifest 输入**。

**同时发现两处模板缺陷，请转告设计侧确认**：
1. **p22 只检出 3 个 `{vItem.itemN}` 槽**，而同组（21/22/23）应为 3/4/5 → 疑漏 1 个槽位。
2. 上述标记文字大面积未更新（不影响运行，但会误导后续维护）。

## 六·1 总原则

- **skin / 类型 = 设计资产 → 人做**（皮肤、配色、装饰、单元视觉样式）。
- **cards / cols = 数量维度 → 程序算**（几何、克隆、字号阶梯）。
- **N > 8 → 降级**（转 table 或拆页），不缩字号硬塞。
- 目标：`N=6..9` 不再需要新模板页；模板矩阵从「类型 × 数量」降为「仅类型」。

## 六·2 manifest 新增字段 `unit`（单元描述符）

由六·0 的生成脚本一并算出，不要手填。schema：

```jsonc
{
  "page": 16,
  "layout": "list",
  "skin": 0,
  "cards": 4,                      // 保留：该页原生槽位数
  "unitKind": "list_row",          // list_row | card | col_group | pic_with_cap | table_row
  "unit": {
    "axis": "y",                   // 克隆轴：y=纵向 / x=横向 / grid=网格
    "band": [0.72, 1.51, 12.31, 4.86],      // 内容带 x,y,w,h (in) —— 单元必须落在此带内
    "proto": "vItem.item1",        // 样板单元的占位符前缀（=克隆源）
    "unitSize": [11.89, 0.61],     // 单元 w,h (in)
    "pitch": 0.82,                 // 模板内既有步距 (in)，作为「不缩放」基准
    "minN": 3, "maxN": 9,          // 可容区间
    "fontLadder": { "3": 0, "6": -1, "8": -2 },   // 相对模板原字号的 pt 偏移
    "align": "stretch"             // stretch=均分内容带 / fixed=保持 pitch 居中
  },
  "slots": ["slideTitle", "vItem.itemN", "vItem.itemN_Desc"]
}
```

## 六·3 运行时克隆算法（落点 `frontend/src/components/DocUtil/PptTemplate.ts`）

新增 `genSlideWithClone(layout, vars, page, N)`，流程：

1. **选母版页**：`resolvePageFor(layout, skin, N)` —— 先精确匹配 `(layout, skin, N)`；
   未命中则取同 `skin` 下 `cards` 最大的那页作母版（如 list skin0 用 p17），触发克隆。
2. **定位样板**：在 slide xml 里找含 `unit.proto`（默认 `item1`）的**顶层节点集合**。
   注意有两种结构（见六·4 分档）：① 单元本身就是独立顶层 `<p:grpSp>`（好克隆）；
   ② 所有 item 装在**同一个** `<p:grpSp>` 里（单元在组内，必须动子形状 + 做组坐标换算）。
3. **保留 1 份样板，删除其余旧单元**（含各自的 deco/装饰形状）。
4. **按 N 复制 N 份**，逐份：
   - 改 `<a:off>`：`align=stretch` 时按 `band.w/N` 均分重排（行距 = `band.h/N`，grid 轴则先定列数）；
   - **占位符重编号** `item1..item1` → `itemK`（`_Desc` 同理）；
   - **形状 name/id 唯一化**（`<p:cNvPr id= name=>`）——slide 内 id 必须唯一，重复会开不了；
   - 字号按 `fontLadder` 改 `<a:rPr sz>` + `<a:endParaRPr>` + `<a:defRPr>` 三处。
5. **收尾断言**：单元数 === N、几何无重叠、无残留 `{}`、槽位集合 === 期望集合。

**三个必踩的坑（请写成代码注释）**：
- **占位符重编号会串**：`item1 → item2` 与 `item2 → item3` 的顺序替换会连锁污染；
  且 `item1` 是 `item10` 的前缀。做法：**先统一改成安全中间名**（如 `__SLOT_K__`）再落最终名，或倒序替换。
- **`<p:grpSp>` 内的 `<a:off>` 是子坐标系**：grpSp 自身有 `xfrm`（`a:off/a:ext` + `a:chOff/a:chExt`）。
  克隆整个 grpSp 只改顶层 off 即可；**克隆组内子形状必须做组坐标换算**，这是最容易出错的一步。
- **`<a:spAutoFit/>`**：模板里文本用自动适配，克隆后 off/ext 变了，需保证 off/ext 与内容量匹配，
  否则 PowerPoint 打开会重排（本地无法渲染，见六·6 验收）。

## 六·4 按结构难度分三档落地（实测，按此顺序做）

| 档 | 特征 | 实测页 | 实测几何（in） | 难度 |
|---|---|---|---|---|
| **A** | 单元 = 独立顶层节点（整个 `<p:grpSp>` 或 pic+cap 对） | **p49** image_grid | pic 5.60×2.00 @ x=0.50/6.60, y=1.30/3.85；cap 紧贴其下 0.04、高 0.40 | ★ |
| | | **p31/p32/p33/p34** columns | 每列 1 个 grpSp；p32 列宽 4.12 步距 4.40；p34 列宽 2.36 步距 2.65 | ★ |
| | | **p19** imageList1 | 4 个 grpSp 各 2.24×4.40，步距 2.98 | ★ |
| | | **p21** imageList2 | 3 个 grpSp 各 3.15×4.72，步距 4.22 | ★ |
| **B** | 单元 = 多个顶层节点（item 与 deco 分离） | **p27–p30** metric | 每项 = `{vItem.itemN}` 2.02×0.88 + `{..._Desc}` 2.02×0.20（各 1 个顶层 sp）+ 1 个顶层 deco sp 2.26×1.75；p27 步距 4.67，p30 步距 2.41 | ★★ |
| | | **p39 / p44** metric+list | 双区：上排 metric 卡 + 下排 list 行（grpSp 11.89×0.83，步距 y=1.12）；**两区各自独立克隆** | ★★ |
| **C** | 全部 item 装在**同一个** `<p:grpSp>` 内 | **p6–p8** progress、**p12–p14**、**p15–p17** list3、**p18**、**p24–p26** | 单元在组内，例如 p15 全部 3 项都在一个 grpSp（0.72,1.90 11.89×4.10）内，p17 是 5 项在同一 grpSp；需组坐标换算 | ★★★ |

**建议顺序：A（先 p49 image_grid → p31–p34 columns）→ B（metric p27–30）→ C（list/progress）**。
理由：A 档只改顶层 off，一次就能验通；C 档要处理组内坐标系，放最后。

**网格版式另需 `gridFor(N, bandAspect)`**：先按内容带与单元宽高比选列数 c，再 `r = ceil(N/c)`。
参考：4→2×2、6→3×2、8→4×2、9→3×3。**image_grid 务必同时写 `<a:srcRect>`**
（第七点见第五章 P0-2：新槽位宽高比变了，裁剪必须按新比例重算，否则又是横向拉伸）。

## 六·5 分流规则：把「数量」从模板矩阵里彻底移除

1. `resolvePageFor(layout, skin, N)` 三级：精确命中 → 取该 skin 最大 N 母版克隆 → 降级。
2. **N > 8 降级**：优先转 `table`（p45–48 已覆盖 5×4/6×4/6×5/8×5），其次由大纲规划层拆页。
3. **删除静默截断**：`capTipsByLayout`（`outlineJson.ts` **L911–923**）现在是硬上限后 `slice()` 丢弃——
   实测上限：`columns/metric_columns`=32、`metric_list`=8、`table`=8、`image_grid`=4、**其余（含 list/progress/catalog/metric）=5**。
   超出即静默丢，这正是第五章 P13「漏掉主力项」与 P6「同表三处口径不一」的根因。
   改为：超额 → 触发克隆/降级，并在大纲 JSON 记录 `overflow: { from: N, to: M, reason }`。
   注意 `image_grid` 的 4 是**槽位上限**，克隆后应改为 9（3×3）。

## 六·5·补 版式语义分流：`progress` ≠ `list`（2026-09-28 晚补，用户提出）

**问题**：progress 与 list 槽位同形（都是 N 条「`{vItem.itemK}` + 可选 `{vItem.itemK}_Desc`」），
但**语义相位相反**——list 是**并列枚举**（打乱顺序意思不变），progress 是**有向序列**（打乱即语义破坏）。
用户已重排出 3 类 progress（p6–14，模板里带连线/站点图形）。若生成侧仍按 list 契约喂，
会写出「并列卖点」塞进进度版式 → 结构性错配。

### 现状实锤：progress 被三处静默降级为 list（与 09-26 表格那次同款坑）

| # | 位置 | 现状 | 后果 |
|---|---|---|---|
| 1 | `OutlinePromptComposer.tsx` **L91** `PPT_OUTLINE_LAYOUT_CATALOG` | layout 枚举只有 7 个，**无 progress** | 选型阶段模型不知道有这个选项，永远不会选它 |
| 2 | 同文件 **L135/L145/L192** `FillLayoutKey`·`PPT_OUTLINE_LAYOUT_RULES`·`layoutRulesFor` | 无 progress 键；L198 `key in RULES ? key : 'list'` | 即使模型写 `layout:"progress"`，拿到的也是 **list 的 tips 契约**（原文写着「对等枚举」） |
| 3 | `outlineJson.ts` **L67/L84** `LAYOUTS`·`normalizeSlideLayout` | 白名单外 → `return "list"` | 解析层把 progress **抹成 list**，下游全按 list 处理 |
| 4 | 同文件 **L911** `capTipsByLayout` | 无 progress 分支 → 落到默认 5 | 结果尚可（progress 就是 3–5），但应显式登记 |

→ 这与 09-26 `layoutRulesFor(['table'])` 键不存在→静默回落 list 契约→表格写坏是**同一个坑**。别再踩第三次。

### 核心判据（交给模型自检 + 可做成轻量校验）

> **打乱测试**：把该页 N 条要点重新排序——**意思不变** → list / columns；**意思被破坏或不再成立** → 才是 progress。

- **适用**（前提是材料本身含流程结构）：页主题为「阶段/步骤/流程/路径/节奏/打法推进/从X到Y/转化链路」，
  且相邻要点之间存在**先后、因果或递进**关系。
- **禁用**：并列枚举（有哪些/是什么/清单/名单）、属性占比（面料/图案/厚薄/袖型）、多轴对照（→`columns`）、
  纯数字规模（→`metric`）。**禁止把并列卖点机械套成「第一步/第二步」**——伪顺序比不用 progress 更糟。
- **反面警告**：不要在 CATALOG 里加「本章至少 1 页 progress」这类硬配额（对比 metric 现有写法）——
  progress 只能由材料里的流程结构触发，强造会批量产出伪流程页。

### tips 语法（`PPT_OUTLINE_LAYOUT_RULES` 新增 progress 块）

- 每条 = 「阶段名（4–12 字）：该阶段动作或产出（≤22 字）」，**强制两段式**（模板给了 `_Desc` 副槽，比 list 更严）。
- **文本里不许写「第一步/阶段1」**——模板已自带节点序号（`connsiteX*` / `T*` 站点图形），再写会重复。
- 首条 = 起点/输入，末条 = 终点/产出；**3–5 条**（模板只做到 5）。
- 正例：`["选品定锚：锁定高增速品类与价格带","内容起量：以卖点短视频撬动自然流","货架承接：搜索与推荐位同步放量","复购沉淀：私域承接拉长生命周期"]`
- 反例：`["价格带50-100占比18.8%","面料以棉为主","袖型常规最多"]`（并列属性 → 应走 list/metric）

### 校验落点（轻量、结构可判、**降级不拒单**）

- **顺序信号**：progress 页 tips 至少 ≥1 处顺序/阶段词（先/再/后/承接/阶段/前期-中期-后期/起量/收口/放大/沉淀/首先-其次-最后）。
  全无 → **Warn + 降级为 list**，不拒单。
- **反例信号**：强并列标记（各/分别/均/以及/另外/此外）密度过高 → 提示换 list。
- **放选型自检阶段，不要放进填充重试循环**——否则又是「重试耗尽→整单失败」那条老路。

### 代码点（并入六·6 一起做）

1. `OutlinePromptComposer.tsx` **L91** CATALOG 加 progress 一行（含适用/禁用判据 + 打乱测试）；
2. 同文件 **L135** `FillLayoutKey` 加 `'progress'`；**L145** 加 progress 键（上面语法）；
3. `outlineJson.ts` **L67** `LAYOUTS` 加 `"progress"`；**L84** `normalizeSlideLayout` 加 `progress`（**只加这一个**，
   不要提前引入没做模板的版式名）；**L911** `capTipsByLayout` 加 `progress → 5`；
4. `templateManifest.ts` 加 `layout === 'progress'` 的取页分支（写法同 list：cards 精确匹配 + 降级）；
5. `coerceLayoutBySlideTitle`（`outlineJson.ts` **L101–150**）只做**温和抬降**：流程线索
   （步骤/流程/路径/阶段/节奏/链路/从…到）→ 抬为 progress；progress 标题含并列线索（有哪些/是什么/清单/类型）→ 降回 list。
   **此处不加拒收**。

### 克隆时的注意点（给六·3）

progress 页内存在 `connsiteX0..X19` / `T0..T19` 这类**非槽位形状名**（属连线/站点图形）。
做单元定位时**不要**把它们当成 item 成员——判据只用 `{vItem.itemK}` 的 K。

## 六·6 必须同步的代码点（旧页号已全错，逐条改）

| 文件 | 位置 | 现状 | 应改为 |
|---|---|---|---|
| `frontend/public/template-manifest.json` | 全量 | 47 页旧映射 | 按六·0 重建（50 页） |
| `frontend/src/components/DocUtil/template-manifest.json` | 全量 | 同上 | 同步，**逐字节一致** |
| `templateManifest.ts` | L94 | metric fallback `24 + (n-2)` | `27 + (n-2)` |
| 同上 | L100 | columns fallback `28 + (n-2)` | `31 + (n-2)` |
| 同上 | L134 | metric_columns fallback `32 + (m-2)` | `35 + (m-2)` |
| 同上 | L157 | metric_list fallback `37 + (m-2)` | `40 + (m-2)` |
| 同上 | L163 | table fallback `page: 42` | `45` |
| 同上 | 全文 | 无 `progress` 分支 | **新增** progress 分支（页 6–14，3 类型 × 3/4/5） |
| 版式名联合类型 | LayoutKey / FillLayoutKey | 无 `progress` | 加 `progress`（前端 `progress` 目前只是 `PROGRESS_MARKER_RE` 伪槽，**不是版式名**） |
| `OutlinePromptComposer.tsx` | `PPT_OUTLINE_LAYOUT_RULES` | 无 progress 契约 | 补 progress 契约（原 `layoutRulesFor(['table'])` 键不存在导致静默 fallback 的老坑别再犯） |
| `outlineCoverage.ts` / `outlineJson.ts` | `layoutForRender` / `resolveSlideIntent` / `capTipsByLayout` | 版式名集合与上限表 | 注册 `progress`；上限表改「超额即分流」 |
| `.github/workflows/ci.yml` | 金标 pattern | 无克隆套件 | 加 `templateClone` |

另：`templateManifest.ts` 的 `table` 分支**是数据驱动的**（`pages.filter(layout==='table')`），
manifest 重建后会自动取到 45–48，只需改 L163 的兜底页号。其余分支的 `+ (n-2)` 兜底才是重灾区。

## 六·7 金标与验收

1. 新增 `frontend/tests/templateClone.test.ts`：对 A/B/C 三档各取一个版式跑 `N=3..9`，解包断言
   ① 单元数 === N；② 单元几何两两无重叠（含容差）；③ 无残留 `{...}`；④ slide 内 shape id 唯一；
   ⑤ 占位符集合 === 期望集合（防止重编号串名）。
2. 现有 `templateTableRender` 的页号断言从 42/44/45/46 迁到 **45/46/47/48**。
3. `templateManifest` 加一条「manifest 与 pptx 一致性」断言：生成脚本重跑，manifest 不变（幂等）；
   且断言两份 manifest 逐字节相同——这条能永久堵住本次这种错位。
4. **人工目检**（本地无 LibreOffice，无法自动渲染）：克隆出的 6 项 / 8 项各一页，
   在 PowerPoint 里确认行高、字号、装饰位置不挤不叠；A 档做完就检一次，别等三档全做完。

---

# 七、Word 侧图文能力：段落级表格与插图（2026-09-28）

来源：用户提问「Word 模板与生成链路有没有图/表布局能力」。**结论：目前是零基础**——
不是「有但没用」，是连地基都没有（`word/media/` 目录不存在、`[Content_Types].xml` 无任何 image 声明、
`document.xml` 里 `drawing=0/pict=0`）。本章给出可直接落地的最小实现方案。

本章所有事实均为 2026-09-28 对仓库当前文件的实测，非推测。

## 七·0 范围与结论

| 项 | 结论 |
|---|---|
| 表格能力 | **可以做，且不需要新依赖**（手写 `<w:tbl>` 字符串注入，已有全部 XML 手术能力） |
| 图片能力 | **可以做，自研注入，不要买 image module**（官方免费版仍要自己算尺寸，等于没省事） |
| 段落契约 | 现在只有「200~400 字散文」，**无 layout 维度** → 需要扩方言 |
| 模板选型无关 | Word 模板是按「商业/简约/学院」选皮肤，与「段落里放什么」是**两个正交维度**，不要绑一起 |
| 金标 | `frontend/tests/DocTemplate.test.ts` 是 **0 字节空文件** → 本章落地时必须填上（见七·8） |

## 七·1 现状实测

### 1) 渲染链路（两处，结构相同）

| 文件 | 位置 |
|---|---|
| `frontend/src/pages/AiOutlineGenDoc.tsx` | `saveDoc()` L146–194（`loadFile("/docTemplate-simple.docx")` L150、`new Docxtemplater` L159、`doc.render({... chapters})` L165、`getZip().generate()` L180、`saveAs` L189） |
| `frontend/src/pages/KbOutlineGenDoc.tsx` | `saveDoc()` L157–205（同上，硬编码 L160、render L175） |

依赖只有 `docxtemplater@3.52` + `pizzip` + `file-saver`；**没有装 image / html module**。
`doc.render({ company, department, author, curDate, title, chapters })` —— 传的就这些，
`first_name/last_name/phone/itemName1/itemName2` 是模板残留的无用字段，可删。

**注入点（重要）**：`doc.render()` 之后、`getZip().generate()` 之前。
此时 zip 里的 `word/document.xml` 已是最终正文，直接对它做字符串手术即可。
**不要**试图用 docxtemplater 的语法插图——它不支持。

### 2) `docTemplate-simple.docx` 正文循环结构（实测段落索引）

```
目录区：
  [173]  TOC 域 + {#chapters}        ← TOC \o "1-3" \h \z \u 在这里（instrText）
  [174]  pStyle=TOC1  1{label}1
  [175]                {#paragraphs}
  [176]  pStyle=TOC2  1.1{label}1
  [177]                {/paragraphs}
  [178]  pStyle=TOC1  {/chapters}1
正文区：
  [182]  pStyle=1     {#chapters}
  [183]  pStyle=1     {label}          ← 章标题 = heading 1
  [184]                {#paragraphs}
  [185]  pStyle=2     {label}          ← 段落标题 = heading 2
  [186]  pStyle=af4   {content}        ← 段落正文 = Normal Indent
  [187]                {/paragraphs}
  [188]  pStyle=1     {/chapters}
```

`paragraphLoop:true` 下，`{#x}`/`{/x}` 独占段落才被当作跨段循环。模板现状**符合**这个要求 ✓
（注意目录区的 `{#chapters}` 与 TOC 域同段，实际生效的是正文区那对——改动时别碰目录区。）

**结论行**：正文区 = `章循环 → 章标题 → 段循环 → 段标题 → 段正文`。
「段落级表/图」要插在 **L186 段正文之后、L187 段循环结束之前**。

### 3) 样式名是数字（不是 `Heading1`）

| styleId | name | outlineLvl |
|---|---|---|
| `1` | heading 1 | 0 |
| `2` | heading 2 | 1 |
| `3` | heading 3 | 2 |
| `af4` | Normal Indent | — |
| `TOC1` / `TOC2` | toc 1 / toc 2 | — |

→ 新增段落若要进目录，**必须**用 `w:pStyle w:val="1"` 「章」/`"2"`「段」。
→ 题注段落**不要**套 heading 样式（否则会污染目录）。

### 4) 版心尺寸与 EMU（图片宽度上限的来源）

```
<w:pgSz w:w="11907" w:h="16840"/>      A4
<w:pgMar top/right/bottom/left = 1701/> （twips）
版心宽 = 11907 - 1701×2 = 8505 twips = 5,400,675 EMU = 5.906 in
版心高 = 16840 - 3402   = 13438 twips = 8,533,130 EMU
换算：1 twip = 635 EMU；1 px @96dpi = 9525 EMU；1 in = 914400 EMU
```

### 5) 域与目录（你已确认「更新域即可」，所以这里只说事实）

- `TOC \o "1-3" \h \z \u` 域**存在**（在 `instrText` 里，第一次用 `w:instr="..."` 正则查会漏，别被误导）。
- 4 个 `PAGEREF _Toc...` 是模板旧目录的页码引用。
- 渲染后**目录文字是对的**（目录区的 `{label}` 循环会换成真实章节名），**只有页码是旧的** →
  用户打开后 `Ctrl+A` → `F9`（或只选目录按 F9）即正确。
- `<w:updateFields w:val="true"/>` 在 `settings.xml` 里**没有** → Word 打开不会自动提示更新。
  可选增强：注入它，让打开时弹「是否更新域」。**但它必须插在 `CT_Settings` 的合法序位**，
  插错位置会导致 Word 报「内容有问题」。安全起点：紧跟 `</w:compat>` 之后；**必须实测能打开**，
  不稳就放弃此项，改为在文档尾加一行提示文字「请在 Word 中按 Ctrl+A→F9 更新目录与编号」。
- `sectPr` 有 3 个（封面节 / 目录节 / 正文节），其中一处带 `pgNumType fmt="lowerRoman"`。
  **如果新插入的内容触发了分节变化，注意别让正文页码继承罗马数字**。

### 6) 其他基础设施缺口（都是「要补」的清单，不是疑问）

| 缺口 | 实测 | 动作 |
|---|---|---|
| 图片容器 | `word/media/` **不存在** | 注入时创建 |
| 内容类型 | `[Content_Types].xml` 里 image Default **为空数组** | 补 `<Default Extension="png" ContentType="image/png"/>`（jpeg 同理） |
| 关系 | `document.xml.rels` 只有 header/footer/styles/theme… **无 image** | 追加 image Relationship |
| 表格能力 | 4 个 `<w:tbl>`：密级表(2列) ×1、编制单位表(4列) ×5行、版本修订表(5列) ×27行 | 全非数据槽。单元格里已有 `{title}{company}{department}` → **格内填值这条路已通** |
| 跨页 | `tblHeader` / `cantSplit` 计数 = **0** | 数据表要加（见七·6） |

## 七·2 方案总览：图/表都走「渲染后 XML 注入」，模板只加一个锚点段

比过两条路，结论明确：

| | docxtemplater 原生行循环 | 渲染后 XML 注入（**选这条**） |
|---|---|---|
| 表格 | 支持（`{#rows}` 放行首格 / `{/rows}` 放行尾格） | 手写 `<w:tbl>` 字符串 |
| 图片 | **不支持** | 唯一可行 |
| 模板改动 | 每个列数要预置一个骨架表，且**表格是段落级的**，模板里要留一堆空骨架 | 只加**一个**锚点段 |
| 灵活性 | 列数写死 | 任意行列、任意图数 |
| 顺序控制 | 依赖模板位置 | 锚点段天然在正确位置 |

**锚点段设计**（模板一次性改动，加在正文区 L186 与 L187 之间）：

```xml
<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>⟦DOCBLOCK⟧</w:t></w:r></w:p>
```

- `<w:vanish/>` = 隐藏文字。渲染后若未处理，用户在 Word 里也看不见（但仍建议清掉）。
- 每个段落展开后都有一个锚点段 → 注入器**按出现顺序**把它们与「该段要放的块列表」一一配对。
- 无块的段落：**整段删除**（否则留一个隐藏空段，影响行距）。
- 有块：把该 `<w:p>` 替换为 `<w:tbl>` 段 或 `<w:drawing>` 段 + 题注段。

`⟦DOCBLOCK⟧` 用 `⟦⟧`（U+27E6/27E7）是因为它在正常中文里绝不出现，可安全用于定位。
**注入完成后必须断言 document.xml 里不再含 `⟦DOCBLOCK`**（见七·8）。

## 七·3 大纲侧方言：```table / ```figure（扩 Markdown，不升 JSON）

Word 正文本来是长散文，Markdown 更自然；改 JSON 要动大纲编辑器 + 历史数据迁移。**加围栏即可**。

### 语法（只放行两种块，先跑通 table 再加 figure）

````markdown
## 第一章 市场大盘

### 大盘规模与增速

2024 年抖音男装大盘 GMV 达 58.12 亿元，同比 +30.6%……

```table
caption: 各品类销量与GMV对比
| 品类 | 销量 | GMV | 占比 |
| polo衫 | 403.7万 | 3.9亿 | 54.8% |
| 衬衫 | 296.2万 | 3.3亿 | 40.2% |
```

```figure
ref: kb:抖音单品爆款分析-商务男士衬衫polo衫/elements/p12_i1.png
caption: 编织肌理Polo衫（销量 9219）
```
````

### 落点一：`ViewItem4Doc.getChaptersFromContent`（L272–320）改状态机

现状是逐行 `trim().match()` 三个正则。**必须改成状态机**，因为：

> ⚠️ **实测坑（一定会踩）**：表格行 `| 品类 | 销量 |` 会被 `paragraphRegex2 = /^[*|+-] (.+)$/`（L279）匹配，
> 生成一个叫「品类 | 销量 | GMV | 占比」的**假段落**，还会顺带通过 `checkChapter` 的段落数校验。
> 所以 table/figure 围栏**必须优先于段落识别**，块内行一律不参与 `paragraphRegex` 判定。

伪码：

```
state = NORMAL
for line of lines:
  if state == NORMAL:
    if line.trim() == '```table':   state = TABLE;  cur = {caption:'', rows:[]}
    elif line.trim() == '```figure': state = FIGURE; cur = {ref:'', caption:''}
    elif line.trim() == '```':      continue          // 容错：孤立围栏忽略
    elif 章节正则: 建 Chapter
    elif 段落正则 && currentChapter: 建 Paragraph，并把 cur 的块挂上去
    else: 正文行/忽略
  elif state == TABLE:
    if line.trim() == '```':  state = NORMAL; 挂到当前 Paragraph.blocks
    elif line 以 'caption:' 开头: cur.caption = 余下文本
    elif line 是分隔行 (---/|:--|): 跳过
    elif line 以 '|' 开头: cur.rows.push(split('|').trim().filter(Boolean))
  elif state == FIGURE: 同理（ref:/caption:）
```

### 落点二：`Paragraph` 加字段（`ViewItem4Doc.ts` L90）

```ts
export type DocBlock =
  | { kind: 'table'; caption: string; rows: string[][] }
  | { kind: 'figure'; assetRef: string; caption: string };

export class Paragraph {
  // ...现有字段不动
  blocks: DocBlock[] = [];
}
```

`blocks` 默认空数组 → **存量大纲（无围栏）行为完全不变**，这是零回归的关键。

### 落点三：`buildDocParagraphFormatPrompt()`（L196–204）加契约

只在**原契约末尾追加**，说明「可按需追加一个 table / figure 块」，并写死三条：
① 块必须紧跟在对应段落正文之后；② 表格行数 ≤ 8、列数 ≤ 5（对齐 PPT 表格上限，避免超宽）；
③ 数字必须来自材料、figure 的 `ref` 只能用材料里给出的 asset 引用（**不许自己拼路径**）。
不要在这些块里要求「每段必须有图」——**不加配额**（同 progress 那条反例）。

### 落点四：`ViewItem4Doc.setAllPrompt`（L417）/ `Doc.getChaptersFromContent`（L502）穿参

确认 `blocks` 随 `Paragraph` 实例一路传到 `doc.render({chapters})` 的 data 里（实例属性会被
docxtemplater 序列化，无需改模板）。

## 七·4 取图：统一 `assetRef`，与 PPT 图鉴共用一套

**不要为 Word 另建取图通道。** 两个来源收敛到一个字符串前缀：

| 来源 | `assetRef` 形式 | 取字节方式 |
|---|---|---|
| 知识库图鉴裁切图 | `kb:<文档名>/<相对路径>`，如 `kb:抖音…polo衫/elements/p12_i1.png` | 复用后端已落地的取图接口（前端 `kbImageAssets.ts` 那套） |
| 用户本机上传 | `upload:<fileKey>` | 前端 `FileReader` 读成 `ArrayBuffer`，**不进后端** |

在「取字节」那一层汇合（一个 `resolveAssetBytes(ref): Promise<{bytes, w, h, mime}>`），
下游注入逻辑完全一致。**这就是第五章五·1「按 asset_id 绑定」的同一个抽象——一次设计，两处复用。**

## 七·5 模板改造（一次性，脚本可做，改完必须同步两份 manifest 之外的三处）

1. **加锚点段**：正文区 L186 之后插一个 `<w:p>…⟦DOCBLOCK⟧…</w:p>`（见七·2）。
2. **修 `<w:tc>` 里已有占位符的表格**：确认密级表/编制单位表渲染正常（它们已有 `{title}` 等）。
3. **补 `[Content_Types].xml`**：`<Default Extension="png" ContentType="image/png"/>` +
   `<Default Extension="jpeg" ContentType="image/jpeg"/>`（有则跳过，重复声明 Word 会报错）。
4. 改完**直接覆盖** `frontend/public/docTemplate-simple.docx`（两个页面都硬编码读它）。
   另两份 `-chapter.docx` / `-items.docx` **本次不动**（它们各有 `{#items}`/`{#children}` 变体，
   等主链路跑通再考虑）。
5. 顺手清理：`frontend/public/sds.docx` 与 `docTemplate-simple-items.docx` **md5 完全相同**，是垃圾副本。
   UI 里 `template_1~6.docx`（`AiOutlineGenDoc.tsx` L53 的列表）**文件不存在，只有缩略图**，
   是死选项——要么补文件要么去掉。

## 七·6 注入器实现

新文件 `frontend/src/components/DocUtil/DocBlockInjector.ts`：

```ts
export interface DocBlockPayload {
  table?:  { caption: string; rows: string[][] };
  figure?: { caption: string; bytes: Uint8Array; mime: string; pxW: number; pxH: number };
}

/**
 * 渲染后注入。就地修改 zip（PizZip 实例）。
 * @param zip  Docxtemplater 的 doc.getZip()
 * @param seq  按「段落展开顺序」排列的 payload 数组；长度必须 === document.xml 里 ⟦DOCBLOCK⟧ 段数
 */
export function injectDocBlocks(zip: PizZip, seq: Array<DocBlockPayload | null>): void
```

实现五步：

1. 读 `word/document.xml` → 用正则找出**全部** `⟦DOCBLOCK⟧` 所在 `<w:p>…</w:p>`（按出现顺序）。
   **断言 `found.length === seq.length`**，不等就抛错（宁可不注入，也别错位插图）。
2. 为每个非空 payload 生成 XML 片段（下），空 payload 的锚点段直接删掉。
3. 图片：`zip.file('word/media/img' + n + '.' + ext, bytes)`。
4. rels：读 `word/_rels/document.xml.rels`，取 `rId` 最大数字 +1，追加
   `<Relationship Id="rId{n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/imgN.png"/>`
   ——**Target 是相对 `word/` 的 `media/imgN.png`，不是 PPT 那种 `../media/`。这是最容易照抄错的一处。**
5. 写回 `word/document.xml`；确保 `[Content_Types].xml` 有对应 Default。

### 图片段（inline，绝不做浮动）

```xml
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr>
 <w:r><w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
   <wp:extent cx="{EMUW}" cy="{EMUH}"/>
   <wp:docPr id="{N}" name="Picture{N}" descr="{题注}"/>
   <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
     <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <pic:nvPicPr><pic:cNvPr id="{N}" name="img{N}.png"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId{N}"/>
        <a:stretch><a:fillRect/></a:stretch></pic:blipFill>
      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{EMUW}" cy="{EMUH}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
     </pic:pic>
    </a:graphicData>
   </a:graphic>
  </wp:inline>
 </w:drawing></w:r>
</w:p>
```

`xmlns:wp / xmlns:a / xmlns:pic / xmlns:r` **就地声明**（别假设根元素已声明，缺一个 Word 就打不开）。

**尺寸算法（这就是 PPT 那次「无 srcRect 横向拉伸 6.4 倍」的 Word 版，同一个错不能犯第二次）**：

```ts
const PAGE_W = 5400675;          // 版心宽 EMU，见七·1-4
const maxW   = Math.round(PAGE_W * 0.95);
let emuW = Math.min(maxW, Math.round(pxW / 96 * 914400));
let emuH = Math.round(emuW * pxH / pxW);
const maxH = Math.round(8533130 * 0.8);
if (emuH > maxH) { emuH = maxH; emuW = Math.round(emuH * pxW / pxH); }
```

→ 等比缩放，**永不拉伸**；若 `pxW` 与 `pxH` 都远小于版心，用原始尺寸（不放大，避免糊）。

### 表格段

```xml
<w:tbl>
 <w:tblPr>
  <w:tblW w:w="8505" w:type="dxa"/>
  <w:tblBorders>  <!-- 四边 + 内部横竖，single sz=4 color=auto -->
  <w:tblLayout w:type="fixed"/>
 </w:tblPr>
 <w:tblGrid><w:gridCol w:w="{8505/cols}"/>…×cols</w:tblGrid>
 <w:tr><w:trPr><w:tblHeader/></w:trPr>   <!-- 表头行：跨页重复 -->
   <w:tc><w:tcPr><w:tcW w:w="…" w:type="dxa"/><w:shd w:val="clear" w:fill="F2F2F2"/></w:tcPr>
     <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>品类</w:t></w:r></w:p></w:tc> …
 </w:tr>
 <w:tr><w:trPr><w:cantSplit/></w:trPr>   <!-- 数据行：不跨页断开 -->
   … 每格一个非空 <w:p> …
 </w:tr>
</w:tbl>
<w:p/>   <!-- ⚠️ 表格后必须有空段落，否则相邻表格会被 Word 合并 -->
```

### 四个必踩坑（照抄会翻车的地方）

1. **`<w:tc>` 内必须至少一个 `<w:p>`**。空 `<w:tc/>` → Word 报「内容有问题」。
2. **每行 `<w:tc>` 数 === `<w:tblGrid>` 的 `gridCol` 数**，否则表格错位/损坏。
3. **两个相邻 `<w:tbl>` 之间、以及 `</w:body>` 之前必须有不含表格的段落**。
4. `⟦DOCBLOCK⟧` 锚点段被替换后，**它的隐藏文字属性一起消失**——别把 `<w:vanish/>` 带到新段上。

### 题注：用 SEQ 域自动编号（你已确认「更新域即可」）

```xml
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="180"/></w:pPr>
 <w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>图 </w:t></w:r>
 <w:r><w:fldChar w:fldCharType="begin"/></w:r>
 <w:r><w:instrText xml:space="preserve"> SEQ 图 \* ARABIC </w:instrText></w:r>
 <w:r><w:fldChar w:fldCharType="separate"/></w:r>
 <w:r><w:t>1</w:t></w:r>                       <!-- 未更新域时的占位显示 -->
 <w:r><w:fldChar w:fldCharType="end"/></w:r>
 <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> {题注文本}</w:t></w:r>
</w:p>
```

- 表格题注把 `图` 换成 `表` → **两个独立自动序列**，互不干扰。
- 序号按**域在文档中出现的顺序**计算，所以注入顺序 = 阅读顺序，编号天然正确。
- 不更新域时显示占位 `1`，属预期；配合七·1-5 的 `updateFields` 或提示语即可。

## 七·7 降级与失败（**绝不整篇失败**）

| 情况 | 处理 |
|---|---|
| `assetRef` 取不到字节 | 删掉图片段，**保留题注段并改为** `［图片缺失：{ref}］`，继续生成 |
| 图片超限（>1.5MB） | 前端 canvas 降质为 JPEG q85 后注入 |
| `seq.length !== 锚点数` | **放弃注入**（保留锚点段，改为打印可见提示「此处有未渲染的块」），仍产出 docx |
| 表格列数 > 5 或行数 > 8 | 由大纲侧契约拦截（七·3）；注入器只做防御性截断 + 标注 |
| `[Content_Types]` 无 png Default | 注入器自动补，不做前置校验失败 |
| 总图体积 > 30MB | 提示用户，超出部分降级为「缺失占位」 |

## 七·8 金标与验收（`frontend/tests/DocTemplate.test.ts` 现在是 0 字节，**用它**）

1. **解析金标**：`getChaptersFromContent` 对含 ```table/```figure 的大纲 → 断言块挂在正确的
   Paragraph 上；**并断言表格行没有被当成 `### 段落`**（就是七·3 那个坑的回归）。
2. **注入单元测试**：假 zip + 2 图 1 表 → 断言 ① `document.xml` 含 2 个 `<w:drawing>` + 1 个
   `<w:tbl>`；② rels 新增 2 条 image 关系且 `Target` 以 `media/` 开头；③ `[Content_Types]` 有 png Default；
   ④ `word/media/img1.png` 存在且字节数 === 输入；⑤ 再断言一次**不含 `⟦DOCBLOCK`**。
3. **结构断言**：每 `<w:tc>` 含 `<w:p>`；每行 `w:tc` 数 === `gridCol` 数；每个 `</w:tbl>` 之后紧跟 `<w:p`。
4. **尺寸断言**：`emuW ≤ 5400675`；`emuW/emuH` 与源图 `pxW/pxH` 偏差 < 1%（**防拉伸回归**）。
5. **零回归金标（最重要）**：`blocks` 全空时跑完整 render+inject，与改造前输出**除时间戳外逐字节等价**。
   这条能保证加能力不动存量。
6. **人工目检**：`docTemplate-simple.docx` 手工插一张图 + 一个表，用 Word 打开确认
   ① 能打开、无修复提示；② `Ctrl+A→F9` 后目录页码与 `图1/表1` 编号正确；③ 表格跨页时表头重复。
7. CI：`ci.yml` 金标 pattern 加 `DocTemplate`。

## 七·9 负面清单（明确不做，避免被"顺手加"）

- ❌ 不引 `docxtemplater` 商业 image module（免费版省不了事，商业版要 license）
- ❌ 不做浮动图（`wrapSquare/wrapTight`）——只 inline，浮动是排版事故高发区
- ❌ 不把 Word 的「模板选型」与「段落里放什么」绑成一个维度
- ❌ 不在大纲契约里加「每章必须有图/表」的硬配额（同六·5·补 progress 的反例）
- ❌ 不把 Word 大纲从 Markdown 升级成 JSON
- ❌ 不做「文中见图 1」的 REF 交叉引用（P2，将来需要再说）
- ❌ 本次不动 `-chapter.docx` / `-items.docx` 两个变体模板

---

# 八、Word 大纲质量：段类型契约 + 体裁包 + 元数据行归一化（2026-09-28）

**来源**：用户在「知识库大纲构思（文章）」页实测（`KbGenDocOutline`），模型输出的文章大纲里混进了
PPT 风格的 `* layout: metric`，而**系统校验通过、可以保存**。本章把这件坏输出拆到代码层，
给出三件 P0 + 两件 P1。

> 行号以当前工作区（`a907b61` 之后、七章已落地）为准；若已漂移，按函数名定位。

## 八·0 坏输出逐行归因（先对齐事实）

截图原文（主题「2024年男装流行趋势」，系统提示词 = `DOC_OUTLINE_SKELETON`）：

```
# 2024年男装流行趋势
## 社媒热度与节奏
* layout: metric                      ← 元数据行
- 近一年男装作品量与互动量               ← 内容行，但用了 `-`
- 下半年热度高于上半年
- 秀经济与上新带来的春季小高峰
## 西服品类的品牌竞争
* layout: list
- 高作品量主力品牌
...
```

三件事同时发生：

| # | 事实 | 后果 |
|---|---|---|
| 1 | 模型把「章节 + 该章要点」写成了 **`* layout: X` + `- 要点行`**，**没有一行 `### `** | 每章真正的段落数是 0 |
| 2 | `paragraphRegex2 = /^[*\|+-] (.+)$/`（`ViewItem4Doc.ts` L407）**把这两类行都收成段落** | 每章 paragraphs = 1（元数据）+ N（要点），落在 2～4 内 |
| 3 | `checkChapter`（L492-517）只数 `chapters[i].paragraphs.length` | **全绿通过**，且 `* layout: metric` 变成一个段落**标题** |

所以这不是「校验太松」那么简单：**解析层的假段落把校验喂饱了**。
续接影响：`layout: metric` 会成为文章里的一个小节标题，并触发一次正文生成
（该段 prompt 会去写「layout: metric」——纯垃圾）；七章刚做的 ```table/figure 围栏也会挂到
最后一个伪段上。**这是 09-26 表格、09-28 progress 之后的第三次同类坑**：
新契约只写在 system 提示里，没在解析/校验层立边界。

## 八·1 现状实测（本轮逐个核过，别凭印象改）

| 项 | 实测 |
|---|---|
| 大纲骨架 | `DOC_OUTLINE_SKELETON`（`OutlinePromptComposer.tsx` **L284-305**）；段标记要求写在 L289「段落以「### 」开头」；禁句在 **L294**「不要在大纲里写正文段落、不要写 layout/tips **JSON**（那是 PPT 契约）」 |
| 禁句为何没拦住 | 它只说 **JSON**，模型写成 Markdown 行 `* layout: metric` 就绕过了 |
| 大纲侧是否知道表/图块 | **不知道**。骨架全文 0 处提及 ```table/```figure |
| 正文侧是否知道 | **知道** ✓ `buildDocParagraphFormatPrompt`（`ViewItem4Doc.ts` **L202-214**，七章加的）已含围栏契约；合流路径 `paragraph.prompt + KB_DOC_WRITING_CONSTRAINT_PROMPT`（`KbOutlineGenDoc.tsx` L262/L272）→ 无需再动 |
| doc 的 L2 体裁包 | **不存在**。`PPT_DOMAIN_PACKS`（L245-276）只有 generic/selection/report/review；doc 无对应物 |
| doc 的 system 提示 | `buildDocOutlineSystemPrompt()`（**L556-558**）**零参**，直接 `return DOC_OUTLINE_SKELETON` |
| `domainPack` 传参 | **死参数**。composer doc 分支（L768）把 `domainPack` 塞进 vars，但 `composeDocOutlineUserMessage`（**L565-586**）只读 role/object/scope，**完全不读 domainPack** |
| 「主题类型」下拉 | 被 `mode === 'ppt' ?`（**L989**）门控 → doc 用户看不到，`Select` 在 L1005 |
| 校验调用点 | 仅 2 处：`ChatWithSpeech4Doc.tsx` **L153-161**（点「大纲保存」）、`OutlineSelectDrawer.tsx` **L77-84**（选大纲）。**生成后不校验** |
| 校验失败文案 | 「请手工检查并修改」（L156/L158）→ 不给方向，用户不知道改哪 |
| 现有金标 | `docOutlineAlign.test.ts`（checkChapter 3 案 + 契约 3 案）、`DocTemplate.test.ts`（解析/注入/零回归）、`ViewItem4Doc.test.ts`（旧解析案） |

## 八·2 P0-1：元数据行过滤（解析层 + 保存层，两处都要）

**规则**：以 `* + - ` 开头、且冒号前是已知元数据键的行，**永远不是段落**。

落点 A · 解析层（`ViewItem4Doc.ts`）

```ts
// 顶层加：白名单式元数据键；宁可少写，别把正常句子吞掉
const DOC_META_LINE = /^[*+\-]\s*(layout|tips|intent|版式|类型|备注|页数)\s*[:：]/i;
```

在 `getChaptersFromContent` 的 normal 分支里，**在 L457-458 取 `paragraphMatch1/2` 之前**插入：

```ts
if (DOC_META_LINE.test(trimmed)) continue;   // 丢弃：不产生段落、也不并入正文
```

落点 B · 保存层（`ChatWithSpeech4Doc.tsx`）

新增并导出一个纯函数（放 `ViewItem4Doc.ts`，与解析同源）：

```ts
export function stripDocOutlineMetaLines(content: string): string
```

在「大纲保存」写库前调用一次（L162 附近，`new OutlineRec(recTitle, recContent, ...)` 之前）：

```ts
recContent = stripDocOutlineMetaLines(recContent);
```

**为什么两处都要**：`OutlineRec` 存的是**原始 markdown**（L162-167），解析层过滤不会持久化
→ 不补保存层，用户下次打开自己的大纲，`* layout: metric` 还挂在那里。

**为什么用白名单键**：`^[*|+-]` 太宽，直接整类丢弃会误杀「- 要点：xxx」这类正常写法。
白名单只吃元数据键，正常 bullet 走原逻辑（八·3 会把它归一成段落）。

## 八·3 P0-2：段落来源分层 + `checkChapter` 分层计数（**归一化优先，不拒单**）

现状 `checkChapter` 把「`* ` 行」和「`### ` 行」混在一起计数，所以假段落能喂饱它。
但它**不能改成硬拒**——理由很重要：

> 这份坏大纲的**内容其实是对的**（章题准确、每章 3～4 条要点、层级也齐）。
> 错的只是**标记形式**。硬拒 → 用户手里的可用大纲被扔掉，还要手工重写，比今天更差。

**改法**：

1. `Paragraph` 增一个来源标记（`ViewItem4Doc.ts` L95-107，默认值保证存量零回归）：

```ts
/** 段落标记来源：### → true；* + - → false（Word 侧两者都当段落，但额度只算 heading） */
heading: boolean = false;
```

在 L467-477 构造 `Paragraph` 时：`paragraphMatch1` 命中 → `heading = true`。

2. `checkChapter`（L492-517）**段落额度只按 heading 计**，并新增一条 Warn 级返回：

```ts
const headingCnt = paragraphs.filter(p => p.heading).length;
if (headingCnt === 0) {
  // 不拒单：按段落理解，但把「没按契约写」这件事报出来（可观测）
  warn = `第${i+1}章未使用【### 】段落标记（检测到 ${paragraphs.length} 行 */- 开头）。
已按段落理解；建议重新生成或手工改为【### 】。`;
}
```

3. **返回码契约要定清楚**（这是本次唯一的接口变更，两处调用方必须同步）：

| code | 语义 | 调用方动作 |
|---|---|---|
| `0` | 通过 | `message.success` |
| `> 0` | **Warn**（可继续） | `message.warning`，**照常保存/选用** |
| `< 0` | 拒收 | 维持现文案 + 提示 |

落点：`ChatWithSpeech4Doc.tsx` L155 与 `OutlineSelectDrawer.tsx` L79 的
`if (t.code !== 0)` → 改成 `if (t.code < 0)`，并在中间插 `else if (t.code > 0) message.warning(t.msg)`。

4. 硬拒的兜底保留：`heading=0 且 paragraphs=0` → 仍返回现 L506 的 `-2`。
   顺带把 L506 的文案从「段落标题前缀应该为【### 】或【* 】或【+ 】或【- 】」
   改为「**应为【### 】**（`* + -` 为兼容写法，推荐 ### ）」——**文案在教模型怎么做**，别反向鼓励伪标记。

## 八·4 P0-3：骨架禁句具体化 + 增「段类型」小节

改 `DOC_OUTLINE_SKELETON`（L284-305），**只动两处**：

**① 把 L294 的含糊禁句换成三条可判定的**（模型对「出现 X 即不合格」比「不要写 Y」敏感得多）：

```
- 段落标记只能用「### 」；禁止用「* 」「+ 」「- 」代替 ### 写段落。
- 禁止出现 layout / tips / intent / 版式 等字段行（Word 没有分区概念，出现即不合格）。
- 不要在大纲里写正文，也不要写 ```table / ```figure 围栏（图表由正文阶段按材料决定）。
```

**② 新增「【段类型】」小节**（放在【内容】之后、【示例】之前）：

```
【段类型】
- 每段默认是**散文段**。
- 数据密集段（销量/占比/构成/对比）：段题直接点名数据口径，如「销量与占比结构」；
  不要在段题里写「表」「图」字样。
- 图表由正文阶段依据材料决定，大纲**不预先承诺**配图配表（避免产出「无图可配」的空段）。
```

**③ 加一个反例块**：把八·0 那段坏输出原样作为 ❌ 示例，紧邻现有 ✓ 示例。
反例比正例更能压住模型的旧习惯（尤其它刚从 PPT 场景过来时）。

> 注：`DOC_OUTLINE_SKELETON` 是 **system**，L3 用户消息（`composeDocOutlineUserMessage`）
> 不动——别把段类型/禁句塞进气泡（那是七章定的分层）。

## 八·5 P1-1：doc 体裁包（补上缺的 L2）

结构照抄 `PPT_DOMAIN_PACKS`（L245-276）的形状，内容按**文章**的读者路径写：

```ts
export type DocDomainPack = 'generic' | 'report' | 'research' | 'review';

export const DOC_DOMAIN_PACKS: Record<DocDomainPack, {label: string; prompt: string}> = {
  generic:  {label: '通用',   prompt: '【体裁：通用】按读者理解路径组织章节；不照搬材料原目录。'},
  report:   {label: '汇报总结', prompt: '【体裁：汇报总结】结论先行 → 依据 → 问题与风险 → 结论建议。'},
  research: {label: '调研研究', prompt: '【体裁：调研研究】背景与方法 → 现状与结构 → 归因 → 判断与建议；判断须有材料依据。'},
  review:   {label: '复盘归因', prompt: '【体裁：复盘】目标 → 结果 → 归因 → 改进；不得编造未提供的基数。'},
};

export function inferDocDomainPack(topic: string, vars?: {domainPack?: string}): DocDomainPack;
```

⚠️ **不要硬编码标准号/行业词表**（`GJB438B`、`GJB`、服装品类词……一律不进词表）。
「研制总结报告（GJB438B）」这类靠 `/总结|汇报|研制|结题/` 命中 `report` 即可。
这条是前几章反复确认的跨域鲁棒性红线：**换域只换配置，不发版**。

**接线四处**（缺一处就是静默丢参数）：

1. `buildDocOutlineSystemPrompt(pack?: DocDomainPack)`（L556-558）：
   `return DOC_OUTLINE_SKELETON + '\n' + DOC_DOMAIN_PACKS[pack ?? 'generic'].prompt;`
   —— 现在零参，调用点 5 处：composer L782、`ChatWithSpeech4Doc.tsx` L69/L76/L84/L228。
   L76 已在 `onSend` 里吃 `payload.systemPrompt` ✓；L69/L84/L228 是**兜底路径**，用无参（generic）即可，
   但 **L782 必须传实参**，否则用户在定框里选的体裁到不了 system。
2. **删掉死参数**：`composeDocOutlineUserMessage` 的 vars **不读 domainPack**（L570-586 实测）。
   建议把 composer doc 分支 L768 的 `domainPack` 从 vars 移除，并留一行注释
   「体裁由 system 承载，不进 L3 气泡」——防下一个人再加回来。
3. **类型隔离**：doc 现在复用 `Partial<PptOutlineVars>`（L567），会让 PPT 的 `selection` 漂到 Word。
   建议拆出 `DocOutlineVars`（role/object/scope/`domainPack: DocDomainPack`），类型层面挡住串味。
4. **UI 去门控**：L989 `mode === 'ppt' ? (…)` 的 else 分支补一个 doc 版
   「高级（体裁）」Collapse，options 用 `DOC_DOMAIN_PACK_OPTIONS`，`value={docPack}`。
   **状态与 PPT 的 `domainPack` 分开**（新增 `docPack` state），否则切模式会互相覆盖；
   `initialVars`（L639）与推断路径（L375/L394 一带）同步处理。

## 八·6 P1-2：生成后即时自检 + 一键规范化（修「坏了才发现」）

现状：校验只在**用户点「大纲保存」**时才跑（4Doc L153-161），而且提示是「请手工检查并修改」。
用户看到的就是截图那样：一份看着挺完整、其实每章 0 个 `### ` 的大纲。

八·2 + 八·3 落地后，坏大纲已经**不会污染正文**（元数据行被丢、假段落标记为非 heading）。
所以本条只解决**观感与可操作性**，P1：

1. **气泡渲染处加 Warn**（4Doc `chatItemRenderConfig`，L128-137 一带）：
   内容含 `## ` 且（含元数据行 或 heading 段数 = 0）→ 显示一枚黄色标签「段落标记不规范」。
2. **给一个「规范化」按钮**：调 `stripDocOutlineMetaLines` + 把该章 `- ` 行升为 `### `，
   就地把气泡内容替换掉（用户确认后），并把结果写回大纲。比让用户手工改友好得多。
3. **别做自动重拟**。Word 大纲是一次性长输出，自动重跑成本高、且这里的错**纯形式**，
   规范化能 100% 修好——不需要再花一次模型调用（与 PPT 填充重试那种「内容错」不同）。

## 八·7 金标与验收

1. **解析金标（用八·0 的原文做 fixture）**：断言 `getChaptersFromContent` 里
   ① `* layout: metric` **不出现在任何 `paragraphs`**；② 4 章 × 各 N 段仍全部解析出来
   （不能因为过滤把结构也丢了）。
2. **校验分层金标**：全 `- ` 行的大纲 → `checkChapter` 返回 **`code > 0`**（Warn）
   且 **绝不 `< 0`**；同时断言 `headingCnt === 0` 被识别。
3. **存量兼容金标（最重要）**：`docOutlineAlign.test.ts` L30/34/38 三案必须仍绿
   （3 章×2 段通过 / 7 章拒收 / 章内 1 段拒收）——这是「不误杀旧大纲」的守门人。
4. **契约金标**：`buildDocOutlineSystemPrompt('report')` 含体裁关键词；
   `buildDocOutlineSystemPrompt()` 不崩且只含骨架；
   **并断言 doc 的 system 里不含 `PPT_OUTLINE_LAYOUT_CATALOG` 的任何片段**
   （PPT 契约串到 Word 的回归，这是本章的病根）。
5. **推断金标**：`inferDocDomainPack` 对 4 类主题各命中一次（含「研制总结报告」→ `report`）。
6. **落点金标**：grep 断言两处调用方已是 `code < 0`
   （`ChatWithSpeech4Doc.tsx`、`OutlineSelectDrawer.tsx`）——`> 0` 当失败处理会直接废掉 Warn 设计。
7. **零回归**：`DocTemplate.test.ts` 的「空 blocks 逐字节等价」保持绿。
8. CI：新建 `docOutlineContract.test.ts` 则加进 `ci.yml` 金标 pattern（`docOutlineAlign` 已在）。

## 八·8 负面清单（明确不做）

- ❌ **不给 Word 加 layout / tips**（22:25 已定：产品模型不同，Word 无分区概念）
- ❌ 不在大纲契约加「每章必须配表/图」硬配额（同六·5·补 progress 的反例）
- ❌ 不硬编码标准号 / 行业词表（GJB438B 只作示例，不进词表）
- ❌ 不把 Word 大纲从 Markdown 升级成 JSON
- ❌ **不因元数据行或缺 `### ` 而拒单**——归一化优先，拒收只兜底
- ❌ 不把段类型/禁句塞进 L3 用户气泡（system 归 system）
- ❌ 本次不动 `-chapter.docx` / `-items.docx`

## 八·9 待查（下一章候选，不建议本轮做）

1. **段级图槽编辑器**：七·4 已留 `upload:` 抽象 + `resolveUpload` 钩子
   （`DocBlockInjector.ts` L300-302），但**没有任何 UI 让用户把本机图片绑到某一段**。
   doc 侧也没有 `OutlineTreeEditor`（那个是 PPT 专用，L120/L374 走 `Ppt`）——
   用户上传图这件事目前**没有入口**。
2. `-chapter.docx` / `-items.docx` 是否纳入（现在两个页面都硬编码灌 `docTemplate-simple.docx`）。
3. 「图片缺失占位」文案（七·7）是否需要引导用户去补图 —— 与第 1 条同一件事的两端。

---

# 九、块的选择策略与资产供给：Word 的表/图谁决定、按什么决定（2026-09-28 深夜）

## 九·0 问题与结论

用户问：「没有 layout，大纲里什么时候安排表和图？表和图又怎么展现？」
前半句点到一个真实空白：**七·3 只定义了「怎么表达」（```table / ```figure 方言），
从没定义「什么时候该有」。**「若本段适合就追加」等于把决策权交给随机性。

三个环节各缺一块，且缺的不是同一样东西：

| 环节 | 现状 | 后果 |
|---|---|---|
| **决策（何时出块）** | 契约只有「若本段适合（非必须）」 | 该出不出（全散文）；不该出乱出 |
| **供给（图能引什么）** | 提示词里**没有任何资产引用** | `ref` 只能编 → 100%「图片缺失」红字 |
| **校验（表里的数字）** | 数值闸门是 PPT 专用，不碰 `DocBlock` | 表成为「正文被拦、表里放行」的编造后门 |

一句话：**表这条链半通（能出但没判据），图这条链全断（无源可取）。**

## 九·1 事实核对（本轮逐个实测，别照抄旧印象）

1. **表图契约不在大纲阶段。**
   `DOC_OUTLINE_SKELETON`（`OutlinePromptComposer.tsx` L284–305）全文不含 `table/figure`，
   L294 明确「不要在大纲里写正文段落、不要写 layout/tips JSON（那是 PPT 契约）」。
   这行**没错**（与八·8 一致），但副作用是大纲里对表图**零提示**。
2. **契约在段落正文阶段。**
   `buildDocParagraphFormatPrompt()`（`ViewItem4Doc.ts` L202–214）→ 经
   `Doc.setAllPrompt()`（L578–597）拼进**每个段的 prompt**；
   调用点 `AiOutlineGenDoc.tsx:68`、`KbOutlineGenDoc.tsx:66`。
   → 「安排表图」这件事发生在**写正文时**，不在写大纲时。
3. **模板锚点在段循环体内，结构天然对齐（实测 `docTemplate-simple.docx`）。**
   ```
   {#chapters}          章循环
     {label}            章标题
     {#paragraphs}      段循环
       {label}          段标题（pStyle=2）
       {content}        段正文（pStyle=af4）
       ⟦DOCBLOCK⟧       ← 锚点段，全文只有 1 个，随段循环复制
     {/paragraphs}
   {/chapters}
   ```
   `injectDocBlocks` 要求 `锚点数 === seq.length`；因为锚点在循环体内，
   **渲染后锚点数恒等于段落数**，而 `collectParagraphBlocks` 按同一结构展平 → 二者同源，不会错位。
   **副作用（要记住）**：块粒度 = **段落**。块只能跟在某段之后，插不进段落中间 / 章末 / 章间；
   一章 2～4 段 = 一章最多 2～4 个块位。
4. **图没有供给源（P0）。**
   `ChatWithSpeech4Doc.tsx`（283 行）grep `asset|image|图` → **0 命中**。
   对比 PPT 侧 `ChatWithSpeech4Ppt.tsx` L611–634 把检索结果拼成
   `⟦chunk:…|page:…|src:…|assets:<asset_ids>⟧`，L855–875 再**由代码**
   （`pickEvidenceAssetsForGrid`）挑图写成 `img:` 行。
   Word 侧这一步整体缺失，契约却要求「ref 只能用材料给出的资产引用」——材料里根本没有。
5. **`kbName` 漏传（P0，一行）。**
   `AiOutlineGenDoc.tsx:184` → `resolveBlocksToPayloads(blockLists, {})`；
   `KbOutlineGenDoc.tsx:199` → `{kbName}`。
   `resolveAssetBytes`（`DocBlockInjector.ts` L394–395）里 `if (!kbName …) return null`
   → AI 大纲页即便 `ref` 写对，也**必然**取不到图。
6. **表格数字无闸门（P1）。**
   `outlineEvidenceValidate.ts` 全部导出都是 PPT 语义（`tip*` / `slideIntent` / `resolveSlideIntent`），
   **不处理 `DocBlock`**。表里数字没人校验。

## 九·2 P0-1：把「资产清单」供给到段落 prompt（figure 能跑通的前提）

不改大纲骨架（它是对的），只在**段落生成**这一步补供给。

1. 段落生成前取该段检索证据（与 PPT 同一条链路：`docs` 里的 `asset_ids`）。
2. 从证据中**用代码抽取**资产清单（不靠模型猜），拼成 prompt 附录：
   ```
   【可用插图资产】只能从下列字符串里**原样复制** ref；列表为空则**不要写 figure**：
   - kb:抖音…衬衫polo衫/elements/p12_i1.png | 建议图注：编织肌理Polo衫
   - kb:抖音…衬衫polo衫/elements/p12_i3.png | 建议图注：撞色领口细节
   ```
3. `assetRef` 格式必须与 `resolveAssetBytes` 口径一致：`kb:<fileName>/<assetId>`
   （L389–395 按**第一个 `/`** 切分，`assetId` 内可含 `/`）。文档里别再写别名。

**硬约束（必须同时下发）**：清单为空 → 契约里**明令禁止** `figure`。
否则模型必然编路径，用户拿到一堆「［图片缺失］」，比没有图更糟。

**替代方案（不推荐，记录用）**：让模型只写 `caption`，前端按 caption 相似度选图。
否决理由：第五章踩过——按文案相似度选图导致**图与卡不匹配**（v2026826 的 12 张图全错）。
图必须「有 id 才绑」，不能「猜」。

## 九·3 P0-2：`AiOutlineGenDoc.tsx:184` 补 `kbName`

一行：`resolveBlocksToPayloads(blockLists, {kbName})`，与 `KbOutlineGenDoc.tsx:199` 对齐。
同时确认该页 `kbName` 取自 `Doc.get_chapters_from_outlineRecs` 的第三返回值（`init()` 已解构，别丢）。

## 九·4 P0-3：把「若本段适合」换成可判定判据（写进 `buildDocParagraphFormatPrompt`）

「适合」不是判据。改为**肯定式 + 反例**：

**表（须同时满足）**
- 材料里**同一组字段**被复述给 **≥2 个对象**（品类×指标、价格带×销量、时段×值、竞品×参数）；
- 该组 ≥2 行 × ≥2 列，且行与行**同质可比**（不是把不同维度硬凑成表）。
- **反例（不要出表）**：① 只有 1 个对象；② 只是把正文已列的数字再抄一遍；③ 为一句结论配表。

**图（须同时满足）**
- 本段讲的对象在【可用插图资产】里**有对应条目**；
- 该图**就在本段**上下文里（不是别的段的对象）。
- **硬规则**：一段最多 1 张图；清单为空则 0 张。

**位置不用教**：块跟在**讲它的那段**后面，锚点机制已保证。

**顺带**：七·3 的尺寸上限（≤8 行×5 列）保留；超限现在是**静默截断**
（`parseTableFenceLines` L305–310 + `buildTableXml` L73–78 双截），
建议截断时在 caption 追加「（表已截断）」，否则用户以为材料就这么多。

## 九·5 P1：表格数值过闸（补上「编造后门」）

复用既有函数，**不要**另写一套：
- `extractMetricTokens` / `normalizeMetricToken` / `evidenceHasMetric`
  （`outlineEvidenceValidate.ts` L169–345）对 `paragraph.blocks[i].rows` 逐格校验；
- 跳过：表头行（第 0 行）、非数值格、价格带 token
  （`isPriceBandBoundToken` L202——价格带是口径不是随机数）；
- 不通过 → **不要把该块塞进 `seq`**（等价于删表）+ `console.warn` 记一条。
  降级为纯文本不划算（表的价值就在结构），直接删更干净。
- **不要**调用 `validateTipsAgainstEvidence`（tips/实体语义、域相关，八·2 已论证不能跨域复用）。

## 九·6 P2：大纲阶段可见性（可选，建议先不做）

现状：用户在大纲页只看到章/段标题，**看不到也管不了**哪段会配表/图——
块在「生成内容」之后才随段内容出现（围栏原文可见、可手改）。
若要前移，最小做法是允许段标题后标 `[表]/[图]` 作为**段属性提示**（非 layout，不违反八·8），
用户可在 `OutlineTreeEditor` 里删。**但这会让大纲阶段替正文做决定**，
与九·1.2 的分工冲突，建议等九·2 跑通后再评估。

## 九·7 金标与验收

1. **供给金标**：给一段带 `asset_ids` 的假证据 → 断言拼出的 prompt 含 `【可用插图资产】`
   且每条都是 `kb:<fileName>/<assetId>` 形式；**证据无 `asset_ids` → 断言 prompt 含「不要写 figure」**。
2. **解析金标**：清单里的 ref 原样进 `figure` 围栏 → `resolveAssetBytes` 切分正确
   （**assetId 含 `/` 的用例必须有**）。
3. **kbName 回归**：grep 断言不得再出现 `resolveBlocksToPayloads(blockLists, {})`。
4. **判据金标**：构造「1 对象 3 指标」正文明文 → 断言输出**不含** ```table
   （契约 prompt 断言 + 一次人工采样，不做单测）。
5. **闸门金标**：含编造数字的表块 → 断言该块**未进入 seq**（该位置为 `null`），且合法表块仍进。
6. **零回归**：`DocTemplate.test.ts` 的「空 blocks 逐字节等价」保持绿。

## 九·8 负面清单

- ❌ 不给 Word 加 layout（重申八·8）
- ❌ 不让模型猜图（只允许原样复制清单里的 ref）
- ❌ 不按 caption 相似度选图（第五章旧坑）
- ❌ 不加「每章必须 1 表 1 图」硬配额
- ❌ 不为表格另写一套数值校验（复用 token 层）
- ❌ 不做文中「见图 N」交叉引用（七·9 已列）

---

# 九·9 本地可验证性 + 排期（2026-09-28 深夜补，用户提问触发）

用户问：「怎么办，要先完成第八章还是第七章？第七章需要我进行目检，目检依赖 UI，
可是 UI 还有要修的在第八章。」——这个前提**有两处不成立**，先纠正事实，再给排期。

## 九·9·1 事实纠正一：本地跑不了 jest 的根因不在套件，在 `DocBlockInjector` 的顶层 import

实测（Windows + `\\wsl.localhost\...` UNC 路径）：

```
TypeError [ERR_INVALID_FILE_URL_PATH]: File URL path must be absolute
    at fileURLToPath (node:internal/url:1608:35)
    at ... ModuleLoader.resolve ...
Emitted 'error' event on ThreadStream instance at:
    at destroy (frontend/node_modules/thread-stream/index.js:349:12)
```

链路：`DocBlockInjector.ts` L9 `import {fetchAssetBytes} from "@/services/chatchat/kb"`
→ 该服务拉起 **pino → thread-stream** worker → worker 里 `fileURLToPath` 解析 UNC 路径失败
→ **进程直接退出**（不是断言失败，是整个 suite 没见过一行输出）。

**已解（测试侧，本轮已做）**：两个套件各加一段
```ts
jest.mock("@/services/chatchat/kb", () => ({
  fetchAssetBytes: async () => { throw new Error("本用例不应调用 fetchAssetBytes"); },
}));
```
→ 本地全绿：
```
PASS tests/DocBlockPreview.test.ts (177.369 s)
PASS tests/DocTemplate.test.ts   ( 14.334 s)
Test Suites: 2 passed, 2 total   Tests: 6 passed, 6 total
```

**待解（产品侧，P1，建议第 1 批一起做）**：顶层 import 会把 kb 服务（含 pino）
拖进**任何**引用 `DocBlockInjector` 的 bundle。改法二选一，方向与七·4 / 九·2 的 `assetRef` 抽象一致：
1. **注入参数（首选）**：`resolveAssetBytes(ref, opts)` 的取字节动作改由调用方传入
   （`opts.fetchKbAsset`，`DocBlockInjector` 不再 import kb 服务）；
2. 或退一步：函数体内 `const {fetchAssetBytes} = await import("@/services/chatchat/kb")` 动态加载。

## 九·9·2 事实纠正二：七·8.6 的目检**不依赖 UI**——样本可由脚本产出

新增 `frontend/tests/DocBlockPreview.test.ts`（**本地目检用；不进 CI 白名单 pattern**，
但会在 `npx jest` 全量步骤跑，已做 CI 兼容：KB 图缺失时回退 1×1 PNG，
「超限降级」分支改用 1.6MB 合成字节，稳定触发而不依赖真实文件）。

做法：直接构造 6 段 `chapters` + 6 种块分支 → `render` → `injectDocBlocks` → 写盘。
**完全绕开产品 UI 与后端**（图走 `upload:` 分支 + `resolveUpload` 钩子喂自备字节）。

跑法：
```bash
cd frontend
node node_modules/jest/bin/jest.js --config jest.config.js --ci --runInBand \
     --testPathPattern='(DocTemplate|DocBlockPreview)'
# 产出：<repo>/.workbuddy/out/docblock-preview.docx
# 约 3.5～4 分钟；必须显式 --config；输出重定向到文件再读（管道接 tail 会 SIGTERM 丢输出）
```

**产出已逐项核过（不必等 Word）**：
| 项 | 实测 | 判定 |
|---|---|---|
| `⟦DOCBLOCK⟧` 残留 | 0 | ✓ |
| `<w:drawing>` | 3 | ✓ |
| image rels / media | `media/img1..3.png` 各 3 | ✓ |
| `[Content_Types]` png Default | 存在 | ✓ |
| SEQ 域 | 表 1 / 图 5 | ✓（缺失占位也保留题注，符合七·7） |
| 竖图 396×879 | `cy=6826504`（=版心高 80% 上限），ratio 0.451 | ✓ 高受限 |
| 横图 635×300 | `cx=5130641`（=版心宽 95% 上限），ratio 2.117 | ✓ 宽受限 |
| 小图 398×400 | `cx=3790950`（=398px@96dpi），未放大，ratio 0.995 | ✓ 不放大 |

→ **第七章的目检不再依赖任何未完成的 UI。** 你在 Word 里只需做三件事：
① 打开不报修复；② `Ctrl+A → F9` 后目录页码与「表 1 / 图 1…图 5」正确；
③ 对照各段正文里已写好的「目检要点」（长表跨页表头、四种图片分支、两处红字占位、无块段不留痕）。

## 九·9·3 排期：**按 UI 依赖切，不按章切**

| 批次 | 内容 | 依赖 UI | 依据 |
|---|---|---|---|
| **已完成** | 七章自动化金标（6 用例全绿）+ 目检样本 | 无 | 九·9·1 / 九·9·2 |
| **第 1 批（Cursor，无 UI）** | 八·2 元数据行过滤（解析层+保存层）／八·3 `checkChapter` 分层计数／八·4 骨架段类型+反例／八·5 doc 体裁包 ＋ **九·3 一行（`AiOutlineGenDoc.tsx:184` 补 `kbName`）** ＋ 八·7.6 两处调用点改 `code < 0` | 无 | 全在解析层/提示词层/调用点，可与 UI 并行 |
| **第 2 批（Cursor）** | **九·2 资产清单供给** ＋ 八·6 即时自检 + 一键规范化 | 八·6 有 | 九·2 是「产品链路里图能出现」的唯一前提 |
| **第 3 批（联调）** | 产品链路端到端目检（大纲 → 生成内容 → 导出） | 有 | 依赖第 1、2 批 |

三条关键判断：

1. **七章不阻塞八章**：代码已全落地 + 金标全绿 + 目检可离线完成 → **七章现阶段可收口**。
2. **八章不阻塞七章的离线目检，但阻塞七章的端到端目检**——大纲本身脏（元数据行被当段落），
   导出结果没法作为验收依据。所以端到端必须排在第 1 批之后。
3. **九·2 是七章端到端的隐藏依赖**（本轮新识别）：没有资产清单供给，
   产品链路里 `figure` 必然全部降级成「图片缺失」→ 端到端目检里「图」这一项**根本验不了**。
   所以九·2 必须排在端到端之前，和八·6 同批。

八·7.6 那两个调用点实测仍是 `!== 0`（会直接把 Warn 当失败处理，废掉八·3 的设计）：
- `ChatWithSpeech4Doc.tsx:155` `if(t.code!==0)`
- `OutlineSelectDrawer.tsx:79` `if(chkMsg.code!==0)`
→ 归入第 1 批（与八·3 同批，不能分开）


---

## 十、《2026-09-29 doc-quality-plan》复核：8 处修正（**先读这份再开工**）

> 复核报告全文：`docs/2026-09-29-doc-quality-plan-review.md`（含 14/14 锚点核对表、两份 docx 解剖数据、B1 根因实证）。
> 结论：方案的 **file:line 锚点真实度很高**（14 项全命中），但**层级判断有系统性偏差**——把前端渲染链的缺口记到了后端账上。照原样开工，至少 3 个 PR 会白做或造成双套机制。

### 十·1 任务①（B1 标题丢字）：根因不在后端，真凶已定位
- 方案指的 `kb_service.py:1134` 是 `_scope_extras()`（检索侧加词，**只增不删**），与标题无关；全仓搜不到任何"否定字符类"标题清洗正则。
- **真凶**：`frontend/src/components/DocUtil/ViewItem4Doc.ts:15-24` 的 `charsToReplace` **显式包含 `"1"~"0"` 全部阿拉伯数字 + `一~十` 中文数字**，经 `cleanString` 作用于 **L530 章标题 / L540 段标题**。实测：`衬衫200元价格带表现` → `衬衫元价格带表现`（与 docx 现象逐字符一致）。
- 注意 `polo` 消失**不是**它（实测保留字母）→ 需二分定性：先 log 原始 LLM 大纲，若已丢则属提示词层。
- **落点改为前端**；验收改 `frontend/tests/docTitleFidelity.test.ts`（挂进 ci.yml L29 的 `--testPathPattern` 清单）。方案里的 `backend/tests/test_title_fidelity.py` 无法复现。

### 十·2 任务②（实体闸）："并入既有三道闸"不成立
- 三道闸是**前端 TS**（`outlineEvidenceValidate.ts` / `PptProductGate.ts`）；后端搜 `gate_report|占位符闸` **0 命中**（只有 `extract_service.py:213` 的占位名 warning，另一层）。
- 落后端 = **第二套闸**，会重演"同规则两处各自演化"。
- 建议：三元组校验先进 `outlineEvidenceValidate.ts`（证据用 `⟦chunk|assets⟧` 标记，`kb_service.py:921-927` 已提供）；`fidelity_gate.py` 只承载后端独有能力。

### 十·3 任务③（榜单排名）：先改判定，再决定是否动 OCR
- `table_structure.py:681` 已有"标签-百分比"成对抽取、`:352` 已有排序 → 结构化数据在**抽取层**就存在，docx 表12/13 也证明它进了检索结果。
- 第 1 步：正则捕 `位居首位|排名第一|是第一|最大`，与同段共现百分数取 max 比对（冲突改写/拦截）；第 2 步才是 OCR 侧落排序 JSON。

### 十·4 任务④（跨页去重）：**方案假设的运行形态不存在**
- 方案写"跨页调用方透传 `used_chunk_ids`（全文生成器按页循环累计）"，但真实形态是 `AiOutlineGenDoc.tsx:252-287` 的 **`Promise.allSettled` 并行、每段一次独立 HTTP**（后端无状态），没有"按页循环累计"的位置。
- 三条替代路线（择一）：①先修 B1（段标题丢数字/字母 ⇒ 段间查询不可分，是重复的连锁原因）；②请求带 `gen_session_id`，后端会话内近似去重；③客户端串行回传（牺牲速度）。
- "同 chunk_id 全文最多 1 次"要加兜底，改为**降权不删**，否则唯一证据页会饿死。

### 十·5 任务⑤（引用统一）：锚点对，但盲映射会造错引
- `kb_service.py:929` 唯一产出口 ✅（docx 实测两套并存：文件1 `[文档N]`8 : 裸`[N]`78；文件2 0 : 65）。
- **风险**：裸 `[N]` 的编号未必等于检索序号，"一律 `[N]`→`[文档N]`"是没有依据的假设，错位即把对的改成错的。
- 建议：提示词禁裸引用（首选）；能判定的才归一；**不能判定就删除**裸引用并计入 report。

### 十·6 任务⑥（空表/噪声）：拆两处，且闸不在后端
- 27 行空表 = **模板**里的「文档修改记录」（两份 docx 表3 均 27 行/非空 1）→ 在 `frontend/public/docTemplate-simple.docx` 里做手术（与 PPT 模板同套做法）。
- OCR 噪声（`激情增高` 两份各 1 次）→ 抽取/渲染后处理层；注意配置别建第三份（前端已用 `frontend/src/data/corpusProfiles/*.json`）。
- 方案"grep 占位符闸 定位"的位置判断需废弃（见十·2）。

### 十·7 任务⑦（图片编排 7a/7b/7c）：**与 09-29 00:04 已落地工作重叠，必须重写**
三件事已经做完，且用的是**另一套契约**：
- chunk 资产：`kb_service.py:921` 已读 `meta["asset_ids"]`、:923 吐 `|assets:…` → 不需新增 `page_assets`。
- 生成侧注入：`frontend/src/components/DocUtil/docFigureAssets.ts`（注释写着"九·2"）已提供 `buildFigureAssetAppendix`；`KbOutlineGenDoc.tsx:254` 已拼【可用插图资产】。
- 渲染端：`DocBlockInjector.ts` + `resolveBlocksToPayloads` + `fetchKbAsset` 已实现，契约是 **```figure 围栏 + `ref: kb:<fileName>/<assetId>`** → **废弃 `asset:` 内联 URI 设想**，别新造第二种。
- **"文档零图"的真实原因**：`AiOutlineGenDoc.tsx:258/268` 写死 `buildFigureAssetAppendix([])`（空清单 ⇒ 硬约束禁止写 figure）；Kb 页有真实清单（`:245-255`）但文件2 仍 0 图（`png Default`=True 说明注入器跑过）→ 先打印 `blockLists.length / payloads / inj.warning` 定性。
- 唯一被方案说对的是"终稿 `ref` 不可 resolve 即拦截"。另：Cursor 自己已标记的风险"清单用全库前 12 条（非段落级）"就是**图配错**的温床 → 7a′ 应改为**按 chunk/页筛资产**。

### 十·8 任务⑧（结论层）：可做，注意两点
- `_TASK_SUMMARY` 目前是 PPT 视角（`outline/slide/outline_slide_fill` + 极薄 `paragraph`），给 Word 加"结论与建议"槽线要连带定层归属。
- "结论数值 ⊆ 实体闸通过集合"依赖十·2 的定层结论；`（推演）` 标记要同时禁止引入材料没有的数字与周期（对齐 `PPT_DOMAIN_PACKS.selection` 既有约束）。

### 十·9 工程配套修正
- `ci.yml` L48-51 全量跑 `backend/tests/` ✅ 不用改 workflow；但**前端新增闸必须加进 L29 的 `--testPathPattern` 清单**。
- "`gate_report.blocked_count > 0` 则 CI 红" → CI 无运行产物，只能**测试内用 fixture 生成再断言**，措辞要改。
- `workbuddy-review.mdc` 只放 Cursor→WB 交接规则；WB→Cursor 的规则归 `workbuddy-task.mdc`，别混。

### 十·10 建议执行顺序（替代方案末节）
- **批 A（立即可做）**：①清洁单收缩+前端标题保真断言（改 `ViewItem4Doc.ts`）；⑦-0 `AiOutlineGenDoc` 空清单（一行）；B1 字母侧二分。
- **批 B（先定层）**：②定层 → ③排名断言 → ⑤引用统一。
- **批 C（需设计）**：④去重路线 → ⑥拆两处 → ⑦ a′/b′/c′ 重写。
- **批 D**：⑧结论层（依赖批 B 定层）。
- **废弃**：原 7a（新增 `page_assets`）、原 7b 的 `asset:` URI、任务①的后端落点、任务④的 `used_chunk_ids: set[str]` 签名。

# 十一、文章质量层：用户对「章节/目标/结论/人设/重复」的直接反馈（2026-09-29 上午）

> 触发：用户手动对比 WorkBuddy 生成的文档与毕方生成的文档，给出五条抱怨（章节不知所云 / 目标模糊 / 没有结论 / 没换选品师角色 / 内容大量重复），问「doc-quality-plan 解决了没有」。
> **答案：没有。** 那 8 个任务是「数字可信」取向，这五条是「文章可读」取向，两个问题域正交。
> 完整逐条对号 + 实测证据见 `bifang/docs/2026-09-29-doc-quality-plan-review.md` **§11**（含 11.1 共同根因、11.2 四个新 bug、11.3 任务 9）。

## 十一·0 一句话
8 个任务里只有 ⑧ 结论层直击叙事，①②④ 擦边；**方案全部做完，文档仍会目标模糊、无人设、无结论章。**

## 十一·1 共同根因（一句话版）
段落写作 prompt = 「文章标题＋章名＋段名＋200~400字」（`ViewItem4Doc.ts:668-671`），**不含**岗位视角 / 本章要回答的问题 / 相邻段边界 / 结论归属；且每段一次独立并发 HTTP（`AiOutlineGenDoc.tsx:258`、`KbOutlineGenDoc.tsx:292`），段间互不可见。
→「目标模糊＋无人设＋大量重复」同源，都在段落 prompt 组装处，**不在检索、不在闸门**。所以任务④（检索去重）单独做治不了重复。

## 十一·2 四个新 bug（本轮实测，均可独立修）
1. `inferDocDomainPack` 被默认值短路（`OutlinePromptComposer.tsx:596-607`，调用点 L839 传 `{domainPack: 'generic'}`）→ **doc 体裁包机制永久失效**（八·5 落了代码但跑不起来）。
2. `DOC_DOMAIN_PACKS` 缺 `selection`（PPT 侧有 `PPT_DOMAIN_PACKS.selection`）→ 选品主题拿不到选品骨架。
3. `role` 默认 `'读者'` 并原样进 user message（`OutlinePromptComposer.tsx:840`）→ 反向误导。
4. `markdown_init` 仍是遗留 6 章样板（`AiOutlineGenDoc.tsx:28` / `KbOutlineGenDoc.tsx:34`），`* 1.1` 写法触发 `checkChapter` warn，且「六、总结评估」内容与文档目标无关。

## 十一·3 新增「任务 9 · 文章质量层」，建议并入批 A
- **9.1（P0）段落 prompt 四要素**：`setAllPrompt` 加 `ctx` 参数（岗位 / 本章要回答的问题 / 相邻段边界"勿重复" / 结论归属）；改 `ViewItem4Doc.ts:662` + 两处调用点。→ 一条治三个症状。
- **9.2（P0）补 `selection` 体裁包 + 修短路**：`DOC_DOMAIN_PACKS.selection`（机会面 → 证据对照 → 风险与不选什么 → 选品结论与动作）；`inferDocDomainPack` 改为「仅显式选择才 forced」。
- **9.3（P1）结论章进 `DOC_OUTLINE_SKELETON`** + `checkChapter` 一条 Warn（不拒单）。与八·3 同批。
- **9.4（P1）重复根治**：与任务④同批重设计（④ 单独做无效）。

## 十一·4 与既有章节的关系
- **不重复**：八·5 体裁包（机制在但失效 → 十一·2#1 修它）；八·1 元数据行；九·4 出块判据。
- **覆盖**：十·8（任务⑧结论层）落层待定 —— 结论章的真正归属在**大纲骨架**（九·3）而非后端写作 prompt。
- **优先级**：十一·3 的 9.1 / 9.2 全无 UI 依赖，且是用户抱怨的直接对症项，**建议与批 A 同批做**。

## 十一·5 WorkBuddy 本轮直接落地的 UI 改动（**Cursor 勿重复改，改前先 git pull/看工作区**）

触发：用户反馈「大纲修改页面右侧大纲内容展示比较难看，没有章节区分」，经确认指的是
`OutlineSelectDrawer`（大纲查询/选择抽屉）右侧那块标题为「大纲内容」的区域。

改动前：Word 大纲走 `<Typography><MdViewer source={...}/></Typography>`（`OutlineSelectDrawer.tsx:276-278`），
即 `react-markdown` 裸渲染 —— 章（`##`）/ 段（`###`）/ 要点（`*`）视觉上几乎无差别，也没有编号与层级缩进。

| 文件 | 动作 | 说明 |
|---|---|---|
| `frontend/src/components/DocUtil/docOutlineStructure.ts` | **新增** | 纯函数解析器（无 React/antd 依赖）：markdown → 章/段 视图模型。口径对齐 `ViewItem4Doc.getChaptersFromContent`：`##`=章、`###`=段、`* - +`=段（标 `heading=false`）、` ```table/figure` 归属所在段、PPT 元数据行丢弃、章前散行进 `loose`。**不做 `cleanString`**——视图必须显示原文，否则标题里的数字/字母会像 B1 那样被吃掉。 |
| `frontend/src/components/DocUtil/DocOutlineView.tsx` | **新增** | 结构化只读视图：文档标题 + 「N 章 / M 段」统计；每章 = `colorFillQuaternary` 底 + 左侧 `colorPrimary` 色条 + 「第 N 章」徽标 + 段数；每段 = 视图编号（1.1）+ 缩进竖线；`*` 要点为次级列表；兼容写法段挂「非 ###」黄标；有表/图围栏时挂「表 / 图」标。颜色全取 antd token，亮/暗自适应。 |
| `frontend/src/components/DocUtil/OutlineSelectDrawer.tsx` | **改 2 处** | ① 导入由 `mdViewer` 换成 `DocOutlineView`；② Word 分支替换为 `<DocOutlineView key={currentId} markdown={getContent(currentId)} fallbackTitle={记录名}/>`。PPT 分支（`OutlineTreeEditor`）未动。 |
| `frontend/tests/DocOutlineView.test.ts` | **新增** | 10 用例：真实 polo 大纲结构/编号、**标题里的 `polo` 与 `200` 必须原样保留**（防 B1 回归）、兼容写法 vs 要点、围栏归属、元数据行丢弃、散行、空内容、序号剥离不误伤 `2024年…` / `100-200元` / `3C` / `TOP6`。 |
| `.github/workflows/ci.yml` | **改 1 行** | L29 `--testPathPattern` 清单加入 `DocOutlineView`。 |

验证：`npx jest --config jest.config.js --ci tests/DocOutlineView --runInBand` → **10 passed / exit=0**（UNC 路径下本机约 4 分钟）。
另用 Python 等价实现独立复算 9 组用例全过（交叉验证，不只依赖一处）。

**未做（留给后续、别顺手加）**：
- `frontend/src/components/DocUtil/mdViewer.tsx` 现在**无人引用**（唯二使用点已替换）。保留未删；若要清理，先确认没有别的分支在用。
- Word 大纲在抽屉右侧仍是**只读**（PPT 分支可编辑）。要不要给 Word 也做编辑（复用 `OutlineTreeEditor` 的壳、换 Doc 的字段），等用户明确要再说。
- 抽屉右侧的 `height: 750px` 外层与 `bodyStyle height 100%` 仍是双滚动条结构（历史遗留），本轮未动以免影响 PPT 分支。

---

## 十二、方案修订：任务 4 语义修正 + 新增任务 4B（材料池 + 分段分配器）

**来源**：用户提出「分段生成不是病因、**分段检索**才是；真正缺的是分段之后没有任何跨段协调状态」的分析，要求补进 `docs/2026-09-29-doc-quality-plan.md`。
**我已逐锚点复核并把改动直接落进方案文件**，逐条核对见 `docs/2026-09-29-doc-quality-plan-review.md` §12。本章只讲 Cursor 需要执行什么。

### 十二·1 方案文件已改三处（不用你再改，直接读）

1. **任务 4** 标题加「⚠️ 语义已修正」，正文新增「实测事实」表（6 条，均为本次 grep 实测），实现要点改为：
   - `retrieve_for_writing` **只增加只读入参** `exclude_keys: set[str] | None`；
   - **禁止**模块级变量 / 全局 set / 进程内缓存（会跨会话污染）；
   - 跨页配额**降权而非删除**（键用 `_doc_key`，`kb_service.py:1271`；直接删会让"唯一证据页"饿死）；
   - 验收加第 3 条：**不传** `exclude_keys` 时输出与现状逐字节一致（防回归）。
2. **新增 任务 4B「材料池 + 分段分配器」**：4B.0 归因边界 / 4B.1 prompt 补洞旁证（6 条规则行）/ 4B.2 上下文前提已过期 / 4B.3 四相形态 + ⚠️ 禁令 / 4B.4 账本通道真相 / 4B.5 涉及文件 / 4B.6 硬编码陷阱 / 4B.7 验收。
3. **执行顺序**改为 `PR4(任务6) → PR5(任务5) → PR6(任务4B) → PR7(任务4)`；「给 Cursor 的使用方式」加 2 条。

### 十二·2 原分析里两处说法不准，**别照抄**

- ❌「`chat_service.py:128-132` 已把每轮 `ret_docs` 持久化，现成有只是没人读」
  ✅ 实测：全仓 grep `last_acc_docs|ret_docs` **只命中 `chat_service.py` 自身** → **前端 0 处发送（生产者不存在）**、**后端 0 处读取**；且写回是把同一个 blob **盖到每一条** assistant 消息（**单块粒度，非按页**）。→ 是"空插座"，不是"现成数据"。
- ❌「生成第 N 页前读同会话历史账本」
  ✅ 实测：前端 `AiOutlineGenDoc.tsx:250-287`、`KbOutlineGenDoc.tsx:321` 都是**全并行 `Promise.allSettled`**，同一 tick 发完全部段落，**没有"第 N 页之前"**；且本批消息批结束才落库。→ 协调状态只能由**阶段 2 一次算完**，或**合并成新端点**。

### 十二·3 我额外查到、原分析没提的一条（对 4B 是决定性的）

`kb_service.py:1215-1246` 的页级路由**已是领域硬编码**：`if title and "大盘" in title: extras.append("男装大盘")`，以及 `男士衬衫` / `polo衫` / `价格带` / `面料|材质|属性|图案|厚薄|袖型` 的显式分支。
→ 分配器**不得**复用它做"章节→片段"打分，否则把服装词表固化成架构（与 B1 同族的"换品类就要改代码"）。已写成 **4B.6 陷阱** + **4B.7.4 验收**（静态断言：分配打分不 import 领域词表常量）。

### 十二·4 开工口径

- **4B 先于任务 4**：4B 定"分配表从哪来"，任务 4 的 `exclude_keys` 才有真调用方；反过来做要重写调用点。
- **4B 第一件事是二选一主形态**（见 4B.3 ⚠️）：
  - 方案 A「前端两相」：阶段 2 在浏览器算分配表 → 逐段带着分配结果调 `retrieve_for_writing`；
  - 方案 B「新端点」：一次请求返回全篇「章节→片段」分配，前端再逐段生成。
  两条路改动面完全不同，**选定后写进 PR 描述**，别混做。
- **不与任务 2 同 PR**（都改 `kb_service.py` 写作链，会撞）。
- 4B 会碰检索主链路，合入前**跑全量 pytest**（`ci.yml:48-51` 已覆盖）。
- 测试口径见 4B.7 → `backend/tests/test_material_pool.py`，4 条断言，其中第 2 条「同一价格带 chunk 只出现在 1 个章节的分配结果里」是对 B4 的直接回归。
