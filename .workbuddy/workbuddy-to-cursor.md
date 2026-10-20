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


---

## 十三、V2 复检补漏：标题只有两级 + 目录编号/页码全错（含**模板级 P0**）

> 证据全文在 `docs/2026-09-29-v1-v2-quality-diff.md` **§七**（WorkBuddy 实测）。本节只给执行口径。

### 十三·0 一句话

V2 的「二级标题繁复 / 没有第三级 / 目录全错」是**同一批结构问题**：契约只给两级标题，而模板的目录区里藏着**第二套** `{#chapters}/{#paragraphs}` 循环，目录编号与页码是模板字面常量。

### 十三·1 实测数据（**勿重新采集**）

- docx 样式：`heading 1` ×4、`heading 2` ×**50**、`heading 3` ×**0**。契约（`OutlinePromptComposer.ts:286-294`）只有 `#`/`##`/`###` 三级 Markdown，`###` 映射到 h2 即最细一级 ⇒ **正文天然只有两级**。
- 模板**已备**三级样式：`styles.xml` 中 styleId `1`–`9` = heading 1–9 全在（`3` = heading 3，带 `numPr numId=1 ilvl=2`）。**缺的是契约，不是样式。**
- h2 平均 42.0 字 / 中位 52 字 / 最长 79 字；>50 字 27 条（54%）；主题型 15 条（均 12.1 字）、数据型 35 条（均 54.8 字）；**70% 的 h2 带 `[文档N]`**。
- 交替模式规整：15 个主题型，每个后紧跟 2~3 条数据型 ⇒ **模型在输出两层信息，被压平成同一级**；这也直接造成报告 §五-4 的「标题-正文复述」。
- 模板目录区（`docTemplate-simple.docx` 段 37–43）：`TOC1 = {#chapters}1` + TOC 域指令、`TOC1 = 1{label}1`、`{#paragraphs}`、`TOC2 = 1.1{label}1`、`{/paragraphs}`、`TOC1 = {/chapters}1`、段 43 = TOC 域 `fldChar end`。**这是「手搓目录」**，编号 `1`/`1.1`、页码 `1` 全是字面常量。
- V2 吻合：目录 59 条（TOC1 ×9 + TOC2 ×50）、`bookmarkStart` 唯一名仅 3 个而 `_Toc182955958` 出现 **50 次**、59 条 `PAGEREF` 只指向 4 个目标。

### 十三·2 待办（按 P0 → P1）

**十三·A（P0，零模板改动，当天可验）段题瘦身**

- `DOC_OUTLINE_SKELETON`（`OutlinePromptComposer.ts:284-296`）：段题 **≤14 字、禁阿拉伯数字、禁 `[文档N]`、禁逗号并列**；数据留给正文与表。
- 解析层「标题体检」（`ViewItem4Doc.ts:598` 附近）：`###` 标题命中 `\d` / `[文档` / 长度 > 20 → 判为数据句，**降级为正文首句引导**（不占 h2）+ Warn（**不拒单**，风格对齐八·3）。
- 预期：h2 中位 52 → ≤14 字；报告 §五-4「标题复述」同步消失。

**十三·C（P0，模板）目录区改造 —— 这是「TOC 编号全错」的真因（报告 §五-3 只列了现象，未定位）**

1. 目录区删掉手搓循环，只留真 TOC 域（`TOC \o "1-3" \h \z \u`）；清空其缓存结果，并给 `fldChar begin` 加 `w:dirty="true"` → Word 打开自动重建（与题注 SEQ「更新域」约定一致）。
2. 位于循环体内的 `_Toc*` 书签，渲染后**必须重命名为唯一值**（否则重名 → 页码全部解析到第一处）。
3. 清理正文 h1 上的历史书签包（段 46 挂 `_Hlt…` + 9 个 `_Toc…`）。

**十三·B（P0，结构正解，需动模板）加真三级**

- 契约 4 级：`#` 文题 → `##` 章 → `###` 段（主题型）→ `####` 子点（数据点/对照点，允许数字与引用）。
- 三处同步：① 模板段 48–52 段落循环体内加 `{#points}` 子循环 + `pStyle=3`（styleId `3` 已存在，勿新建样式），`⟦DOCBLOCK⟧` **保持在段级**、块粒度不变；② `ViewItem4Doc.ts:598` `paragraphRegex1 = /^### (.+)$/` 扩展解析 `####`，`Chapter/Paragraph` 加 `points`；③ `checkChapter`（`ViewItem4Doc.ts:686`）分层校验，段额度只算 `###`。
- 收益：数据从标题回到子点；TOC `\o "1-3"` 自然多出一级。

### 十三·3 与其它任务的边界

- **和 §十一（文章质量层）同源**：十一补的是"段落 prompt 缺岗位/边界/结论"，本节补的是"标题层级不够、目录假"。
- **A 与 C 可合并为一个 PR**（都只碰大纲契约 + 模板 + 解析层，不碰检索）。**B 单独一个 PR**（改模板结构，风险最高）。
- **不碰** `docOutlineStructure.ts` / `DocOutlineView.tsx`（WB 已改，见 十一·5）；新解析若加 `points`，那两处需**同步**支持（届时先说一声）。
- 与 §十二（4B 材料池）无交集，可并行；但两者**都别与任务 2 同 PR**。
- **回归硬要求**：模板一改，必须重跑 `frontend/tests/DocTemplate.test.ts`（七章金标）+ 离线目检 `frontend/tests/DocBlockPreview.test.ts`（产出 `.workbuddy/out/docblock-preview.docx`），确认 `⟦DOCBLOCK⟧` 残留 0、锚点数 == 段数。


---

## 十四、层级塌陷复检：`*` 行不是"第三级"，是"独立生成单元"（P0）

> 触发：用户贴「大纲是三级、生成页只显示两级，第三级与第二级平级」+ 生成页提示词截图。
> 结论：十三·B（`####` → points）**已落地**，但**模型写的是 `*` 不是 `####`**，而 `*` 分支至今仍产段落 —— 它不只是"显示平级"，**它会各拿 200~400 字预算独立生成一次**，是正文膨胀与段间重复的直接来源。

### 十四·1 已落地部分（勿重做）

| 事实 | 证据 |
|---|---|
| 契约已有三级，且 `####` 可选 0~4 | `OutlinePromptComposer.tsx:290`；`:296` 明令「禁止用 `* + -` 代替 `###/####`」 |
| 模板已有 `{#points}` 子循环（h3） | `docTemplate-simple.docx` 标签实测含 `{#points}/{/points}`，mtime 09-29 15:25（commit `ef3a2bd`） |
| 解析器 B 已认 `####` → `paragraph.points` | `ViewItem4Doc.ts:668` `pointRegex`；`:744-746` |
| 数据句 `###` 已降级为子点 + Warn | `ViewItem4Doc.ts:754-759`；`isDataLikeDocParagraphTitle` `:246-254` |
| 抽屉（解析器 A）已是三级 | `docOutlineStructure.ts:150-175`；`DocOutlineView.tsx:146-176` |

### 十四·2 五个缺口（按严重度）

| # | 缺口 | 证据 | 后果 |
|---|---|---|---|
| **C** | **生成循环不过滤 `heading`** | `KbOutlineGenDoc.tsx:377`、`AiOutlineGenDoc.tsx:254` 均 `for (const paragraph of chapter.paragraphs)` | `*` 行生成的段落各发一次 HTTP、各写 200~400 字 → 一章 4 个 `###` + 8 个 `*` = **12 个生成单元**，正文膨胀 3 倍、同组数字反复复述 |
| B | `*` 分支仍新建段落 | `ViewItem4Doc.ts:667` `paragraphRegex2`；`:747-766` `heading=false` | 与抽屉口径不一致 → 用户看到"第三级平级" |
| A | 生成页不渲染 `points` | `OutlineResultDoc.tsx` 只渲染 `label + content`（`:97`） | 即便写的是 `####`，生成页也看不到第三级 |
| D | `siblings` 取全量 paragraphs | `ViewItem4Doc.ts:931-934` | 数据句混进「同章其他段落（内容勿重复）」清单（截图实证：`男装大盘总销量 7,280.1 万…`） |
| E | `points` 不注入写作 prompt | `setAllPrompt` `:914-959` 从不用 `paragraph.points` | 子点信息在写作时**静默丢失**，只在大纲/docx 里存在 |
| F | 字数三处硬编码 | `ViewItem4Doc.ts:219`、`:936`、`parseChatCompletion.ts:149`；无 `wordBudget` | 一刀切；「大约…左右」叠词；改一处漏两处 |

### 十四·3 修法（按批，均无 UI 阻塞）

**14.3.1（P0）解析口径统一 —— 不破坏存量**

- 规则：**章内一旦出现过 `###`**，其后所有 `* - +` 行一律归入「当前段」的 `points`，**不新建 Paragraph**；章内从未出现 `###` 时保持旧行为（`*` = 兼容段落，`checkChapter` 已有 Warn）。
- 落点：`ViewItem4Doc.ts:747-766` 的 `paragraphMatch2` 分支加上述判别；`docOutlineStructure.ts:164-166` 已是同规则 → 两处对齐后天然一致。
- 断言：构造「4 个 `###` + 8 个 `*`」→ `paragraphs.length === 4`、`points` 合计 8。

**14.3.2（P0）生成闸双保险**

- `KbOutlineGenDoc.tsx:377` / `AiOutlineGenDoc.tsx:254`：只生成 `p.heading === true` 的段落；若整章 `headingCnt === 0`（存量旧大纲）则退化为全部生成。
- 与 14.3.1 独立生效：即使将来再出现别的兼容写法，也不会被当成生成单元。

**14.3.3（P0）展示与注入**

- `OutlineResultDoc.tsx`：段内渲染 `points`（缩进、次级、只读，视觉对齐 `DocOutlineView`）。
- `setAllPrompt`：注入 `【本段要点】…`（`points.label`，≤6 条）；`siblings` 改为只取 `heading` 段落。

**14.3.1b（P0，与 14.3.1 同 PR）大纲侧措辞 —— 不写死三级**

替换 `OutlinePromptComposer.tsx:290` 那一行（保留「可选」，加**条件触发**而非强制）：

```
4. 数据点/对照点用「#### 」写在对应 ### 之下（每段 0～4 个；#### 允许数字与 [文档N]）。
   - 若本段要讲清楚的数据对象 ≥2 个（多个价格带 / 多个品类 / 多个属性维度），必须逐个写成 ####，
     每个对象一行；只讲单一主题、无并列数据时可写 0 个。
   - 严禁使用「* / + / -」代替 #### —— 它们会被当成新段落独立成文。
```

- 「必须」只绑在「数据对象 ≥2」这个**可判定的条件**上，不是「每段必须三级」。
- 落闸位置：`checkChapter` 加一条 **Warn（不拒单）**：章内存在「### 段且 points 为空且段题含品类×指标语义」→ 提示补子点。

**14.3.4（P1）字数变量化（用户问题 3）**

**保留「字数写进 prompt」——但写的是变量，不是常数。** LLM 需要显式目标，不给反而更差；只改两件事：常数 → 变量、区间 → 单值。

- 常量集中一处：

  ```ts
  export const DOC_WORD_BUDGET = {base: 150, perPoint: 60, min: 150, max: 600} as const;
  export const wordBudgetFor = (p: Paragraph, chapter?: Chapter) =>
    clamp(DOC_WORD_BUDGET.base + (p.points?.length || 0) * DOC_WORD_BUDGET.perPoint, ...);
  ```

- **取值公式（本段要点数驱动）**：`budget = 150 + points数 × 60`，clamp `[150, 600]`。

  | 要点数 | 0 | 1 | 2 | 3 | 4 |
  |---|---|---|---|---|---|
  | 字数 | 150 | 210 | 270 | 330 | 390 |

  依据：一条数据点至少要「数值 + 口径 + 一句解读」≈60 字；段首引入与收口 ≈150 字。
- **总预算归一化（可选，默认关）**：若用户设了「全文字数」（页内数字输入），生成前一次性算好并按 `budget_i × total / Σbudget` 缩放。
  **注意**：段落是 `Promise.allSettled` 全并行发请求（见十二·②），**不存在"边生成边调整"**，字数必须在解析后、生成前一次算完。
- 文案改为单值、去叠词：`撰写约 ${budget} 字的正文`（不写「大约…左右」，实测模型易取下界）。
- `buildDocParagraphFormatPrompt(budget)`、`ViewItem4Doc.ts:936`、`parseChatCompletion.ts:149`（改 `buildKbConstraintPrompt(budget)`）三处共用同一常量。
- **字数只做软目标，不做硬闸**：不截断、不因超字数拒收；仅在导出前对偏差 >50% 的段给 Warn。

**14.3.5（P1）提示词双层编辑（用户问题 4）**

- 数据模型：`Paragraph` 增 `wordBudget / role / question / allowTable / allowFigure`；`prompt` 保留为 legacy 回退。
- 页内简单层：字数（number）、岗位视角（text）、本段要点（chips，来自 `points`，可增删）、表/图开关、「本段要回答什么」（单行）。
- 「高级」抽屉：完整模板（`{{slot}}` 高亮）+ 恢复默认 + **只读展示运行时追加**（`KB_DOC_WRITING_CONSTRAINT_PROMPT`、`figureAppendix`）——现在这段是静默追加（`KbOutlineGenDoc.tsx:387/397`），用户看到的"全可编辑"实际只可控一半。
- 组装：`assemblePrompt(paragraph, template)` 生成时拼装；页内只改变量。
- 存量：`prompt` 非空且无结构化字段 → 走原整串编辑（零迁移）。

### 十四·4 边界与验收

- **不硬性规定三级层级数**；硬性的是：① 全链路一套解析口径；② 数据密集段 ≥1 子点（Warn 不拒单）；③ 第三级不占段落额度、不单独生成。
- 新增 `frontend/tests/DocOutlineHierarchy.test.ts`：`*` 归并、`points` 注入、`siblings` 不含子点、`heading` 过滤四条断言。
- 人工目检：生成页逐章展开，章内条目数 == 该章 `###` 数（不再等于 `###` + `*`）。

## 十五、动态标题层级：级数 = f(体裁, 体量)，提示词禁写固定数字（P0 措辞 / P1 承载）

> 触发：用户问「文章到底写几级合适？有的一级够、有的要 4 级甚至 6 级，知识库写作怎么实现」。
> 结论（**用户已确认**）：级数不是系统常量，由两轴决定——**体裁轴给上界 `maxLevel`，体量轴给实际深度**，两者取小。
> 「写死三级」的真错不在"三"这个数字，而在**把结构决策放进了提示词**：不可单测、不可按文档取不同值、改一次要重跑全部金标。
> 分工原则：**模型管分层（内容该分几层），代码管压平（把任意层数压进架构）**。

### 十五·1 事实核对（本轮实测，旧结论有两处已失效）

| 事实 | 证据 | 与旧备忘的差异 |
|---|---|---|
| 模板循环已是**三层** | 解 `docTemplate-simple.docx` 的 `word/document.xml`，循环标签实测为 `{#chapters}{#paragraphs}{#points}{/points}{/paragraphs}{/chapters}`；可见标签仅 `{title}{company}{department}{author}{curDate}` + 3×`{label}` + 1×`{content}` | 旧「只有两层循环」**作废** |
| `{#points}` **没有 `{content}`** | 同上：全文仅一个 `{content}`，位于 `{#paragraphs}` 内 | ⇒ `####` 只有 label，**无正文承载位** |
| 目录已是真 TOC 域 | `w:dirty` 实测存在 | 旧「手搓目录 + `_Toc182955958` 重名」**作废**，勿再引用 |
| `DocBlockInjector.ts` **不解析 Markdown** | 全文 grep 无 `heading`/`pStyle`/`styleId`/`markdown`；只做块注入与题注（`buildTableXml`:95、`buildFigureXml`:139、`captionParagraph`:61） | ⇒ 段正文里写 `#####` 只会变成字面文本 |
| styleId 实测存在 1/2/3 | document.xml `w:val` 取值集合含 1/2/3 | heading 4～6 **需补 styles.xml** |
| 提示词三个固定数字 | `OutlinePromptComposer.tsx:288`（3～5 章）、`:289`（2～4 段）、`:290`（0～4 个 ####） | 这就是"写死"的落点 |
| skeleton 与体裁包直接拼接 | `buildDocOutlineSystemPrompt` `:643-646` = `DOC_OUTLINE_SKELETON + '\n' + DOC_DOMAIN_PACKS[p].prompt` | ⇒ **插值点在这里** |
| 体裁包无层数字段 | `DOC_DOMAIN_PACKS` `:587-611`，类型 `{label, prompt}`，5 个包 generic/selection/report/research/review | 需加 `maxLevel` |

**承载位天花板（动手前务必记住）**

| 级 | Markdown | 数据对象 | 正文承载 | 生成单元 |
|---|---|---|---|---|
| 1 | `#` | docTitle | 有（`{title}` 封面） | 否 |
| 2 | `##` | `Chapter`（`ViewItem4Doc.ts:169`） | 无（纯容器） | 否 |
| 3 | `###` | `Paragraph`（`:100`） | 有（`{content}` + blocks） | **是**（一次 HTTP） |
| 4 | `####` | `Paragraph.points[]`（`:119`） | **无，仅 label** | 否 |
| 5+ | `#####` | 无对应对象 | 无 | — |

推论：**当前真标题上限 = 3 级 + 1 层要点**。P0 只能把 `maxLevel` 用到 2～3；要 4～6 级必须先做 15.3.4 打开承载位。

### 十五·2 设计：两轴定级

**轴 1 · 体裁（上界）** —— `DOC_DOMAIN_PACKS` 每项加 `maxLevel`：

| 包 | 体裁 | maxLevel | 理由 |
|---|---|---|---|
| report | 汇报/简报 | 2 | 结论先行，一屏一意 |
| selection | 选品 | 3 | 章-段-数据点 |
| review | 复盘归因 | 3 | 目标-结果-归因-改进 |
| generic | 通用 | 3 | 兜底 |
| research | 调研研究/白皮书 | 4 | 方法、归因需要「节」做归组 |
| （P2 新增）standard / manual | 标准、教材手册 | 5～6 | 条-款-项 |

**轴 2 · 体量（实际深度）** —— 段数 `N = 总字数 ÷ 300`（每段字数取 14.3.4 的 budget 均值），让每层平均分支落在 3～4：`depth ≈ ceil(log₃.₅ N)`

| N（段数） | 总字数 | 结构深度 | 配置 |
|---|---|---|---|
| ≤6 | <2k | 1 层 | 章即段，无容器 |
| 7～15 | 2k～4k | 2 层 | 章 × 段 |
| 16～40 | 5k～12k | 3 层 | 章 × 节 × 段 |
| 41～100 | 12k～30k | 4 层 | + 小节 |
| >100 | >30k | 5 层 | + 条 |

**实际深度 = min(体裁 maxLevel, 体量 depth)**。

### 十五·3 四步修法（按 PR）

**15.3.1（P0）提示词改「条件义务」，数字全部变量化**

替换 `OutlinePromptComposer.tsx:286-290` 的【层级】段（骨架里用 `{maxLevel}` 占位，**在 `buildDocOutlineSystemPrompt` 插值**）：

```
【层级·按内容需要分层，不按固定层数】
1. 全文 1 行一级标题（「# 」，短名 ≤20 字）。
2. 最深不超过 {maxLevel} 级。用几级由内容决定：
   - 同一父节点下不足 2 个子节点时，禁止分这一层（宁可少一级，不要空壳层）。
   - 同一父节点下超过 6 个子节点时，应再分一层。
   - 禁止「只有 1 个子节点」的中间层（如 1.1 下面只有 1.1.1），那是空壳。
3. 章用「## 」，段用「### 」，数据点/对照点用「#### 」。
4. 严禁「* / + / -」充当层级（会被当成新段落独立成文）。
5. 标题不得为空壳词（概述/小结/其他/背景）；命中则并入父层。
```

- 插值点（`buildDocOutlineSystemPrompt` `:643-646`）：
  ```ts
  const p = pack && DOC_DOMAIN_PACKS[pack] ? pack : 'generic';
  const L = DOC_DOMAIN_PACKS[p].maxLevel ?? 3;
  return DOC_OUTLINE_SKELETON.replace(/\{maxLevel\}/g, String(L)) + '\n' + DOC_DOMAIN_PACKS[p].prompt;
  ```
- **保留** `:291-303` 全部质量约束（段题瘦身、数字下沉、结论章）——那些是质量约束不是层数约束，动它们会回退十三·A。
- 注意：`selection` 包 `:595` 里的「3～5 章」是章数不是层数，属体裁惯例，**暂保留**（P2 再评估）。

**15.3.2（P0）纯函数 `normalizeDocDepth` —— 压平规则，可单测**

新建 `frontend/src/components/DocUtil/docHeadingDepth.ts`（与 `docOutlineStructure.ts` 同层；**纯函数、不 import 服务**，避免 UNC 下 jest 崩，见九·9·1）。

```ts
export interface DocDepthOpts {
  maxLevel: number;      // 体裁轴
  targetDepth?: number;  // 体量轴，可选
  minSiblings?: number;  // 默认 2
  maxSiblings?: number;  // 默认 6
}
export function normalizeDocDepth(
  chapters: Chapter[],
  opts: DocDepthOpts,
): {chapters: Chapter[]; notes: string[]} {
  // R4 空洞剔除（最先做，避免空壳层参与后续计算）
  //   段题命中 ^(概述|小结|其他|背景|说明|前言)$ 且 points 空 且 content 空 → 删段
  // R1 单子塌陷：章内 paragraphs.length === 1
  //   → 章降级为「段级容器」：章保留 title，段的 points 上提为章级，
  //     章成为唯一生成单元，原段移除
  // R3 宽度约束：章内 paragraphs.length > maxSiblings
  //   → 只 notes.push(Warn)，不自动拆章（拆章需语义，交给模型重出）
  // R2 深度截断：层级 > maxLevel 的部分
  //   → P0：把 paragraph.points 并入该段 prompt 引导语「【本段要点】a、b、c」并清空 points
  //   → P1：points 改挂 level 字段，交 15.3.4 决定渲染成 hN 还是要点
  return {chapters, notes};
}
```

- 调用点：`getChaptersFromContent` 之后、`checkChapter` 之前；`notes` 走现有 Warn 通道，**不拒单**。
- **R1 必须排在 R2 前面**：`maxLevel` 开大而内容少时，会先长出「6 层每层 1 个节点」的竹节结构 —— 要禁止的不是"更深"，是"更空"。

**15.3.3（P0）容器扁平化 —— 模板零改动**

不改 `Chapter/Paragraph` 两层模型，用「零内容段」表达容器：

```ts
// Paragraph 增字段（ViewItem4Doc.ts:100-128）
level: number = 3;   // 2=章级容器 3=段 4/5/6=更深标题（P1 启用）
isContainer(): boolean {
  return !this.content && this.blocks.length === 0;
}
```

- 生成循环 `KbOutlineGenDoc.tsx:377`、`AiOutlineGenDoc.tsx:254` 加：
  ```ts
  if (paragraph.isContainer()) { continue; }   // 容器不发 HTTP
  ```
  **与 14.3.2 的 `heading` 过滤是两条独立闸，都要保留**（14.3.2 拦 `*`，这条拦容器）。
- 编号 `2.3.1`：遍历时维护 `counters[level]` 写进 `label` 前缀（渲染前完成，不进 prompt）。
- 模板 `{#chapters}{#paragraphs}` 照跑，容器渲染成"只有标题的空段" ⇒ **模板一行不改**。

**15.3.4（P1）`applyHeadingLevels` —— 按 level 定样式，打开 4～6 级**

- 落点 `DocBlockInjector.ts`（已有 `injectDocBlocks(zip, seq)` `:242` 的 XML 后处理先例，可复用 `findDocBlockAnchors` `:176` 的定位思路）：
  ```ts
  export function applyHeadingLevels(zip: PizZip, plan: Array<{level: number}>): void
  // 遍历 word/document.xml 的 <w:p>，命中段标题 → 改 w:pPr/w:pStyle 为 heading{level}
  ```
- 调用点：`KbOutlineGenDoc.tsx:234` / `AiOutlineGenDoc.tsx:197`（`injectDocBlocks` 之后）。
- 依赖：`styles.xml` 补 heading 4/5/6；**若改样式有风险，先退化为直接格式**（`<w:rPr><w:b/><w:sz/></w:rPr>` + `w:ind` 缩进），跑通再换样式。

### 十五·4 单测（新建 `frontend/tests/docHeadingDepth.test.ts`）

UNC 下**必须** `jest.mock("@/services/chatchat/kb")`（九·9·1）。四个用例：

| # | 用例 | 输入 | 断言 |
|---|---|---|---|
| 1 | R1 单子塌陷 | 章内 1 段 0 点 | 该章成为唯一生成单元、原段移除；`生成单元数 === 章数` |
| 2 | R2 深度截断 | `maxLevel=2`，某段 3 个 points | `points.length === 0` 且该段 prompt 含「【本段要点】」三个条目 |
| 3 | R3 宽度 Warn | 章内 8 段、`maxSiblings=6` | 结构**不变**（不自动拆章），`notes` 含 1 条 Warn |
| 4 | R4 空洞剔除 | 段题「概述」+ 无 points + 无 content | 该段被删，`paragraphs.length` 减 1 |

附加（同文件）：`buildDocOutlineSystemPrompt('report')` 输出含「最深不超过 2 级」；`('research')` 含「不超过 4 级」。
CI：`.github/workflows/ci.yml:29` 的 `--testPathPattern` 清单加入 `docHeadingDepth`。

### 十五·5 依赖顺序、验收与负面清单

- **先十四，再十五**：`14.3.1`（`*` 归并）未落地前，`*` 会污染 `paragraphs` 数组，15.3.3 的容器判定会被误伤。
- 分期：
  - **P0**：15.3.1 + 15.3.2 + 15.3.3（级数仍限 2～3，风险最低，先解决"该 2 级被逼出 3 级"）。
  - **P1**：15.3.4 + `styles.xml` 补 heading 4/5 → 开到 4～5 级。
  - **P2**：体裁包 `maxLevel` 全量（含 standard/manual 的 5～6 级）。
- 验收：
  - 机器：`normalizeDocDepth` 输出中任何父节点的子节点数 ∈ [2, 6]，`notes` 无「单子层」告警。
  - 人工：同一主题跑 `report`（应为 2 级，无 `####` 空层）与 `research`（应出现节级容器），对比层级分布。
- 负面清单：**不做**自动拆章/自动合并章（需语义，交给模型重出）；**不做**运行时动态调层级（段落 `Promise.allSettled` 全并行，必须在解析后、生成前一次算完）。

## 十六、字数 A/B 实测结论（**本章无执行项**，执行仍按第十五章）

> 触发：用户问「第 4 条那组 A/B 验证跑了吗？还是要字数变量」。
> 答：**已真跑**（deepseek-chat，10 段 × 3 档 = 30 次调用 + 校准档 10 次，全部成功）。十四·3.4 里两条**经验判断**现已被实测数据替换，公式不变。
> 完整报告：`docs/2026-10-20-word-budget-ab.md`；可复跑脚本：`.workbuddy/tools/ab_word_budget.py`。

### 十六·1 实测结果

| 档 | 指令 | 均值 | 标准差 | CV | 命中率(±20%) | 最短/最长 |
|---|---|---|---|---|---|---|
| A | 不给字数 | 352.4 | 114.3 | **0.32** | 40% | 169 / 571 |
| B | 「撰写 200~400 字」（现状） | 336.9 | 39.1 | 0.12 | **20%** | 260 / 392 |
| C | 「撰写约 N 字」，N=150+60×要点数 | 220.8 | 35.2 | 0.16 | **90%** | 143 / 273 |
| D | 同 C，base=170（校准用） | 249.5 | 31.3 | 0.13 | 70% | 199 / 291 |

按要点数看偏差（C 档）：2 要点 −11%~+1%；1 要点 −0%~+7%；0 要点（结论段）+27% / −5%。

### 十六·2 对十四·3.4 的三处更正（**请按此覆盖旧表述**）

1. 「不给字数 LLM 会**偏短**且段间方差大」→ **错**。实测是**偏长且失控**：均值 352、区间 169~571、CV 0.32（B 档的 2.7 倍）。长度由材料量决定，不由段落需要决定。
2. 「区间写法模型易取下界」→ **错**。模型挤向**区间中段**（约 336 字）。
3. **新增（关键）**：B 档 CV 最低（0.12）是**假整齐**——所有段被拉到同一长度，0 要点结论段被写到 330~392 字（目标 150，超写 120%~161%）。**评价字数效果要看命中率/偏差，不能只看 CV。**

### 十六·3 结论

- **字数变量要保留，且必须是单值（「约 N 字」），区间写法（200~400）废弃。**
- **公式确认不变**：`budget = 150 + points × 60`，clamp `[150, 600]`；base 170 的校准档命中率反而降到 70%，base 保持 150。
- 残留偏差只有一条：0 要点结论段仍 +27%，建议结论章单独下调（×0.85 或 base 130）——**该项未实测**，不进本轮改动。
- 十五·2 体量轴 `N = 总字数 ÷ 300` 与实测量级（220~350）一致，可沿用。

### 十六·4 局限（勿过度外推）

单模型（deepseek-chat）、单主题、单份固定材料（未接检索），每段每档仅 1 次采样 ⇒ 只证明「字数指令对长度的控制力」，不评价内容真实性，换模型需重跑。

### 十六·5 真实大纲复跑（**修正十六·2 第 1 条**）

> 输入：用户提供的真实大纲《抖音商务衬衫polo选品分析》——4 章 / 13 段 / 29 要点，**要点数全部 2~3，无 0 要点段**。
> 材料改用大纲自带真实要点（不再用虚构摘要）。13 段 × 3 档 = 39 次调用全部成功。完整正文对照：`docs/2026-10-20-ab-samples.md`。

| 档 | 均值 | CV | 命中率 | （样例大纲·要点 0~2） |
|---|---|---|---|---|
| A 不给字数 | 220.5 | 0.18 | **23%** | 352.4 / 0.32 / 40% |
| B 「200~400」 | 294.4 | 0.14 | **77%** | 336.9 / 0.12 / 20% |
| C 「约 N 字」 | 299.5 | 0.17 | **77%** | 220.8 / 0.16 / 90% |

目标均值 297.7；C 299.5、B 294.4 均对准，A 220.5 系统性偏短 26%。

**修正 1（覆盖十六·2 第 1 条）**：A 档不是固定"偏长"，而是**长度由材料量决定**——样例大纲材料是长摘要 → 352（偏长）；真实大纲材料只有 2~3 条要点 → 220（偏短）。统一表述：**不给字数 ⇒ 长度由材料量牵着走，不由段落需要决定。**

**修正 2**：B 档这次 77% 与 C 持平，因为该大纲所有段目标都在 270~330，正好落在「200~400」中段。样例大纲有 0 要点段（目标 150）时 B 才塌到 20%。
⇒ **变量化的真实收益 = 应对要点数不均匀的大纲**（含 0 要点结论段时 B 会系统性灌水）。保留变量的理由从"均值更准"改为"**抗不均匀 + 防灌水**"，公式 `150 + 60n` 不变（目标均值 297.7 vs 实际 299.5）。

**正文质量实证**：「polo衫主力价格带」C 档 316 字，逐个解读三个价格带并给出「主战场 / 流量入口 / 溢价试探」的主次布局；A 档 216 字只有罗列、无结论。「属性配置取舍」B 档被灌到 374 字（目标 270，+39%），出现明显重复啰嗦。


## 十七、字数公式实测修正 + docTitle 空兜底（P0，**覆盖** 十四·14.3.4 的部分实现）

> 本章基于 `docs/2026-10-20-word-budget-ab.md` 与 `docs/2026-10-20-ab-samples.md` 的 39 次真实调用实测（真实 polo 大纲 4 章 13 段 × A/B/C 三档）。
> **执行本章前须已落地**：十五·15.3.1/15.3.2/15.3.3、十四·14.3.1/14.3.2/14.3.4/14.3.5（见 `.workbuddy-handoff.md` 2026-10-20 三条回执）。

### 十七·0 一句话

十四·14.3.4 把字数收敛到 `docWordBudget.ts` 单一真源，**这个架构是对的，保留不动**。但公式写成了**常量区间**、且**与要点数无关**，与实测结论冲突。本章只改**公式**和**措辞**，不推翻架构、不动 UI 结构。

### 十七·1 现状盘点（已实测，勿重复改）

| 文件 / 位置 | 现状（Cursor 已落地） | 本章是否要改 |
|---|---|---|
| `docWordBudget.ts` 单一真源 | ✓ 已建，`DOC_WORD_BUDGET` / `wordBudgetFor` / `clampWordBudget` / `formatWordBudgetZh` | **改公式与格式化** |
| `DOC_WORD_BUDGET.heading` | `{min:200, max:400}` | 改为要点数驱动 |
| `DOC_WORD_BUDGET.body` | `{min:120, max:280}` | 同为要点数驱动（基数不同） |
| `DOC_WORD_BUDGET.container` | `{min:0, max:0}` | **不动**（容器已被 `paragraphsToGenerate` 过滤，不发请求） |
| `wordBudgetFor(p)` 入参 | `{heading?, container?, wordBudget?}` | **加** `points` / `pointGuide` / `prompt` |
| `ViewItem4Doc.ts:1199` `paragraph.wordBudget = wordBudgetFor({...})` | ✓ 已接 | 传入要点源 |
| `ViewItem4Doc.ts:278` `直接输出约 ${zh} 字连贯正文` | 区间措辞 | **改单值** |
| `ViewItem4Doc.ts:339` `撰写大约${zh}个字左右的具体内容` | 区间措辞 | **改单值** |
| `parseChatCompletion.ts:163` `输出形态是文章段落（约 ${zh} 字）` | 区间措辞 | **改单值** |
| `KbOutlineGenDoc.tsx:390/401`、`AiOutlineGenDoc.tsx:261/272` `buildKbDocWritingConstraintPrompt(wordBudgetFor(paragraph))` | ✓ 已按段传预算 | 随公式自动生效，无需改 |
| `outlineJson.ts:530-539` `docTitle` | ✗ 缺兜底 | **新增**（十七·3） |

### 十七·2 P0-1：字数改成要点数驱动的单值

#### 17.2.1 陷阱（**最重要，先看这条**）

`maxLevel≤3` 时 `normalizeDocDepth` 会把 `####` 折进 `pointGuide` 并**清空 `points`**（你自己的实现）。所以：

> **禁止用 `paragraph.points.length` 当要点数** —— 它绝大多数时候是 `0`，会让所有段都拿到 base 150。

必须用已存在的 `paragraphPointLabels(p)`（`ViewItem4Doc.ts:405`，回退链 `points → pointGuide → 整串抠【本段要点】`）：

```ts
const n = paragraphPointLabels(paragraph).length;
```

#### 17.2.2 公式

```
budget = clamp(BASE + 60 × n, 150, 600)
BASE: heading 段 = 150 ；body 段 = 120
```

实测依据（真实大纲 13 段，要点数 2~3）：目标均值 297.7 vs 实际均值 299.5；命中率（±20%）C 档 77%，与现状区间档持平但**抗不均匀**——样例大纲含 0 要点结论段时，区间档塌到 20%，单值档仍 90%。

#### 17.2.3 保留 `{min, max}` 结构，加单值分支（改动最小）

不要改 `WordBudget` 的类型定义，否则 `InputNumber` / `clampWordBudget` / 存量数据全要动。做法：

- 让 `min === max === N`
- `formatWordBudgetZh` 加分支：`min === max` → 返回 `${min}`（原样返回 `"270"`，而不是 `"270～270"`）

这样 `ViewItem4Doc.ts:278/339`、`parseChatCompletion.ts:163` 三处的 `${zh}` 自动从「200～400」变成「270」，**措辞一行都不用改**。

#### 17.2.4 措辞（**仅当三处模板句仍读起来别扭时才动**）

`ViewItem4Doc.ts:339` 现在是 `撰写大约${zh}个字左右`——`"大约"` + `"左右"` 双重写模糊。建议改成：

```ts
`文章标题是<${opts.docTitle}>，请为它的【${opts.chapterTitle}】章节中的段落： [${paragraph.title}]撰写约${zh}字的具体内容。`
```

实测用的就是「撰写约 N 字的正文」这一句，命中率数据基于它。

#### 17.2.5 单测补充（`frontend/tests/docWordBudget.test.ts`）

在既有套件里补 4 例：

1. `n=0` → 150（heading）/ 120（body）
2. `n=3` → 330
3. `n=20` → 600（clamp 上界生效）
4. **要点在 `pointGuide` 里（points 为空）时，仍算出正确 n** ← 这条是 17.2.1 的回归位，缺了就会静默退化

### 十七·3 P0-2：`docTitle` 空兜底（真实大纲实测暴露）

`docs/2026-10-20-ab-samples.md` 用的真实大纲**第 1 行就是 `## 大盘机会与品类位次`，全文无 `#`**。

`outlineJson.ts:530-539`：

```ts
let docTitle = "";
...
if (h1) { docTitle = h1[1].trim(); continue; }
```

无 `#` 行 → `docTitle` 保持 `""` → 模板 `{title}` 渲染成空 → **导出 docx 封面标题丢失**。这不是样例问题，用户手改/模型输出都可能没有 `#`。

**修法（三级回退，在 `markdownToOutlineStructure` 末尾补）**：

1. `docTitle` 非空 → 原样用
2. 否则取**第一个 `##` 章节标题**的「上位词」——不要直接拿 `## 大盘机会与品类位次` 当文档标题（它是章名不是文名）
3. 都没有 → 用**文件名/会话标题**（调用方传入的 `fallbackTitle`），再兜底 `"未命名文档"`

**同时**：`ViewItem4Doc.ts:339` 拼的是 `文章标题是<${opts.docTitle}>`——docTitle 为空时这句变成 `文章标题是<>`，模型会失去全文定位。兜底必须同时覆盖这里。

### 十七·4 P1（**未实测，本章不落地，先别写死**）

实测残留一条：0 要点的结论段仍超写约 +27%。建议结论章 ×0.85，**但我没跑过这个变体**，所以：

- **不要**直接把 `isConclusion ? 0.85 : 1` 写进 `docWordBudget.ts`
- 若要落地，先用 `.workbuddy/tools/ab_word_budget.py` 跑 `--tiers C,E`（E = C×0.85 on 结论章）确认有效
- 在此之前，`AssembleDocParagraphOpts.isConclusionChapter` 字段**保持存在但不参与计算**

### 十七·5 验收与负面清单

**验收**
- `jest docWordBudget / docOutlineAlign / docHeadingDepth / docTitleFidelity` 全绿
- 手工核对：真实 polo 大纲 13 段，要点数 2~3 → 预算应落在 270~330，无一段是 150 或 400（出现即说明 17.2.1 退化）

**负面清单（禁止）**
1. 禁止用 `paragraph.points.length` 算要点数（17.2.1）
2. 禁止把 `WordBudget` 从 `{min,max}` 改成单数字——会牵动 `InputNumber`、存量 `promptManual` 大纲
3. 禁止改 `DOC_WORD_BUDGET.container`（容器不生成，改了无意义且会污染 clamp）
4. 禁止在未跑 A/B 前写死结论章系数（十七·4）
5. 禁止动 `docWordBudget.ts` 的「单一真源」定位——三处硬编码收敛是你做对的，别退回


## 十八、结论章系数**撤销** + 十五·15.3.4 排期（heading 4~6 承载位）

> 本章基于 `docs/2026-10-20-word-budget-ab.md` 第八节（46 次调用）与 `docTemplate-simple.docx` 二进制实测。
> 前置：十七章 P0（字数公式 + docTitle 兜底）。

### 十八·0 一句话

**十七·4 的「结论章 ×0.85」跑出来是负效果，予以撤销。** 十五·15.3.4 的门槛比第十五章预估的低——模板里 heading 1~9 **全部已完整定义**，但发现一个新的 P0：**TOC 域硬编码 `\o "1-3"`，开到 4 级也不会进目录。**

### 十八·1 撤销十七·4（结论章系数）

**实测结论：不要加任何结论章系数。**

| 大纲 | C 档（原公式） | E 档（结论章 ×0.85） |
|---|---|---|
| 样例（10 段） | **100%** 命中 | 90% |
| 真实 polo（13 段） | **92%** 命中 | 69% |

真实大纲结论章三段目标均为 270（E 档指令 230）：C 档 259/265/255（−4%/−2%/−6%，全命中）；E 档 181/253/191（−33%/−6%/−29%，两段脱靶）。**结论章本来就不超写，打折只是把它压到脱靶。**

同时证伪了十七·4 的依据：「0 要点结论段 +27% 超写」在重跑中是 **+3%**——是噪声不是偏差。

**执行要求**：`AssembleDocParagraphOpts.isConclusionChapter` **保留但不参与字数计算**，并且不要新增任何按章类型打折的逻辑。

### 十八·2 新增判据：单次效应 > 2σ 才可改 prompt

同指令重跑两次，逐段相减得噪声：

| 大纲 | σ | 相对均值 |
|---|---|---|
| 样例 | 19.5 字 | 8.8% |
| 真实 | 42.1 字 | 14.0% |

> **判据：单次 A/B 观测到的差异必须 > 约 20%~28%（2σ）才可据此改 prompt；低于此值一律当噪声。**

- 成立：B 档区间写法系统性超写（+45%~+161%，远超 2σ 且多段同向）
- 成立：C 档无系统偏差（逐段 ±11%，在 σ 内）
- **不成立已撤销**：0 要点段 +27%（1.3σ，单段单次）

后续任何人提「某类段落偏长/偏短，加个系数」，先按这条判据卡：样本 ≥3 段、效应 >20% 才动。

### 十八·3 十五·15.3.4 排期（P1，现可开工）

#### 18.3.1 先修正第十五章的一个误判

第十五章写「模板实测已有 styleId 1/2/3，4~6 需在 `styles.xml` 补」——**这条作废**。实测 `word/styles.xml`：

| styleId | name | sz | outlineLvl | pPr/rPr |
|---|---|---|---|---|
| 1 | heading 1 | 30 | 0 | ✓ |
| 2 | heading 2 | — | 1 | ✓ |
| 3 | heading 3 | 24 | 2 | ✓ |
| 4 | heading 4 | 24 | 3 | ✓ |
| 5 | heading 5 | — | 4 | ✓ |
| 6 | heading 6 | — | 5 | ✓ |
| 7~9 | heading 7~9 | — | 6~8 | ✓ |

**heading 1~9 全部已定义且含 outlineLvl，样式表不用改。** 第十五章预估的「补样式」工作量归零。

#### 18.3.2 但要做的三件事（其中一条是新发现的 P0）

**(a) `applyHeadingLevels()` —— 缺，这是 15.3.4 本体**
`DocBlockInjector.ts` 现在只做 table/figure 注入与 SEQ 题注，不写 `w:pStyle`。需新增一步：遍历段落，按 `paragraph.level` 把 `w:pPr/w:pStyle` 写成 `w:val="{level}"`。

现状已就位，可直接接：
- `Paragraph.level: number = 3`（`ViewItem4Doc.ts:130`）
- `Paragraph.container: boolean`（`ViewItem4Doc.ts:134`）
- `applyDocHeadingNumbers(chapters)`（`docHeadingDepth.ts:92`）已负责编号

**(b) TOC 域收录级别 —— 新发现，P0，第十五章没写到**
`word/document.xml` 里 TOC 域是硬编码：

```
TOC \o "1-3" \h \z \u
```

**`\o "1-3"` 表示目录只收录 1~3 级。** 即使 (a) 把某段写成 heading 4，它也**不会出现在目录里**。要做 4 级以上，必须让这个域按 `maxLevel` 动态生成：`TOC \o "1-{maxLevel}"`。

注意：`w:dirty="true"` 已生效（打开时 Word 会刷新），所以改域指令即可，不用重建书签。

**(c) 3 级与 4 级视觉不分层 —— 小坑，建议一并处理**
实测 styleId 3 与 4 的 `w:sz` **同为 24**，开到 4 级后会出现「3 级标题和 4 级标题一样大、只差缩进」。建议在 `styles.xml` 把 heading 4 的 `sz` 调到 22（或改用加粗/颜色区分），否则用户会说"分了层但看不出来"。

#### 18.3.3 分期

- **P1-a**：(a) `applyHeadingLevels` + (b) TOC 域动态化 —— 做完即真正支持 4~6 级
- **P1-b**：(c) 字号区分；`DOC_DOMAIN_PACKS` 各包声明 `maxLevel`（原 P2，随 P1-a 一起更省事）

### 十八·4 验收与负面清单

**验收**
- 构造一份 4 级大纲（章 → 节 → 段 → 子段）导出 docx，用 python-docx 读回：段落 `style.name` 应出现 `heading 4`；目录域应为 `\o "1-4"`
- 构造一份 2 级大纲：不应出现 heading 3 及以上（压平规则仍生效）
- `jest docHeadingDepth / docOutlineAlign / DocTemplate / docTemplateToc / docWordBudget` 全绿

**负面清单**
1. **禁止**加结论章字数系数（十八·1）
2. **禁止**改 `styles.xml` 补 heading 4~6——已经有了，改了反而破坏（18.3.1）
3. **禁止**只做 (a) 不做 (b)：4 级标题不进目录，等于分层对读者不可见
4. **禁止**把 TOC 域写死成 `\o "1-9"`：应按 `maxLevel` 动态生成，否则短文档目录会出现空层
5. **禁止**用单次 A/B 的低幅度差异（<20%）改 prompt（十八·2）


## 十九、成品实测：`抖音商务衬衫polo选品分析-Ai-v2026920.docx` 体检（**两个新 P0**）

> 样本：用户提供的 Ai 页产物（**生成于 2026-09-20，早于十七/十八章的修复**）。对照版：同大纲 + C 档字数契约生成的 13 段。
> 体检脚本：`.workbuddy/tools/audit_docx.py`、`.workbuddy/tools/leak_impact.py`（可复跑）。
> **注意时效**：本章里"字数失控""层级错乱"两项可能已被 10-19/10-20 的修复覆盖，落地前先重跑体检脚本确认；但 **19.2 与 19.3 是现存代码问题，不受时效影响**。

### 十九·1 体检结果

| 指标 | Ai 版产物 | 同大纲 C 档对照 |
|---|---|---|
| 段数 | 13 | 13 |
| 字数均值（目标 297.7） | **351.6（+18.1%）** | 290.9（−2.3%） |
| 命中率 ±20% | **5/13 = 38%** | **12/13 = 92%** |
| 最长 / 最短 | 517 / 138 | 366 / 230 |
| 层级样式 | heading 1×4、**heading 2×3、heading 3×10** | heading 1×4 + heading 2×13（一致） |
| 标记泄漏 | **figureref 6 + 围栏 ``` 20** | 0 |
| 幻觉引用 `[文档N]` | **17 处** | 0 |
| 图 / 表 | **0 张图**（media 空）、表可疑 | 未接资产，无 |

### 十九·2 P0-A（**新，交接里没有**）：Ai 页出现幻觉引用

Ai 页**没有知识库检索**，产物却有 17 处 `[文档1][文档2][文档3]`。

根因：`buildKbDocWritingConstraintPrompt`（`parseChatCompletion.ts:145-170`）第 4 条写死了「可在句末用 `[文档1][文档2]` 标注引用」，而 `AiOutlineGenDoc.tsx:261/272` **无条件**把它追加到 Ai 页的段 prompt（回执 2026-09-28T14:08 只提到接了 scrub 与资产，没提条件化）。模型在没有真实检索材料时**照着这条编造引用**。

**修法**：`buildKbDocWritingConstraintPrompt` 增加参数（或 Ai 页传 `hasRetrieval: false`），无检索时第 4 条整条不追加，并显式禁止输出任何 `[文档N]` 标记。同时建议在生成后加一道正则闸：若本次无检索却出现 `\[文档\d+\]`，剥离并 Warn。

### 十九·3 P0-B：围栏退化形态未被识别（**字数失控的真因**）

产物里的围栏是退化形态，注入器不识别，于是**整块原文进了正文**。三条真实 fixture（直接拿去当单测输入）：

```
① 图：`figureref:` 取代了 ```figure + ref:
```figureref: kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/elements/..._p1_img1.png
caption: 抖音商务男装衬衫/polo衫热销爆款采样概览（2024.03.19–2024.04.17）```

② 表：`table` 与 `caption:` 粘连成 `tablecaption:`
```tablecaption: polo衫在男装大盘中的位次与增速| 维度 | 位次 | 规模 | 同比 | 环比 | 占大盘 || 销量 | TOP6 | 403...```

③ 两个围栏紧邻、中间无换行分隔
...| 300-400 | 4.9万 | 1.64% | 34.12% | 29.65% |``````figureref: kb:...
```

**这不是小瑕疵，它同时造成了另一个 P0。** 把泄漏的围栏文本剔除后重算：

| | 原样 | 去围栏后 |
|---|---|---|
| 均值 | 351.6（**+18.1%**） | 304.9（**+2.4%**） |
| 命中率 | 5/13（38%） | **9/13（69%）** |

**即字数"失控"里有 +15.7pp 是泄漏文本撑出来的，不是字数指令失效。** 修注入器 = 同时修好泄漏与字数两个问题，优先级应排在调字数公式之前。

> **【已作废，见 21.14】** 本表的 351.6 / +18.1% / 304.9 / +2.4% 四个数是**错误正则**（`<w:t[^>]*>` 误匹配 `<w:tcPr>`）算出来的。
> 用带边界的正则 `<w:t(?: [^>]*)?>` 重算：均值 **291.4（−2.1%）**、命中 5/12。
> **方向仍成立但理由要换**：不是"均值超标"，而是**分布被污染**——含 figure 泄漏的段 +34%~+40%，结论章 −45%~−54%，两者在均值上互相抵消。
> 所以仍应先修围栏，因为修完分布会变，那时才谈得上重估 `150+60n` 的 base。**现在不要动公式。**

**修法建议**：不要靠"让模型别写错"——实测证明模型会稳定退化。在**围栏切分阶段**做**容错归一**：

> **【落点更正，见 22.3】** 这里原文写的是 `DocBlockInjector.ts`，**写错了**。
> 切围栏的函数是 `absorbBlocksFromParagraphContent`，定义在 **`ViewItem4Doc.ts:724`**；
> `DocBlockInjector.ts:348` 只是 import 后调用。十九章实际落地（见 handoff 20:40）也做在了
> `docFenceNormalize.ts` + `ViewItem4Doc.ts:730/:941`——**实现是对的，是我交接里的落点写错了**。
> 后续凡涉及"围栏识别/归一化/丢弃"的改动，一律落在 `ViewItem4Doc.ts` / `docFenceNormalize.ts`。

1. 围栏开头取 ``` 后第一个词，前缀匹配 `table` / `figure` / `figureref` 都认（允许 `tablecaption:`、`figurecaption:` 这类粘连）
2. `caption:` 若与前一行/开头粘连，按 `caption:` 关键字切分
3. 连续 ``` ``` 视为两个块
4. 无法归一化的块 → **丢弃并 Warn**，绝不留原文进正文（宁可少一张图）

### 十九·4 P1：兄弟标题被赋予不同层级

heading 2 只有 3 个且位置随机（1.1 / 2.2 / 3.3），其余 10 个兄弟标题都是 heading 3。后果：目录里 1.1 与 1.2 缩进不同、正文里字号不同，同级内容看起来像两级。

推测与 `Paragraph.level` 默认值 3（`ViewItem4Doc.ts:130`）及 `normalizeDocDepth` 的容器判定有关：某些分支把首个段落误升为 2 级。**落地前先用体检脚本确认是否已随十七章修复。**

### 十九·5 P2：结论章靠「（推演）」撑篇幅

4.1「主推与试单分层」只有 **138 字（目标 270，−49%）**，正文出现 3 处「（推演）」；4.3 有 4 处。模型在没有材料时自己标注了推测身份——但正式文档里不应该出现这种标记。

这本质是**材料分配**问题（任务 4B）：结论章拿到的材料不足，只能写推演。修法不在 prompt，在于让结论章拿到前几章已生成的事实（账本/摘要注入）。

### 十九·6 对照版

同大纲 13 段 + C 档字数契约生成的对照版已落盘（见 `docs/2026-10-20-docx-audit.md`）。**说明对照版只验证了字数与结构，没有接真实检索与图资产**，内容深度与它不在同一可比维度——它引用的数字（7280.1万 / 172.6万 / 72.18% 等）与大纲一致，说明双方材料同源，主要差距在**契约执行**而非素材。

### 十九·7 验收

- 重跑 `.workbuddy/tools/audit_docx.py`，目标：figureref=0、```=0、`[文档N]`=0（Ai 页）、层级 heading 2 计数 = 段落总数
- 新增单测 `docFenceDegrade.test.ts`，用 19.3 的三条 fixture：① 归一化成 figure 块 ② 归一化成 table 块 ③ 切分成两块；再补一条"无法归一化 → 丢弃不留原文"
- `jest docWordBudget / docHeadingDepth / docOutlineAlign / DocTemplate` 全绿


## 二十、新指标：段落开头句式同质化（内容层，此前未测）

> 来源：2026-10-20 用 `style_scan2.py` 对两份 docx + 三档 A/B 原文扫描的实测。
> 本章新增一条**可量化的内容层指标**，并修一条已存在但覆盖不全的提示词禁令。
> 执行优先级：**P1**，排在第十七、十九章之后（十九章修的是字数失真的因果，先做）。

### 20.1 实测数据

扫描口径：取非 heading/Title、清洗围栏文本后长度 >60 字的正文段，匹配 6 类套路开头
（`从X来看/看` `在X上` `落到X` `就X而言` `数据/结果显示` `整体/总体`），再统计模糊限定词密度。

| 样本 | 正文段 | 套路开头 | 模糊限定词 | 开头 4~6 字重复 |
|---|---|---|---|---|
| A 档（不给字数） | 13 | **85%** (11/13) | 0.8 处/段 | `从价格带` ×2 |
| B 档（200~400） | 13 | **100%** (13/13) | 1.2 处/段 | `从价格带` ×3 |
| C 档（约 N 字） | 13 | **92%** (12/13) | 0.8 处/段 | `从价格带` ×3 |
| 对照版 C 档 docx | 13 | **100%** (13/13) | 1.1 处/段 | `从价格带证据` ×2 |
| **毕方 Ai 版 docx（9-20 产物）** | 13 | **15%** (2/13) | 0.4 处/段 | `polo衫的` ×2 |

### 20.2 三条结论

**① 不是字数指令导致的。** A/B/C 三档 85%/100%/92%，差异落在噪声 σ 内。
所以第十七章的字数变量化**不是**这个问题的成因，也不该指望改字数能修好它。

**② 我的 A/B 脚本 100% vs 毕方 15%，差距来自提示词，不是模型。**
同一模型（deepseek-chat）、同一批段落，差别只在提示词里有没有约束首句。

**③ 现存禁令覆盖不全——这是毕方侧真正要改的点。**
`ViewItem4Doc.ts:280` 现有禁令：

```
禁止以「根据知识库」「材料显示」「综上所述」等套话开头或结尾。
```

它只禁了**三类显式套话词**，完全没有覆盖**视角介词短语**——而实测里 10/13 段用的是
「从……来看 / 从……的视角看 / 在……上 / 落到……上」。毕方 Ai 版实测 15% 低，
是因为提示词里的**选品师人设 + 段题直接切入**起了作用，**不是这条禁令的功劳**。
也就是说：这条禁令对人设弱、段题抽象的场景（generic / research 体裁）**会失守**。

### 20.3 修法（两行，改 `ViewItem4Doc.ts:280` 与 `:342`）

把禁令从句式黑名单扩展为「黑名单 + 正向要求」：

```
禁止以「根据知识库」「材料显示」「综上所述」等套话开头或结尾；
禁止以「从……来看 / 在……上 / 落到……上」这类视角介词短语开头——
首句必须直接切入本段的主体（实体名、数据或判断），不得先声明观察角度。
```

正向要求比黑名单更重要：只写"禁止从X来看"，模型会换成"就X而言"继续绕。
`ViewItem4Doc.ts:342`（Ai 页的 `直接输出正文，不要以「根据知识库内容」等套话开头`）同步改。

### 20.4 配套：把这条做成可回归指标

- 扫描脚本已落盘 `.workbuddy/tools/style_scan2.py`（用法 `python style_scan2.py <docx> [标签]`）。
- 建议阈值：**套路开头 ≤ 30%**、**模糊限定词 ≤ 0.6 处/段**。当前毕方 Ai 版 15% / 0.4 达标；
  对照版 100% / 1.1 严重超标。
- 若要做成 jest 断言，可对正文文本跑同一组正则，不需要 docx。

### 20.5 关于对照版 docx 的局限声明（勿误当基线）

`抖音商务衬衫polo选品分析-对照版-C档.docx` 是 **python-docx 直造**的，
**未经过毕方渲染管线**（docxtemplater + DocBlockInjector）。所以：

- 它证明的只有「**正文生成这一层**的字数可控、无标记泄漏」；
- 它**没有 TOC 域**（实测无 `instrText`）、**无表无图**（`w:tbl` 0 / `drawing` 0）——
  这两项是脚本没造，不能据此说毕方管线有问题；
- 它的材料是**大纲要点本身**，不是真实检索结果，所以内容深度不可与线上产物比。

### 20.6 依赖与顺序

无代码依赖，可独立做。但建议排在十九章（围栏容错）之后——
围栏文本会污染扫描样本（不清洗会把 13 段扫成 5 段），
先修围栏，这条指标才能稳定测。

### 20.7 执行顺序提醒（必读，覆盖"只读末章"规则）

`.cursor/rules/workbuddy-task.mdc` 只读**最大编号章**，即本章（二十）。
因此**未执行项在这里显式点名，避免被跳过**：

**⚠️ 第十九章尚未执行，且优先级高于本章。下一轮请先做第十九章，再回来做二十章。**

第十九章待办（代码现状已核实，10-20 20:35）：
1. **Ai 页幻觉引用**：`parseChatCompletion.ts:142` 与 `:162` 第 4 条仍**无条件**写入
   「可在句末用 [文档1][文档2] 标注引用」。Ai 页无检索 ⇒ 模型编造 17 处引用。
   修法：按「本次是否有检索结果」条件追加该条；并在生成后正则闸剥离 `[文档N]`。
2. **注入器围栏退化容错**：`DocBlockInjector.ts` 中**未见** `figureref` / 退化形态识别
   （grep 无命中）。产物里的退化形态是 `figureref:`（非 ```figure + ref:）、
   `tablecaption:` 粘连、两围栏紧邻无分隔 ⇒ 6 个图全部漏掉，原文进正文。

**已确认落地（无需再动）**：
- 十七章 ✅ `docWordBudget.ts:86-97` 已是 `base + 60×countPointLabels` 且 `single()` 单值；
  `outlineJson.ts:569` 已有 `docTitle.trim() || fb || "未命名文档"` 兜底。
- 十八章 ✅ `docHeadingLevels.ts` 已建，`applyHeadingLevels`（:60）+ TOC `\o "1-${L}"`
  动态化（:53）都已实现并在 `AiOutlineGenDoc.tsx:212`、`KbOutlineGenDoc.tsx:247` 接入。

**执行顺序：十九章 → 二十章。**


## 二十一、围栏退化第三批：单行围栏（十九章未覆盖，P0 补漏）

> 来源：2026-10-20 20:45，用 9-20 真实产物 `抖音商务衬衫polo选品分析-Ai-v2026920.docx`
> 逐行还原原文后做的对照实验。脚本 `.workbuddy/tools/verify_fence2.py` / `extract_fixture.py`。

### 21.1 先确认：十九章两条 P0 确实落地了

我复跑了 `npm test -- --testPathPattern=docFenceDegrade`（**8 passed / 8 total，EXIT=0**），
并逐行核了代码，不是只看回执：

- **P0-A ✅** `parseChatCompletion.ts:166` `hasRetrieval = opts?.hasRetrieval !== false`，
  无检索分支第 4 条改为「禁止输出任何 [文档N]/[文档1] 类引注标记，禁止编造出处」；
  `:186` `stripHallucinatedDocCitations` 剥离闸；`AiOutlineGenDoc.tsx:277/:291` 传 `{hasRetrieval:false}`。
- **P0-B ✅** 新建 `docFenceNormalize.ts`，`ViewItem4Doc.ts:730/:941` 接入，
  `absorbBlocksFromParagraphContent` 里无法归一 → 丢弃且**写回清洁正文**（`paragraph.content = plain`）。
- **安全性确认 ✅** 丢弃不会破坏注入契约：`injectDocBlocks` 的 `seq[i]` 允许 `null/[]`
  （替换为空串），`seq.length` 恒等于段数，所以少块不会触发
  「锚点数 ≠ seq」的可见报错分支。

### 21.2 但真实产物验证：figure 0 / table 0

我把 9-20 产物里 **11 个含围栏段落**的真实原文喂进归一化 + 解析，跑三组对照：

| 变体 | figure 块 | table 块 |
|---|---|---|
| A 现行（十九章已落地） | **0** | **0** |
| B + 行尾闭合 `FENCE_END` 放宽 | **0** | **0** |
| C + 行尾闭合 + ref/caption 切分 | **0** | **0** |

三组全 0。原因不是归一化写错，是**真实形态和交接里给的 3 条 fixture 不是同一类**。

### 21.3 真实形态 ~~开栏、内容、闭合**全在一行**~~

> **【已作废，见 21.15–21.17】** "全在一行"是**丢 `<w:br/>` 造成的假象**。
> raw `document.xml` 实测：`figureref` = **0**、`figurecaption` = **0**、`tablecaption` = **0**、`pngcaption` = **5**、`<w:br/>` = **10**（6 figure + 4 table，每块恰好 1 个）。
> 真实形态是 **「半行」**：语言标记（`figure`/`table`）后面**有**一个换行，`ref:` 到 `caption:` 之间**没有**换行，闭合符在**行尾**。
> **不要按本节的字面描述写正则**，请直接跳到 **21.18**。

原文（**已按 `<w:br/>` 还原换行后**，行 42）：

原文（归一化前，`行 42` 实际内容）：

```
…独作为备货结论。```figureref: kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/elements/抖音单品爆款分析-商务男士衬衫polo衫_p1_img1.pngcaption: 抖音商务男装衬衫/polo衫热销爆款概览（采样时间2024.03.19–2024.04.17）```
```

结构（更正后）：`正文 + ```figure + ⏎ + ref: kb:…png + caption: 标题 + ```` `。
**只有一个换行——在语言标记之后**，`png` 与 `caption:` **直接粘连**，闭合 ```` ``` ```` 在**行尾**。
（原文此处写作 `figureref:` 粘连形态，是未还原 `<w:br/>` 时的错误样本，**勿作为 fixture**。）

三条致命点：

1. **开栏符在正文行尾**，不是行首。
   `matchFenceOpen` 的正则 `^```\s*([A-Za-z]*)` 要求 ```` ``` ```` 在行首 ⇒ **永不匹配**，状态进不去。
2. **闭合符在内容行尾**。
   `FENCE_END = /^```\s*$/`（`ViewItem4Doc.ts:618`）要求整行只有 ```` ``` ```` ⇒ **永不闭合**，
   块永不 flush。
3. **ref 与 caption 无分隔粘连**（`…_p1_img1.pngcaption: 抖音…`）。
   即使前两条修好，`parseFigureFenceLines`（`:843-862`）只按**行首**匹配 `ref:` / `caption:`，
   会把整串当 ref ⇒ 图仍然找不到。

覆盖统计：6 个 figure **全部**是这个形态；5~6 个 table 同样。

### 21.4 第四条形态：只有 caption、没有 ref

`行 67`：

```
…（推演）。```figurecaption: 商务男士衬衫polo衫热销款式示意```
```

`parseFigureFenceLines` 的 `if (!assetRef && !caption) return null;` 只挡"两者都空"，
所以这个会产出 `{kind:"figure", assetRef:"", caption:"商务…"}` ⇒ 没有 ref，**必然缺图**。
建议：无 ref 的 figure 显式降级为 `figure-missing`（模板已有 `buildMissingFigureXml` 兜底），
保留 caption，而不是直接丢弃或产出空 ref 块。

### 21.5 修法（在 `preprocessDegradedFences` 内，注意顺序）

**必须放在现有 ①②③ 之前**——① 会先插入 `\n`，把单行拆坏，之后再想匹配单行就晚了。

```
**【作废，见 21.17】此正则在真实产物上 0 命中——raw `figureref` = 0。真实形态是 `figure` 后**有**换行、其余无换行。请按 21.18 的「按位置修」实现。**

④ 单行围栏拆分（新增，置于 ① 之前）：
   /```\s*(figure|table|figureref|figurecaption|tablecaption)\s*[:：]?\s*([^`]*?)```/g
   → "```$1\n$2\n```"
   效果：正文```figureref: X```  →  正文\n```figureref\nX\n```
   之后 ① 把它变成 ```figure\nref: X\n```，闭合行独立 ⇒ FENCE_END 无需改动。

⑤ ref/caption 粘连切分（在 ④ 之后、② 之后均可）：
   /(\.(?:png|jpe?g|gif|webp))\s*(caption|图)\s*[:：]/gi → "$1\n$2: "
   效果：ref: kb:x.pngcaption: 标题  →  ref: kb:x.png\n caption: 标题
```

`matchFenceOpen` / `FENCE_END` **都不用改**——④ 已经把行尾开栏/闭合变成了独立的行。
这是比"放宽 FENCE_END"更安全的改法：不动状态机的边界条件。

### 21.6 建议补 3 条单测 fixture（用真实原文，别再造合成样本）

加到 `tests/docFenceDegrade.test.ts`：

1. **单行 figureref**（上面 `行 42` 全文）⇒ 期望 1 个 figure 块，`assetRef` 以 `kb:` 开头、
   以 `.png` 结尾、`caption === "抖音商务男装衬衫/polo衫热销爆款概览（采样时间2024.03.19–2024.04.17）"`。
2. **单行 tablecaption**（`行 49`：`…```tablecaption: polo衫主力价格带销量与销售额对照| 价格带 | 本期销量 |…|``` `）
   ⇒ 期望 1 个 table 块且行数 >1。
3. **只有 caption 无 ref**（`行 67`）⇒ 期望降级为 `figure-missing`，caption 保留。

验收断言请写成「ref 以 .png 结尾 **且** caption 非空」——只断言"块存在"会漏掉粘连没切开的回归
（那种情况块也存在，但 ref 是脏串）。

### 21.7 一条可观测性建议（P1，不阻塞）

`absorbBlocksFromParagraphContent` 的 `flush()` 里 `if (block) push`，**没有 else**：
无法归一的围栏被静默丢弃，无 warn、无计数、UI 无提示。旧行为是"脏内容可见"（至少能发现），
新行为是"内容消失且没人知道"。建议加 `console.warn` + 返回丢弃计数，
在段落状态里显示「本段有 N 个表/图未能解析」。

### 21.8 一条默认值建议（P1，不阻塞）

`parseChatCompletion.ts:166` `opts?.hasRetrieval !== false` 是**默认 true**。
将来若新增无检索入口且忘记传这个参数，会静默退回幻觉引用。建议改为显式必传，或默认 false。


### 21.9 补充：Ai 页无图源，应从源头禁图（比单行围栏更根本）

`AiOutlineGenDoc.tsx:273` 现有注释：

```
十·7 ⑦-0：Ai 无 KB 资产，勿拼空清单硬禁（此前 buildFigureAssetAppendix([])）
```

即：Ai 页**不再拼图资产清单**——这一步对。但**没有补上"禁止出图"的反向约束**，
于是模型仍然按 Doc 契约写出 figure 围栏，ref 指向它自己编的 `kb:…` 路径，
而 Ai 页根本没有资产可取 ⇒ **必然取不到 ⇒ 围栏原文泄漏进正文**。

20:46 实测产物（`抖音商务衬衫polo选品分析-Ai-v2026920.docx`，mtime 20:46:37）：

| 指标 | 值 |
|---|---|
| `figureref` / `figurecaption` 标记 | 5 + 1 = **6 个** |
| 实际渲染 `<w:drawing>` | **0** |
| 泄漏进正文的围栏原文 | **5 处** |
| `tablecaption` 标记 / 实际 `w:tbl` | 4 / **3** |

**【已作废，见 21.11】~~表能渲染、图全废，不是围栏解析的锅——表不依赖外部资产，图依赖。~~**
**→ 更正：内容表渲染数 = 0/4，图 0/6，两者同为 0。那 2 个 `w:tbl` 是模板自带的封面签署表（编制单位/编制人/日期），跟正文无关。能否渲染只取决于围栏有没有被识别，与是否依赖外部资产无关。**
所以 Ai 页的修法应该是**两头一起**：

1. **提示词侧**：`buildKbDocWritingConstraintPrompt` 的 `hasRetrieval:false` 分支里，
   再加一句「本页无可用的图片资产，禁止输出 ```figure 围栏；需要图示时用文字描述」。
   只删清单不够——不禁止，模型会自己编。
2. **注入侧**：`DocBlockInjector` 对 `assetRef` 解析不到资产的 figure 块，
   维持"丢弃"或降级 `figure-missing`，**但绝不把围栏原文留在正文**。
   这一条十九章已经覆盖，配合第 1 条后可做到"根本不产生"。

### 21.10 待用户确认：20:46 产物是新代码跑的吗

该 docx 的 `mtime = 2026-10-20 20:46:37`（导出时间），但文件名是 `Ai-v2026920`（9-20 版本串）。
我上一轮按文件名判为"旧产物"，**该判断已作废**，但两者仍互斥，需用户确认：

**若为新代码生成**（用户称"前端跑内容生成的结果"），则十九章 P0-A **未生效**，因为：
- `stripHallucinatedDocCitations`（`parseChatCompletion.ts:187`，正则 `/\[文档\d+\]/g`）
  在 `AiOutlineGenDoc.tsx:320` 调用且 `Doc.setContent(chapters, key, scrubbed.text)` 写回——链路正确；
- 产物仍有 **15 处 `[文档N]`**，散布在 **9 个不同段落**（1.1/1.3/2.1/2.2/2.3/3.1/3.2/3.3/4.2），
  不是"部分段落未重新生成"能解释的；
- 且 `applyHeadingLevels`（`AiOutlineGenDoc.tsx:212`）若生效，同层兄弟应同级，
  实测却是 **heading2 ×3 + heading3 ×10 混用**，与十八章不符。

⇒ 三者同时不符，倾向于是**旧内容被重新导出**，或跑的是 **KB 页**（KB 页 `hasRetrieval` 默认 true，
`[文档N]` 是**合法期望输出**，此时不用修）。

**30 秒自检**（请用户在浏览器 Console 看）：
- 出现 `Ai 段 xxx 剥离幻觉引注 N 处` ⇒ 走了 Ai 页新代码，且剥离生效 ⇒ 产物的引用是别处混入；
- 无此 warn 且是 KB 页生成的 ⇒ `[文档N]` 合法，**不用改**；
- 无此 warn 且确是 Ai 页 ⇒ 十九章在该路径未生效，需查 `paragraphsToGenerate` 与导出时的 chapters 数据源。

## 二十一、补充更正：内容表渲染数 = 0/4（前一节的因果关系作废）

> 本节**推翻**本章前面「表能渲染 3/4、图全废 0/6，因为表不依赖外部资产」的判断。
> 该判断写在交接 L2560 附近，也进了我的备忘，**均作废，勿再引用**。

### 21.11 实测：文档里那 2~3 个 `w:tbl` 全是模板封面表

脚本：`.workbuddy/tools/tbl_check2.py`（随本节一起落盘）。

```
原始 <w:tbl> 计数: 3    </w:tbl> 计数: 3    完整表匹配数: 2
```

把这两个表的单元格内容读出来：

| 表 | 行数 | 内容 |
|---|---|---|
| 表 1 | 1 | `密级：` / `版本：V1.0` + 文档标题 |
| 表 2 | 5 | `编制单位：| 北京AI智能联盟 | 参加单位：| AI智能工作室`<br>`编 制 人：| 智能小毕 | 日    期：| 2026-9-20`<br>`质    保：` / `审    核：` / `批    准：` |

**两个都是 `docTemplate-simple.docx` 自带的封面/签署表，跟正文内容无关。**
正文里 4 个 table 意图（tablecaption ×4，行 44/49/51/53）**渲染数 = 0**。

⇒ 图 0/6、表 0/4，**两者同为 0**。不存在"表比图好"的差异，也不存在"表不依赖外部资产所以能成功"这回事。
能否渲染只取决于一件事：**围栏有没有被识别**。表同样要走 `matchFenceOpen`，同样死在行尾开栏。

### 21.12 更关键的一条推论：十九章的「丢弃兜底」在真实产物上从未触发

`verify_fence2.py` 三档实验的结果里，最该看的是最后那个数字：

```
figure 块 0 | table 块 0 | 丢弃 0
```

- 成块 0 → 没被解析
- **丢弃 0** → 也没被当成"认不出的围栏"清掉

两者同时为 0 只有一个解释：**这段文本从头到尾没进入围栏状态机**。
`matchFenceOpen` 要求 ```` ``` ```` 在行首，真实形态的开栏符在正文行尾 → 永不匹配 → 归一化后的"丢弃"分支根本没有输入。

所以十九章 P0-B 的兜底设计是对的，但**在真实形态下它是个死分支**。
⇒ **21.5 ④（单行围栏拆分）不只是"让图表能出来"，它同时是"丢弃兜底能否生效"的前提。**
这一条把 21.5 的优先级从"修图"抬到"修整条契约链"，必须最先做，且顺序在现有 ①②③ 之前（① 会先插 `\n` 把单行拆坏）。

### 21.13 顺带：所有 Word XML 文本提取的正则有坑

我此前几个审计脚本用的是 `<w:t[^>]*>(.*?)</w:t>`。
`<w:tcPr>` 会被这个正则当成 `<w:t...>` 开标签（`<w:t` + `cPr` + `>`），造成**重叠匹配**：

- 单元格内容提取出现 `<w:tcPr><w:tcW w:w="85…` 这种 XML 源码假象（我一度以为表把 XML 写进了正文）
- 字数统计**虚高约 4.5%**（全文汉字：错误 3830 / 修正 3666）

正确写法（必须带空格或词边界）：

```python
re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>', re.S)   # 匹配 <w:t> 与 <w:t xml:space="preserve">
```

**请检查 `DocBlockInjector.ts` 及任何单测里若有等价的正则，同样加边界。**
本节落盘的 `tbl_check2.py` / `wc_fix.py` 已用正确写法。

### 21.14 字数口径更正（两处都得改）

用正确正则重算（`wc_fix.py`），**段落级数字与错误正则逐段完全一致**
（正文段里没有 `<w:tcPr>`，重叠匹配只在表格段发生）⇒ 段落字数统计**不受该 bug 影响**。

但我此前报的「均值 351.6 / +18.1%」是错的，正确口径如下：

| 口径 | 均值 | 命中率(±20%) | 相对目标 297.7 |
|---|---|---|---|
| **原样（正确口径）** | **291.4** | **5/12** | **−2.1%** |
| 剔除围栏泄漏文本后 | 259.8 | — | −12.7% |

**逐段分布（这才是真问题，均值把它盖住了）**：

| 段 | 字数 | 偏差 | 备注 |
|---|---|---|---|
| 2.1 polo衫主力价格带 | 400 | **+34%** | 含 figure 围栏泄漏 |
| 3.1 polo衫面料结构 | 416 | **+40%** | 含 figure 围栏泄漏 |
| 3.2 polo衫图案结构 | 408 | **+37%** | 含 figure 围栏泄漏 |
| 4.1 主推与试单分层 | 165 | −45% | 结论章，满篇「（推演）」 |
| 4.2 属性配置取舍 | 136 | −54% | 结论章 |
| 4.3 暂缓与观察 | 145 | −51% | 结论章 |

**修正后的因果**：不是"整体超标 +18%"，而是**泄漏段系统性偏长 +34~40%、结论章系统性偏短 −45~54%，两者在均值上互相抵消**。
所以"−2.1% 看起来达标"是假象——命中率只有 42%。

⇒ 「先修围栏再调字数」的结论**仍然成立，但理由变了**：不是"字数超标由泄漏造成"，
而是"泄漏污染了个别段落的长度分布，使字数指标失去诊断价值"。
修完围栏后正文会整体变短（−12.7%），届时需**重新评估** `150+60n` 的 base，
但那是下一轮的事，**现在不要动公式**。

## 二十一（续）· 决定性更正：raw XML 里 `figureref` = 0

> **本节推翻 21.1 / 21.5 / 21.9 / 21.11 里所有"词形退化"的描述。**
> 原因不是文档变了，是我提取文本时丢了 `<w:br/>`。
> 复跑校验：`.workbuddy/tools/br_check3.py`

### 21.15 原始字节实测

直接对 `word/document.xml` 做 `str.count()`，不经任何提取：

```
raw figureref      : 0
raw figurecaption  : 0
raw tablecaption   : 0
raw pngcaption     : 5
figure</w:t>...<w:br 出现 : 6
<w:br/> 总数             : 10        # = 6 figure + 4 table，每块恰好 1 个
```

**结论：`figureref:` / `figurecaption:` / `tablecaption:` 这三个词在文档里根本不存在。**
它们是我把 `<w:t>figure</w:t><w:br/><w:t>ref: </w:t>` 直接拼接后"长"出来的假词。

### 21.16 真实形态：不是"全挤一行"，是"只丢了部分换行"

按 XML 顺序还原 `<w:t>` 与 `<w:br/>` 后，真实文本是：

**figure（6 个，每块 1 个 br）**
```
…不宜单独作为备货结论。```figure⏎ref: kb:…/…_p1_img1.pngcaption: 抖音…概览```
```

**table（4 个，每块 1 个 br）**
```
…具备优先进入选品池的资格。```table⏎caption: polo衫在大盘中的位次与增速| 口径 | 数值 | 位次 | 同比 | 环比 | 占大盘 || 销售额 | 3.9亿 | TOP5 |…|```
```

也就是说：**模型只在 `figure` / `table` 这个词后面保留了换行（因为模板那一行就是这么写的），前面、中间、闭合处全部没换行。**

四个断点，按必须修复的顺序：

| # | 位置 | 现状 | 后果 |
|---|---|---|---|
| ① | 开栏符**前** | `结论。```figure` 紧贴句号 | `matchFenceOpen` 要 `^``` ` → **永不匹配**，状态机进不去 |
| ② | `ref` 与 `caption` **之间** | `…_p1_img1.pngcaption:` | caption 并进 ref，`parseFigureFenceLines` 拿不到独立 caption 行 |
| ③ | 表格 caption 与首行、行与行**之间** | `…增速\| 口径 \|…\|\| 销售额 \|…` | 整张表一行，无法按行解析 |
| ④ | 闭合符**前** | `…概览``` ` 在行尾 | `FENCE_END = /^```\s*$/` → **永不闭合**，块永不 flush |

### 21.17 为什么这条更正很要紧：原方案会 0 命中

21.5 ④ 写的正则是

```js
/```\s*(figure|table|figureref|figurecaption|tablecaption)\s*[:：]?\s*([^`]*?)```/g
```

它假设存在 `figureref:` 这种**语言标记粘连**。但：

- raw `figureref` = **0 次**
- 真实形态是 `figure` 后**有**换行，标记本身不粘连
- 这条正则只在"标记前后都无换行"时才命中 → **按原方案实现，真实产物依然 0 块**

**必须改成按位置修，不按词形修。**

### 21.18 修正后的修法（置于现有 ①②③ 之前）

```js
// ④a 开栏符前置换行：正文句号后紧贴 ```figure / ```table
s = s.replace(/([^\n])```[ \t]*(?=(?:figure|table)\b)/gi, "$1\n```");

// ④b 图片路径与 caption 切分
s = s.replace(/(\.(?:png|jpe?g|gif|webp))[ \t]*(caption|图)[ \t]*[:：]/gi, "$1\ncaption: ");

// ④c 表格 caption 与首个管道列切分
s = s.replace(/(caption[ \t]*[:：][^\n|]*?)[ \t]*\|/gi, "$1\n|");

// ④d 闭合符前置换行：把行尾 ``` 提到独立行
s = s.replace(/([^\n`])```[ \t]*$/gm, "$1\n```");
```

**④d 必须放最后**，否则前面几条插入的换行会被它误判。

**表格行切分（`||` → `|\n|`）不要放在 `preprocessDegradedFences` 里做**——全文替换 `||` 有误伤风险（正文里可能出现）。
正确位置是 `parseTableFenceLines` 内部：只对已进入 `table` 状态的缓冲区做行切分。

```js
// parseTableFenceLines 内部
buf = buf.join('\n').replace(/\|[ \t]*\|/g, "|\n|").split('\n');
```

### 21.19 对既有章节的更正清单

| 位置 | 原文 | 更正 |
|---|---|---|
| 21.1 真实样本 | ```` ```figureref: kb:…pngcaption: …``` ```` | ```` ```figure⏎ref: kb:…pngcaption: …``` ```` |
| 21.5 ④ | 按 `figureref` 词形拆行 | 按**位置**拆：开栏前 / 路径后 / caption 后 / 闭合前（见 21.18） |
| 21.9 表 | `figureref / figurecaption 5+1 = 6` | 6 个 figure；raw 词形计数**均为 0**，是提取假象 |
| 21.11 表 | `tablecaption ×4` | 4 个 table；形态为 `table⏎caption: 表题\| 列…` |
| 21.6 fixture | 用"单行"字符串当 fixture | **必须从 raw XML 提取并保留 `<w:br/>`**，否则 fixture 本身是假的 |

### 21.20 方法论（这条比修 bug 更值钱）

**从 OOXML 反推文本，必须按 XML 顺序同时处理 `<w:t>` 与 `<w:br/>` / `<w:cr/>`。**
只 `join(<w:t>)` 会把所有换行吃掉，凭空生成"看起来存在、实际不存在"的退化形态。

我这轮因此连续误判三次：

1. 第一次：以为单元格里写进了 XML 源码 → 实际是 `<w:t[^>]*>` 误匹配 `<w:tcPr>`
2. 第二次：以为有 5 处 `figureref:` → 实际是丢 `<w:br/>` 拼出来的假词
3. 第三次：以为围栏"全挤一行" → 实际是"只保留语言标记后的 1 个换行"

三次都朝"更严重"的方向偏，差点让修复方案整体跑偏（写出 0 命中的正则）。

**以后所有 Word 体检脚本统一用 `.workbuddy/tools/br_check3.py` 的 `linear()` 写法。**
回归判据：`raw figureref == 0`，若脚本报出 `figureref > 0`，先怀疑提取方式，再怀疑文档。

## 二十二、对「十九 / 二十章评审意见」的逐条回应与终版执行序

> 本章是对 Cursor 于 2026-10-20 21:00 左右给出的《十九、二十章评审》的回应。
> 结论先行：**主干接受 4 条、驳回/更正 3 条**，并新增 1 条它没发现、但优先级最高的 P0。

### 22.1 总表

| # | 评审意见 | 我的判定 | 依据 |
|---|---|---|---|
| 1 | 落点写 `DocBlockInjector` 不准，实际切围栏在 `ViewItem4Doc` | ✅ **接受，我写错了** | `absorbBlocksFromParagraphContent` 定义在 `ViewItem4Doc.ts:724`；`DocBlockInjector.ts:348` 仅调用。已就地更正 19 章 |
| 2 | 十九验收 fixture 偏乐观，不能当成品验收 | ✅ **接受** | 8/8 绿但真实产物 0 图 0 表（21.2） |
| 3 | 字数「+18% 全是泄漏」表述过满 | ✅ **接受** | 已更正为 −2.1%（21.14），19 章原表已加作废标记 |
| 4 | 二十章阈值 ≤30% / ≤0.6 偏经验 | ✅ **接受** | 15% 是单样本；改为「相对基线下降」判据（22.6） |
| 5 | 「必须接上二十一**单行围栏**」 | ⚠️ **方向对，形态描述过时** | 21.15–21.17 已更正为**半行**；按「单行」写 `figureref` 词形正则 → **仍 0 命中** |
| 6 | 十九·4 兄弟层级「旧产物时效、先核实」 | ❌ **驳回前提** | 产物 mtime **20:46**（新）。已定位确切根因，见 22.4 |
| 7 | 「二十应排在围栏修好之后」 | ⚠️ **对，但漏了一条更该先做的** | 22.4 的层级错位与围栏无关、独立、改动最小 |
| 8 | （未提）`buildHeadingLevelPlan` 的 points 也会进 plan | 🆕 **新增隐患** | 22.5，开到 4 级后必然爆 |

---

### 22.2 接受项一：落点更正（已就地改）

十九章原文写「在 `DocBlockInjector.ts` 的围栏切分阶段做容错归一」——**错**。

```
absorbBlocksFromParagraphContent  →  定义：ViewItem4Doc.ts:724
                                  →  调用：ViewItem4Doc.ts:208（自身）
                                  →  调用：DocBlockInjector.ts:348（import）
```

十九章实际落地（`docFenceNormalize.ts` + `ViewItem4Doc.ts:730/:941`）**位置是对的**，是我交接里的落点写错了。已在 19 章就地更正，并加了一条规则：

> **凡涉及围栏识别 / 归一化 / 丢弃的改动，一律落在 `ViewItem4Doc.ts` 或 `docFenceNormalize.ts`，不进 `DocBlockInjector.ts`。**

---

### 22.3 接受项二：不要把十九的单测当成品验收

`docFenceDegrade.test.ts` 8/8 绿，但：
- fixture 是人按「结构还在、局部变形」想象的
- 真实是模型「流式生成、就地开合」的产物
- 两条路不交叉，所以**覆盖率 100% 的测试可以完全挡不住真实故障**

已在 21.6 要求换真实 fixture、断言改成「ref 以 `.png` 结尾 **且** caption 非空」。本轮再补一条：

> **成品验收必须走真实产物 + `br_check3.py` 还原换行后的文本**，合成 fixture 只能当回归位，不能当验收位。

---

### 22.4 驳回项：十九·4 不是「旧产物时效」，是十八章代码的真 bug

**前提已作废**：该 docx 的 `mtime = 2026-10-20 20:46:37`，比十八章落地（19:55）**晚 51 分钟**。所以十八章代码**确实参与了这次生成**。它不是旧产物。

我把产物的 17 个 heading 段全列出来：

```
40 h1  1 大盘机会与品类位次
41 h2  1.1 男装大盘量额双增        ← 章1的第1段 = h2
43 h3  1.2 polo衫位次与增速
45 h3  1.3 衬衫集中度信号
47 h1  2 价格带证据对照
48 h3  2.1 polo衫主力价格带
50 h2  2.2 polo衫机会价格带        ← 章2的第2段 = h2
52 h3  2.3 衬衫价格带分化
54 h1  3 属性与热销款对照
55 h3  3.1 polo衫面料结构
57 h3  3.2 polo衫图案结构
59 h2  3.3 衬衫厚薄与袖型          ← 章3的第3段 = h2
61 h3  3.4 热销店铺与销量
63 h1  4 选品结论与动作
64 h3  4.1 主推与试单分层
66 h3  4.2 属性配置取舍
68 h3  4.3 暂缓与观察              ← 章4无 h2
```

**h2 落在 1.1 / 2.2 / 3.3 —— 完美对角线。** 这不是随机，是**确定性错位**。

#### 根因：plan 与 paras 两套口径不一致

```ts
// docHeadingLevels.ts:33-42  buildHeadingLevelPlan
for (const ch of chapters || []) {
    plan.push({level: Math.min(2, L)});        // ← 章也 push 进 plan
    for (const p of ch.paragraphs || []) {
      plan.push({level: Math.min(Math.max(2, p.level || 3), L)});
      ...
    }
}
// ⇒ plan.length = 4 章 + 13 段 = 17

// docHeadingLevels.ts:75  applyHeadingLevels
const n = parseInt(sm[1], 10);
if (n < 2 || n > 9) continue;                  // ← h1（styleId 1）被跳过
// ⇒ paras 只有 13 个段标题，章（h1）不在其中
```

`n = Math.min(13, 17) = 13`，按序号逐个覆盖 `paras[i] ← plan[i]`：

| paras | 段 | 取到的 plan[i] | 结果 |
|---|---|---|---|
| 0 | 1.1 | plan[0] = **章1 → 2** | h2 ✅ 对角线 |
| 1 | 1.2 | plan[1] = 3 | h3 |
| 2 | 1.3 | plan[2] = 3 | h3 |
| 3 | 2.1 | plan[3] = 3 | h3 |
| 4 | 2.2 | plan[4] = **章2 → 2** | h2 ✅ 对角线 |
| … | | | |

**章数越多，偏移累积越大**，所以第 4 章已经偏到没有 h2 了。

#### 修法（推荐方案 A，改动最小）

`buildHeadingLevelPlan` **不 push 章**——因为章由模板渲染为 h1，且 `applyHeadingLevels` 用 `n < 2` 明确排除了它。两边口径一拉齐，`plan.length === paras.length === 13`，对角线消失。

```ts
// docHeadingLevels.ts:33-42
export function buildHeadingLevelPlan(chapters: Chapter[], maxLevel?: number) {
  const L = ...;
  const plan: Array<{level: number}> = [];
  for (const ch of chapters || []) {
    // 章由模板渲染为 h1，applyHeadingLevels 以 n<2 排除之 ⇒ 不进 plan。
    // 若将来模板把章改成 h2/h3，必须与 applyHeadingLevels 的过滤条件同步放开。
    for (const p of ch.paragraphs || []) {
      plan.push({level: Math.min(Math.max(2, p.level || 3), L)});
      // points 不产生标题段，禁止 push（见 22.5）
    }
  }
  return plan;
}
```

配套把 `applyHeadingLevels` 的不等长分支从「截断后静默成功」升级为**显式 warn 且暴露计数**：

```ts
// 现状：paras.length !== plan.length 时仍返回 ok:true，只在 warning 里提一句
// 建议：console.warn + 返回 {ok:false, mismatched: paras.length - plan.length}
```

> **为什么必须 warn 而不是静默**：这次恰恰是「17 ≠ 13」被静默截断，才让对角线跑了整整一篇文档而没人发现。

**优先级 P0，排在围栏之前。** 理由：①与围栏完全独立，改动 ~5 行；②后果是目录缩进 + 字号全篇错；③已有确切根因和复现样本。

---

### 22.5 新增：`points` 是第二个错位源（现在没爆，开 4 级必爆）

`buildHeadingLevelPlan:38-40`：

```ts
for (const _ of p.points || []) {
  plan.push({level: Math.min(pl + 1, L)});   // ← points 也进 plan
}
```

但模板里 `{#points}` 渲染的是列表项/正文，**没有 `w:pStyle`** ⇒ 不进 `paras`。所以只要 `points` 非空，plan 就会再次膨胀、再次错位。

本次产物没暴露，是因为 `normalizeDocDepth` 在 `maxLevel ≤ 3` 时把 `####` 折进 `pointGuide` 并**清空了 `points`**。等 15.3.4 开到 4 级、points 不再被清空，这条会立刻爆。

**修法**：与 22.4 同一处——plan 里**只 push 会产生标题段的项**（当前即「段」）。若将来 points 也要渲染成标题，必须在 `applyHeadingLevels` 里同步放开过滤，不能单边改。

---

### 22.6 接受项三：二十章阈值改为「相对基线下降」

原写「套路开头 ≤30%、模糊词 ≤0.6 处/段」，来源是**单样本**（毕方 Ai 15% / 对照版 100%），确实是拍的。

改为：

| 指标 | 新判据 | 说明 |
|---|---|---|
| 套路开头率 | **不高于当前线上基线；改动后需相对基线下降 ≥ 1/3** | 基线 15%，则改后应 ≤10% |
| 模糊限定词 | **相对基线下降，不设绝对值** | 基线 0.4 处/段 |
| 开头 N 字撞车 | **全文 0 组** | 这条是硬约束，不设比例 |

同时接受评审的一条实质建议，写进二十章修法：

> **黑名单必须配正向要求**，否则模型会换成「就…而言 / 针对…来讲 / 基于…观察」继续绕。
> 正向要求措辞建议：**「首句必须直接出现本段的主体（实体 / 数据 / 判断），不得先铺视角或背景。」**
> 验收必须跑 `style_scan2.py` 回归，**改两行 prompt 就结案不成立**。

关于「与人设的张力」——评审指出「选品师视角」本身容易诱发「从…看」，这条我同意并补充可落地口径：

> 岗位视角放在**段中**（解释数据时用「以选品师口径看」），**首句直入段题实体**。

---

### 22.7 终版执行序（覆盖此前所有顺序表述）

```
① 22.4 + 22.5  层级 plan 口径对齐（P0，~5 行，独立，已有复现样本）
② 21.18        围栏按位置归一（P0，注意：21.5 的 figureref 词形正则已作废）
③ 21.9         Ai 页显式禁图（P0，只删清单不够，必须给否定信号）
④ 20.3 + 20.6  开头句式：黑名单 + 正向要求，style_scan2 回归
⑤ 十九·5       结论章材料账本（P2，属 4B，不在 prompt 层解决）
```

**排序理由**：

- ① 与 ② 无依赖，但 ① 改动最小、证据最硬，先做可立刻验证「十八章到底对不对」。
- ② 必须在 ④ 之前：围栏文本会把 13 段扫成 5 段，**句式指标在围栏修好前测不准**。
- ③ 与 ② 同源（Ai 无资产 → 模型编 `kb:` 路径 → 围栏必然解析失败），建议同批做。
- ⑤ 是材料分配问题，加 prompt 禁令无效，**不要在 ①~④ 里一起做**。

---

### 22.8 方法论补充（第三次栽在同一类坑上）

我在本次排查中连续三次误判，且**每一次都朝「更严重」的方向偏**：

1. 以为单元格装进了 XML 源码 → 实际 `<w:t[^>]*>` 误匹配 `<w:tcPr>`
2. 以为有 5 处 `figureref` → 实际丢 `<w:br/>` 拼出的假词（raw = 0）
3. 以为围栏「全挤一行」 → 实际「只有标记后 1 个换行」

共同点：**从 OOXML 反推文本时丢失结构信息**（`<w:br/>`、`<w:tab/>`、段落边界）。

写进项目约定，凡审计 docx 一律遵守：

```
1. 取单元格/正文文本必须带边界：<w:t(?: [^>]*)?>，禁止 <w:t[^>]*>
2. 还原段落文本必须顺序遍历，把 <w:br/> → \n、<w:tab/> → \t
3. 任何"形态"结论，先在 raw document.xml 上 count 关键词验证存在性，
   再谈正则；count = 0 说明是提取假象，不是真实形态
4. 判时效一律看 mtime，不看文件名里的版本串
```

---

### 22.9 负面清单

1. **禁止**按 21.5 的 `figureref` 词形写正则（raw 计数为 0）。
2. **禁止**只改 `applyHeadingLevels` 的过滤或只改 `buildHeadingLevelPlan`，**必须两边同口径**，否则错位照旧。
3. **禁止**把十九章 `docFenceDegrade` 的单测绿当作成品验收。
4. **禁止**在 ①~④ 之前动 `150+60n` 的 base（分布未清洗，调参无意义）。
5. **禁止**把「结论章（推演）」当成 prompt 问题处理。

## 二十三、docGen 原始输出实测（模型第一手输出，绕过 docx 渲染）

> 数据来源：用户提供的 `!!!!docGen result::::` JSON（4 章 13 段完整快照，含 prompt / content / blocks / wordBudget / allowTable / allowFigure / level）。
> 价值：**这是模型写出的原始字符串，未经 docxtemplater 渲染、未经 OOXML 反推**，因此是围栏形态的最高等级证据，可与 21.15–21.17（从 docx 反推）互相独立验证。

### 23.1 21.10 结案：这是 KB 页，`[文档N]` 是合法输出

**判定依据是 prompt 文本本身，不看文件名。**

- `parseChatCompletion.ts:166` → `hasRetrieval = opts?.hasRetrieval !== false`；`:167` 分两支拼 `citeRule`。
- **Ai 页必传 false**：`AiOutlineGenDoc.tsx:277` 与 `:291` 两处都写了 `{hasRetrieval: false}`。
- 若为 Ai 页，prompt 里必定出现"禁止输出任何 `[文档N]` 标记、禁止编造出处"这类否定条款。

**本份 13 段 prompt 里一条都没有**，取而代之的是"数字与专名须可溯"——这是 `hasRetrieval === true` 分支的措辞。

⇒ 结论：**这份是 KB 页（有检索）生成的**。`[文档1][文档2][文档3]` 是**合法期望输出**，不是幻觉。
⇒ **十九章 P0-A 无需改动，21.10 关闭。**

⚠️ 文件名 `-Ai-v2026920` 是误导（版本串，我上一轮已栽过一次）。**以后一律以 prompt 文本判定页面归属**，规则写进 23.11。

### 23.2 围栏真实形态：与 21.15–21.17 完全吻合（独立验证）

从模型原始字符串逐段摘出（13 段里 10 段含围栏）：

| 段 | 类型 | 原始形态（关键断点处） | 印证 |
|---|---|---|---|
| 1 | figure | `…不宜单独作为备货结论。```figure`⏎`ref: kb:…_p1_img1.pngcaption: 图题``` ` | ④a 开栏前有正文；④b `pngcaption` 粘连；④d 闭合前有内容 |
| 2 | table | `…具备优先进入选品池的资格。```table`⏎`caption: 表题\| 口径 \| 数值 \|…\|\| 销售额 \| 3.9亿 \|…\|``` ` | ④a；④c caption 与首行粘连、行间用 `\|\|` |
| 4 | table | `…再定组货比例 [文档3]。```table`⏎`caption: …\| 价格带 \|…\|\| ¥50以下 \|…\|``` ` | 同 ④a④c |
| 5 | table | 同上形态 | 同 |
| 6 | table | 同上形态（5 行） | 同 |
| 7 | figure | `…判断效率会明显提升 [文档1]。```figure`⏎`ref: kb:…_p6_chart1.pngcaption: 图题``` ` | ④a④b④d |
| 8 | figure | `…稀释纯色主盘的周转效率。```figure`⏎`ref: kb:…_p6_chart2.pngcaption: 图题``` ` | ④a④b④d |
| 9 | figure | `…避免把资源压在偏风格化的少数结构上。```figure`⏎`ref: kb:24SS抖音风格趋势白皮书-男装.pdf/…_p20_img1.pngcaption: 图题``` ` | ④a④b④d + **跨文档**（见 23.8） |
| 11 | table | `…（推演）。```table` ← **只有开栏，无内容** | 21.4 孤开栏 |
| 12 | figure | `…仅在有明确测款数据后再追加（推演）。```figure`⏎`caption: 商务男士衬衫polo衫热销款式示意``` ` | 21.4 **无 ref** |

**⇒ 与 21.15–21.17 从 docx 反推的"半行"结论逐条吻合**（开栏后有 1 个真换行、`png` 与 `caption:` 之间无换行、闭合 ``` 前有内容）。两条独立证据链互证，21.18 的按位置修法（④a→④d）**确认成立**，21.5 的词形正则**确认作废**。

### 23.3 【新 P0】终极根因：渲染只读 `blocks`，而生成后 `blocks` 是空的

这一条比围栏形态更根本，此前所有章节都没写到。

```
模型输出 content（含围栏原文）
      ↓
生成完成 —— 【不调用 absorb】
      ↓
渲染 DocBlockInjector.ts:340-359
      ├─ 数据源 = p.blocks（唯一）
      └─ 顺带"剥离正文里的围栏"
      ↓
:348  absorbBlocksFromParagraphContent(p)   ← 解析只在渲染时发生
```

调用点实测（`grep absorbBlocksFromParagraphContent`）：

- `ViewItem4Doc.ts:208` — 对象构造时（编辑大纲场景）
- `DocBlockInjector.ts:348` — **渲染时**

**生成完成后没有调用。** 后果是：

1. JSON 里的 `blocks` 字段 = **上一次渲染/构造的残留**，不是本次生成的结果（见 23.4）。
2. 渲染时才尝试解析 → `matchFenceOpen` 要 `^``` ` → 开栏前有正文 → 不匹配 → 状态不进 → `blocks` 空。
3. `blocks` 空 → **0 图 0 表**。
4. 同一处"剥离正文里的围栏"也失败（因为压根没识别成围栏）→ **围栏原文进正文**。

⇒ **"0 图 0 表"和"围栏原文泄漏"是同一次失败的两种表现，不是两个问题。**
⇒ 这也解释了 21.12 那条推论：成块 0 **且**丢弃 0，因为状态机从未启动。

### 23.4 `blocks` 与 `content` 不同源（证据污染，勿当基线）

| 段 | content 里的围栏 | blocks 字段 |
|---|---|---|
| 1 | figure | `[]` |
| 3 | figure | `[]` |
| 4 | **table** | `[figure]` ⚠️ |
| 6 | **table** | `[figure]` ⚠️ |

**完全反向**：有 figure 的段 blocks 空，是 table 的段 blocks 里有 figure。
⇒ JSON 中的 `blocks` 是历史残留，**不可用于验证本次解析结果**。复现时必须重新生成，不要复用旧快照。

### 23.5 `blocks` 里的脏 `assetRef`：状态机能进，缺的是切分

```
段4: {"kind":"figure","assetRef":"kb:…_p2_0.pngcaption: polo衫价格带分布与大盘对比```","caption":""}
段6: {"kind":"figure","assetRef":"kb:…_p4_0.pngcaption: 男士衬衫价格带销量与销售额分布```","caption":""}
```

**修正我此前"0 块"的表述**：部分段**能进入围栏状态机**，失败发生在后续两步——

- ④b（`.pngcaption:` 未切）→ ref 变脏串
- ④d（闭合 ``` 未剥）→ 闭合符留在 ref 里
- 连带 `caption` 解析为空

⇒ 再次印证 21.6 的断言要求：**必须写「ref 以 `.png` 结尾 且 caption 非空」**。只断言"块存在"会漏掉这种"块存在但内容全脏"的回归——这正是本例的实际情况。

### 23.6 【新 P0】段 10 content 为空，且无告警

```
段10 「热销店铺与销量」: content = "", blocks = []
```

13 段里 1 段**静默失败**（约 7.7%）。既无 Console warn，渲染时也不会有占位。
建议（改动小、独立，建议并入 ① 同批）：
- 生成循环对 `content.trim() === ""` 做一次 warn + 自动重试 1 次；
- 渲染前对空段显示"（本段生成失败）"占位，不要静默留白。

### 23.7 `allowTable` / `allowFigure` 恒 true（21.9 需从 Ai 页扩到全页）

JSON 里 **13/13 全为 true**。代码：

- `ViewItem4Doc.ts:1255-1256` 硬编码 `= true`
- `ViewItem4Doc.ts:279-280` `opts?.allowTable !== false` / `allowFigure !== false` → 默认 true

⇒ 21.9 原来只针对 Ai 页，实测**KB 页同样恒 true**。修法应为**与图资产清单联动**：清单为空 → `allowFigure = false`，从源头不给模型这个选项（而不是只删清单、留着开关）。

### 23.8 图 ref 跨文档（旧问题复现）

段 9 的 ref 指向 `24SS抖音风格趋势白皮书-男装.pdf`，其余 8 处指向 `抖音单品爆款分析-商务男士衬衫polo衫.pdf`。
⇒ 图资产未按绑定源文档过滤（`docFigureAssets.ts` 取全库前 12 条），印证旧记录"V2 实测 4 个指错文档"。归材料池（4B）范围，本轮不动。

### 23.9 内容层新缺陷（非本轮，登记备查）

- **段 13 逻辑矛盾**：写「两段跌幅小于 100-200 元带」，但段 6 实测 ¥200-300 同比 **+27.34%**、¥300-400 **+34.12%**，均为正增长 → "跌幅"是幻觉。
- **段 2 单位写反**：「男装大盘同期**销售额** 7280.1 万、**销量** 58.12 亿」——7280.1 万是销量、58.12 亿是销售额，两个数被对调。
⇒ 属材料账本/去重/数字可溯问题，归 4B，**不要在 prompt 层解决**。

### 23.10 执行序（在 22.7 基础上更新）

```
① 22.4+22.5  层级 plan 口径对齐    P0 · ~5 行 · 独立 · 有复现样本
   23.6       空段告警 + 占位       P0 · 并入同批（改动小、独立）
② 21.18      围栏按位置归一 ④a→④d  P0 · 本轮最大收益（0图0表与泄漏同源）
   21.9       无资产 → allowFigure=false（Ai 页 + KB 页都要）
③ 20.3+20.4  开头句式 + 扫描回归    P1 · 必须在 ② 之后（否则样本被围栏污染）
④ 十九·5      结论章材料账本        P2 · 属 4B
```

### 23.11 硬规则：判定页面归属只看 prompt 文本

- **有**"禁止输出任何 `[文档N]`"类否定条款 → Ai 页（`hasRetrieval: false`）
- **无**、且写"数字与专名须可溯" → KB 页（`hasRetrieval !== false`），`[文档N]` 合法
- **禁止**依据文件名（`-Ai-`、`v2026920` 等）判断产物来源或时效；时效一律看 `mtime`。

### 23.12 负面清单（本轮）

1. 不要把本份 JSON 的 `blocks` 当验收依据（23.4 已证不同源）。
2. 不要按 21.5 的 `figureref` 词形正则（raw 计数为 0）。
3. 不要只断言"块存在"（23.5：块存在但 ref 脏、caption 空）。
4. 不要因为 `[文档N]` 出现就去改十九章（23.1：KB 页合法）。
5. 不要把 0 图 0 表与围栏泄漏当成两个问题分开修（23.3：同源）。

### 23.13 第二份快照（纯生成态）：`blocks` 全空 + `ref` 不自洽

用户提供第二张 docGen 截图（同为 `KbOutlineGenDoc.tsx:516`，段 1–3）。这份是**新一次生成**，与 23.2 那份措辞不同。

**① `blocks` 全空，彻底证实 23.3**

放大逐字段核对：段 1 / 段 2 / 段 3 均为

```
"blocks":[],"heading":true,"level":3,"container":false,...,"wordBudget":{"min":270,"max":270},
"allowTable":true,"allowFigure":true,"promptManual":false
```

而同一段的 `content` 里**明明有** `...备货结论。```figure`⏎`ref: kb:…`。

⇒ 本份是"生成完成、尚未渲染"的干净态：`content` 有围栏、`blocks` 为空。
⇒ 反过来印证 23.4：上一份的段 4/6 出现脏 `blocks`，确系**历史渲染残留**，不是本次解析结果。
⇒ **23.3 的结论（渲染只读 `blocks`、生成后不解析）由两份快照共同锁定。**

**② 新问题：`ref` 不自洽，同一图位两次文件名不同**

| | 段 1 的图 ref | 段 3 的图 ref |
|---|---|---|
| 本份 | `kb:…polo衫.pdf/`**`elements/`**`…_p1_chart.png` | `kb:…polo衫.pdf/…_p4_0.png`（无 `elements/`） |
| 上一份 | `kb:…polo衫.pdf/`**`elements/`**`…_p1_img1.png` | 同 `_p4_0.png` |

代码口径：

- `docFigureAssets.ts:113` `formatKbAssetRef` 只拼一层：`kb:${fileName}/${assetId}`
- `DocBlockInjector.ts:455-458` `resolveAssetBytes` 按**首个 `/`** 切分，`assetId` 允许含子路径

所以**带 `elements/` 本身不一定是错**（`assetId` 可能就是 `elements/xxx.png`）。真正的硬证据是：

> **同一个段（段 1）、同一个图位，上一份是 `_p1_img1.png`，本份是 `_p1_chart.png`。**

两次生成若都是"原样复制清单字符串"，文件名不可能变。⇒ **模型在改写 `ref`**，而不是复制。

（同段图题也变了：上一份"抖音商务男装衬衫/polo衫热销爆款概览（采样时间…）"，本份"抖音商务男装衬衫/polo衫热销爆款概览（2024.03.19–2024.04.17）"——题注也是自己组织的。）

**③ 新增 P1：`ref` 白名单精确校验**

prompt 里已经写了「`ref` 只能原样复制清单字符串」（`ViewItem4Doc.ts:297` 起的【图·须同时满足】），**模型没遵守**。所以只能靠代码兜：

- 渲染侧 `resolveAssetBytes` 前加一道：该段可用资产 `ref` 集合（来自 `docFigureAssets` 的 `formatKbAssetRef` 输出）作为白名单，**精确匹配**才放行；
- 不命中 → 降级 `figure-missing`（**保留 caption**，走 `buildMissingFigureXml`），不得按模型给的串硬取、也不得整块丢弃。

**顺序**：21.18 让 figure 能被识别 → 23.13 让脏 `ref` 不出空图。
两者**串联**，只做前者，段 1 仍会缺图（21.18 修好后它会被识别成块，但 ref 取不到 bytes）。

**④ 句式：段 3 已改为直入**

- 段 1：「从选品师视角看，大盘当前处在…」——仍是视角介词短语
- 段 2：「从选品位次看，polo衫…」——仍
- 段 3：「**男士衬衫的集中度信号，是选品师判断这个赛道还能不能进的第一道门槛**」——**直入实体 + 判断**

⇒ 段 3 正是二十章 20.3 要的"首句直接出现主体（实体/数据/判断）"。说明**模型本来就能做到**，正向要求有实证基础，不是空想；也说明不能只加黑名单（段 1/2 会换个介词继续绕），必须把正向写法写成硬要求。

**⑤ 字数：本份段 1 目测偏长，但不下结论**

`wordBudget` 仍是单值 270（段 1）/ 330（段 2），与 23.2 一致。段 1 正文目测约 350–400 字，**但 `content` 里含 figure 围栏文本**（约 60–80 字），且截图为目视估算、未精确计数。
⇒ **不据此改公式**；按 21.14 口径，等 21.18+23.13 落地后重新导出 docx，用 `wc_fix.py` 精确重算。

## 二十四、评审 556075e（执行序 ①–④）：3 项实证缺陷 + 1 项提示失真

### 24.0 结论表

| # | 级别 | 位置 | 现象（jest 探针实测） | 修法 |
|---|---|---|---|---|
| A | P1 | `ViewItem4Doc.ts:842-845` | 表格含**空单元格**被拆行拆坏：`["A","","高"]` 变 `["A","",""]` + `["高","",""]` | 仅当缓冲含 `\|\|` 才展开 |
| B | P1 | `ViewItem4Doc.ts:762` | 正文含**非图表** ``` 代码块 → 已吸收的 blocks 被清空（图丢失）+ 代码块被吞 | 早退条件收紧为「含 table/figure 语义开栏」 |
| C | P1 | `DocBlockInjector.ts:413-414` | `kb: a.pdf/1`（冒号后带空格）≠ 白名单 `kb:a.pdf/1` → 合法图误杀 | 匹配前归一化 ref |
| D | P2 | `docFigureAssets.ts:169-180` / `KbOutlineGenDoc.tsx:240-252` | 白名单拒绝（脏 ref）也计进 `countUnresolvedFigures` → 弹红 error 且文案失真 | 拆出 `figure-blocked`，分开计数与提示 |
| ✅ | — | ① 层级 | plan 口径 == 模板渲染口径，对角线已消除 | 勿改 |
| ✅ | — | ②③ 顺序 | 两个收集函数同为双层全量遍历，下标一一对应 | 勿改 |

### 24.1 A：空单元格表格被拆坏（实证）

探针输入（标准 markdown，3 列）：

```
| 指标 | 数值 | 说明 |
| --- | --- | --- |
| A |  | 高 |
| B | 3 | 中 |
```

实测 `p.blocks[0].rows`：

```
[["指标","数值","说明"], ["A","",""], ["高","",""], ["B","3","中"]]
```

应为 3 行 3 列；`高` 掉到独立行。根因：`ViewItem4Doc.ts:844` 的
`replace(/\|[ \t]*\|/g, "|\n|")` 把**合法空单元格** `|  |` 当成「退化粘连」的行分隔符。

修法（只在确有粘连信号时展开）：

```ts
const joined = lines.join("\n");
const expanded = /\|\|/.test(joined)
  ? joined.replace(/\|\|/g, "|\n|").split("\n")
  : lines;
```

`pushTableRowChunks` 里的 `||` 分支保持不变（那是真退化形态）。

### 24.2 B：非图表代码块清空 blocks（实证，回归）

探针：段已有 1 个 figure block，正文为
`正文\n```json\n{"a":1}\n```\n收尾`
→ 执行 `absorbBlocksFromParagraphContent` 后：

```
blocks = []，plain = "正文\n收尾"
```

两个后果：
1. 已吸收的图/表丢失 —— 导出时 `collectParagraphBlocks` 会再调一次，直接 0 图 0 表；
2. 模型写的普通代码块被静默删除。

根因：`ViewItem4Doc.ts:762` 早退条件从「含 table/figure 围栏」放宽成「含任意 ``` 」。

修法（保留二十一·18 的半行识别，同时不误伤）：

```ts
const mayHaveDocBlock =
  /```\s*(?:table|figure|figureref|tablecaption|figurecaption)/i.test(raw0) ||
  /```\s*(?:ref|kb:|caption)\s*[:：]/i.test(raw0);
if (!/```/.test(raw0) || !mayHaveDocBlock) {
  return raw0.trim();      // 保留既有 blocks
}
```

注意：`contentMayHaveDocFences` 只有前半段，直接用会漏掉无标签的 ```` ```ref: kb:… ```` 退化形态。

### 24.3 C：ref 未归一化 → 合法 ref 被误杀（实证）

探针四例的 assetRef：

| 输入 ref 行 | 解析出的 assetRef | 与白名单 `kb:a.pdf/1` 是否命中 |
|---|---|---|
| `ref: kb:a.pdf/1` | `kb:a.pdf/1` | ✅ |
| `ref: kb: a.pdf/1 ` | `kb: a.pdf/1` | ❌ 误杀 |
| `ref：kb:a.pdf/1`（全角冒号） | `kb:a.pdf/1` | ✅ |
| 半行 `正文。```figure … caption: 图4``` ` | `kb:a.pdf/1` | ✅ |

⇒ 全角冒号能过、空格不能过，口径不一致。

修法（两处都做，双保险）：
- `parseFigureFenceLines`（`ViewItem4Doc.ts` 886-900 附近）赋值 `assetRef` 前归一：
  `r.replace(/^kb:\s*/i, "kb:").replace(/\s+$/, "")`，并剥掉包裹的反引号/引号；
- `resolveBlocksToPayloads`（`DocBlockInjector.ts:413`）匹配前对 `ref` 与白名单两侧做同一归一化函数。

### 24.4 D：白名单拒绝被当成「ref 不可 resolve」

`countUnresolvedFigures` 只数 `kind === "figure-missing"`，而白名单拒绝现在也 push `figure-missing`（`DocBlockInjector.ts:414-420`）⇒ `KbOutlineGenDoc.tsx:250` 会弹红色
`有 N 张插图无法解析（ref 不可 resolve），已写入「图片缺失」占位`，
但真实语义是「模型改写了 ref」。诊断失真 + 噪音。

修法：白名单拒绝改 push `kind: "figure-blocked"`（仍渲染成缺失占位、保留 caption）；
`countUnresolvedFigures` 只数 `figure-missing`；Kb 页对 blocked 单列一条
`message.warning(\`有 ${n} 处 figure ref 不在可用清单（模型改写），已占位\`)`。

### 24.5 已核对无误（勿再改）

1. **① 层级对齐**：`doc.render({chapters})` 的模板循环遍历 `ch.paragraphs` 全量；`buildHeadingLevelPlan`（`docHeadingLevels.ts:34-42`）同样全量且跳过 `container`；`applyDocHeadingNumbers`（`docHeadingDepth.ts:99`）同样跳过 container ⇒ 三者口径一致，Δ=0，对角线消除。（注：`container` 全库无赋 `true` 处，当前为 no-op，将来容器扁平化落地时三处已对齐。）
2. **② 顺序一致**：`collectParagraphBlocks`（`DocBlockInjector.ts:352-374`）与 `collectParagraphAllowedFigureRefLists`（`docFigureAssets.ts:120-136`）同为 `chapters → paragraphs` 双层全量遍历，下标一一对应。
3. **Ai 禁图链**：`allowFigure=false`（`ViewItem4Doc.ts:1306` + `AiOutlineGenDoc.tsx:98-99`）+ 约束第 7 条 + 生成后剥离 `[文档N]` → 三重；且 Ai 页不弹 unresolved error。
4. **两相生成**：`bodyJobs → buildFactLedger → conclJobs`，进度分母 `jobs.length`；单段重跑（genKey）走 `runPhase(jobs, ledger)` 复用已有前文 ✓。

### 24.6 修法清单（按优先级）

1. **24.2 B**（丢图，最伤）
2. **24.1 A**（表格拆坏）
3. **24.3 C**（合法图误杀）
4. **24.4 D**（提示失真）

每条必须补一条 jest，落到既有套件里。
注：评审时助手在 `frontend/tests/wb_review_probe.test.ts` 留了 3 条纯打印探针（A/B/C 用例即上文证据）；本项目在 UNC 下 `rm`/trash 不可用，请由你**删掉该文件**，或把 3 个用例改造成正式断言并迁入 `docFenceDegrade.test.ts` / `docFigureSupply.test.ts`。
- B：已吸收 blocks + 正文含 ``` ```json ``` ``` → blocks 仍为 1、正文保留代码块；
- A：空单元格 3 列表 → rows 仍 3 行 3 列；
- C：`ref: kb: a.pdf/1 ` → 归一化后命中白名单；
- D：blocked / missing 分别计数。

### 24.7 验收口径（改完必须出真实产物再判卷）

代码改完后由用户在 UI 重生成并导出 docx，助手侧跑 `.workbuddy/tools/`：
- `audit_param.py`：层级不再对角线（h2 编号连续）、字数分布；
- `style_scan2.py`：首句直入率（二十·3 是否生效）；
- `tbl_check2.py`：内容表 rows 列数与源一致（防 A 复发）；
- 出图数：看 Console `[DocBlock] withBlocks`。**若恒 0，先查 `allocateMaterialPool` 是否真返回 `asset_ids`，不要再改渲染侧**（23.3 的根因已在渲染侧修完，剩下的在材料池供给）。
