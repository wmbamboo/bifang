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
