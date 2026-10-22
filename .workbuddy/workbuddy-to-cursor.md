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

## 二十五、10-21 新产物实测（Ai-v2026921.docx）：图缺失根因 + 题注 SEQ 全是 1

样本：`桌面/抖音商务衬衫polo选品分析-Ai-v2026921.docx`（132 段 / drawings 4 / media 4 / w:tbl 4）
判卷脚本：`ab/audit_1021.py`、`ab/audit_1021b.py`、`ab/cap_check.py`（输出同名 `_out*.txt`）

### 25.0 结论表

| 项 | 结果 | 证据 |
|---|---|---|
| **图缺失（用户报的 1 处）** | **不是白名单拒绝、不是取不到字节，是单图体积闸 `MAX_IMG_BYTES=1.5MiB`** | 段 77 占位文本 `（>1572864B）`，且**无**「不在可用清单」标记 ⇒ ref 合法 |
| 层级对角线 | ✅ 已消除 | 1.1–1.3 / 2.1–2.3 / 3.1–3.4 / 4.1–4.3 连续 |
| 内容表 | ✅ 2/2 成功、5 列齐整 | 表2（4 行×5 列）、表3（6 行×5 列） |
| 图 | 4/5 成功（此前 0） | media 4 个：618/102/39/37 KB |
| 围栏泄漏 | ✅ 0 | ``` / figureref / DOCBLOCK / 裸[n] 全 0 |
| 首句视角介词 | ✅ 0/14（20.3 生效） | 无「从/在/落到/基于」开头 |
| 结论章账本 | ✅ 生效 | 4.1–4.3 引用前文数字（172.6万/42.76%/70.07%/72.18%）并标「（推演）」 |
| **题注编号** | ❌ **5 张图全是「图 1」、2 张表全是「表 1」** | SEQ 域缓存值均为 1，且 `w:dirty` 缺失 |

### 25.1 图缺失：实证根因（P0 待修）

- 位置：段 77，属于 `2.2 polo衫机会价格带`；题注在段 78「图 1 polo衫与男士衬衫价格带分布及同比表现（第4页）」
- 占位原文：
  `［图片缺失：kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/抖音单品爆款分析-商务男士衬衫polo衫_p4_0.png（>1572864B）］`
- **判定链**：
  1. 无「不在可用清单」⇒ 未走 `figure-blocked`，**ref 在白名单内、模型没有改写它**（23.13 生效正确）；
  2. 不是 `resolveAssetBytes` 返回 null（那会是无后缀的 `figure-missing`）；
  3. 文案里的 `（>${MAX_IMG_BYTES}B）` 唯一指向 `DocBlockInjector.ts:440` 的**单图体积闸**。
- **为什么这张超闸**：`…_p4_0.png` 是**页级整页图**（`kb/assets/<doc>/<doc>_p<页>_<i>.png`，未裁切），PNG 直出 >1.5 MiB；而成功注入的 4 张分别是 618 / 102 / 39 / 37 KB（618 KB 那张同样是偏大的整页图，贴着闸）。

**修法（按优先级，勿改渲染侧其它逻辑）**

1. **P0 降采样后再注入，不要丢图** —— `DocBlockInjector.ts:438-447`：
   `bytes.byteLength > MAX_IMG_BYTES` 时先调新增的 `resizeImageBytes(bytes, mime)`（`createImageBitmap` → `OffscreenCanvas` → `convertToBlob({type:"image/jpeg", quality:0.85})`，宽上限取版心 2×：版心 5,400,675 EMU ≈ 5.9in，按 96dpi ≈ 567px，取 1200px 上限足够清晰），压缩后仍超限或环境不支持（无 OffscreenCanvas）才降级 `figure-missing`。
   ⇒ 1.5 MB 的整页图压到 ~200 KB，既不撑爆 docx 也不丢图。
2. **P2 供给侧**：材料池清单若含页级整页图（`_p<页>_<i>.png`）且同页有 `elements/` 裁切图，优先裁切图；后端若能返回 size，清单阶段直接剔除超大图。
3. 阈值 `MAX_IMG_BYTES` / `MAX_TOTAL_IMG_BYTES`（`DocBlockInjector.ts:20-21`）建议做成可配，别写死在渲染层。

### 25.2 题注全是「图 1」/「表 1」（P0，用户可见）

- 题注是**真 SEQ 域**：`<w:instrText> SEQ 图 \* ARABIC </w:instrText>`，7 处（图 5、表 2）
- 但缓存值 `<w:t>1</w:t>` **全是 1**，且 `<w:fldChar>` **没有 `w:dirty="true"`** ⇒ Word 打开后不会自动刷新，用户看到的就是重复的「图 1」。

**修法（二选一，建议都做）**
1. 注入时按已有计数写真序号：`injectDocBlocks` 里已有 `imgN`，表也有对应计数，把缓存值 `<w:t>1</w:t>` 换成 `图 N` / `表 N` 的真实序号；
2. 同时给 `<w:fldChar w:fldCharType="begin">` 加 `w:dirty="true"`（与 TOC 域一致），保证 Word 端刷新。

### 25.3 占位文案把内部 ref 写进正文（P1）

`DocBlockInjector.ts:181` `［图片缺失：${ref || caption || "unknown"}］` + `:444` 的 `ref: "${ref}（>${MAX_IMG_BYTES}B）"`
⇒ 正文出现 `kb:…pdf/…_p4_0.png（>1572864B）` 这种内部串（本次实测已命中）。
**修法**：占位文案只留 `caption`（或「图片缺失」+ 简短人类可读原因），ref 与阈值只进 `console.warn` / `[DocBlock]` 诊断。

### 25.4 仓库卫生

`.workbuddy/tmp/`（助手审计临时文件 `d_vi.txt / d_pc.txt / d_kb.txt / d_ai.txt / ch24.md / append24.py / cleanup.py`）被 dcaaf95 一并提交入库。
请 `git rm -r --cached .workbuddy/tmp` 并在 `.gitignore` 加一行 `.workbuddy/tmp/`（助手侧 UNC 下无法删除，需你操作）。

### 25.5 验收口径（下一轮）

修完 25.1 / 25.2 / 25.3 后，用户 UI 重生成导出，助手跑：
- `audit_1021.py`：drawings 应 = 5（原缺失那张变成图）、缺占位 0、正文无 `kb:` 串；
- `cap_check.py`：题注序号应为 图1–图5 / 表1–表2 递增；
- `audit_1021b.py`：结论章仍引用前文数字、表列数一致。

## 二十六、章节编号重复：模板自动编号 × 手写编号叠加（P0，用户可见）

样本：`Ai-v2026921.docx` 导航窗格显示 `11 大盘机会与品类位次` / `1.1.11.1 男装大盘量额双增` / `3.1.13.1 polo衫面料结构`。

### 26.0 拆解（数字对得上，排除"写了两遍手写编号"）

| 显示 | 自动编号 | 手写编号（`applyDocHeadingNumbers` 写进 label） |
|---|---|---|
| `11 大盘…` | `1`（heading1 / ilvl0，lvlText `%1`） | `1 大盘…` |
| `1.1.11.1 男装…` | `1.1.1`（heading3 / ilvl2，lvlText `%1.%2.%3`） | `1.1 男装…` |
| `1.1.21.2 polo…` | `1.1.2` | `1.2 polo…` |
| `3.1.13.1 polo…` | `3.1.1` | `3.1 polo…` |

⇒ **两份编号都在**：Word 自动编号（来自样式）+ 手写编号（来自 `label` 文本）。

### 26.1 根因证据

1. 模板 `frontend/public/docTemplate-simple.docx` → `word/styles.xml`：
   ```
   styleId=1 heading 1  numPr=<w:numId w:val="1"/>
   styleId=2 heading 2  numPr=<w:ilvl 1/><w:numId 1/>
   styleId=3 heading 3  numPr=<w:ilvl 2/><w:numId 1/>
   … heading 4–9 全部挂 numId=1
   ```
2. `word/numbering.xml`：`num 1 → abstractNum 0`，其 lvlText = `%1` / `%1.%2` / `%1.%2.%3` …
3. 产物 `document.xml` 的标题段**没有显式 numPr** ⇒ 继承样式 ⇒ 自动编号必然显示。
4. `applyDocHeadingNumbers`（`docHeadingDepth.ts:92-105`）把 `${cn} ${baseCh}` / `${cn}.${pn} ${base}` 写进 `label`，模板 `{label}` 渲染成正文 ⇒ 手写编号也在。

**为什么段是三层 `1.1.1`**：段用 `heading 3`（ilvl=2，`%1.%2.%3`），而文档里没有 `heading 2` 段落，中间层计数器恒为 1 ⇒ `章.1.段`。

### 26.2 修法（推荐 A，勿选 B）

**A. 导出时删掉 heading 1–9 样式里的 `<w:numPr>`，保留手写编号体系。**

```ts
// docHeadingLevels.ts 新增
export function stripHeadingAutoNumbering(zip: PizZip): number {
  const f = zip.file("word/styles.xml");
  if (!f) return 0;
  let xml = f.asText();
  let n = 0;
  xml = xml.replace(
    /<w:style [^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<\/w:style>/g,
    (block, _sid) => {
      const name = (block.match(/<w:name w:val="([^"]+)"/) || [])[1] || "";
      if (!/^heading [1-9]$/.test(name)) return block;
      const next = block.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "");
      if (next !== block) n += 1;
      return next;
    },
  );
  if (n) zip.file("word/styles.xml", xml);
  return n;
}
```

调用点（与 `applyHeadingLevels` 同批，generate 之前）：
- `KbOutlineGenDoc.tsx` saveDoc ≈ L259-265
- `AiOutlineGenDoc.tsx` saveDoc 对应位置

**不要动**：`styleId=a/a0/a1…`（中文公文样式，未使用）、`numId=0` 的段落（TOC Heading / 模板 `{#chapters}` 段）。

**B. 改成纯自动编号（不推荐）**：需把段落到 `heading 2`（ilvl=1）以得到 `%1.%2`，同时删掉 `applyDocHeadingNumbers`，并重排 `paragraph.level` 语义（3→2）与 `applyHeadingLevels` 的映射，还会影响 TOC/标题体检/字数公式的 level 判断。改动面远大于 A。

### 26.3 审计盲点（必改）

`ab/audit_1021.py` 只读 `<w:t>`，**读不到 Word 自动编号**，所以前两轮体检都漏了这条。
判卷脚本须新增一项：
- `styles.xml` 里 `name^="heading [1-9]"` 且含 `<w:numPr>` 的样式数（应为 0）；
- 若模板改回自动编号路线，则改为断言标题段显示编号 == 文本编号（不叠加）。

### 26.4 验证副本

助手已用「仅删 heading numPr、其余字节不动」的方式产出：
`桌面/抖音商务衬衫polo选品分析-Ai-v2026921-编号修复验证.docx`
（`heading styles still with numPr: []`、正文显式 numPr 0）
打开导航窗格应为：`1 大盘机会与品类位次` / `1.1 男装大盘量额双增` … `4.3 暂缓与观察`。

注意：该副本**只修编号**，题注「图 1/表 1」重复与图缺失（二十五章）仍在，别拿它当最终验收样本。

## 二十七、二十六复核（已验通过）+ 二十五开工授权（含精确落地坐标）

### 27.0 二十六复核结论：**通过，可以收工**

我逐项核过代码与实跑，不是只看你的回执：

| 项 | 结论 | 依据 |
|---|---|---|
| `stripHeadingAutoNumbering` 实现 | ✅ 正确 | `docHeadingLevels.ts:121-137`：`^heading [1-9]$` 精确匹配 `w:name`，只删本 style 块内首个 `numPr`，返回受影响条数；不动 `TOC Heading`(numId=0) 与公文样式 `a/a0–a5` |
| 双页调用点 | ✅ 均在 `applyHeadingLevels` 之后 | `AiOutlineGenDoc.tsx:228`、`KbOutlineGenDoc.tsx:275`；两页各 1 处 `saveAs`（`:236` / `:283`），**不存在漏调的导出路径** |
| 是否漏段落级 numPr | ✅ 不用处理 | `num_out.txt` 实测：产物 11 个标题段 `numPr=-`（pPr 里无直接 numPr），自动编号**只来自样式**；模板里 `[40]/[50]`（`{#chapters}` / `{/chapters}` 边界段）带的是 `numId=0`＝无编号，无害 |
| jest | ✅ 6/6 全绿 | 我独立复跑 `docHeadingLevels`（169s）：含新加的「二十六·A」，strip 前后 9→0 |
| audit_param.py 增 numPr 审计 | ✅ 已收 | 判卷口径补齐（上一轮我漏掉的根因类型） |

**两条加固（P2，可顺手，勿单独开章）**
1. `stripHeadingAutoNumbering` 的正则 `<w:numPr\b[^>]*>[\s\S]*?<\/w:numPr>` **匹配不到自闭合** `<w:numPr/>`。改成
   `<w:numPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:numPr>)`，防模板被 Word 另存后形态变化。
2. 测试里 `expect(headingWithNum.length).toBe(9)` 硬编码 9，模板若被另存/改版会红。建议改为
   `toBeGreaterThan(0)` + 单独断言 `name` 集合包含 `heading 1`/`heading 3`（语义化，不脆）。

### 27.1 二十五：**开工，按 25.1 → 25.2 → 25.3 顺序做**

下面是我在当前代码上核过的**精确坐标**，照此实现即可一次做对（不再需要你猜）：

#### 25.1 图体积降采样（P0，本轮最优先）

- 闸在 `DocBlockInjector.ts:440`（`MAX_IMG_BYTES = 1.5*1024*1024`，常量在 `:20`），另有总闸 `:448`。
- 改法：**超闸先压，压不动才丢**。把 `:439-447` 的 `if (bytes.byteLength > MAX_IMG_BYTES) { push figure-missing; continue; }` 换成：

```ts
if (bytes.byteLength > MAX_IMG_BYTES) {
  const rs = opts?.resizeImage
    ? await opts.resizeImage(bytes, mime, 1200, 0.85)
    : null;
  if (!rs) {
    items.push({kind: "figure-missing", caption: b.caption || "", ref: ref || "(空)"}); // 文案见 25.3
    continue;
  }
  bytes = rs.bytes; mime = rs.mime; pxW = rs.w; pxH = rs.h;   // 尺寸直接取，别再 readImageSize
}
if (bytes.byteLength > MAX_IMG_BYTES) { /* 压完仍超 → 才降级 missing */ }
```

- 新增（同文件，非导出亦可）：

```ts
export type ResizeImageFn = (
  bytes: Uint8Array, mime: string, maxW: number, q: number,
) => Promise<{bytes: Uint8Array; mime: string; w: number; h: number} | null>;

export const defaultResizeImage: ResizeImageFn = async (bytes, mime, maxW = 1200, q = 0.85) => {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const bmp = await createImageBitmap(new Blob([bytes], {type: mime || "image/png"}));
    const scale = Math.min(1, maxW / Math.max(1, bmp.width));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext("2d");
    if (!ctx) { bmp.close?.(); return null; }
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await cv.convertToBlob({type: "image/jpeg", quality: q});
    const buf = new Uint8Array(await out.arrayBuffer());
    bmp.close?.();
    return {bytes: buf, mime: "image/jpeg", w, h};
  } catch { return null; }
};
```

- **必须做成可注入 hook**（`injectDocBlocks(zip, seq, opts?: {resizeImage?: ResizeImageFn, ...}`）：
  jsdom 无 `createImageBitmap`/`OffscreenCanvas`，不注入就永远走 `null` 分支，单测**覆盖不到成功路径**。
  测试传 fake 返回 `{bytes: <小jpeg>, mime:"image/jpeg", w:900, h:600}` 断言落地为 `kind:"figure"`。
- 已确认配套无坑：`mimeToExt`（`:246`）支持 jpeg；`ensureImageContentTypes`（`:218`）已注册 jpeg/jpg；`readImageSize`（`imageBufferMeta.ts:9`）支持 JPEG SOF0/SOF2 —— 但 resize 分支请直接用返回的 w/h，少一次解析。
- 版心不必操心：显示宽由 `computeInlineEmu`（`:96`）按版心 95% 等比缩放，`maxW=1200` 只是分辨率上限。

#### 25.2 题注 SEQ 全是 1（P0，用户直接可见）

`captionParagraph`（`:75-87`）缓存值写死 `<w:t>1</w:t>`，且 `begin` 的 fldChar 无 `w:dirty`。
**两处一起改**：

```ts
function captionParagraph(seqName: "表"|"图", caption: string, seqValue: number): string {
  ... `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve"> SEQ ${seqName} \\* ARABIC </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:t>${seqValue}</w:t></w:r>` ...
}
```

调用点三处，各自传序号：
- `:149` `buildTableXml(caption, rows)` → 加参 `seqValue`，注入循环里 `++tblN`；
- `:177` `buildFigureXml(item, rId, docPrId)` → 加参，注入循环里 `++capFigN`；
- `:185` `buildMissingFigureXml(caption, ref)` → **缺失/被拒图也会出题注**，所以同样 `++capFigN`（与 Word 刷新后 SEQ 按文档顺序重排的语义一致，两边不会打架）；但 `caption` 为空时它不输出题注 ⇒ 此时**不要** ++（先判 `item.caption ? ++capFigN : 0`）。

注意 `imgN`（`:284`，只数真实 media）与 `capFigN`（凡出题注就 +1）**是两个计数器**，缺失图存在时不相等，别复用。

#### 25.3 占位/报错文案不要把内部 ref 写进正文（P1）

- `buildMissingFigureXml`（`:180-187`）：正文只留人类可读文案。`missing` → `［图片缺失］`；`blocked`（24·D）→ `［图片不可用］`；caption 走题注照常保留。`ref` 只进 `console.warn("[DocBlock] ...")`。
- `:444` 的 `ref: \`${ref}（>${MAX_IMG_BYTES}B）\`` 同步去掉阈值后缀（它最终会经 `countUnresolvedFigures` 冒到 Kb 页红 error，用户会看到 `kb:…png（>1572864B）`）。

#### 25.4 顺手（P2，一行）

`KbOutlineGenDoc.tsx:283` `saveAs(blob, title+"-Ai-v"+...)` —— **KB 页导出却标 `-Ai-v`**（所以你手上那份 KB 产物叫 `…-Ai-v2026921.docx`）。改为 `title+"-Kb-v"+...`。Ai 页 `:236` 保持不变。

#### 25.5 仓库卫生（重申 25.4，仍未做）

`.workbuddy/tmp/`（含我上轮 `ch24/ch25/ch26.md`、`append*.py`、`d_*.txt`）与 `.workbuddy/tmp2/` 已被提交/待提交。
请：`git rm -r --cached .workbuddy/tmp .workbuddy/tmp2` + `.gitignore` 加两行；`frontend/tmp/`（jest 日志）同理。助手侧 UNC 下删不掉。

### 27.6 验收（做完 25.1–25.3 后）

用户 UI 重生成导出新 docx，我跑：
- `audit_1021.py`：`drawings` 应 **5**（原来超闸那张变成图）、缺失占位 **0**、正文无 `kb:` / `（>1572864B）` 串；
- `cap_check.py`：题注应为 **图1–图5 / 表1–表2 递增**，且 fldChar 带 `w:dirty`；
- `num_check.py`：导航窗格 `1 / 1.1 …`（二十六回归）；
- `audit_1021b.py`：结论章仍引用前文数字、表列数一致（防回归）。

jest：`docFigureSupply` / `docFenceDegrade` / `docHeadingLevels`（含新加的 resize hook 用例）全绿。

## 二十八、KB 页新产物（Kb-v2026921.docx）判卷：二十五三项全部生效，剩 1 处 blocked

判卷脚本：`ab/judge.py`（新，一份跑完 9 项；用法 `python judge.py <docx> [out]`），输出 `ab/judge_out.txt`。
样本：`桌面/抖音商务衬衫polo选品分析-Kb-v2026921.docx`（**KB 页**，与上一轮 Ai 页产物不同源，勿直接对比）。

### 28.0 判卷总表

| 项 | 结果 | 证据 |
|---|---|---|
| **25.1 降采样** | ✅ **生效** | media 里出现 `img3.jpeg 111.3KB`、`img4.jpeg 106.4KB`（jpeg = 压缩产物），此前这两张必被 1.5MiB 闸丢弃 |
| **25.2 题注序号** | ✅ **生效** | 图 1–7 / 表 1–2 严格递增，缓存值 = 真实序号，7 处 fldChar 全部带 `w:dirty="true"` |
| **25.3 占位文案** | ✅ **生效** | 正文 `kb:` = 0、`（>` = 0；占位只剩「［图片不可用］」 |
| **二十六 编号** | ✅ 保持 | styles.xml heading numPr = 无；标题 `1 / 1.1 … 4.3` 干净，无 `^\d+\.\d+\.\d` 叠加 |
| 图 | 6/7（此前 4/5） | drawings 6，成功图在 1.1/1.2/1.3/2.1/3.1/3.2 |
| 内容表 | ✅ 2/2，5 列齐整 | 表1（5行×5列）、表2（6行×5列）；另 2 个 `w:tbl` 是模板封面 |
| 正文字数 | ✅ 中位 303（n=13，204–366） | 契约 200–400，命中率 13/13 |
| 20.3 首句介词 | ✅ 0/13 | 无「从/在/基于…」开头 |
| 十九·5 账本 | ✅ 生效 | 4.1/4.3 正文引用前文数字（72.18%、70.07%、¥100-200）并带「（推演）」 |
| 泄漏扫描 | ✅ 全 0 | ``` / figureref / tablecaption / DOCBLOCK / ⟦ 在 raw XML 中均为 0 |
| **图 7（4.2 段）** | ❌ **［图片不可用］= blocked** | 题注「图 7 商务休闲风渗透的男装品类分布」仍生成，但图没进来 |

### 28.1 图 7 blocked：定位路径（本轮唯一 FAIL，请按顺序自查）

现象链：段 53（4.2 属性配置取舍）→ 段 54 正文 270 字 → 段 55「［图片不可用］」→ 段 56 题注「图 7 …」。
按 24·D 的语义，占位文案为「图片不可用」⇒ **走的是 `figure-blocked`（ref 不在段级白名单），不是取字节失败、也不是体积闸**。

我已排除的两条：
1. 不是体积闸 —— 25.1 生效后超闸图会变成 jpeg 成功注入（`img3/img4` 就是证据）；
2. 不是 ref 归一问题 —— 24·C 已用 `normalizeKbAssetRef` 两侧共用。

**剩下两条可能，请按下述顺序自查（不要跳）**：

1. **段级白名单是否为空**？结论章（4.x）由十九·5 两相生成，若材料池没给 4.x 分配 `key_assets`，`allowedFigureRefs` 就是 `[]`，那么模型写的任何 ref 都会 blocked。
   ⇒ 在 `DocBlockInjector` 的 blocked 分支里 **console 打印 `ref` 与 `allowed.length`**（现在只留了净化文案，无法自查）。若 `allowed.length === 0`，根因在**材料池分配器（4B）**，不在渲染侧。
2. **若 `allowed.length > 0`**：说明是模型改写了 ref（23.13 的老问题在此段复发），或 `allowFigure` 判定用的清单与 `collectParagraphAllowedFigureRefLists` 的段级清单**不是同一份**（21.9 与 23.13 的判定源请对齐核一遍）。

治理建议（顺序）：
- P0：blocked 时 console 打 `ref` + `allowed.length` + `allowed.slice(0,3)`；
- P1：`allowed.length === 0` 的段落，生成阶段就该 `allowFigure=false`（21.9 已有机制，确认它用的是**段级**清单而非全库/全局前 12）—— **从源头不让模型写 figure，比事后拦截更好**；
- P2：blocked 的段不应留下题注（段 56「图 7 …」空挂一个题注更刺眼），建议 blocked 时不生成 captionParagraph。

### 28.2 新实证：KB 资产体积分布（关系到 25.1 的 P2 建议，现在有硬数据）

`backend/data/knowledge_base/服装/assets/抖音单品爆款分析-商务男士衬衫polo衫/`：
- **整页图 18 张**：1.05 MB ~ 10.5 MB（p1_0=3.35MB、p2_0=1.88MB、p4_0=1.95MB、p16_0=10.5MB…）⇒ **17/18 张都过不了 1.5MiB 闸**，必须靠降采样；
- **裁切图 `elements/` 82 张**：100 KB ~ 323 KB ⇒ 完全不需要压缩，且数量是整页图的 4.5 倍。

⇒ 25.1 的 P2 建议升级为 **P1**：
1. 材料池/清单**优先给 `elements/` 裁切图**，整页图只在同页无裁切图时兜底（清单排序时把 `_p<页>_<i>.png` 排到 `elements/` 之后）；
2. 清单阶段若后端能返回 size，**直接剔除 >2MB 的整页图**（现在前端要先下载 10MB PNG 再压，白白浪费带宽与时间）；
3. 成功注入的 `img1.png 618.7KB` 说明清单里也在给偏大的整页图 —— 与第 1 条一起修。

### 28.3 P2 小瑕疵（可顺手）

- **表 2 题注带模型批注**：「表 2 男士衬衫各价格带销量与销售额表现对照（表已截断）」——「（表已截断）」是模型写进 caption 的自述，进了题注很难看。
  ⇒ caption 落库前清洗：去掉 `（表已截断）`/`（图略）` 之类括号自述（建议做成 `cleanDocCaption()`，与 25.3 的文案净化同源）。
- 目录区出现 `toc 1` 与 `目录 1` 两个样式段（模板自带，w=0 靠 TOC 域刷新），暂不影响，记录即可。

### 28.4 判卷口径修正（我这边，已修）

`judge.py` 第一版把**表格单元格的 `<w:p>` 也算成正文段**，导致字数中位被拉到 3 字、首句检查样本为 0（误判）。
已修：统计正文前先 `re.sub(r"<w:tbl>.*?</w:tbl>", "", x)`，且正文段判定改为「非 heading 样式 + 非题注」，`drawings` 仍用原文计数。
**以后所有 OOXML 判卷脚本都必须先剔除 `<w:tbl>` 再统计段落。**

### 28.5 下一轮验收

修完 28.1 后重生成导出：
- `judge.py`：drawings = 7（或 6 且**无** blocked 题注空挂）、缺失占位 0、图序号连续、表列数齐整；
- 若图 7 变成「不出现 figure 块但也不留题注」，同样算 PASS（源头禁图成功）。

## 二十九、`[文档N]` 为什么还在：不是残留，是「标了编号却没给对照表」

体检脚本：`ab/cite_check.py`（输出 `ab/cite_out.txt`）。

### 29.1 实测：24 处 / 9 段 / 编号 1、2、3

```
总出现 24，落在 9 个正文段；编号分布 文档1×14、文档2×6、文档3×4
位置：全部在句末、句号之前（…环比+10.2%[文档1]。）✅ 规范
落在标题或题注里：0 ✅
堆叠 [文档1][文档2]：1 处（段 49）—— 符合提示词第 4 条「可在句末用 [文档1][文档2] 标注」的契约，不算 bug
```

### 29.2 结论：**这是设计内的来源标注，不该当残留删掉**

- 后端 `kb_service.py:926-928`：检索片段就是按 `[文档{i}] 来源：{source} 第X页` 喂给模型的，**编号有真实出处**，不是模型编的；
- 提示词 `parseChatCompletion.ts:171`（`hasRetrieval=true` 分支）第 4 条主动要求「可在句末用 [文档1][文档2] 标注引用（禁止裸写 [1][2]）」；
- 剥离闸 `stripHallucinatedDocCitations` **只在 `AiOutlineGenDoc.tsx:342` 调用**（Ai 页无检索 → 禁止并剥离），**Kb 页有意不调用**。

### 29.3 但它现在是半成品，有两个真缺陷

**① 前端把来源清单数据丢了（P0）**
后端 `ref_docs` 每条都带了 `{id, title, source, kb_name, chunk_id, page, link}`（`kb_service.py:929-943`），**就是现成的「资料来源」清单**。
但前端 `grep -rn "ref_docs\|refDocs" src/` **零命中** —— 数据回来了，没保存也没用。
⇒ 读者看到 `[文档1]` 根本不知道是哪份文件，**标注的信息量等于 0，只剩噪音**。

**② 编号作用域是「单次检索」，不是全文（P1，致命）**
段正文是**每段一次独立 HTTP 全并行**（`KbOutlineGenDoc.tsx:450` 起），每段的检索各自从 `[文档1]` 重新编号。
⇒ 段 15 的 `[文档1]` 与段 28 的 `[文档3]` **可能指向同一份文件，也可能不是**，跨段编号不可比。
这意味着：**在编号全局化之前，做不出「文档1 = 某文件」的精确映射表**（做了就是错表）。

### 29.4 修法（按优先级）

**P0 —— 文末追加「资料来源」，只列文件、不带编号映射**
- 数据来源：`ref_docs`（生成阶段按段保存，去重后聚合页码），无需新接口；
- 文案形态（不带编号，规避 ② 的错配风险）：
  ```
  资料来源
  · 抖音单品爆款分析-商务男士衬衫polo衫.pdf（第 4、7、11 页）
  · ×××行业周报.pdf（第 2 页）
  ```
- **⚠️ 别把它加成第 5 章**：新增章会污染 `buildHeadingLevelPlan` / `applyHeadingLevels` 的段序（编号会变成「5 资料来源」、TOC 也跟着变）。
  正确做法：**在 `applyHeadingLevels` 与 `stripHeadingAutoNumbering` 之后**再 append 一段段落，样式用 `Normal`/列表样式（或 `heading 1` 但**不进 chapters 数组**，手写文本即可）。

**P1 —— 编号全局化（做完它才能开精确映射/脚注）**
- 生成前先建「本次生成的全局文档表」：把所有候选 source 去重排序 → 固定编号，写进每段的约束提示词（替换现在「[文档1][文档2]」的开放写法），模型只能用表内编号；
- 之后 `[文档N]` 跨段一致，文末可出「文档1 = 文件名」精确表，甚至可升级为脚注。

**P2 —— 导出开关**
「保留来源标注 / 纯正文」二选一；选纯正文时复用 `stripHallucinatedDocCitations`（它现在是 Ai 页专用，抽成公共函数即可，KB 页也能用）。

### 29.5 我的判卷口径更新

`[文档N]` **不计入泄漏扫描白名单之外的问题**（此前 judge.py 把它列在扫描项里，但不判 FAIL）。
判卷新增两条：
1. 文末是否存在「资料来源」小节（P0 落地后）；
2. 引用是否落在标题/题注（应为 0）、是否句中乱插（应只在句末）。

### 29.6 验收

P0 落地后重生成导出：正文 `[文档N]` 仍在（设计内）✅、文末出现去重的文件名+页码清单、章节编号仍是 1–4（没有多出「5 资料来源」）、TOC 不变。

## 三十、来源标注开关：保留 / 隐去（用户拍板，P1 落地）

### 30.0 需求

用户拍板：`[文档N]` 要有开关，能隐去也能保留；**研究性文档倾向保留**。
⇒ 做**文档级开关**，并把二十九章的「资料来源清单」挂在开关下面联动。

### 30.1 现状（确认过，别改错地方）

- `stripHallucinatedDocCitations`（`parseChatCompletion.ts:195-211`）：纯函数，删 `[文档N]` + 收敛空格/标点，**Ai 页专用**（`AiOutlineGenDoc.tsx:342`）。
- KB 页提示词 `parseChatCompletion.ts:171`：`hasRetrieval=true` 分支第 4 条要求「可在句末用 [文档1][文档2] 标注」；`false` 分支禁止。
- KB 页操作区（`KbOutlineGenDoc.tsx:813-824`）：「选择大纲 / 内容生成 / 文档下载」三个 dashed 按钮，目前**没有 Checkbox/Switch**。
- 体裁轴（十八章的 report/selection/review/generic/research）**代码里尚未落地**（`grep Genre` 零命中）⇒ 本轮**不要**做"按体裁给默认值"，先做全局开关，体裁默认值留 P2。

### 30.2 落地设计（照此实现）

**① 状态与持久化**

```ts
const KEEP_CITE_KEY = "bifang.doc.keepCitations";
const [keepCitations, setKeepCitations] = useState<boolean>(() => {
  const v = localStorage.getItem(KEEP_CITE_KEY);
  return v === null ? true : v === "1";   // 默认保留（研究性文档需要）
});
const onKeepCitationsChange = (v: boolean) => {
  setKeepCitations(v);
  localStorage.setItem(KEEP_CITE_KEY, v ? "1" : "0");
};
```

**② UI**（`KbOutlineGenDoc.tsx`，放在「文档下载」按钮**上方**，与按钮同宽）

```tsx
<div style={{marginBottom: 8}}>
  <Checkbox checked={keepCitations}
            onChange={(e) => onKeepCitationsChange(e.target.checked)}>
    保留来源标注 [文档N]
  </Checkbox>
  <div style={{fontSize: 12, opacity: 0.65, marginTop: 2}}>
    {keepCitations ? "正文保留 [文档N]，导出时自动附「资料来源」" : "正文隐去 [文档N]，导出时不附来源清单"}
  </div>
</div>
```
`Checkbox` 从 `antd` 引入（页面已在用 Button/Tag/Flex/Spin 等 antd 组件）。**Ai 页不加这个开关**（无检索，恒隐去）。

**③ 提示词端（影响新生成的内容）**
`buildKbDocWritingConstraintPrompt(budget, {hasRetrieval, allowCitations})` —— 增加 `allowCitations?: boolean`：
- `hasRetrieval && allowCitations` → 现在的第 4 条（可标注）；
- `hasRetrieval && !allowCitations` → 换成「禁止输出任何 [文档N] 类引注标记，数据照常给，但不标出处」（与 Ai 页那条同源措辞）。
调用点 `KbOutlineGenDoc.tsx:442` 传入 `keepCitations`。**默认行为保持不变**（`allowCitations` 缺省 = true）。

**④ 导出端（兜底，对已生成内容立即生效，不必重生成）**
在 `saveDoc()` 里、渲染之前：
```ts
const srcChapters = keepCitations ? chapters : stripCitationsDeep(chapters);
```
⚠️ **必须深拷贝后再剥**——直接改 `chapters` 里的 content 会把标注永久删掉，开关切回「保留」也找不回来。
新增纯函数（建议放 `parseChatCompletion.ts`，与剥离函数同文件）：
```ts
export function stripCitationsDeep<T>(chapters: T[]): T[]  // 结构克隆 + 对每个段落 content 跑 stripHallucinatedDocCitations，返回 stripped 总数
```
导出后 `console.info("[DocCite] 隐去来源标注 N 处")`。

**⑤ 与「资料来源」清单联动（二十九章 P0）**
- `keepCitations === true` ⇒ 文末追加「资料来源」（去重文件名 + 页码）；
- `keepCitations === false` ⇒ 不追加（正文都隐去了，列清单反而突兀；等 P2 再加"仍附数据来源"选项）。

**⑥ 追加位置的老坑再强调一次**（二十九·P0 已写，别忘）
「资料来源」必须在 `applyHeadingLevels` + `stripHeadingAutoNumbering` **之后** append，且**不进 `chapters` 数组**，否则会被算成第 5 章（`5 资料来源`），把二十六刚修好的编号和 TOC 又弄坏。

### 30.3 顺序建议

`③ + ④`（开关本体，1 小时内可完）→ `②` UI → `⑤` 资料来源清单（二十九 P0）。
`stripCitationsDeep` 与 `allowCitations` 各补 1 条 jest（放进 `tests/docFenceDegrade.test.ts` 或新建 `tests/docCitation.test.ts`）。

### 30.4 验收（我来跑）

1. 开关 = 保留：正文 `[文档N]` 在、文末有「资料来源」、章节编号仍是 1–4；
2. 开关 = 隐去：正文 `judge.py` 的 `[文档` 计数 = 0、无连续空格/「 ，」这类剥离残留、文末无清单、字数与保留版基本一致（差 = 标注字符数）；
3. 开关来回切：**保留版导出后切到隐去再切回保留，标注仍在**（验证 ④ 没改坏 state）；
4. 不重生成、只切开关再导出，隐去应立即生效（验证 ④ 的兜底路径）。

## 三十一、当前执行序（用户已确认，按此开工，勿跳步）

只做下面 3 个任务，做完就停，等用户重生成导出后由助手判卷。不要顺手改别处。

### 任务 1 —— 28.1：定位 4.2 段图 7 的 blocked（先定位，别急着改业务）

1. `DocBlockInjector.ts` 的 blocked 分支增加诊断输出：
   `console.warn("[DocBlock] figure-blocked", {ref, allowed: allowed.length, sample: allowed.slice(0,3)})`；
2. 同一分支加 jest 断言（放进 `tests/docFigureSupply.test.ts`）：blocked 时 `kind === "figure-blocked"` 且 caption 保留；
3. **先只做诊断**，把结论写进 `.workbuddy-handoff.md`：
   - `allowed.length === 0` ⇒ 根因在**材料池分配器（4B）**，结论章（4.x）没分到 `key_assets`。此时再做：确认 `allowFigure` 用的是**段级**清单（21.9 与 23.13 判定源对齐）；段级清单为空时生成阶段就该 `allowFigure=false`（源头禁图）。
   - `allowed.length > 0` ⇒ 是模型改写 ref（23.13 复发）或两份清单不一致，按 28.1 第 2 条处理。
4. 顺带（P2，同文件）：blocked 段**不要生成题注**（现在段 56 空挂一个「图 7 …」更难看）。

### 任务 2 —— 三十章：来源标注开关（提示词端 + 导出端 + UI）

1. `parseChatCompletion.ts`：`buildKbDocWritingConstraintPrompt(budget, {hasRetrieval, allowCitations})` 增 `allowCitations`（缺省 true，行为不变）；
2. 同文件新增 `stripCitationsDeep(chapters)`：**深拷贝** + 对每个段落 content 跑 `stripHallucinatedDocCitations`，返回剥离总数；
3. `KbOutlineGenDoc.tsx`：`useState` + localStorage `bifang.doc.keepCitations`（默认 true）；「文档下载」按钮上方加 antd `Checkbox`；`saveDoc()` 内 `keepCitations ? chapters : stripCitationsDeep(chapters)`；
4. jest：`allowCitations=false` 的提示词含「禁止输出任何 [文档N]」；`stripCitationsDeep` 不改入参（深拷贝验证）+ 剥离计数正确。

### 任务 3 —— 二十九·P0：资料来源清单（挂在开关下）

1. 生成阶段保存后端返回的 `ref_docs`（目前前端零消费，`kb_service.py:929-943` 已返回 `{id,title,source,page,link}`）；
2. 导出时若 `keepCitations === true`：在 `applyHeadingLevels` + `stripHeadingAutoNumbering` **之后** append 一段「资料来源」（去重文件名 + 聚合页码），**不进 `chapters` 数组**；
3. 必须验证：章节编号仍是 1–4，没有多出「5 资料来源」，TOC 不变。

### 仓库卫生（顺手，1 行）

`git rm -r --cached .workbuddy/tmp .workbuddy/tmp2 frontend/tmp` + `.gitignore` 加这三行。助手侧 UNC 下删不掉。

### 交付与验收

- 每个任务各跑相关 jest 全绿后在 handoff 写明；
- 三个任务完成后用户 UI 重生成导出新 docx，助手跑：
  `ab/judge.py`（drawings/题注/编号/字数/泄漏）、`ab/cite_check.py`（引用计数与位置）、以及开关两种取值各导出一份对比。

## 三十二、开关版两份产物判卷：三件事（日期月份、图文不符、图仍 blocked）

样本：`桌面/…-Kb-v2026921-开.docx`（开关=保留）、`…-Kb-v2026921-关.docx`（开关=隐去）。
判卷：`ab/judge.py`、`ab/cite_check.py`、`ab/space_check.py`、`ab/extract_media.py`。

### 32.0 开关本身：**PASS**

| 项 | 开（保留） | 关（隐去） |
|---|---|---|
| 正文 `[文档N]` | 21 处 ✅ | **0 处** ✅ |
| 文末「资料来源」 | 7 行（去重文件名 + 聚合页码）✅ | **无** ✅（联动正确） |
| 剥离残留（空格+标点/空括号/行首空格） | — | **全 0** ✅ |
| 章节编号 / TOC | 1–4，无叠加 ✅ | 1–4 ✅ |
| 题注 | 图1–4 / 表1–4 递增 + dirty ✅ | 图1–6 / 表1–2 ✅ |
| 泄漏（``` / figureref / DOCBLOCK / kb:） | 全 0 ✅ | 全 0 ✅ |

⚠️ **验收姿势要改**：这两份是**两次独立生成**（开版 4 图/4 表，关版 6 图/2 表，正文字数 5857 vs 5850），内容不同 ⇒ 不能直接对比字数与图表数。
正确做法：**生成一次 → 只切开关导出两次**，才能证明"隐去只删标注、不动正文"。

### 32.1 日期版本号月份小 1（P0，纯 bug，4 处）

`getMonth()` 返回 0–11，均未 +1：
- `KbOutlineGenDoc.tsx:237`（KB→Word，用户手上 `2026921` = 2026-9-21，实际 10-21）
- `AiOutlineGenDoc.tsx:180`（Ai→Word）
- `AiOutlineGenPpt.tsx:255`（Ai→PPT）
- `KbOutlineGenPpt.tsx:304`（KB→PPT，**且 `:305` 文件名写成 `-Ai-v`，应为 `-Kb-v`**）

统一修法（4 处都换，别各写一套）：

```ts
const p2 = (n: number) => String(n).padStart(2, "0");
const curSimpleDateStr =
  `${curDate.getFullYear()}${p2(curDate.getMonth() + 1)}${p2(curDate.getDate())}`;
```
顺带的好处：现在 `10 月 5 日` 会生成 `2026105`（与 `2026-1-05` 混淆），补零后恒为 8 位 `20261005`。

### 32.2 「衣服取了裤子和鞋」——不是幻觉，是图清单里没有语义（P0）

**实证**：我把 `…关.docx` 的 media 解包看过，`img6.png`（694×1580，竖长条）**就是一条牛仔裤 + 黑色皮鞋**，却被放在 `3.4 热销店铺与销量`，题注写成「抖音电商热销爆款店铺示例」。

根因两层：

**① 图清单给模型的是纯 ref、没有 caption（直接原因）**
`DocKeyAssetRow`（`docFigureAssets.ts:12-18`）只有 `source / file_name / asset_ids / page / chunk`，**没有 caption**。
`buildFigureAssetAppendix`（`:168-172`）虽然支持 `建议图注：${e.caption}`，但从 `keyAssets` 构造时拿不到 caption ⇒ 模型看到的是：
```
- kb:24SS抖音风格趋势白皮书-男装.pdf/…_p9_img2.png
```
它只能凭**文件名猜内容**，于是"店铺示例"猜到了牛仔裤图。**这不是模型乱编 ref（blocked 才是），是白名单内盲选。**

**② 跨文档污染（放大原因）**
这次的「资料来源」暴露了检索范围：**7 份文档**，含
`2024抖音服饰行业趋势报告` / `2025春夏运动男装数据洞察` / `24SS抖音风格趋势白皮书-男装` / **`抖音单品爆款分析-连衣裙`** / `抖音单品爆款分析-男装T恤` / `…商务男士衬衫polo衫` / `男装消费趋势洞察-艺恩`。
衬衫章节分到了运动男装/趋势报告的 chunk，其 `asset_ids` 里就是牛仔裤图。

**修法（按优先级）**

1. **P0｜`key_assets` 行补 `captions: string[]`（与 `asset_ids` 同序）**，后端从图注/页文本/OCR 里取；前端拼进 `建议图注：`。
   没有这一步，任何"让模型自己选图"的方案都是盲选。这是本次最根本的一处。
2. **P0｜图-段主题相关性闸（前端兜底）**：候选图的 `source` 文档名与段标题/正文的品类词冲突（如段讲"衬衫/polo"，source 含"连衣裙/运动/裤/鞋"）→ 不作为候选；白名单为空时 `allowFigure=false`（源头禁图）。
3. **P1｜检索 scope 收紧**：有绑定源文档时**默认单文档**（产品已定）；全库检索时材料池按文档级相关性先过滤，别把 7 份不同品类一起塞进一章。
4. **P2｜图形态规则**：`h/w > 1.6` 的竖长条视为单品图，只在段标题含「款式/示例/单品/穿搭」时允许；「店铺/大盘/价格带」类段禁止单品图。

### 32.3 图 7 仍「［图片不可用］」（4.2 段，两版都在）

`28.1` 的题注去除已生效（blocked 段不再空挂题注 ✅），但 blocked 本身还在。
Cursor 已加诊断 `console.warn("[DocBlock] figure-blocked", {ref, allowed, sample})`，**需要用户下次生成时看一眼 Console 的 `allowed` 值**，一句话定案：
- `allowed: 0` ⇒ 段级白名单为空 ⇒ **材料池 4B 没给 4.2 分配 key_assets**（此时 21.9 本应 `allowFigure=false`，请一并核为何模型仍写了 figure——说明 `allowFigure` 与 `allowedFigureRefs` 的取值时点不一致）；
- `allowed: >0` ⇒ 模型改写 ref（幻觉），按 23.13 处理。

### 32.4 P2：题注仍混模型自述

开版 `表 2 / 表 3` 题注带「（表已截断）」。`cleanDocCaption()` 尚未做，建议与 25.3 文案净化同源处理。

## 三十三、生成内容列表页：插图可视化 + 手动换图（2026-10-21）

### 33.0 诉求与结论

用户问：生成内容列表页能不能把「图引用」的图直观显示出来，要不要让用户选。

**结论：能，且必须做。** 三档：P0 显示（本轮必做）、P1 段内换图（本轮必做）、P2 跨候选扩选（下一轮）。

为什么现在必须做（成本账）：
- 现状 `OutlineResultDoc.tsx:96` 只渲染 `paragraph.content`（pre-wrap）+ 一个「含图N」Tag，
  **图在导出前完全不可见**。上一轮三十二章「3.4 热销店铺配了牛仔裤+皮鞋」只能在导出的 docx 里发现，
  返工成本 = **一次完整生成（13 段 × HTTP）+ 一次导出**；做成列表页可视化后，返工 = 一次点击。
- 三十二章的 blocked（4.2 图不可用）同理：现在是导出后才知道，做成列表页卡片后**当场可补图**，
  不必重生成——这比继续查 28.1 的 allowed.length 更快见效。

### 33.1 可行性：数据与接口全部就绪（已核过，不需要后端改造）

| 需要的东西 | 现状 | 位置 |
|---|---|---|
| 本段用了哪张图 | `paragraph.blocks: DocBlock[]`，figure 块含 `assetRef` + `caption` | `ViewItem4Doc.ts:117-119`、`ViewItem4Doc.ts:131` |
| 本段候选图清单 | `paragraph.allowedFigureRefs: string[]`（生成时写入，6 条上限） | `ViewItem4Doc.ts:158-162`、`KbOutlineGenDoc.tsx:473-479` |
| 图片可直接 `<img>` 显示 | 后端 `list_assets` 返回 `url: /knowledge_base/asset_file?kb&file_name&asset_id`；该路由**无鉴权依赖**，直接 `FileResponse` | `kb_service.py:594`、`routers/knowledge_base.py:243-258` |
| asset_id 解析 | `resolve_asset_path` 支持 `elements/xxx_p4_img1.png`、`whole/page_4.png`、`xxx_p4_0.png`（normalize_asset_id 多候选），且拒绝路径穿越 | `kb_service.py:678-699` |
| 可复用的选图交互 | PPT 侧已有 `ImageGridAssetPicker`（宫格 + 手选 + 回写） | `ImageGridAssetPicker.tsx`，`OutlineTreeEditor.tsx:877` |

⚠️ 所以**不要先调 `listAssets` 再拿 url**——`ref` 里 fileName/assetId 都有，直接拼 url 即可，零额外请求。
`listAssets` 只在 P2 扩选（要拉候选以外的图）时才用。

### 33.2 P0：段内插图卡片（显示）

在 `OutlineResultDoc.tsx:96` 的 `{paragraph.content}` 下面追加 `<FigureStrip>`：

```tsx
// 新增 src/components/DocUtil/DocFigureStrip.tsx（纯展示 + 可选换图入口）
type Props = {
  paragraph: Paragraph;
  kbName?: string;
  editable?: boolean;
  onPick?: (blockIndex: number, nextRef: string, nextCaption?: string) => void;
};
```

每段渲染规则（`paragraph.blocks` 全量遍历，保持与 `prepareChaptersBlocks` 同序）：

1. `kind === "figure"` 且能 `parseKbAssetRef` → 卡片：缩略图（max-height 160px）+ caption +
   来源小字（`fileName` + `p{page}`）+ **风险标记**。
2. 同一个 figure 块若渲染期判为 missing/blocked，卡片盖红色角标「导出将缺失」，并给「选一张」按钮（见 33.6）。
3. `blocks` 为空但 `countParagraphMedia` 说有图（即围栏还在 content 里、未 absorb）→ 显示
   「图未解析」灰卡，提示重生成该段。这种情况理论上不该出现，出现即 Bug，值得告警。

**风险标记（三十二章的教训，直接前置到 UI）**：
- 整页图（assetId 以 `whole/` 开头，或不匹配 `_p(\d+)_(img|chart)\d+`）→ 标「整页图·将降采样」；
- `h/w > 1.6` 的竖长条 → 标「竖版单品图」（裤鞋图就是这个形态，用户一眼能看出不对）；
- 图片 `onError` → 标「加载失败」，不要静默空白。

### 33.3 P1：段内换图（选择）

交互：**默认只展示，不打断**。卡片右上角一个「换图」按钮 → `Modal` 里宫格展示本段
`allowedFigureRefs` 的全部候选（缩略图 + caption + 来源），点选即写回。

```
卡片: [缩略图] 图题xxx
      抖音单品爆款分析-…pdf · p4 · 整页图·将降采样   [换图] [移除]
```

写回逻辑（页面侧回调，以 `KbOutlineGenDoc.tsx` 为例）：
```tsx
const onFigureChange = (chKey: string, pKey: string, blockIndex: number, nextRef: string) => {
  setChapters(prev => prev.map(ch => {
    if (ch.key !== chKey) return ch;
    return {...ch, paragraphs: (ch.paragraphs || []).map(p => {
      if (p.key !== pKey) return p;
      const blocks = [...p.blocks];
      const b = blocks[blockIndex];
      if (!b || b.kind !== "figure") return p;
      blocks[blockIndex] = {...b, assetRef: nextRef};
      // ★ 33.5：手选 ref 必须并进白名单，否则导出被判 figure-blocked
      const allowed = Array.isArray(p.allowedFigureRefs) ? [...p.allowedFigureRefs] : [];
      if (!allowed.includes(nextRef)) allowed.push(nextRef);
      return {...p, blocks, allowedFigureRefs: allowed};
    })};
  }));
};
```

「移除」= 从 `blocks` 里 splice 掉该 figure（不要把 `allowedFigureRefs` 清空，
否则同段后续再换图会全 blocked）。

### 33.4 P2：跨候选扩选（下一轮）

`allowedFigureRefs` 上限是 6 条（`figureAssetsFromAssignedKeys(assigned, keyAssets, 6)`，
`KbOutlineGenDoc.tsx:473`），模型只能在里面挑。用户若都不满意：
Modal 里加「更多」→ `listAssets({knowledge_base_name: kbName, file_name: <本段候选的 fileName>, kinds: "image,chart"})`
（默认 kinds 返回的正是 `elements/` 裁切图，100–323 KB，符合三十二章「优先裁切图」的结论）。
选中的同样按 33.5 并入白名单。

### 33.5 ★ 最容易踩的坑：手选 ref 必须同步进白名单

渲染期校验在 `DocBlockInjector.ts:486-514`：段级白名单来自
`collectParagraphAllowedFigureRefLists(chapters)`（`docFigureAssets.ts:118-136`），
不匹配 → `kind: "figure-blocked"` → 导出变「［图片不可用］」。

即：**用户手选成功、UI 显示正常、导出却是空图**。所以 33.3 那段 `allowed.push(nextRef)` 是硬要求，
不是可选优化。建议在 `docFigureAssets.ts` 加纯函数便于单测：

```ts
/** 三十三·5：手选后同步白名单（纯函数，可测） */
export function applyManualFigureRef(
  p: {blocks: Array<{kind: string; assetRef?: string}>; allowedFigureRefs?: string[]},
  blockIndex: number,
  nextRef: string,
): {blocks: Array<{kind: string; assetRef?: string}>; allowedFigureRefs: string[]} {
  const blocks = p.blocks.map((b, i) =>
    i === blockIndex && b.kind === "figure" ? {...b, assetRef: nextRef} : b);
  const allowed = [...(p.allowedFigureRefs || [])];
  if (!allowed.includes(nextRef)) allowed.push(nextRef);
  return {blocks, allowedFigureRefs: allowed};
}
```

### 33.6 blocked / missing 段：列表页直接补图（顺带收敛 28.1）

生成结束、导出之前，`blocks` 里不会有 blocked 记录（那是**渲染期**才判的）。所以要在列表页预判，
用同一套归一口径提前算一遍：

```ts
// 与 DocBlockInjector 同源：normalizeKbAssetRef + allowed 集合
export function previewFigureStatus(p: Paragraph): Array<{index: number; ok: boolean; reason?: string}> {
  const allowed = new Set((p.allowedFigureRefs || []).map(normalizeKbAssetRef));
  return p.blocks.flatMap((b, i) => {
    if (b.kind !== "figure") return [];
    if (allowed.size === 0) return [{index: i, ok: false, reason: "本段无可用插图资产"}];
    if (!allowed.has(normalizeKbAssetRef(b.assetRef))) return [{index: i, ok: false, reason: "ref 不在本段候选内"}];
    return [{index: i, ok: true}];
  });
}
```

`ok: false` 的卡片直接显示红角标 + 「选一张」（走 33.3 同一 Modal，候选 = `allowedFigureRefs`）。
用户补完再导出，即可绕过 4.2 的 blocked —— **这条落地后，28.1 的 Console 诊断就不阻塞验收了**。

### 33.7 UI / 性能要点

- `OutlineResultDoc` 是 antd `Collapse accordion`，**同时只展开一个段** ⇒ 天然懒加载，
  不必额外做虚拟列表；但候选 Modal 打开时才发图请求即可。
- 图片 url 走 `<img src>`（后端无鉴权），**不要**用 `fetchAssetBytes` 转 blob URL
  （`kb.ts:198`），那是导出链用的，UI 侧用会多一次全字节下载（整页图 10 MB）。
- `OutlineResultDoc` 需要新增 props：`kbName?: string`、`onFigureChange?: (...)`。
  **Ai 页（`AiOutlineGenDoc.tsx:568`）不传 kbName/回调即可**（Ai 页 `allowFigure=false`，
  `AiOutlineGenDoc.tsx:290/:301`，本就无图）；`KbOutlineGenDoc.tsx:919` 传 `kbName={kbName}` + 回调。
- 缩略图加 `loading="lazy"`、`object-fit: contain`、灰度底，避免长图撑破面板。

### 33.8 验收（我会这样判）

1. 列表页展开任一段：能看到该段引用的图（不是只看到「含图1」）；
2. 点「换图」选另一张 → 卡片图立即变化 → **导出 docx 里是新选的那张**（验证 33.5 白名单同步）；
3. 选一张后切回原图，仍能正常导出（验证 allowed 追加不会误伤）；
4. 4.2 段若显示红角标，补一张后导出，docx 里该段有图、「［图片不可用］」计数 = 0；
5. jest：`applyManualFigureRef` / `previewFigureStatus` / `parseKbAssetRef`（含 `kb: a.pdf/1` 带空格、
   `elements/xxx.png` 带斜杠、`whole/page_4.png`）至少 6 条；并入既有套件，勿新建文件。

## 三十四、智能大纲构思（Ai 页）误报「全库/未选知识库」提示（2026-10-21）

### 34.0 现象与定性

用户在**智能大纲构思**（`AiGenDocOutline`）点「定框并构思」，弹窗里出现：

> 当前为全库或未选具体知识库：检索默认「知识库补充」。选定具体库后可绑定源文档。

定性：**不是报错，是 `Alert type="info"`**，但它在 Ai 页是**错误文案**——
Ai 构思页根本没有知识库概念（无选库入口），却提示用户「选定具体库后可绑定源文档」，
属于**无解提示**（按它说的去做也做不到）。两条问题：① 不该显示；② 文案里的「知识库补充」在 Ai 页是假事实。

### 34.1 根因（已核实链路，非推测）

链路：`src/pages/AiGenDocOutline.tsx:74` → `ChatWithSpeech4Doc`（**未传 `kb_name`**，
其 props 注释 `ChatWithSpeech4Doc.tsx:25-29` 明确写「outlineTypeAiDOC 时不需要」）
→ `ChatWithSpeech4Doc.tsx:250-255` `<OutlinePromptComposer kbName={kb_name} showVars mode="doc" />`
⇒ `kbName === undefined`。

```ts
// OutlinePromptComposer.tsx:764-765
const canBindFiles = Boolean(kbName) && kbName !== ALL_KB_NAME && showVars;
// :1056 三元 → :1103-1108 else 分支无条件渲染 Alert
```

即：**「无库（Ai）」与「选了全库（KB）」被合并成同一个 else 分支**，前者不该提示、后者才需要提示。
`canBindFiles` 本身的计算是对的，错的是 else 兜底没区分「有没有库上下文」。

同源受影响：`ChatWithSpeech4Ppt.tsx:312`（`AiGenPptOutline` 同样不传 `kb_name`）⇒ **PPT 侧同 bug，改组件内部即可一并修好**。

### 34.2 修法

**P0**：`OutlinePromptComposer.tsx:764` 附近新增库上下文明细，并把 else 分支改成两段：

```ts
const hasKbContext = Boolean(kbName);                 // Ai 构思页无库概念
const isAllKb = hasKbContext && kbName === ALL_KB_NAME;
const canBindFiles = hasKbContext && !isAllKb && showVars;
```

```tsx
// 原 :1103-1108 的 else 分支整块替换
) : hasKbContext ? (
  <Alert
    type="info"
    showIcon
    style={{marginBottom: 8}}
    message={`当前选中「${kbLabel(kbName)}」：检索默认「知识库补充」。如需绑定源文档，请先在知识库页选定具体库。`}
  />
) : null}
```

`kbLabel` 已存在（`kbSelectorModal.tsx:9-13`，`__all__` → 「全库」、空 → 「未选择」），
在 `:10` 的 import 里补上即可（当前只引入了 `ALL_KB_NAME`）。

三种场景的期望结果：

| 场景 | kbName | 期望 |
|---|---|---|
| Ai 智能大纲构思 | `undefined` | **不显示任何 Alert**，也不显示源文档区块 |
| KB 构思 · 选了「全库」 | `__all__` | 显示 Alert，文案含「全库」（有解：去选具体库） |
| KB 构思 · 选了具体库 | 具体名 | 显示源文档 Select + 检索范围 Radio（现状不变） |

**P1（顺手，同一文件）**：`send()` 里 `:886` / `:918`
`const effectiveScope = files.length === 0 ? 'kb_supplement' : retrievalScope;`
在 Ai 页（无库）也会把 `retrievalScope: 'kb_supplement'` 带进 payload。
提示词侧目前**无污染**（`composeDocOutlineUserMessage:683` 只在 `files.length` 时写检索约束），
但下游若读 `retrievalScope` 做 scope 决策会误判成「可从知识库补充」。
建议：`const effectiveScope = files.length === 0 ? (hasKbContext ? 'kb_supplement' : undefined) : retrievalScope;`
（payload 字段本身可选，见 `:707`。若下游强依赖非空，退而求其次：Ai 页传 `'bound_only'` 也不合适 → 用 `undefined` 最诚实，下游按缺省处理。）

### 34.3 验收（我会在 UI 上这样判）

1. Ai 智能大纲构思 → 「定框并构思」弹窗：无 Alert、无「源文档」区块；
2. KB 构思页选「全库」→ 弹窗出现 Alert，文案含「全库」二字，且**不出现**源文档 Select；
3. KB 构思页选具体库 → 行为与现在完全一致（源文档可多选、检索范围默认「仅用所选文档」）；
4. 智能大纲构思（PPT）同样不出现该 Alert；
5. jest：新增 3 条渲染断言（`kbName=undefined` / `=__all__` / `=具体库`），
   并入既有 `OutlinePromptComposer` 相关套件，勿新建测试文件。

### 34.4 备注

本条与文档生成链（二十五～三十三章）无关，属**构思入口 UI**，可独立排期、不阻塞三十三章。

## 三十五、插图候选支持「本地上传」（2026-10-21）

### 35.0 诉求与结论

用户问：图片候选（三十三章 33.3 换图宫格 / 33.4 扩选）能不能加上**本地上传文件**的选项。

结论：**能，而且契约早就预留了，只是没接线**。推荐 **方案 A（浏览器 IndexedDB 暂存）**，零后端改造。

前提：三十三章的换图弹窗（P1）；若想更早见效，可先做最小版——段落插图卡片下直接放一个「上传本地图片」按钮。

### 35.1 现状：`upload:` 契约已存在，但缺 resolveUpload（已核实）

```ts
// DocBlockInjector.ts:594-607
if (ref.startsWith("upload:")) {
  const key = ref.slice("upload:".length).trim();
  if (!opts.resolveUpload || !key) return null;   // ← 没有任何调用方传 resolveUpload
  ...
}
```
- 类型 `ResolveUploadBytes` 已定义：`DocBlockInjector.ts:33-35`；
- 但 `grep resolveUpload src/` **零命中**（除定义处）⇒ 现在写 `upload:xxx` 必然判 `figure-missing`。
- 调用点（要在这里补 opts）：`KbOutlineGenDoc.tsx:269` `resolveBlocksToPayloads(blockLists, {...})`；
  Ai 页 `AiOutlineGenDoc.tsx:205` 同源（Ai 禁图，可不接，但建议接上保持一致）。

顺序提醒（`DocBlockInjector.ts:505-523`）：**白名单判定在取字节之前** ⇒
upload ref 同样受 `allowedFigureRefs` 约束，必须按三十三·5 push 进白名单，否则 blocked。

### 35.2 存储方案选型

| 方案 | 后端改造 | 刷新后仍在 | 跨设备 | 结论 |
|---|---|---|---|---|
| **A. IndexedDB 暂存（推荐）** | 无 | ✅ | ❌ | 导出在浏览器内完成（docxtemplater + PizZip + saveAs），够用 |
| B. 后端临时上传端点 | 需新端点 + 过期清理 | ✅ | ✅ | 只有「换台电脑继续编辑」才需要，成本高三倍以上 |
| C. localStorage / base64 | 无 | ✅ | ❌ | 5 MB 上限，一张图就爆，**不可行** |

### 35.3 实现步骤

**① 新文件 `frontend/src/components/DocUtil/docUploadAssets.ts`**（I/O 集中在此，纯函数仍放 `docFigureAssets.ts`）

```ts
type UploadAssetMeta = {key: string; name: string; mime: string; bytes: number; w: number; h: number; createdAt: number};

export async function saveUploadAsset(file: File): Promise<UploadAssetMeta | null>;
export async function readUploadAsset(key: string): Promise<{bytes: ArrayBuffer; mime: string} | null>;
export async function listUploadAssets(): Promise<UploadAssetMeta[]>;
export async function deleteUploadAsset(key: string): Promise<void>;
export async function uploadAssetPreviewUrl(key: string): Promise<string | null>;  // blob URL，内部缓存
export async function purgeUploadAssets(olderThanDays = 7): Promise<number>;
```

IndexedDB：库 `bifang-doc-uploads`，store `assets`，key = `u_<uuid>`（**不含 `upload:` 前缀**，
前缀由 `formatUploadAssetRef` 加，与 `kb:` 的处理保持一致）。
**降级**：`indexedDB` 不可用时回退内存 Map，并在 UI 提示「本次会话有效，刷新后需重新上传」。

`saveUploadAsset` 内部顺序：校验 mime → 读 ArrayBuffer → **超限先用 `defaultResizeImage`
（`DocBlockInjector.ts:69`，与 25.1 同一实现）压到宽 ≤1200 / q0.85** → 存 → 返回 meta。

**② `docFigureAssets.ts` 增加**

```ts
export function formatUploadAssetRef(key: string): string { return `upload:${key}`; }
export function isUploadAssetRef(ref: string): boolean { return normalizeKbAssetRef(ref).startsWith("upload:"); }
```

**③ 白名单**：`applyManualFigureRef`（三十三·5）对 upload ref **天然适用**（只做字符串 push），
不要为 upload 单独开口子——否则绕过白名单会让「模型改写 ref」的防线失效。
但**渲染侧**要认：`upload:` 前缀的 ref 在 `collectParagraphAllowedFigureRefLists` 里原样带出即可，无需改。

**④ 导出 opts**（`KbOutlineGenDoc.tsx:269`）

```ts
const payloads = await resolveBlocksToPayloads(blockLists, {
  kbName,
  fetchKbAsset: async ({kbName: kn, file_name, asset_id}) => fetchAssetBytes({...}),
  resolveUpload: async (key) => readUploadAsset(key),     // ← 新增
  allowedFigureRefsByList: collectParagraphAllowedFigureRefLists(renderChapters),
});
```

**⑤ UI**
- 换图弹窗（33.3 宫格）末尾插一张「＋ 本地上传」虚线卡片 → antd `Upload`（`beforeUpload` 返回 `false`，
  `showUploadList={false}`，`accept="image/png,image/jpeg,image/gif"`）；
- 上传成功后该图插入宫格并**自动选中**，同时按 33.5 写回 `blocks` + `allowedFigureRefs`；
- 段落插图卡片（33.2）显示时：`isUploadAssetRef` 为真 → 用 `uploadAssetPreviewUrl(key)` 作 `src`
  （**不能拼 `/knowledge_base/asset_file`**），并在来源小字标「本地上传 · 原文件名」。

### 35.4 硬约束（4 条，缺一即出废图）

1. **mime 白名单**：只收 `image/png | image/jpeg | image/gif`。
   ⚠️ **webp/avif/bmp 必须拒绝或前端转 PNG**——`mimeToExt`（`DocBlockInjector.ts:324-328`）只认
   jpeg/gif/png，webp 会被写成 `.png` 扩展名但内容是 webp ⇒ **Word 里打不开**。
2. **体积**：存前压到 ≤ `MAX_IMG_BYTES`（1.5 MB，`DocBlockInjector.ts:20-21`）；>10 MB 直接拒绝，
   防 IndexedDB 爆仓。渲染侧 25.1 的降采样对 upload 分支**同样生效**（`:530-556`），无需再改。
3. **白名单**：upload ref 必须进 `allowedFigureRefs`（同 33.5），否则 `figure-blocked`。
4. **导出时读不到 → 明确降级**：`readUploadAsset` 返回 null 时，占位文案要区别于 KB 缺失，
   写「本地上传图已失效，请重新上传」；**不要静默写成「图片不可用」**（用户会以为系统坏了）。

### 35.5 验收（我会这样判）

1. 换图弹窗上传一张本地 PNG → 宫格出现该图并自动选中 → 列表页卡片显示该图；
2. **不重新生成直接导出** → docx 的 media 里多出该图（字节与上传文件可比对的尺寸/体积）；
3. 刷新页面后，列表页卡片仍能显示（验证 IndexedDB 持久化）→ 再导出一次仍成功；
4. 上传一张 >10 MB 的图 → 被压到 ≤1.5 MB 且仍能导出（验证 25.1 路径对 upload 生效）；
5. 上传 .webp → 被拒绝并给出可读提示（或被转成 PNG），**不得**产出打不开的图；
6. 手动删掉 IndexedDB 该条 → 导出时给出「本地上传图已失效」提示，而非静默缺失；
7. jest：`formatUploadAssetRef` / `isUploadAssetRef` / `saveUploadAsset` 的 mime 拒绝与压缩分支
   （jsdom 需 fake-indexeddb 或注入 storage 适配器），至少 5 条，并入既有套件。

### 35.6 排期

依赖三十三章（换图弹窗）。建议：**三十三章 P0+P1 落地后紧接着做本条**，
UI 上把「本地上传」与「KB 候选」放进同一个宫格，用户心智才统一。

## 三十六、执行序（本批次：34 → 33 → 35）（2026-10-21）

用户已授权本批次三章，**按下列顺序依次落地**，每章完成后再进下一章（不要并行改，避免互相覆盖）。
详细设计在各自章节里，**本章只给顺序、坐标与硬约束清单**，与正文冲突时以正文为准。

### 36.1 顺序与理由

| # | 章 | 内容 | 为什么这个顺序 |
|---|---|---|---|
| 1 | **三十四** | Ai 构思页误报「全库/未选知识库」提示 | 单点改动（~10 行），且是用户当前正在看到的错误提示，先消除；与后两章无耦合 |
| 2 | **三十三** | 内容列表页插图可视化 + 段内换图 | 主力；三十五依赖它的换图弹窗 |
| 3 | **三十五** | 候选支持「本地上传」 | 挂在三十三的宫格里，最后接 |

未包含在本批次（勿顺手做，避免范围膨胀）：
32.1 日期 `getMonth()` 未 +1（4 处）、32.2 key_assets captions + 主题闸、28.1 blocked 诊断、
32.3 题注清洗（「（表已截断）」）。其中 32.1 是 5 分钟改动，可随时插入。

### 36.2 三十四（先做）

- 文件：`src/components/ChatUtil/OutlinePromptComposer.tsx`
- `:764` 加 `const hasKbContext = Boolean(kbName);` / `const isAllKb = hasKbContext && kbName === ALL_KB_NAME;`
  `canBindFiles = hasKbContext && !isAllKb && showVars;`
- `:1103-1108` 的 else 整块换成 `hasKbContext ? <Alert message={\`当前选中「${kbLabel(kbName)}」…\`}/> : null`；
  `:10` import 补 `kbLabel`（`kbSelectorModal.tsx:9-13`）。
- 期望：Ai 构思页（`kbName=undefined`）**不显示**该 Alert、也不显示源文档区块；KB 页选全库 → 显示且文案含「全库」；KB 页选具体库 → 行为不变。
- P1（顺手）：`:886` / `:918` 无库时 `retrievalScope` 传 `undefined`，别再写 `kb_supplement`。
- 同源：改在组件内部即可覆盖 `ChatWithSpeech4Ppt.tsx:312`，**不要**另改一处。

### 36.3 三十三（主力）

- 新文件 `src/components/DocUtil/DocFigureStrip.tsx`（段内插图卡片 + 换图入口）。
- `OutlineResultDoc.tsx:96`（`{paragraph.content}`）下挂载；组件新增 props：
  `kbName?: string` + `onFigureChange?: (chKey, pKey, blockIndex, nextRef) => void`。
  调用点：`KbOutlineGenDoc.tsx:919` 传两者；`AiOutlineGenDoc.tsx:568` **都不传**（Ai 页 `allowFigure=false`，本就无图）。
- 图片 url：直接用 `ref` 拼 `/knowledge_base/asset_file?knowledge_base_name&file_name&asset_id`
  （后端无鉴权，`routers/knowledge_base.py:243-258`），**不要**先调 `listAssets`、
  **不要**用 `fetchAssetBytes`（会整字节下载 10 MB 整页图）。
- 纯函数放 `docFigureAssets.ts`：`parseKbAssetRef`（`^kb:(.+?)\/(.+)$`，兼容 `elements/`、`whole/`）、
  `applyManualFigureRef`、`previewFigureStatus`（与 `DocBlockInjector` 同源归一化）。
- ★ **三十三·5 是硬要求**：手选 ref 必须 push 进 `paragraph.allowedFigureRefs`。
  渲染期 `DocBlockInjector.ts:505` 的白名单判定**在取字节之前**，不进白名单 ⇒ `figure-blocked`
  ⇒ 现象是「UI 显示正常、导出却是［图片不可用］」。
- 卡片要标风险：整页图（将降采样）、`h/w>1.6` 竖版单品图（上一轮裤鞋图就是这个形态）、加载失败。

### 36.4 三十五（最后）

- 新文件 `src/components/DocUtil/docUploadAssets.ts`：IndexedDB 库 `bifang-doc-uploads`，
  store `assets`，key = `u_<uuid>`（**不含 `upload:` 前缀**，前缀由 `formatUploadAssetRef` 加）。
  六个函数：save / read / list / delete / previewUrl / purge(7 天)。
  IndexedDB 不可用 → 降级内存 Map + 提示「刷新后需重新上传」。
- 接线：`KbOutlineGenDoc.tsx:269` 的 `resolveBlocksToPayloads` opts 加
  `resolveUpload: async (key) => readUploadAsset(key)`；Ai 页 `:205` 同（可选）。
- UI：换图宫格末尾「＋ 本地上传」虚线卡片（antd `Upload`，`beforeUpload` 返回 false），
  上传后插入宫格并自动选中，走与三十三·5 相同的写回路径。
- **35.4 四条硬约束**：① 只收 png/jpeg/gif（**webp 会被 `mimeToExt` 写成 .png 但内容是 webp ⇒ Word 打不开**）；
  ② 存前用 `defaultResizeImage` 压到 ≤1.5 MB、>10 MB 拒收；③ upload ref 同样要进白名单；
  ④ 读不到时降级文案写「本地上传图已失效，请重新上传」，**不要**复用「图片不可用」。

### 36.5 jest 要求（三章通用）

- 断言**并入既有套件**（`docFigureSupply` / `docHeadingLevels` / `docFenceDegrade` / `OutlinePromptComposer` 相关），
  **勿新建测试文件**（历史教训：`wb_review_probe.test.ts` 是评审临时探针，已删）。
- 至少覆盖：三十四 3 条（`kbName=undefined` / `__all__` / 具体库）、
  三十三 6 条（`parseKbAssetRef` 三种形态 + `applyManualFigureRef` + `previewFigureStatus` + 带空格 ref）、
  三十五 5 条（mime 拒绝、压缩、key 格式、白名单写入、读不到降级）。
- jsdom 缺 `createImageBitmap` / `OffscreenCanvas` / `indexedDB`：
  用**可注入 hook**（`opts.resizeImage`、storage 适配器）或 fake-indexeddb，别让成功路径永远走 null 分支。
- 跑法：`--config jest.config.js --ci --runInBand --testPathPattern='(X)'`，UNC 下必须 mock `@/services/chatchat/kb`。

### 36.6 仓库卫生（顺手，UNC 下我删不掉）

```
git rm -r --cached .workbuddy/tmp .workbuddy/tmp2 frontend/tmp
```
并在 `.gitignore` 补 `.workbuddy/tmp/`、`frontend/tmp/`（这些是我的审计临时文件，被历史提交带进库了）。

### 36.7 验收（由用户在 UI 完成，助手判卷）

1. 三十四：Ai 智能大纲构思「定框并构思」弹窗无 Alert；KB 页选全库有 Alert 且含「全库」。
2. 三十三：列表页能看到段内引用的图；换图后**不重新生成直接导出**，docx 里是新选的图
   （这条同时验证三十三·5 白名单同步）。
3. 三十五：上传本地 PNG → 刷新页面 → 再导出一次，docx 仍有该图；webp 被拒或转 PNG。
4. 助手侧脚本：`ab/judge.py`（层级/字数/表/图/泄漏）、`ab/cap_check.py`（题注递增）、
   `ab/cite_check.py`（引用分布）、`ab/num_check.py`（编号叠加回归）。

### 36.8 回执

按现行规则回执「已完成: 三十六」，并逐条列出三章各改了哪些文件、jest 结果、
以及 36.6 仓库卫生是否执行。

## 三十七、大纲列表标题溢出 + 智能文章生成页对齐知识库页（2026-10-21）

> 基线：`68a2835` + 三十三/三十五章的工作区未提交改动（`DocFigureStrip.tsx`、`docUploadAssets.ts` 已存在）。
> 行号可能随后续改动漂移，**以函数名为准**。

### 37.1 「大纲预览」抽屉标题溢出（P0，用户已截图）

**现象**：列表里第一条「如何帮助选品师筛选出抖音男装的爆品」折成两行，第二行「爆品」压到下一条
（第 2 条「抖音商务男装爆品选品」）上，视觉上像两条粘在一起。

**根因**（`OutlineSelectRadio.tsx`，三个叠在一起）：

| # | 位置 | 问题 |
|---|---|---|
| 1 | `radioStyle`（约 :78-85） | 写死 `height: '1.6em'` + `display:'block'`。文本换行后**高度不增长**，第二行直接溢出到下一个 `Row` —— 这是"压行"的直接原因 |
| 2 | `showName()`（约 :94-100） | 按**字符数** 20 截断 + `"..."`。中文字号 `1.3em`，20 字宽远超 `Col span=18`（抽屉 1400px × 38% × 18/24 ≈ 400px）⇒ 截了还是会换行 |
| 3 | `Tooltip title`（约 :188） | 显示的是 `chapterHint`（前 4 个章名 + ID），**不是被截断的全名** ⇒ 用户被截了也看不到全名 |

**修法**（交给 CSS，别再按字数截）：

```tsx
// 1) 去掉固定高度，改 flex 单行
const radioStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '1.1em',
  lineHeight: '1.6',
  whiteSpace: 'nowrap' as const,
  minWidth: 0,
  width: '100%',
};
```

```tsx
// 2) 标题单独占位、单行省略；Tag 不压缩
<Radio key={item.outlineId} style={radioStyle} value={item.outlineId}>
  <Tag color="blue" style={{flex: '0 0 auto'}}>{i + 1}</Tag>
  <Tooltip
    title={
      <div>
        <div style={{fontWeight: 500}}>{item.outlineName}</div>
        <div style={{opacity: 0.8}}>{chapterHint(item.outlineContent)}</div>
        <div style={{opacity: 0.8}}>ID: {item.outlineId}</div>
      </div>
    }
  >
    <span style={{flex: '1 1 auto', minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
      {item.outlineName}
    </span>
  </Tooltip>
  <Tag style={{marginLeft: 4, flex: '0 0 auto'}}>{chapterCount(item.outlineContent)} 章</Tag>
</Radio>
```

3) 删掉 `showName()`（或保留但仅用于 `document.title` 之类，不用于显示）。
4) `Row` 里的 `Col span={18}` / `Col span={6}` 建议改 flex：左列 `flex:'1 1 auto'; minWidth:0`，
   右列（改名/删除/下载三个图标）`flex:'0 0 auto'`，避免窄屏再次挤压标题。
5) 顺手：`Row` 的 `borderBottom: '1px solid #000'` 太重，建议 `var(--color-border-tertiary)` 或 antd `Divider` 级灰。

**验收**：40 字长标题只占一行、末尾省略号，hover 显示完整标题；20 条大纲连续排列不重叠；
改名输入框仍可用；`N 章` Tag 不被压缩换行。

### 37.2 「写作大纲」不展示整串模板（P1，两页共用组件，改一处两页生效）

**先纠正一个前提**：`OutlinePromptDoc` 是 KB 页与 Ai 页**共用**的组件
（`KbOutlineGenDoc.tsx:886`、`AiOutlineGenDoc.tsx:519` 都渲染它），所以"整串模板"两页都存在，
**不存在"KB 已改、Ai 未改"的差异**。改 `OutlinePromptDoc.tsx:79-82` 一处，两页同时生效。

现状（`OutlinePromptDoc.tsx` 的 `get_items`）：
```tsx
children: <p><Tag color={"volcano"}>提示词<br/></Tag>{paragraph.prompt}</p>
```
`paragraph.prompt` = `assembleDocParagraphPrompt()` 的整串（`ViewItem4Doc.ts:333+`），
含【输出格式·文章段落】+【表…】+【图…】+【围栏格式】+ 代码块示例，每段重复一遍
⇒ 一段 500~800 字，十几段全是同一份契约，用户无法看出"这一段真正不同的是哪几句"。

**改成分层展示**（默认不摊开契约）：

```tsx
// 1) 摘要行：只读段落字段，别解析 prompt 字符串
const b = wordBudgetFor(paragraph);
const chips = [
  `约 ${formatWordBudgetZh(b)} 字`,
  `要点 ${paragraphPointLabels(paragraph).length}`,
  paragraph.allowTable === false ? '禁表' : '可表',
  paragraph.allowFigure === false ? '禁图' : '可图',
  paragraph.promptManual ? '自定义提示词' : null,
].filter(Boolean);

// 2) children 结构
<div>
  <Space size={4} wrap style={{marginBottom: 6}}>
    {chips.map((c) => <Tag key={c}>{c}</Tag>)}
  </Space>
  <Collapse
    ghost
    size="small"
    items={[{
      key: 'contract',
      label: '写作契约与完整提示词（系统统一注入，通常无需修改）',
      children: (
        <div style={{whiteSpace: 'pre-wrap', fontSize: 12,
                     color: 'var(--color-text-secondary)'}}>
          {paragraph.prompt}
        </div>
      ),
      // promptManual === true 时默认展开：这段的 prompt 是用户自己写的
      ...(paragraph.promptManual ? {} : {}),
    }]}
    defaultActiveKey={paragraph.promptManual ? ['contract'] : []}
  />
</div>
```

硬约束：
- **`paragraph.prompt` 仍是唯一真源**（编辑态 `EditablePromptCollapse4Doc` 保存、生成时
  `baseBody = paragraph.prompt + kbC` 都用它）⇒ 本次只改**展示**，不碰数据与保存路径；
- 摘要取字段（`wordBudgetFor` / `paragraphPointLabels` / `allowTable` / `allowFigure` / `promptManual`），
  **不要**去正则切 `prompt` 字符串（会被手工改写的 prompt 打穿，见 `promptManual` 的存在意义）；
- 分点标签沿用 `paragraphPointLabels()`，**禁止用 `paragraph.points.length`**
  （`maxLevel≤3` 时 points 被折进 `pointGuide`，恒为 0）。

### 37.3 智能文章生成页（Ai）对齐知识库页（P1）

**能力差异清单**（逐项判断，不是机械照搬）：

| 项 | KB 页 | Ai 页 | 判断 |
|---|---|---|---|
| 写作大纲空态引导 | `noOutline ? <Empty description={emptyHint}/>`（`KbOutlineGenDoc.tsx:884-888`） | 无判空，直接渲染空 Collapse（`AiOutlineGenDoc.tsx:513-519`） | **该对齐**：Ai 页未选大纲时显示「选择大纲后，提示词会显示在这里」，别给一个空白折叠面板 |
| 提示词整串摊开 | 有 | 有 | **两页共用，见 37.2** |
| 导出兜底剥引注 | `saveDoc` 里 `if (!keepCitations) stripCitationsDeep(...)`（`KbOutlineGenDoc.tsx:243-246`） | **无** | **该对齐**：Ai 页导出前**无条件**跑一次剥离（Ai 本就没有合法来源，且用户可能手工编辑正文带进 `[文档N]`） |
| 引用开关 `keepCitations` | ✅ Checkbox + localStorage | ❌ | **不要照搬**：Ai 无检索、无 `ref_docs`，开关只能产出"指向不存在来源"的编号，是假开关。改为在导出区加一行灰字说明：「AI 模式无外部来源，正文不保留 [文档N]」 |
| 文末「资料来源」 | ✅ `appendDocBibliography` | ❌ | 不适用（无 `bibliography`） |
| 图卡片 / 换图 / 本地上传 | ✅ `DocFigureStrip`（KB :950-956 传 `kbName`+`onFigureChange`） | 未传 props（`AiOutlineGenDoc.tsx:570`） | **保持不接**：Ai 页 `allowFigure=false`（:290-292），无图可显示；若将来放开，再传 props |
| 导出命名 | `-Kb-v` | `-Ai-v` | 已正确，勿动 |

**具体改法（Ai 页两处）**

① 空态（`AiOutlineGenDoc.tsx` 写作大纲 ProCard 内）：
```tsx
{chapters.length === 0 ? (
  <Empty style={{marginTop: 48}}
         description="选择大纲后，段落提示词会显示在这里。请先在【智能大纲构思】生成并保存大纲。" />
) : (
  <OutlinePromptDoc id="prompt-container" chapters={chapters} docTitle={title}
                    activeKey={key} fn={cbFn} genFn={genFn} cbSaveResultFn={cbSavePromptResult}/>
)}
```

② 导出兜底（`saveDoc`，在 `doc.render` 之前，注意**深拷贝**）：
```ts
import {stripCitationsDeep} from "@/components/DocUtil/parseChatCompletion";
import {Empty} from "antd";   // 37.3① 也需要补这个 import
...
// 注意：返回值是 {chapters, stripped}，不是数组本身
const {chapters: exportChapters, stripped: citeStripped} = stripCitationsDeep(chapters);
if (citeStripped > 0) console.info("[DocCite] Ai 导出剥离引注", citeStripped);
flagEmptyDocParagraphs(exportChapters);
const blockLists = prepareChaptersBlocks(exportChapters);
applyDocHeadingNumbers(exportChapters);
doc.render({... chapters: exportChapters });
```
⚠️ 与三十章同一坑：**必须用返回值，不要就地改 `chapters`**，否则开关/二次导出会把正文标注永久删掉
（Ai 页虽无开关，但重复导出会把用户手工加的标注也抹掉，仍要遵守深拷贝口径）。

### 37.4 验收

1. 大纲预览抽屉：40 字标题单行省略、hover 全文、条目不重叠（37.1）；
2. 写作大纲：每段首屏只有「约 N 字 / 要点 k」等 chips + 折叠条，展开才见整串契约；
   **编辑保存后重新展开，提示词内容与保存前一致**（验证只改展示、未动真源）（37.2）；
3. Ai 页未选大纲：显示空态引导而非空白折叠面板；
4. Ai 页：正文手工加一个 `[文档3]` → 导出 docx 里该标记消失，且**源数据 `chapters` 里仍在**
   （再导一次仍会剥，验证深拷贝）（37.3）；
5. KB 页回归：引用开关「保留/隐去」仍正常，图卡片与换图不受影响。

## 三十八、执行序（本批次：只做三十七；行号已按 09a9fd9 校正）（2026-10-21）

> **授权结论：可以开工，且只开工三十七。** 三十六（34→33→35）已验收闭环，工作区干净，不与其重叠。
> 三十七章正文（4439 行起）的**设计不变**，但那里的行号是 `68a2835` 时代的，**已全部漂移**，以本章坐标为准。

### 38.0 开工前状态（已核，勿重复确认）

| 项 | 事实 |
|---|---|
| 基线 | `09a9fd9`（HEAD） |
| 工作区 | 前端 `git status` 干净；仅 `backend/start.sh` 与两个 `:Zone.Identifier` 历史残留，**与本批次无关，勿动** |
| 三十六落地物 | `DocFigureStrip.tsx` / `docUploadAssets.ts` / `outlineKbBindUi.ts` **均已入库**（09a9fd9 一并提交） |
| 三十七三项 | 全部未落地：`OutlineSelectRadio.tsx` 仍是 `height:'1.6em'` + `showName` 截 20 字；`OutlinePromptDoc.tsx` 无 `Empty`；`AiOutlineGenDoc.tsx` 无 `stripCitationsDeep` |

### 38.1 三十七·1（P0，用户截图仍在复现）大纲列表标题溢出

**校正后坐标**（`frontend/src/components/DocUtil/OutlineSelectRadio.tsx`）：

| 原章坐标 | 现坐标 | 内容 |
|---|---|---|
| `:78-85` | **`:69-76`** | `radioStyle`（`display:'block'` + `height:'1.6em'`） |
| `:94-100` | **`:77-83`** | `showName()` 按 20 字截断 |
| `:188` | **`:149`** | `<Tooltip title={chapterHint + ID}>`，未放全名 |
| `Row/Col` | **`:126-127` / `:157`** | `Row {borderBottom:'1px solid #000'}`、`Col span={18}`、右侧 `Col span={6}` |
| 调用点 | **`:147-153`** | `<Radio style={radioStyle}>` + `<Tag>{i+1}</Tag>` + Tooltip + `{showName(...)}` + `<Tag>{n} 章</Tag>` |

做法照三十七·1 的代码块，**闭环判定**：抽屉拉到 1000px 宽时，第一条长标题必须是**单行省略号**，且第二行不再压到第 2 条；Tooltip 悬停能看到全名。删 `showName` 后确认无其它引用（`:150` 是唯一调用点）。

### 38.2 三十七·2（P0）智能文章生成页对齐知识库页

**① 写作大纲空态** —— 别新增判空分支，**改既有那条**：
`OutlinePromptDoc.tsx:41-43` 现在是
```tsx
if (!keys) {
  return <Collapse ghost accordion items={[]} />;
}
```
`keys = Doc.getKeysFromKey(chapters, activeKey)`，chapters 为空时必然走到这里 ⇒ 直接换成 `<Empty description="尚未生成写作大纲：请先在左侧完成构思与大纲生成" image={Empty.PRESENTED_IMAGE_SIMPLE} />`。
⚠️ 该 `return` 之后**没有其它 hook**（`cb4EditParagraph_prompt`、`get_items` 都是普通函数），所以提前 return 不会破坏 hooks 顺序；若你后续在它上面加 hook，必须先挪到 hook 之后。

**② 导出兜底剥引注** —— `AiOutlineGenDoc.tsx:169 saveDoc`，照 `KbOutlineGenDoc.tsx:241-248` 的写法，但**不设开关**（Ai 无检索，恒剥）：
```ts
// :181 之前
const cite = stripCitationsDeep(chapters);
const renderChapters = cite.chapters as Chapter[];
// 后面 :182 flagEmptyDocParagraphs / :183 prepareChaptersBlocks / :190 doc.render 的 chapters
// 全部换成 renderChapters
```
⚠️ 两个必错点：
- `stripCitationsDeep` 返回 **`{chapters, stripped}`**，不是数组；直接 `const renderChapters = stripCitationsDeep(chapters)` 会让 `chapters` 变对象，文档渲染成空。
- `doc.render({... chapters: renderChapters ...})` 里那处也要换，否则只剥了统计路径、渲染路径没剥。

**③ 引用开关：不加**（Ai 无 `ref_docs`，开关只能产出指向不存在来源的编号）。改为在写作大纲区（`:521` 附近）加一行灰字说明：「AI 模式无外部来源，正文不保留 [文档N]」。

**④ 图卡片 / 换图 / 本地上传：保持不接**（Ai `allowFigure=false`）。已核：`DocFigureStrip` 只经 `OutlineResultDoc` 挂载，而 Ai 页未传 `onFigureChange` ⇒ 正确，**勿顺手接上**。

**⑤ 摘要 chips（三十七·3）** —— 若做，数值一律取段落字段（`wordBudgetFor(p)` / `paragraphPointLabels(p).length` / `allowFigure`），**禁止正则切 `prompt` 字符串**。

### 38.3 顺手项（5 分钟，只因为你要改同一个 `saveDoc`）

`AiOutlineGenDoc.tsx:180` 与 `KbOutlineGenDoc.tsx:238` 的
`curDate.getFullYear()+""+curDate.getMonth()+""+curDate.getDate()`
仍少 `+1`（32.1 未做）⇒ 生成 `2026921`。本批次统一改：

```ts
const pad2 = (n: number) => String(n).padStart(2, "0");
const curSimpleDateStr = `${curDate.getFullYear()}${pad2(curDate.getMonth() + 1)}${pad2(curDate.getDate())}`;
```
`curDateStr`（带分隔符的）同样 `+1`。**四处在同一 PR**：`AiOutlineGenDoc`、`KbOutlineGenDoc`、`AiOutlineGenPpt`、`KbOutlineGenPpt`（PPT 两处仅改 `+1`，文件名 `-Ai-v`/`-Kb-v` 一并核对）。

### 38.4 jest 与验收

- 断言**并入既有套件**，勿新建测试文件：`OutlineSelectRadio` 属 UI，至少对纯函数 `outlineKbBindUi` 已有的用例别动；新增的可放 `docCitation.test.ts`（Ai 恒剥、开关来回切）与 `docOutlineAlign.test.ts`（空态）。
- 跑：`--testPathPattern='(docCitation|docOutlineAlign|docHeadingLevels|docFigureSupply)'`。
- 用户侧验收（我判卷）：① 大纲预览抽屉长标题单行省略、不压行；② Ai 页写作大纲无内容时显示空态而非空面板；③ 手改正文塞一个 `[文档1]` → 导出后为 0；④ 导出文件名日期为 `20261021`。

### 38.5 追加（用户 08:06）：写作大纲**只展示简单提示词**，整串模板退出展示面

> 这是对你正在做的三十七·3 的**收口修正**，不是新功能。若 37.3 尚未落地，直接按本节做；若已落地（chips + 嵌套 Collapse「写作契约与完整提示词」），按本节改。

**用户原话**：「智能文章生成中的『写作大纲』栏目中只要展示简单提示词即可」。
⇒ 结论：**展示面只留简单提示词**，完整整串 `paragraph.prompt` 只在「编辑」态的高级抽屉里可看（该抽屉 `EditablePromptCollapse4Doc` 已有 `setAdvOpen`）。`paragraph.prompt` 仍是**唯一真源**，本次只改展示，不动数据结构、不改拼接逻辑。

**① 新增纯函数**（`ViewItem4Doc.ts`，与 `paragraphPointLabels` 同区，便于单测）：

```ts
/** 三十八·6：写作大纲展示用的「简单提示词」——只含用户可感知的语义，不含系统契约 */
export function simpleDocParagraphPrompt(p: Paragraph): string {
  const zh = formatWordBudgetZh(wordBudgetFor(p));
  const lines: string[] = [`【${(p.title || "").trim() || "本段"}】约 ${zh} 字`];
  const role = (p.role || "").trim();
  const question = (p.question || "").trim();
  if (role) lines.push(`岗位视角：${role}`);
  if (question) lines.push(`本章要回答的问题：${question}`);
  const labels = paragraphPointLabels(p);
  if (labels.length) lines.push(`本段要点：${labels.map((t, i) => `${i + 1}) ${t}`).join("；")}`);
  else if ((p.pointGuide || "").trim()) lines.push(`本段要点：${p.pointGuide!.trim()}`);
  if (p.promptManual && (p.prompt || "").trim()) {
    const s = p.prompt.trim().replace(/\s+/g, " ");
    lines.push(`已手改高级模板：${s.slice(0, 160)}${s.length > 160 ? "…（完整见编辑态高级抽屉）" : ""}`);
  }
  return lines.join("\n");
}
```
⚠️ 字数一律走 `wordBudgetFor(p)`（**不许正则切 prompt**）；要点一律走 `paragraphPointLabels(p)`（**不许用 `p.points.length`**，maxLevel≤3 时被折进 pointGuide 恒 0）。

**② `OutlinePromptDoc.tsx`**：删掉你刚加的嵌套 Collapse（`items=[{key:"contract", label:"写作契约与完整提示词…", children:<div>{paragraph.prompt}</div>}]`，现文件 `:113-137`），children 改成：

```tsx
children: (
  <div style={{whiteSpace: "pre-wrap", lineHeight: 1.6}}>
    {simpleDocParagraphPrompt(paragraph)}
  </div>
),
```
chips 行（`:108-112`）保留 —— 它与简单提示词的职责分工是：**chips 给数字口径（字数/要点数/可表/可图），简单提示词给语义（段题/岗位/问题/要点）**，二者不重复。
`defaultActiveKey` 里 `promptManual ? ["contract"] : []` 随之删除。

**③ `EditablePromptCollapse4Doc.tsx` 存量兜底**（`:204-223`）：`!structured` 分支现在是 `<pre>{paragraph.prompt}</pre>`，这会在段落缺结构化字段时把整串模板糊在展示面 ⇒ 改成 `{simpleDocParagraphPrompt(paragraph)}`（`<pre>` 保留换行）。**编辑态** `:270-299` 的整串 `TextArea` 不动（存量数据只能整串编辑）。

**④ 两页都生效**：`OutlinePromptDoc` 是 KB / Ai 共用组件（KB `:887`、Ai `:521`）。本次**不要**做 props 开关——两页展示口径保持一致。

**⑤ 验收**：随便一段，展示面只有 3~5 行（段题+字数 / 岗位视角 / 本章问题 / 本段要点），看不到「【输出格式·文章段落】」「```table」「禁止以…开头」等系统契约字样；点「编辑」→ 高级抽屉里仍能看到完整整串；改完保存后 `paragraph.prompt` 真源不变。

### 38.6 不在本批次（勿顺手）

32.2 `key_assets` captions + 主题闸、28.1 blocked 定案、32.3 题注清洗、二十九 P0 编号全局化。其中 28.1 仍等用户 Console 里那行 `[DocBlock] figure-blocked`。

## 三十九、三十七验收（我实跑）+ 四条收口（2026-10-21 08:20）

> 基线 `0afdb81`（HEAD；注意该提交信息只写了「Typography 未定义」，实际把 37 + 38.3 + 围栏自愈全并进来了，**别按提交信息判范围**）。
> jest 我本地实跑：`(docCitation|docOutlineAlign|docHeadingLevels|docFigureSupply)` → **4 suites / 62 passed**（219s），与你的回执一致。

### 39.0 逐项验收

| 项 | 结论 | 依据 |
|---|---|---|
| 37.1 大纲列表不压行 | ✅ 症状已消除 | `OutlineSelectRadio.tsx:70-80` 删掉 `height:'1.6em'` 改 flex+nowrap；`:124-136` `Row wrap={false}` + 左容器 `minWidth:0/overflow:hidden` |
| 37.1 省略号 / 章数 Tag | ❌ 有缺陷 | 见 39.2 |
| 37.2 空大纲 Empty | ✅ | `OutlinePromptDoc.tsx:48-57` |
| 37.3 摘要 chips | ✅ | `OutlinePromptDoc.tsx:93-101`（走 `wordBudgetFor` / `paragraphPointLabels`，未正则切 prompt） |
| 38.2① Ai 恒剥引注 | ✅ | `AiOutlineGenDoc.tsx:186-190` 深拷贝；`:182/:183/:184/:211/:227/:237/:242` 七处全部换 `renderChapters`，无遗漏 |
| 38.2③ 灰字说明 | ✅ | `AiOutlineGenDoc.tsx:533-535` |
| 38.3 日期 +1 | ✅ 四页 | `AiOutlineGenDoc` / `KbOutlineGenDoc` / `AiOutlineGenPpt` / `KbOutlineGenPpt` 全改 `pad2` 八位；`KbOutlineGenPpt.tsx:305` 文件名改 `-Kb-v` |
| **38.5 写作大纲只展示简单提示词** | ❌ **未做** | 见 39.1 |

### 39.1 P0：38.5 未落地（用户 08:06 的明确要求）

`OutlinePromptDoc.tsx:113-137` 现在仍是「写作契约与完整提示词（系统统一注入，通常无需修改）」+ `children: {paragraph.prompt}` —— 整串仍在展示面（`promptManual` 时还默认展开）。按 38.5 执行：

1. `ViewItem4Doc.ts` 新增 `simpleDocParagraphPrompt(p)`（38.5 有完整实现，字数走 `wordBudgetFor`、要点走 `paragraphPointLabels`）。
2. `OutlinePromptDoc.tsx:113-137` 整段折叠换成 `<div style={{whiteSpace:"pre-wrap",lineHeight:1.6}}>{simpleDocParagraphPrompt(paragraph)}</div>`，并删掉 `defaultActiveKey`。
3. `EditablePromptCollapse4Doc.tsx:204-223` 的 `<pre>{paragraph.prompt}</pre>` 同样换成 `simpleDocParagraphPrompt`（编辑态 `:270-299` 的整串 TextArea 保留，那是存量数据唯一编辑入口）。

### 39.2 P1：37.1 的省略号不生效，「N 章」会被硬裁

根因（我核了 antd 源码，不是猜）：`node_modules/antd/es/radio/radio.js:101`
```js
children !== undefined ? React.createElement("span", null, children) : null
```
⇒ `OutlineSelectRadio.tsx:153` 里的 children（Tag / Tooltip>span / Tag）全被塞进**一个匿名 `<span>`**。因此：
- `:171-176` 那个 span 的 `flex:'1 1 auto'` **无效**（父容器不是 flex）；
- 匿名 span 作为 flex item 的 `min-width:auto` 不肯收缩 ⇒ 长标题撑开后被 `:126` 的 `overflow:hidden` **硬裁**，`:177` 的「N 章」Tag 直接看不见（不是被省略号截断）。

**修法 A（推荐，纯 inline，不用新建样式表）**：Radio 只留圆点，标题与 Tag 放 Radio 外面，整行自己接管点击：
```tsx
<div
  style={{display:'flex', alignItems:'center', gap:6, minWidth:0}}
  onClick={(e) => {
    if ((e.target as HTMLElement).closest('.ant-radio-wrapper')) return; // 圆点自己会触发 onChange
    setValue(item.outlineId!);
    props.outlineSelectFn(item.outlineId!);
  }}
>
  <Radio value={item.outlineId} style={{flex:'0 0 auto', marginInlineEnd:0}} />
  <Tooltip title={<div><div style={{fontWeight:500}}>{item.outlineName}</div>
    <div style={{opacity:.8}}>{chapterHint(item.outlineContent)}</div>
    <div style={{opacity:.8}}>ID: {item.outlineId}</div></div>}>
    <span style={{flex:'1 1 auto', minWidth:0, overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.outlineName}</span>
  </Tooltip>
  <Tag style={{flex:'0 0 auto', marginInlineEnd:0}}>{chapterCount(item.outlineContent)} 章</Tag>
</div>
```
⚠️ 必须加那句 `closest('.ant-radio-wrapper')` 早退，否则点圆点会走两次 `outlineSelectFn`（它会去拉大纲，重复请求）。

**修法 B（不改结构）**：项目目前 **没有任何 .css/.less 文件**（`src/*.css` 为空），需新建并引入全局样式：
```css
.ant-radio-wrapper { display:flex; align-items:center; min-width:0; flex:1 1 auto; }
.ant-radio-wrapper > span:last-child { display:flex; align-items:center; gap:6px; min-width:0; flex:1 1 auto; }
```

### 39.3 P1：新加的围栏宽松正则会把 ```json 当图表围栏吞掉（24·B 回归的窄版）

`docFenceNormalize.ts:117`：
```ts
/```[\s\S]{0,80}?\bkb:\S+\/\S+\.(?:png|jpe?g|gif|webp)/i
```
命中后 `contentMayHaveDocBlockFences` 返回 true ⇒ `absorbBlocksFromParagraphContent` 先 `blocks=[]` 再解析；开栏行不是 table/figure 时进 `state="unknown"`，该分支只把行塞进 `buf`、**flush 时不输出** ⇒ **整段 ```json 从正文消失**（`ViewItem4Doc.ts:799-806`）。
这不是假设：docGen 原始 JSON 的 `blocks` 里就带 `"assetRef": "kb:…png"`，模型若把这类元数据写进 ```json 围栏，80 字符内必命中。
收紧（要求 ``` 后只有 figure/figureref 或直接换行，```json 不命中）：
```ts
/```[ \t]*(?:figure|figureref)?[ \t]*\r?\n[\s\S]{0,80}?\bkb:\S+\/\S+\.(?:png|jpe?g|gif|webp)/i
```

### 39.4 P2：`countParagraphMedia` 的 max() 会把「灰卡」显示成「含图1」

`ViewItem4Doc.ts:735-741` 改成 `max(blocks, 正文残留围栏计数)`。若吸收失败（围栏被清、blocks 为空），标签仍报「含图1」，点开只有灰卡 —— 与用户看到的「图未解析」是同一现象，**用计数掩盖了症状**。
建议：计数只认真实 `blocks`；残留围栏单独作为「未解析」提示（`DocFigureStrip` 已有 `unparsed` 判定，`DocFigureStrip.tsx:117-121`），让「有图 / 有图但没解析出来」两态在文案上分开。

### 39.5 P2：`OutlineResultDoc.tsx:86-89` 在 render 里吸收

`contentShow` 直接调 `absorbBlocksFromParagraphContent(paragraph)`：函数本身幂等（先 `blocks=[]`、末尾回写 `content`），当前只读列表可接受。但**将来一旦在列表里做内联编辑**，render 期吸收会把用户正在输入的半截围栏吞掉。建议把「改写」留在生成收尾（`KbOutlineGenDoc.tsx:677-688`、`AiOutlineGenDoc.tsx:420-425` 已有），列表这层只做「检测 + 提示」。

### 39.6 执行序

**39.1（38.5 补做，用户当前诉求）→ 39.2 A（列表视觉收口）→ 39.3（围栏正则收紧，防吞代码块）→ 39.4/39.5（P2，可同批）**。
39.1 与 39.3 互不冲突，可同一提交；39.2 改的是另一个文件。
仍未做（勿顺手）：32.2 captions + 主题闸、28.1 blocked 定案、32.3 题注清洗、二十九 P0。

## 四十、PPT 小项描述长度校验：误报根因与四步治理（2026-10-21 22:50）

用户报：页面内容生成完，幻灯片标题旁橙叹号，hover 提示「第 1 点描述须为 20～70 字，当前 108 字」。
用户自提四条治理方案（计数剔除引用 / 数据点放宽到 100 / 一键 AI 精简 / 校验前移）。我逐条核过代码，**三条成立、两条需要纠偏**，另挖到一个用户没提但更该先做的根因。

### 40.0 现场结论（先回答「能不能先继续」）

**能继续，橙叹号不阻断下载。** 证据：`ViewItem4Ppt.ts:2274-2311` `evaluatePptDownloadReady`，`genErr && hasItems` 走 **softWarnings**（`:2298-2300`），只有 `!hasItems` 才进 blockers。
即：`Slide.setContent`（`:1679-1692`）校验失败时 `genError = vErr` 但仍 `setResult(viewItems)` ⇒ 内容在、可展示、可下载，橙叹号只是复核提示（`EditableResultCollapse.tsx:35-50`，`hasItems && genErr → 'warn'`）。
⚠️ 但描述 108 字灌进 list 版式会挤字/溢出，导出前建议至少压到 ~70 字。

### 40.1 P0：PPT 侧完全没有引用标记治理（比「计数没剔除」更根本）

用户判断①成立，但**只改计数是治标**。

链路核实：
- 后端检索片段本来就带编号（`kb_service.py:926-928`，`[文档{i}] 来源：…`）⇒ `[文档13]` 有真实出处，不是模型幻觉；
- **文档侧**有 `stripHallucinatedDocCitations`（`parseChatCompletion.ts:204-218`）；
- **PPT 侧零治理**：`grep stripHallucinatedDocCitations|stripCitations` 在 `ViewItem4Ppt.ts` / `AiOutlineGenPpt.tsx` / `KbOutlineGenPpt.tsx` / `ChatWithSpeech4Ppt.tsx` **全零命中**；提示词里也没有任何「禁止/允许 `[文档N]`」的条款。

后果不止计数：`[文档13]` 会被**原样灌进 PPT 页面**，读者看到一个没有对照表的悬空编号（PPT 没有文末资料来源清单，也没地方放）。

**三件套，缺一不可：**
1. 提示词禁写 —— `buildPptItemFormatPrompt`（`ViewItem4Ppt.ts:1139`）各分支统一加一条：`不要用 [文档N]，不要输出任何来源标注。`
2. 解析时剥离 —— `Slide.setContent`（`:1670-1692`）在 `genViewItemByRegex` 之后、校验之前，对每条 `vi.title/vi.content` 跑 `stripHallucinatedDocCitations`（提到 PPT 侧公共处复用，勿复制正则）。
3. 校验计数用剥离后的长度 —— 见 40.2。

只做 3 = 让告警消失但页面仍脏，**不接受**。

### 40.2 P1：校验口径改为「剥离引用后计数」+ 编辑器软限

`validateSlideViewItems`（`:1254-1261`）目前只 `trim()`，裸算 `content.length`。
改动：新增纯函数 `pptItemLength(s)` = `stripHallucinatedDocCitations(s).text.trim().length`，`:1376`（描述）、`:1373`（标题）、`:1368`（metric 解读）、`:1273/:1298/:1328/:1332/:1351/:1365` 各处一并换掉，保证「提示的数字」与「编辑器显示的字数」同源。

⚠️ **顺带修一个会静默丢数据的 bug**：`SliderDrawer.tsx:222` 描述 `TextArea` 硬写 `maxLength={dMax}`（70）。用户把 108 字原文粘进去会被**从尾部静默截断**，且不提示 —— 手改时最容易丢掉末尾的出处/数字。
改法：去掉 `maxLength`，改成软限 —— 超限把 `Text type="secondary"` 的字数显示变红（`:221` 已有 `{item.content.trim().length}/{dMax}` 现成位置），保存时仍由 `validateSlideViewItems` 拦。标题那行 `:212` 同理（PPT_ITEM_TITLE_MAX=12 也会硬截）。

### 40.3 P1：一键 AI 精简 —— 同意做，但别放 hover Tooltip

`EditableResultCollapse.tsx:159` 的橙叹号是 `<Tooltip title={tip}>{icon}</Tooltip>`，纯文本、hover 即消失，**放不下一个可点按钮**（Tooltip 里塞按钮能点但极易误触/遮挡）。
现成入口更好用：`getSlideExtra`（`:166-182`）已有「内容修改」按钮 → 打开 `SliderDrawer`。建议把「AI 精简至合规」放在 **`SliderDrawer` 每条描述下方**（`:217-224` 那个 TextArea 下面），仅在 `len > dMax` 时出现：

```tsx
{over && <Button size="small" type="link" onClick={() => onShorten(index)}>AI 精简至 {dMax} 字</Button>}
```

`onShorten` 走单条重写（复用该页已有的单条生成通道，prompt = 「把下面这句压缩到 ≤70 字，保留全部数字与出处，只删连接词与重复限定，不要新增内容」）。**不要**重新生成整页（会动到其他点）。

### 40.4 P2：数据密集点不该挤在 list —— 分档机制已存在，判定太窄

用户建议②「按点类型分档：叙述 20~70 / 数据 20~100」。**方向对，实现要换路径**：

- 70 不是随手定的：`PPT_ITEM_DESC_MAX=70`（`:372`）与 `SliderDrawer` 的 `maxLength` 同源，是**版式容量约束**。直接放宽到 100 而没验模板 ⇒ 溢出比告警更糟（我没测模板实际容量，**不许凭这个数字拍板**）。
- **系统已有分档**：`metric` / `metric_list` 布局 = 数据点走「原数字 2~12 字 + 短解读 4~16 字」（`:368-371`、`:1155-1156`）。数据密集的点本来就该走这条路，而不是给 list 放宽。
- 真正的洞在**版式判定**：`outlineJson.ts:146-158` 的 `metricCue` 只对**页标题**正则（`/大盘|增速|规模|占比|GMV|销售额|同比|渗透|播放量|金额|人次/`）。页标题不含这些词、但要点塞了三组质押数字 ⇒ 判 `list` ⇒ 挤 20~70。
  改法（P2）：`metricCue` 增加对**要点文本**的判定（要点里 ≥2 个「数字+单位」视为看数页），或在大纲侧给数据密集页显式标 `layout: metric`。

### 40.5 纠偏：三条不要做

1. **别只改计数让告警消失** —— 页面里的 `[文档13]` 还在（40.1）。
2. **别把 70 放宽到 100** —— 除非先确认模板描述区容量；优先让数据点走 metric 版式（40.4）。
3. **别再把字数抄一遍进提示词** —— `buildPptItemFormatPrompt` 的 list 分支（`:1243-1251`）**已经写了** `1. 概括标题（4～12字） - 具体描述（20～70字）`。用户判断④「校验没前移」的前提不成立；108 字是模型为塞三组数字**主动违反**已写明的约束。再抄一遍收益≈0，该做的是 40.3（一键精简）+ 40.4（给数据点正确出口）。

### 40.6 执行序与验收

**40.1（引用三件套）→ 40.2（计数口径 + 软限）→ 40.3（一键精简）→ 40.4（metricCue 扩到要点，P2 可延后）**。
jest：并入既有 PPT 套件（勿新建文件）；用例三条 —— ① 含 `[文档13]` 的 108 字描述，剥离后 ≤70 ⇒ 校验通过且返回文本无 `[文档`；② 剥离后仍 >70 ⇒ 仍报错且**报的数字是剥离后的长度**；③ 去掉 `maxLength` 后粘贴 108 字不被截断（软限标红）。

验收（UI）：KB 页 PPT 重新生成同一页 → 橙叹号消失、描述里无 `[文档N]`；在编辑器粘 108 字 → 标红不截断 → 点「AI 精简」→ 保存通过。


## 四十一、反馈闭环 P0（新模块，需求已由用户拍板）

> 需求文档：`docs/2026-10-21-feedback-loop-requirements.md`（**先看这份**，本单以它为准）
> 背景：产品同事给了 LTC 的反馈闭环方案（录屏 + TRAE 规则包），要求毕方先加上，他好加入测试提缺陷。
> 用户已拍板三个决策（文档第十节）：① 复用现有 RBAC、加指派字段、不做角色管理界面；② 内部测试起步但将来给客户，做 `visibility`/`env` 预埋；③ 产品内角标为主，邮件为辅（仅 fixed/resolved 两事件，异步可失败）。

### 41.0 先纠一个我上一轮写错的前提（必读）

上一章我写「后端无鉴权中间件、需新建角色体系」——**错的**。毕方已有完整 RBAC：

| 已有 | 位置 |
|---|---|
| `users.access`（admin / user） | `backend/app/db.py:54` |
| `roles` 表（admin / user 初始数据） | `db.py:216-223` |
| `menus` 表（20 条，`p_id=12` = 系统管理） | `db.py:227-259` |
| `role_res` 表（角色→菜单授权，admin 全量） | `db.py:262-273` |
| `orgs` 表 | `db.py:276` |

⇒ **不要新建 users/roles/权限界面**。本单权限工作只有三件：加 1 条菜单、加 1 条授权、接口里读 `access` 判定。

### 41.1 数据库（`backend/app/db.py`）

1. 在 `user_logs` 建表附近（约 `:112` 之后）加 `feedbacks` / `feedback_comments` 两张表 + 4 个索引，**DDL 照抄需求文档第四节**（含 `assignee` / `visibility` / `env` / `notify_status` 四个新字段，别漏）。
2. 菜单种子数据：`db.py:227-259` 的 `menus` 数组末尾加一条：
   ```python
   (21, "反馈管理", "feedbackMgt", "feedbackMgt", "MessageOutlined", "/admin/feedback", 9, 12),
   ```
   ⚠️ `menus` 种子只在 `menu_count == 0` 时写入，**已存在的库不会补这条**。必须同时写一个幂等补丁：启动时 `INSERT OR IGNORE INTO menus (id, ...) VALUES (21, ...)`，并对 `role_res` 同样 `INSERT OR IGNORE ... ('feedbackMgt','menu','1','admin')`。否则用户现有库里看不到菜单。
3. 不要动 `user_logs`（P2 才接）。

### 41.2 后端（`backend/app/routers/feedback.py` 新建）

- 6 个接口，路径与权限矩阵见需求文档第五节 / 第四节权限矩阵。
- `main.py:53-56` 加一行 `app.include_router(feedback.router)`，与现有四个同风格。
- 风格照 `db.py` 手写 `sqlite3`，**不引 SQLAlchemy**；成功失败用现有 `ok()` 封装（见 `mock_api.py`）。
- 权限判定：`PUT` 必须校验。从请求头 token 反查 `_TOKENS`（`mock_api.py:37`）拿 username → 查 `users.access`。**不要写中间件**，与现有 router 无鉴权风格一致，但 `PUT` 这一处必须有。
- 幂等：`POST /api/feedback` 前端会带预生成 `id`，用 `INSERT OR REPLACE` 或先查重。
- 图片上传复用 `knowledge_base.py:243-258` 的 `FileResponse` 风格（无鉴权），存 `DATA_DIR/feedback_imgs/`。

### 41.3 前端

| 件 | 位置 / 参照 |
|---|---|
| 浮动入口 `FeedbackFloatEntry` | 照抄 `src/components/UploadTask/UploadTaskPanel.tsx:340` 的 `UploadTaskFloatEntry`；挂到 `src/app.tsx:119`（与 `<UploadTaskFloatEntry />` 并列） |
| 右上角未读角标 | `app.tsx:61` `actionsRender` 数组里加一项 |
| 提交弹窗 `FeedbackModal` | 类型 + 描述 + 截图粘贴/拖拽 + 「自动附加上下文」可勾选可预览（**默认勾，但必须能看见具体内容**）。底部隐私灰字占位照需求文档 6.1 |
| 管理页 `FeedbackAdmin` | 挂在 `/admin/feedback`，参照 `src/pages/Admin.tsx` 现有子页面写法；列表支持 `?mine=1` / `?status=` / `?assignee=` |
| **详情用右侧抽屉，不要跳新页面** | 产品同事熟悉的形态就是 LTC 那套「列表 + 右侧详情抽屉」（截图 / 指派 / 内部记录 / 评论）。抽屉里额外放一块 `context_json` 的可折叠查看区 |
| 服务层 | `src/services/` 下新建 `feedback.ts`，照 `services/chatchat/kb.ts` 的请求风格 |

上下文快照字段（`gen_id` / `gen_type` / `target_key` / `asset_ref` / `allowed_refs` / `console_tail` …）照需求文档第二节表格。`console_tail` 上限 50 条、单条 ≤500 字，`context_json` 整体 ≤32KB（超了截断，别静默丢整包）。

### 41.4 邮件通知（**P0 必做**，配置已就位且已实测）

**凭据已写入 `backend/.env`，直接读即可**（`**/.env` 已被 `.gitignore` 忽略，不会入库）。可用键：`SMTP_HOST` / `SMTP_PORT` / `SMTP_SSL` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `FEEDBACK_SITE_BASE`。占位键已同步进 `backend/.env.example`（那里只放假值，别写真值）。

⚠️ **硬约束：密码只存在于 `.env`。禁止写进任何源码、文档、交接、测试用例或提交信息。** 读取用 `os.getenv`，不要打印到日志。

**已实测通过**（2026-10-22 00:30，`ab/smtp_probe.py`，只握手未发信）：
```
host=smtp.exmail.qq.com port=465 ssl=True
CONNECT ok / EHLO 250 / LOGIN OK
```

实现要求：
- 465 → `smtplib.SMTP_SSL(host, port, timeout=15)`；若 `.env` 是 587 且 `SMTP_SSL=false` → `SMTP()` + `starttls()`。`timeout` 必须设，避免卡死请求线程。
- 只在两个事件发：`fixed`（请提交人确认）与 `resolved`（已关闭）。收件人 = 提交人 `users.email`；为空或格式非法 → `notify_status='skipped'`。
- 异步发（`asyncio.create_task` 或线程），失败写 `notify_status='failed'` 并记录简短原因，**不得阻断状态变更接口**（这是本条最容易写错的地方：别在 `PUT` 里 await 发信）。
- 纯文本即可，正文含：反馈编号、标题/首 40 字、新状态、处理人回复摘要、`FEEDBACK_SITE_BASE` 拼的直达链接。`From` 显示名「毕方反馈」。
- 主题行统一前缀 `[毕方反馈]`。

### 41.5 执行序

**41.1 → 41.2 → 41.3 → 41.4（41.4 已是必做，不要再跳过）**。测试：
- 后端：至少覆盖「user 改状态 403」「admin 改状态 200」「提交人无 email 时 `notify_status='skipped'` 且不报错」「SMTP 异常时状态变更仍返回 200、`notify_status='failed'`」四条；
- 邮件自测：用 `ab/smtp_probe.py` 先验证连接，再真发一封到 `<邮箱>` 自收，确认主题前缀与正文链接正确；
- 前端：jest 至少覆盖「context 快照截断 ≤32KB」「提交幂等（同 id 两次只入库一条）」两条纯函数。

### 41.6 不在本单（勿顺手）

- 用户管理 / 角色管理 / 组织架构界面（已存在，本单只加菜单与授权记录）；
- `user_logs` 埋点、AI 洞察、反馈聚类（P2）；
- 段/页级「就地反馈」按钮（P1）；
- 富文本、@提及、企微通知、Gitee 同步；
- 邮件模板美化（纯文本即可：反馈编号 + 状态 + 直达链接）。


## 四十二、指针章：本单做「四十章 PPT 小项描述长度校验治理」（2026-10-22 02:05）

### 42.0 为什么要有这一章（必读，别跳过）

**本单不做四十一，也不要再动反馈闭环的任何文件。** 四十一（反馈闭环 P0）已由 `0b70859` 落地并验收通过，本单与它无关。

本章存在的原因只有一个：**四十章写在了四十一章前面**（四十章在本文档 4836-4904 行，四十一章在 4907 行）。你的开工规则是「读末章」，所以四十章一直处于「已下发但读不到」的状态。实测确认它**从未被执行**：

- `ViewItem4Ppt.ts:1375` 仍是 `if (content.length < PPT_ITEM_DESC_MIN || content.length > PPT_ITEM_DESC_MAX)` —— 裸算 `content.length`，没剥离引用标记；
- `ViewItem4Ppt.ts` / `AiOutlineGenPpt.tsx` / `KbOutlineGenPpt.tsx` / `ChatWithSpeech4Ppt.tsx` / `PptTemplate.ts` 五个文件里 `stripHallucinatedDocCitations|stripCitations` 命中数**全为 0**；
- `SliderDrawer.tsx:212` `maxLength={tMax}`、`:222` `maxLength={dMax}` 硬限仍在。

**所以：本单只做四十章，执行 40.1 → 40.2 → 40.3 → 40.4，40.5 列出的三条一律不做，40.6 的验收照做。** 四十章正文在 4836-4904 行，开工前请完整读一遍（下面 42.1-42.4 只是把关键行号复述一遍，防止你翻错位置，**不是正文的替代品**）。

### 42.1 P0：引用标记三件套（四十章 40.1）

用户报的原始现场：PPT 某页橙叹号「第 1 点描述须为 20～70 字，当前 108 字」，描述尾部带 `[文档13]`。

根因比「计数没剔除引用」更靠前：**PPT 侧完全没有引用标记治理**。后端检索片段本来就带编号（`kb_service.py:926-928`），文档侧有 `stripHallucinatedDocCitations`（`parseChatCompletion.ts:204-218`），PPT 侧零命中 ⇒ `[文档13]` 会原样灌进幻灯片，而 PPT 没有文末资料来源清单，编号悬空。

三件套缺一不可：
1. `buildPptItemFormatPrompt`（`ViewItem4Ppt.ts:1139`）各分支统一加：`不要用 [文档N]，不要输出任何来源标注。`；
2. `Slide.setContent`（`:1670-1692`）在 `genViewItemByRegex` 之后、校验之前，对每条 `vi.title/vi.content` 跑剥离（抽到 PPT 侧公共处复用，**不要复制第二份正则**）；
3. 校验计数改用剥离后的长度（见 42.2）。

**只做第 3 条 = 让告警消失但页面仍脏，不接受。**

### 42.2 P1：计数口径 + 编辑器软限（四十章 40.2）

- 新增纯函数 `pptItemLength(s)` = `stripHallucinatedDocCitations(s).text.trim().length`；
- 换掉 `:1376`（描述）、`:1373`（标题）、`:1368`（metric 解读）以及 `:1273/:1298/:1328/:1332/:1351/:1365` 各处裸算，保证「报错里的数字」与「编辑器显示的字数」同源；
- **顺带修一个静默丢数据的 bug**：`SliderDrawer.tsx:222` 描述 `TextArea` 的 `maxLength={dMax}`（70）会把粘贴的 108 字**从尾部静默截断**，最容易丢掉末尾的数字与出处。去掉 `maxLength`，改成软限：超限把 `:221` 已有的 `{item.content.trim().length}/{dMax}` 显示变红，保存仍由 `validateSlideViewItems` 拦。标题 `:212` 同理（`PPT_ITEM_TITLE_MAX=12` 也会硬截）。

### 42.3 P1：一键 AI 精简（四十章 40.3）

入口**不要放 hover Tooltip**（`EditableResultCollapse.tsx:159` 是 `<Tooltip title={tip}>`，纯文本、hover 即消失，塞按钮易误触）。

放在 `SliderDrawer` 每条描述下方（`:217-224` 那个 TextArea 下面），仅当 `len > dMax` 时出现：

```tsx
{over && <Button size="small" type="link" onClick={() => onShorten(index)}>AI 精简至 {dMax} 字</Button>}
```

`onShorten` 走**单条重写**（复用该页已有的单条生成通道），prompt 用：「把下面这句压缩到 ≤70 字，保留全部数字与出处，只删连接词与重复限定，不要新增内容」。**不要重新生成整页**（会动到其他点）。

### 42.4 P2：数据密集点走 metric，而不是给 list 放宽（四十章 40.4）

用户原始建议是「叙述点 20~70 / 数据点 20~100」。方向对，实现要换路径：

- `PPT_ITEM_DESC_MAX=70`（`:372`）与 `SliderDrawer` 的 `maxLength` 同源，是**版式容量约束**。没验模板就把 70 放宽到 100 ⇒ 溢出比告警更糟。**不许凭这个数字拍板**。
- 系统**已有分档**：`metric` / `metric_list` = 数据点走「原数字 2~12 字 + 短解读 4~16 字」（`:368-371`、`:1155-1156`）。
- 真正的洞在版式判定：`outlineJson.ts:146-158` 的 `metricCue` 只对**页标题**正则（`/大盘|增速|规模|占比|GMV|销售额|同比|渗透|播放量|金额|人次/`）。页标题不含这些词、但要点塞了三组质押数字 ⇒ 判 `list` ⇒ 挤在 20~70。
- 改法：`metricCue` 增加对**要点文本**的判定（要点里 ≥2 个「数字+单位」视为看数页），或在大纲侧给数据密集页显式标 `layout: metric`。**P2，可以延后到 42.1-42.3 之后单开一轮。**

### 42.5 三条不要做（四十章 40.5，重申）

1. **别只改计数让告警消失** —— 页面里的 `[文档13]` 还在（42.1）。
2. **别把 70 放宽到 100** —— 除非先确认模板描述区容量；优先让数据点走 metric（42.4）。
3. **别再把字数抄一遍进提示词** —— `buildPptItemFormatPrompt` 的 list 分支（`:1243-1251`）**已经写了** `具体描述（20～70字）`。「校验没前移」的前提不成立，108 字是模型为塞三组数字**主动违反**已写明的约束。再抄一遍收益≈0。

### 42.6 执行序与验收（四十章 40.6）

执行序：**42.1 → 42.2 → 42.3 → 42.4**（42.4 可延后）。

jest 并入既有 PPT 套件，**不要新建测试文件**。三条用例：
1. 含 `[文档13]` 的 108 字描述，剥离后 ≤70 ⇒ 校验**通过**，且返回的 `viewItems` 文本里**不含** `[文档`；
2. 剥离后仍 >70 ⇒ 仍报错，且**报错里的数字是剥离后的长度**；
3. 去掉 `maxLength` 后粘贴 108 字**不被截断**，超限标红。

UI 验收：KB 页 PPT 重新生成同一页 → 橙叹号消失、描述里无 `[文档N]`；编辑器粘 108 字 → 标红不截断 → 点「AI 精简」→ 保存通过。

提醒：橙叹号本身**不阻断下载**（`evaluatePptDownloadReady` 走 softWarnings，`ViewItem4Ppt.ts:2298-2300`），所以别把它当 blocker 处理；但 108 字灌进 list 版式会挤字溢出，导出前仍要压到 ~70 字。


## 四十三、邮件 P0 修复 + 真 token 校验 + 登录/操作双审计（2026-10-22 02:20）

### 43.0 本单范围与优先级（先说清楚，别做串）

**四十二（PPT 描述长度校验）暂缓，做完本单再回四十二。** 本单执行序：

**43.1 邮件修复（P0，这是四十一 41.4 没收尾的欠账）→ 43.2 真 token 校验 + session 超时（P0）→ 43.3 登录/退出审计（P1）→ 43.4 操作行为审计（P1）→ 43.5 审计查询页（P2）。**

用户提的五个诉求，我逐项核过代码，**其中三条的现状与你的想象不同，先纠偏**（43.1-43.4 的开头都标了「现状实测」）。

### 43.1 P0：邮件从未发出过（不是"没收到"，是压根没发）

**实测证据**（我直连 `backend/data/bifang.db` 快照查的，后端进程持锁所以是复制快照读的）：

```
feedbacks: 8bc1d18f | user=admin | status=fixed | assignee=admin | notify_status='skipped'
user_logs: rows = 0
users: hezl(admin, email='')  lizy(admin, email='')  admin(admin, <邮箱>)
```

`notify_status='skipped'` 而不是 `'failed'` ⇒ 走的正是 `schedule_notify` 里的 `if not smtp_configured(): on_done("skipped", "未配置 SMTP")` 分支（**`feedback_mail.py:88`**）。不是发信失败，是**根本没进发信流程**。

三个原因叠加，**少修一个都还是发不出去**：

**(a) `Settings` 里压根没有 SMTP 字段。** `app/config.py` 的 `Settings` 只声明了 deepseek / embedding / retrieval / host / port / cors / data / chunk / ocr 这些，**没有** `smtp_*` / `feedback_*` 任何字段；而 `model_config` 写的是 `extra="ignore"` ⇒ `.env` 里的 `SMTP_HOST/SMTP_PORT/SMTP_SSL/SMTP_USER/SMTP_PASS/SMTP_FROM/FEEDBACK_SITE_BASE` 七个键被 pydantic **静默忽略**。

**(b) 读的是 `os.getenv`，而 `.env` 从没进过进程环境变量。** `feedback_mail.py` 全文用 `os.getenv("SMTP_HOST")` 读；但 `start.sh` 只有 `source .venv/bin/activate` + `exec uvicorn`，**既没有 `set -a; source .env; set +a`，也没有 `export $(grep -v '^#' .env | xargs)`**。pydantic-settings 的 `env_file` 只填充 Settings 对象，**不回写 `os.environ`**。⇒ `os.getenv` 恒为空。

**(c) 提交人邮箱是空的。** 即使 (a)(b) 都修好，`_user_email()` 取的是 `users.email`，而 **`hezl`、`lizy` 两行的 email 都是空字符串** ⇒ `valid_email('')` 为 False ⇒ `on_done("skipped", "提交人无有效邮箱")`（`:91-93`）。

**修法：**

1. `app/config.py` 的 `Settings` 增加七个字段（类型照抄）：
   ```python
   smtp_host: str = ""
   smtp_port: int = 465
   smtp_ssl: bool = True
   smtp_user: str = ""
   smtp_pass: str = ""
   smtp_from: str = ""
   feedback_site_base: str = "http://localhost:8000"
   ```
2. `app/services/feedback_mail.py` 里**全部 `os.getenv(...)` 改为 `get_settings()`**（`from app.config import get_settings`）。`smtp_configured()` / `_send_sync()` / `build_mail()` 三处都要改。**不要**用 `load_dotenv()` 把 `.env` 灌进 `os.environ` 来绕过 —— 与项目既有的 pydantic-settings 风格不一致，且会让密码长期驻留进程环境。
3. **邮箱策略（用户 2026-10-22 拍板：`lizy` 的邮箱暂时不提供）**：`hezl` → `<邮箱>`；`lizy` 留空。**但"发不出去"这件事必须在产品界面上体现出来，不许静默 skip** —— 用户原话「产品界面通路要体现」：
   - `notify_status` 增加 `'no_email'` 取值。现在的 `'skipped'` 语义太笼统（未配置 SMTP / 非通知事件 / 无邮箱 三种情况共用一个值），排查时看不出卡在哪个分支；
   - 反馈列表与详情的「通知状态」列：显示「已发送 / 未发送·提交人未填邮箱 / 发送失败·<原因>」，未填邮箱用橙色标注，鼠标悬停给出"在个人中心补充邮箱后可重发"的提示；
   - 管理页与个人中心**让 email 可编辑**（这条不变），补上邮箱后支持「重发通知」。
   - 代码侧：`schedule_notify` 的 `on_done("skipped","提交人无有效邮箱")` 分支（`feedback_mail.py:91-93`）改成 `on_done("no_email","提交人未填邮箱")`。**先改状态值再改界面**，别只改文案。
4. `FEEDBACK_SITE_BASE` 目前是 `http://localhost:8000`，链接别人打不开 —— 有对外地址就改，没有就先留着并在邮件里注明"需在内网访问"。

**验收（41.4 欠账，这次必须真发一封）：** 后端重启后，在管理台把一条反馈置为 `fixed`，确认 `notify_status` 从 `skipped` 变成 **`sent`**，且 `<邮箱>` 真收到信。若仍是 `skipped`，把 `skipped` 的原因文案（"未配置 SMTP" / "提交人无有效邮箱"）报出来定位。

### 43.2 P0：真 token 校验 + session 超时（现在是可以冒充管理员的）

**现状实测：**

- `mock_api.py:14` `_TOKENS: dict[str, str] = {}`，`:58` `_TOKENS[token] = username` —— **内存字典，无时间戳、无过期、无上限**，token 一旦签发**永不过期**，且进程重启即全丢；
- `mock_api.py:75-77` `out_login()` **只 `return ok({}, msg="已退出")`，根本不删 token** ⇒ 点了退出登录，旧 token 照样能用（前端 `AvatarDropdown.tsx:46` 调的它）；
- `feedback.py:_actor`（:31-67）鉴权顺序是 **token → 回退 `header username/loginUser`** ⇒ 任何人构造一个 `username: admin` 的请求头就能冒充管理员，看到全部反馈、改状态、指派。**这个回退必须去掉。**

**修法：**

1. `_TOKENS` 值改为结构：`{"username": str, "exp": float, "last": float}`，签发的 token 用 `secrets.token_urlsafe(32)`（现在是 `token_hex(16)`，够用但可加长）。
2. **滑动过期**：TTL 默认 **2 小时**（用户 2026-10-22 拍板，原拟 30 分钟嫌短；先硬编码常量 + 注释，别一上来就加配置项）。**语义要说清**：2 小时是**从最后一次请求开始计时**（滑动窗口），不是从登录时刻算 —— 用户一直在操作就永不过期。另设**绝对上限 12 小时**，从登录时刻算，到点必须重登（防止一个永不活动的 token 靠滑动无限续命）。每次校验通过刷新 `last`。
3. 新增统一依赖（放 `app/security/auth.py`，不要散在各 router）：
   ```python
   def require_user(request) -> dict   # 401 若 token 无效/过期
   def current_user(request) -> dict|None  # 可为 None，用于公开接口
   ```
   `_actor` 改为调用它，**删除 `header username/loginUser` 回退**（`feedback.py:48-55` 整段删）。
4. `out_login` 真正 `pop` token，并返回前端清 localStorage 的约定。
5. **前端必须核实一件事**：`requestErrorConfig.ts` 的请求拦截器是否**统一**给所有请求带 `token` header（现有 `_actor` 的注释暗示"后端重启后 token 会丢、但 localStorage 里还有 loginUser" ⇒ 前端可能只有部分请求带 token）。若不是全量带，43.2 一上就会大面积 401。**这一条先查再改**，查完在回执里写明结论。
6. 401 时前端跳登录页并提示"登录已过期"，不要静默失败。

### 43.3 P1：登录 / 退出审计（现在是一行都没有）

**现状实测：登录成功、登录失败、退出登录 —— 三条路径全部零记录。** 全仓 `grep user_logs` 只命中 `db.py:112`（建表）和 `mock_api.py:207`（**读**接口），**没有任何 INSERT**。`user_logs` 表 `rows = 0`，从建库至今一条没写过。也没有任何 session/超时概念（`grep expire|timeout|SESSION` 在 `app/` 下只命中 smtp 和 document_loader 的 timeout）。

`user_logs` 现有字段是「页面访问/功能操作」口径（`user/name/org_code/org_name/source/url/module/menu/fcn/client_ip/request_id/record_time`），**装登录事件不合适**（没有事件类型、没有结果、没有时长、没有 session_id）。

**新建 `login_logs` 表**（`db.py` 里加，注意存量库要 `CREATE TABLE IF NOT EXISTS`）：

```sql
CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    name TEXT DEFAULT '',
    client_ip TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    event TEXT NOT NULL,          -- login_ok | login_fail | logout | timeout | kicked
    reason TEXT DEFAULT '',       -- 失败/踢出原因：密码错误 | 账号已停用 | 空
    session_id TEXT DEFAULT '',   -- token 前 8 位，串联同一次登录
    login_at TEXT,
    logout_at TEXT,
    duration_s INTEGER DEFAULT 0
);
```

**埋点位置**（三处，都在 `app/routers/mock_api.py`）：
- `login_account` 成功分支（`:58` 附近）：`event='login_ok'`，记 `client_ip`（取法见 43.4 的 IP 取值说明）、`user_agent`、`session_id`；
- `login_account` 两个失败分支（`:37` 账号已停用、`:68` 密码错误）：`event='login_fail'` + `reason`；
- `out_login`：真正 pop token 后写 `event='logout'` + `logout_at` + `duration_s`；
- 43.2 的超时判定触发时：写 `event='timeout'`，`logout_at` 记为过期时刻。

### 43.4 P1：操作行为审计（`user_logs` 是空壳，需要扩字段 + 定白名单）

**现状实测：** 表存在、字段设计尚可（有 `client_ip`/`url`/`module`/`menu`/`fcn`），但 **零写入、无事件类型、无结果、无停留时长字段**。所以"是否支持判断都做了些啥操作"——**现在不支持，一条都没有**。

**(a) 扩字段**（`db.py` 的 `user_logs` 建表语句加列；存量库用 `ALTER TABLE ... ADD COLUMN`，SQLite 支持，注意要 try/except 幂等）：

```sql
ALTER TABLE user_logs ADD COLUMN event TEXT DEFAULT '';       -- view | action
ALTER TABLE user_logs ADD COLUMN action TEXT DEFAULT '';      -- 见下方白名单枚举
ALTER TABLE user_logs ADD COLUMN target TEXT DEFAULT '';      -- 对象：kb名/文档id/反馈id
ALTER TABLE user_logs ADD COLUMN result TEXT DEFAULT 'ok';    -- ok | fail
ALTER TABLE user_logs ADD COLUMN detail TEXT DEFAULT '';      -- 失败原因/关键参数，≤500字，禁止记密码/token
ALTER TABLE user_logs ADD COLUMN session_id TEXT DEFAULT '';
ALTER TABLE user_logs ADD COLUMN duration_ms INTEGER DEFAULT 0;  -- 页面停留，见 (c)
```

**(b) 记录哪些 —— 白名单（不在清单里的一律不记，避免高频只读把表撑爆）：**

| 类别 | action 枚举 | 说明 |
|---|---|---|
| 认证 | `login` / `logout` | 走 `login_logs`，**不重复**写 user_logs |
| 知识库 | `kb_create` / `kb_delete` / `doc_upload` / `doc_delete` / `doc_revectorize` | 写操作 |
| 生成 | `gen_doc_start` / `gen_doc_done` / `gen_ppt_start` / `gen_ppt_done` / `gen_fail` | 含失败，`detail` 记错误信息 |
| 导出 | `export_docx` / `export_pptx` | 成品下载 |
| 反馈 | `fb_create` / `fb_status` / `fb_assign` / `fb_comment` / `fb_image` | 全量记（本单新模块） |
| 用户/权限 | `user_create` / `user_update` / `user_disable` / `pwd_change` / `role_change` | 敏感操作必记 |
| 页面停留 | `page_view` | 路由级，见 (c) |

**明确不记**：检索结果刷新、轮询（`upload_task` 状态轮询）、素材列表拉取、任何 GET 只读查询。

**(c) 停留时长怎么算（这是用户明确问的）：**

两个方案，**一期两个都做，互为兜底**：
1. **前端上报（准）**：路由切换 / 页面卸载（`beforeunload` + `visibilitychange`）时，用 `performance.now()` 算出上一页停留毫秒数，随下一条日志或单独 `POST /mock_api/user-log` 上报，写进 `duration_ms`。
2. **后端兜底（零前端改动）**：同一 `session_id` 下相邻两条 `page_view` 的 `record_time` 差值 ≈ 上一页停留时长。查询时**用 SQL 窗口函数 `LAG()` 现算**，不要写入表（写入会有"最后一段永远算不出"和"回填时序"两个坑）。

⚠️ 前端上报那条如果工作量太大，可以先只做后端兜底（`LAG()` 方案），**但要在回执里明确说清"最后访问的页面停留时长缺失"这个已知边界**，别让它悄悄变成"看起来数据不全"的 bug。

**(d) 埋点方式：中间件 + 白名单，不要散点手写。**
新增 `app/services/audit.py`：一个 FastAPI 中间件，按 (b) 的白名单匹配 `method + path` → 自动落 `user_logs`；白名单用一张常量表维护（`AUDIT_RULES: list[(method, path_regex, action)]`）。好处是不遗漏、新增接口改一处。**不要**在每个 router 里手写 INSERT。

**IP 取值**：`request.client.host` 在有反向代理时会拿到 `127.0.0.1` ⇒ 依次取 `X-Forwarded-For` 首段 → `X-Real-IP` → `request.client.host`。

### 43.5 P2：审计查询页（否则记了也看不见）

- `mock_api.py:207` 的 `user_logs` 读接口扩：**分页**（`page/size`，默认 20/50）+ **筛选**（`user` / `action` / `event` / `result` / 起止时间），返回 `total`；
- 新增 `login_logs` 读接口（同款分页筛选）；
- 前端加菜单「日志审计」，`menus` 走 `INSERT OR IGNORE`、`role_res` 带 `NOT EXISTS` 防重（**照抄四十一反馈管理那套幂等补丁的写法**，存量库不走 `count==0` 分支）；
- 页面两栏：登录日志（账号/IP/UA/事件/时长）+ 操作日志（用户/动作/对象/结果/停留）。**只读，不给删除按钮**（审计数据不可篡改是前提）。

### 43.6 保留策略与隐私（别省）

- 日志量：`page_view` 会是大头，建议 `page_view` 保留 **30 天**、其余 **180 天**，启动时跑一次清理（`DELETE FROM user_logs WHERE record_time < ?`），**不要**用定时任务增加运维面；
- 审计含 IP / UA，属个人信息。需求文档 `docs/2026-10-21-feedback-loop-requirements.md` 里已定的口径是"入口常驻 + 隐私声明占位"，这里保持一致：**先只在内部使用，不给客户开放前补隐私声明**。

### 43.7 不在本单（勿顺手）

- 审计数据的可视化图表 / 用户行为分析 / AI 洞察（P2，攒够数据再说）；
- 单点登录、验证码、密码复杂度策略、异地登录告警；
- **角色细化 / 多角色（RBAC 演进）** —— 用户提出了但**方案尚未拍板**，见 43.10。**本单不要动角色体系本身**（不建表、不改 `roles` / `role_res` 的结构）。
- ~~把 `lizy` 从 admin 降级~~ → **已拍板：降为 `user`**（用户 2026-10-22）。但降级必须保住他的「知识库管理」能力，本单按 **43.10 方案 A** 做（给 `user` 角色补授知识库管理菜单）。`hezl` 保持 `admin`（他是反馈处理人）。

### 43.8 执行序与验收

**43.1 → 43.2 → 43.3 → 43.4 → 43.5**。

验收（逐条贴结果，别只说"已完成"）：
1. 邮件：重启后端 → 置 fixed → `notify_status='sent'` → `<邮箱>` 收到信（**贴 `notify_status` 的实际值**）；
2. token：`curl` 不带 token 请求 `GET /mock_api/feedback` ⇒ 401；带 `username: admin` 头但**无 token** ⇒ **401**（这一条专门验弱鉴权是否真去掉）；带有效 token ⇒ 200；
3. session：登录后静置超过 TTL 再请求 ⇒ 401 且 `login_logs` 多一条 `event='timeout'`；
4. 登录审计：登一次、密码错一次、退出一次 ⇒ `login_logs` 三条，含 IP、时长非空；
5. 操作审计：新建知识库 / 生成一次 PPT / 提交一条反馈 ⇒ `user_logs` 三条，`action` 命中白名单枚举；
6. 查询页：分页 + 按 user/action 筛选返回正确 `total`。

### 43.9 本单完成后 → 接「四十二」（别让前章烂掉，机制缺陷）

用户 2026-10-22 指出一个真问题：**交接文档是「读末章开工」，每追加一章，前面的未完成章就被永久压住**，四十二会变成"永远的前章"。

事实求是：四十二（PPT 小项描述长度校验，`## 四十二、` 在 4994 行）**已经被压过一次** —— 它原本被四十一压住，靠追加四十二章这个指针才排上队，现在又被四十三压住。

**从本章起定一条规则：每一章末尾必须写明「本单完成后，下一单做哪一章」。**

本单（四十三）完成后，**接四十二**：直接执行 `## 四十二、`（4994 行）里 42.1 → 42.2 → 42.3 → 42.4，42.5 三条不做，42.6 验收照做。四十二本身是完整独立的指令章，不需要再为它写指针章。

⚠️ 后续任何人（我或用户）再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。

**当前待办链条（写在这里，防止丢）：**
1. **四十三**（本单，邮件 / token / 双审计）→ 正在做
2. **四十二**（PPT 小项描述长度校验，4994 行）→ 本单完成后接
3. **RBAC 方案 C**（真·多角色，见 43.10，用户 2026-10-22 已拍板）→ 四十二之后，**需单独开一章**，不要只靠这条备注。

### 43.10 待用户拍板：角色与权限细化（本单不动，先摆方案）

用户 2026-10-22 提出：`lizy` 应降为 `user`，但又需要「知识库管理」权限；进而问是否需要细化角色与权限的关系、支持一个用户多个角色（即 `user` 身份带部分管理权限）。

**现状实测**：`users.access` 是**单值**（`admin` / `user`）；`roles` / `role_res` / `menus` 是标准 RBAC 三表，但**只有 role→res 的授权，没有「用户-角色」关联表** ⇒ 一个用户只能有一个角色（就是 `access` 本身）。`_actor` 返回 `access`，前端 `initialState` 拿它判菜单。

三个方案：

| 方案 | 做法 | 代价 | 适用 |
|---|---|---|---|
| **A. 改授权（最小）** | `lizy` 降为 `user`，再给 `role_res` 中 `role_code='user'` 补授「知识库管理」菜单 | 零代码，一条 `INSERT` | **副作用：所有 `user` 都获得知识库管理权**，粒度粗。内部测试期（就 4 个账号）可接受 |
| **B. 加中间角色** | 新建 `role_code='kb_manager'`，只授知识库菜单；`lizy` 的 `access` 直接改成 `kb_manager`（仍是单值） | 要排查前端是否有硬编码 `access === 'admin'` 的分支 | 比 A 干净，但仍是单角色；将来"既是 kb_manager 又要提反馈"还得再改 |
| **C. 真·多角色** | 新增 `user_roles(user_id, role_code)` 关联表，权限取并集；`_actor` 返回角色集合，前端菜单按并集渲染 | 改动面最大：db + 后端鉴权 + 前端 `initialState`/菜单渲染 + 用户管理界面 | 将来给客户用必走这条路；现在 4 个账号，做了收益不划算 |

**本单按 A 做**（先把 `lizy` 的权限打通、不阻塞），**C 记为技术债**，等"要给客户用"或"角色数超过 3 个"时再开单。走 A 时 `role_res` 的补丁**必须照抄四十一那套 `INSERT ... WHERE NOT EXISTS` 幂等写法**，别用 `count==0` 分支（存量库不走那条路）。

**已拍板（用户 2026-10-22 02:40）：走 C（真·多角色），但不在本单做，等四十三全部完成后单独开一章。**

本单仍按 A 执行（先把 `lizy` 的权限打通、不阻塞）。⚠️ **A 的产出现在 C 落地时必须回滚**：A 是把「知识库管理」直接授给 `user` 角色，C 落地后权限按角色并集计算，若 A 的授权还留着，就会变成「所有 user 都带知识库管理」——正好是 A 的副作用被固化下来。**开 C 那一单时，第一条就是删掉这条 `role_res` 记录，并改成给 `kb_manager` 角色授权。**


## 四十四、四十三验收判卷：两件收尾 + 接四十二（2026-10-22 02:50）

### 44.0 判卷结论（我实测过，不是看你的回执复述）

四十三**整体通过**。以下每条我都有实测证据：

| 验收项（43.8） | 结果 | 证据 |
|---|---|---|
| 邮件 `notify_status` | ✅ | `feedbacks` 里 `0d88a429 \| user=hezl \| status=fixed \| notify=sent`（对比修复前的 `8bc1d18f \| notify=skipped`） |
| 弱鉴权真的去掉 | ✅ | 我 curl 三种情况全部 **401**：① `-H "username: admin"` 无 token ② 完全无身份 ③ 伪造 `token: deadbeef`。返回体 `{"detail":"登录已过期或未登录"}` |
| SMTP 改走 Settings | ✅ | `config.py:73-79` 七个字段齐全；`feedback_mail.py` 三处 `get_settings()`，无 `os.getenv` |
| 登录/失败/退出埋点 | ✅ | `login_logs` 11 行，含 `login_fail`(reason=密码错误, ip=127.0.0.1) 与 `logout`(duration_s=3) |
| 白名单 + 停留时长 | ✅ | `user_logs` 8 行，`page_view` duration_ms=37606（约 37.6 秒，与相邻记录间隔自洽）、`fb_create`/`fb_status` 均在白名单内 |
| 审计页 | ✅ | `routes.ts:230` `/admin/audit` + `AuditLogs.tsx` + `menu.ts:35`「日志审计」 |
| lizy 降 user + 知识库授权 | ✅ | `users` 表 `lizy \| access=user`；`db.py:302` 幂等补丁（审计菜单 + user 补授知识库管理） |
| 中间件已生效 | ✅ | 不用再提醒重启了 —— `user_logs` 有 02:44 的数据，说明新代码已在跑 |

### 44.1 P0（先做这个）：四十三的改动**一行都没提交**

`git status` 显示 **12 个 `M` + 2 个未跟踪新文件**（`backend/app/security/auth.py`、`backend/app/services/audit.py`），最新提交还停在 `00d4871`。

**先把四十三整体提交，再动任何新代码。** 理由不是洁癖：现在工作区里混着邮件修复、token 改造、审计中间件三件事，一旦四十二的改动叠上来，出问题没法回滚到"四十三完成"这个已知好状态。

提交时按 43.1 / 43.2 / 43.3+43.4 / 43.5 拆成 2-4 个 commit，别一个 `feat: 一大堆`。

### 44.2 P1：`login_logs` 缺独立时间字段 —— 这是我的设计疏漏，你照做就行

**问题**：表里只有 `login_at` / `logout_at`，**没有事件自身的记录时间**。登录失败时 `login_at` 是 NULL ⇒ 实测 `login_fail` 那一列时间全是空的。

后果很实际：**登录失败恰恰是安全审计最需要时间戳的事件**（谁、什么时候、连续几次试密码），现在查不出来。审计日志没有时间等于废数据。

**修法**（`db.py` 的 `_ensure_login_logs` 里加，注意存量库要幂等）：
```sql
ALTER TABLE login_logs ADD COLUMN record_time TEXT;
```
然后 `write_login_log()` 里**所有事件**（`login_ok` / `login_fail` / `logout` / `timeout` / `kicked`）都写 `record_time = _now()`，`login_at` 保持只在成功时有值的语义。

顺带把审计页的登录日志表格加上这一列，并按 `record_time` 倒序。

### 44.3 提醒（不用你改，别再动密码）

`login_logs` 里有 **5 条 `hezl` 的 `login_fail`（reason=密码错误）**，之后你把它重置成了创建时密码。现在五个账号的 `password` 都是标准 bcrypt（`$2b$` 前缀、长度 60），形态正常。

**别再动任何账号的密码。** 用户会自己登一次确认；如果登不上，他会走个人中心的改密流程，不需要你介入。

另：用户已明确 **RBAC 走方案 C（真·多角色）**，但**不在本单、也不在四十二做**，等排到那一单我再开章。你不需要做任何角色体系的改动。

### 44.4 收尾完成后 → 接「四十二」

执行序：**44.1（提交）→ 44.2（补时间字段，提同一个 commit 或紧邻的第二个）→ 四十二**。

四十二：`## 四十二、` 在 4994 行，执行 42.1 → 42.2 → 42.3 → 42.4，42.5 三条不做，42.6 验收照做。它是完整独立的指令章，不用再为它写指针章。

### 44.5 待办链条（继续继承，别丢）

1. ~~四十三（邮件 / token / 双审计）~~ → 已落地待收尾
2. **四十四**（提交 + `login_logs` 时间字段）→ 本单
3. **四十二**（PPT 小项描述长度校验）→ 接在 44 之后
4. **RBAC 方案 C**（真·多角色，43.10 已拍板）→ 单独开章，排最后


## 四十五、四十二验收判卷 + 交接文档入库 + 做 42.4（2026-10-22 03:40）

### 45.0 四十二（42.1–42.3）验收通过（我逐项实测过）

| 项 | 证据 |
|---|---|
| 剥离复用同一套正则 | ✅ `ViewItem4Ppt.ts:4` `import { stripHallucinatedDocCitations }`，`:8` 包装函数，注释写明「勿复制第二份」——正是 42.1 要求的 |
| 提示词禁写 | ✅ `:17` `"不要用 [文档N]，不要输出任何来源标注。"` |
| 写入前剥离 + 校验用剥离后 | ✅ `:1696` 「校验前剥离 [文档N]，写入也用清洗后文本」；主校验 `:1393-1397`（标题/描述）全部换成 `pptItemLength(...)` |
| 编辑器软限 | ✅ `SliderDrawer.tsx` 已无 `maxLength`（原 `:212/:222` 已删）；`:241/:253` `type={dOver ? 'danger' : 'secondary'}` 超限标红 |
| AI 精简仅超长出现 | ✅ `:264-268` 条件 `dOver && props.onShortenItem && !asColumn && !asMetric` —— 还额外排除了分栏/指标版式，考虑得比我写的细 |
| `login_logs.record_time` | ✅ 新事件有值（实测 `03:30:25 login_fail` 带 `record_time`）；失败事件终于能按时间查了 |
| commit 拆分 | ✅ 6 个 commit 结构清楚：邮件 / token / 审计 / record_time / PPT / docs |

两点说明，不是缺陷：

- **`record_time` 有 6 条历史 NULL** —— 是加字段之前的旧记录（`ALTER TABLE ADD COLUMN` 不回填）。**不要去回填它们**：`login_ok` / `logout` 还能用 `login_at` 凑，但 `login_fail` 的旧行 `login_at` 本来就是 NULL，回填只会造出假数据。留空即可，新数据已正确。
- **用户 `hezl` 03:30 有两次 `login_fail` 后 `login_ok`** —— 是用户在自己验证登录（密码已确认可用）。**不要因为看到登录失败就去重置密码**，这条我再说一次。

### 45.1 P0：把 `.workbuddy/workbuddy-to-cursor.md` 单独提交（你之前的判断是对的）

你不把它混进功能提交是对的，**继续这么干**。这一份单独开一个 commit。

我在提交前扫了一遍，**没有明文凭据**（唯一命中的是 `token_urlsafe(32)` 这种代码描述，不是真密钥）。但有 **5 处 `<邮箱>`** 企业邮箱 —— 属个人信息，不是密钥。**仓库若是私有就直接提交；若公开或将来要公开，先把邮箱脱敏成 `<邮箱>`。** 这点由用户确认，你不用自己决定，提交前问一句。

### 45.2 P1：现在把 42.4 做掉（原本标 P2 延后，我改主意了）

**为什么现在做**：42.4 是四十二里唯一没做的，刚做完 42.1–42.3，上下文还在，接着做成本最低；拖到下一轮要重新读一遍代码。

**更要紧的是，当初把它定为 P2 的理由其实不成立**：P2 的顾虑是「放宽字数上限会溢出模板」，但 **42.4 根本不碰 70 这个上限** —— 它改的是版式判定，让数据密集页走 `metric`（metric 有自己的「原数字 2~12 字 + 短解读 4~16 字」约束，与 list 的 20~70 是两套）。所以没有模板容量风险，是我当初把两类风险混在一起标了 P2。

**改什么**（`frontend/src/components/DocUtil/outlineJson.ts:146-158`）：

`metricCue` 现在只对**页标题**做正则（`/大盘|增速|规模|占比|GMV|销售额|同比|渗透|播放量|金额|人次/`）。页标题不含这些词、但要点里塞了三组质押数字 ⇒ 判成 `list` ⇒ 挤在 20~70 字里 ⇒ 就是用户最初报的那个 108 字现场。

改成：**同时看要点正文** —— 一条页的要点里出现 **≥2 组「数字 + 单位」**（如 `6.7亿股`、`22.1亿股`、`7.28亿股`）即判为数据页走 `metric`。或者更稳妥：在大纲侧给数据密集页显式标 `layout: 'metric'`。

**风险与验收（这条别省）**：判定放宽 ⇒ 会有更多页走 metric 版式 ⇒ 版式发生变化。所以必须实测：拿最初报 108 字那一页（三组质押数字）重新生成，确认 ① 判成 `metric` ② 数字完整没被截 ③ 不溢出。同时**反验一页叙述型内容**，确认没被误判成 metric（若误伤，把阈值收紧到「≥2 组数字+单位 **且** 数字字符占该条描述比例 > 20%」）。

jest 继续并入 `outlineStructureAssert`，用例两条：① 要点含 3 组「数字+单位」、页标题无关键词 ⇒ 判 metric；② 要点纯叙述 ⇒ 仍判 list。

### 45.3 提醒（不用你做）：main 领先 origin 6 个 commit

6 个 commit 都还在本地。用户决定何时 push —— **push 之前必须先确认 45.1 的仓库可见性**（有企业邮箱和 RBAC 实现细节在里面）。

### 45.4 待办链条

1. ~~四十四（提交 + record_time）~~ ✅
2. ~~四十二 42.1–42.3~~ ✅
3. **42.4（metricCue 扩到要点）** ← 本单
4. **RBAC 方案 C（真·多角色）** ← 43.10 已拍板，单独开章，排最后

⚠️ 排到 RBAC-C 那一单时，**第一条是回滚 43.10 方案 A 的副作用**：A 把「知识库管理」直接授给了 `user` 角色，C 落地后权限按角色并集算，若 A 的授权残留 ⇒ 所有 user 都带知识库管理。必须先删那条 `role_res`、改授 `kb_manager`。


## 四十六、PPT 小项超长治理：自动精简重试 + 提示词治根 + table 内容模式判定（2026-10-22 04:45）

### 46.0 背景（用户实测现象，不是猜的）

知识库 PPT 生成「宝能系统持股路径」页，第 5 点报「第 5 点描述须为 20～70 字，当前 172 字」。

已确认**校验本身是对的**：172 字里没有 `[文档N]`，`pptItemLength`（`ViewItem4Ppt.ts:12-14`）已经是剥离引用后的长度，**不是 42.2 失效**。

根因是三条约束互相打架：

| # | 约束 | 位置 |
|---|---|---|
| a | `MAX_ITEMS = 5`，该页已满 5 条 ⇒ 拆不出第 6 条 | `SliderDrawer.tsx:25` |
| b | 提示词写死「本页必须且只能输出 N 行……即使其中列举了多个名称，也不要拆成多行」⇒ 不许拆 | `ViewItem4Ppt.ts:1262-1263` |
| c | 小项描述上限 70 字 | `PPT_ITEM_DESC_MAX` `ViewItem4Ppt.ts:385` |

⇒ 三条同时成立时模型只能违反其一，实测它选择违反字数。

附：172 字里近一半是公司全称堆砌（「截至华润信托股份有限公司、深圳市钜盛华股份有限公司通过……」），删掉全称即可压到 45 字左右，PPT 里本就该用简称。

### 46.1 生成后自动精简重试（P0）

现状：`shortenSlideItem(_index, item, dMax)` **已实现**（`KbOutlineGenPpt.tsx:769`），prompt 也写对了（「保留全部数字与出处，只删连接词与重复限定」），但**只挂在 SliderDrawer 的手动按钮上**（`SliderDrawer.tsx:267`，条件 `dOver && props.onShortenItem && !asColumn && !asMetric`）。

改法：
1. 在**生成内容写入前**（`KbOutlineGenPpt.tsx` / `AiOutlineGenPpt.tsx` 调 `theSlide.setViewItemsStructured(items)` 之前），先扫一遍 items：用 `pptItemLength(item.content)` 对比该条的 dMax（按 layout 取：metric → `PPT_METRIC_DESC_MAX`=16 / columns → 28 / 其余 → `PPT_ITEM_DESC_MAX`=70）。
2. 对**超长条目**调 `shortenSlideItem` 压缩后替换。**限流**：最多 3 条；单条失败静默保留原文，**不得因压缩失败而中断生成或抛错**。
3. 压完再走 `setViewItemsStructured`，仍失败才报橙叹号。

硬约束：
- **不得**改变条目数量、**不得**改 layout —— 这两项会撞模板容量，属 46.4 范围，本单不碰。
- 必须给用户可见反馈：有条目被压缩时 `message.info`（如「已自动精简 2 条超长描述」），否则用户不知道内容被动过。
- 复用现有 `shortenSlideItem`，**不要**新写一份压缩 prompt。

### 46.2 提示词治根（P0）

`buildPptItemFormatPrompt`（`ViewItem4Ppt.ts:1259-1271`）在 `countLine` 之后、格式示范之前追加两条：

- 「公司/机构/品牌一律用简称（如「华润信托」不必写「华润信托股份有限公司」），禁止为凑字数堆砌全称。」
- 「一条描述若含 3 个以上数字，必须砍掉铺垫，只留「主体 + 动作 + 数字」；超过 70 字即视为失败。」

⚠️ `countLine` 里那句「即使其中列举了多个名称，也不要拆成多行」**本次先不动**。去掉它会引发条数与模板容量不匹配（见 46.4），属另一个风险面。

### 46.3 table 版式改为「标题 + 内容模式」双源判定（P0）

现状只有标题词，`coerceLayoutBySlideTitle`（`outlineJson.ts:167`）：
```ts
const tableCue = /价格带|对照表|矩阵表|排行表|分档表|表格/.test(t);
```
标题不含这些词就永不抬 table，而「宝能系统持股路径」这类数据并列页恰好吃亏。

改法：在 `outlineJson.ts` 新增 `tipsSuggestTableLayout(tips: string[] | undefined): boolean`，与 `tipsSuggestMetricLayout`（`:112`）并列。**阈值必须保守，防误伤 metric 页**：

```
1. list.length >= 3                     // 表格至少 3 行
2. 每条 tips 都含至少一个数字 /\d/        // 每行都有数值，才是「记录行」
3. 非数字字符占比 >= 40%                 // 是「标签+数值」，不是纯数字短语（防 metric 误伤）
4. tips 平均长度 <= 24 字                // 短条目，非叙事句
```

然后把 `tableCue` 改成 `原标题正则 || tipsSuggestTableLayout(tips)`。**保持 table 判定在 metric 判定之前**（`:167-171` 现有顺序不变）——table 单格上限 120 字，比 metric 的 16 字宽松得多，命中时优先用宽松的。

⚠️ 第 3 条是防误伤的关键：metric 页的 tips 多为「586亿」「42.3%」这类**纯数字短语**，非数字字符占比极低，因此不会被误抬成 table。**这条必须写 jest 反验**（见 46.7 第 1 条）。

### 46.4 拆行权限 —— 本单不做，先记债

放开「一条要点只对应 1 行」需要同步放宽 `MAX_ITEMS`（现 5）与 list 模板容量。**必须先验模板能吃几条**（打开对应版式的占位符个数实测）才能改，不能凭感觉放宽。本单不动，等实测结论再开单。

### 46.5 生成后「建议切表格」提示（P1，时间紧可延后）

`validateSlideViewItems` 在 list / progress 分支报错时追加条件提示：
```
超长条目数 >= 2
且其中至少 2 条 pptItemLength > 100
且 countNumericUnitGroups(该条描述) >= 2
⇒ 错误文案末尾追加：「本页多条描述超长且含多组数字，建议在幻灯片设置中切换为「表格」版式。」
```
**只提示、不自动切换** —— 自动切换需要把描述重组成管道行（`title` 字段承载 `品类|价带|销量` 结构），属新行为，风险另议。

### 46.6 执行序

1. 46.1 自动精简重试（**Kb / Ai 两页都要接**，只接一页会漏）
2. 46.2 提示词两条
3. 46.3 table 双源判定 + `tipsSuggestTableLayout`
4. 46.5 建议切表提示（可延后）
5. jest

### 46.7 验收（我会逐条判，回执只写「已完成」不给过）

jest 并入既有 `outlineStructureAssert` 套件（**不新建文件**），新增 4 条：

1. **反验（最重要）**：tips 为纯数字短语（如 `['586亿','42.3%','1.2万']`）⇒ `tipsSuggestTableLayout` 必须返回 **false**；且 `coerceLayoutBySlideTitle` 仍判 metric，**不能被抬成 table**
2. tips 为「标签+数值」且 ≥3 条（如 `['欧莱雅 586亿','雅诗兰黛 42.3%','宝洁 1.2万']`）⇒ 判 **table**
3. 含 `[文档13]` 的 172 字描述，经 `shortenSlideItem` 压缩后 `pptItemLength <= 70`，且返回值不含 `[文档`
4. `buildPptItemFormatPrompt()` 输出含「简称」与「3 个以上数字」两条子串断言

UI 验收（须用户操作，代码侧不用等）：
- 重生成「宝能系统持股路径」页，看第 5 点是否自动压到 70 内且数字保留
- 若仍超长，看是否出现「建议切换为表格」提示

### 46.8 下一单

本单完成后做 **RBAC 方案 C（真·多角色）**：

1. **第一条必须先回滚 43.10 方案 A 的副作用** —— 删除当时授给 `user` 角色的「知识库管理」菜单授权（`role_res`），改授新的 `kb_manager` 角色。否则 C 落地后权限按角色并集算，**所有 user 都会带上知识库管理**，把 A 的粗粒度固化下来。
2. 再建 `user_roles` 关联表、`_actor` 返回角色集合、前端菜单按并集渲染、用户管理界面支持勾选多角色。

⚠️ 后续任何人（我或用户）再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。


## 四十七、PPT 写作大纲栏：展示简单层提示词 + 编辑态分层（对齐文档侧 38.5 / 39.1）（2026-10-22 05:15）

### 47.0 需求与现状

用户要求：PPT 生成的「写作大纲」栏要参照文章（Doc）生成的做法 —— **展示面只给简单提示词，不展示整串模板；编辑态也要分层**。

现状（已核实）：

| 位置 | 现状 |
|---|---|
| `OutlinePromptPpt.tsx:89-91` | 直接渲染 `{slide.prompt}` 整串（含【页面内容】【页面其他功能块】等契约） |
| `EditablePromptCollapse4Ppt.tsx:66-76` | `contentShower` = `<pre>{slide.prompt}</pre>` 整串 |
| `EditablePromptCollapse4Ppt.tsx:79-84` | `contentEditor` = 单个 `Input.TextArea` 编辑整串 prompt |
| `KbOutlineGenPpt.tsx:775` / `AiOutlineGenPpt.tsx` 同构 | `cbSavePromptResult(key, newPrompt: string)` 只能保存整串 |

**Ai 页也要改**（`AiOutlineGenPpt.tsx:832` 同样有「写作大纲」栏），只改 Kb 会漏一半。

### 47.1 ⚠️ PPT 侧与文档侧的字段差异（别照抄文档侧）

`Slide`（`ViewItem4Ppt.ts:1594-1607`）字段只有：`index / title / subTitle / layout / key / label / prompt / content / genError / viewItems`。

**没有**文档侧的 `role / question / pointGuide / allowTable / allowFigure / promptManual`。所以 `simplePptSlidePrompt` 不能照抄 `simpleDocParagraphPrompt`（`ViewItem4Doc.ts:444`）的「岗位视角 / 本章要回答的问题」那两块。

PPT 侧的语义来源是：
- **要点真源 = `slide.subTitle`**（`role: text` 多行），用 `parseSlideTips`（`ViewItem4Ppt.ts:507`）解析
- 版式 = `slide.layout`，中文名可直接复用 `layoutLabel`（`outlineSerialize.ts`）
- 条数口径 = `countOutlineTips(slide.subTitle)`；metric_list 拆分用 `splitMetricListTips`（`:526`）

### 47.2 新增 `simplePptSlidePrompt`（P0）

在 `ViewItem4Ppt.ts` 新增（**不要**放进 `ViewItem4Doc.ts`）：

```ts
export function simplePptSlidePrompt(slide: Slide): string
```

输出形态（多行，展示面用 `whiteSpace: "pre-wrap"`）：
```
【{slide.title}】版式：{layoutLabel(slide.layout)}
本页要点：1) [数据卡] xxx；2) [要点] xxx
```
规则：
- `subTitle` 解析不出要点时退化成一行提示「（本页未解析到要点，完整提示词见编辑态）」，**不得**回退去展示整串 prompt
- role 显示：`metric` → `[数据卡]`，`list` → `[要点]`（与 `ViewItem4Ppt.ts:2210` 现有口径一致）
- 输出里**不得**出现契约词（「请优先采信」「禁止」「【输出格式】」「【本页标题】」等）——这条要写 jest 断言

### 47.3 展示层改造（P0）

`OutlinePromptPpt.tsx:89-91` 的 `children` 从 `{slide.prompt}` 改为「chips + 简单层」，照抄 `OutlinePromptDoc.tsx:94-118` 的结构：

- **chips（数字口径）**：版式 `layoutLabel(slide.layout)`；要点 `countOutlineTips` 条；`metric_list` 时拆成「数据卡 M / 要点 K」；条数上限（list ≤5 / metric 2～9 / metric_list 8 / columns 20）
- **正文（语义）**：`simplePptSlidePrompt(slide)`

### 47.4 编辑态分层（P0）

`EditablePromptCollapse4Ppt.tsx` 照抄 `EditablePromptCollapse4Doc.tsx:257-290` 的双层模式：

- **上层「简单层」**：
  - 版式 `Select`（选项取 `LAYOUTS`，显示 `layoutLabel`）
  - 要点行列表：每行 = role 切换（`metric`/`list`）+ Input + 删除按钮；底部「添加要点行」
- **下层「高级」**：整串 `slide.prompt` 的 `TextArea`，**默认折叠**，标注「改这里会覆盖简单层」

判定：仿 `paragraphHasStructuredPrompt`，加 `slideHasStructuredPrompt(slide)` = `parseSlideTips(slide.subTitle).length > 0`。为 false（存量无结构化要点）时**保留现有单个 TextArea 整串编辑**，不要强行分层。

### 47.5 保存链路扩 patch（P0）

现状 `cbSaveResultFn:(key:string,newPrompt:string)=>void` 只收整串。改为仿文档侧 `DocPromptSavePatch`：

```ts
export type PptPromptSavePatch = { subTitle?: string; layout?: SlideLayout; prompt?: string };
```

- `EditablePromptCollapse4Ppt` 的 `cbSaveResultFn` 签名改为 `(key: string, patch: PptPromptSavePatch | string)`
- `OutlinePromptPpt.tsx:72-75` 的 `onSaveResultFn` 同步改签名
- `KbOutlineGenPpt.tsx:775` / `AiOutlineGenPpt.tsx` 的 `cbSavePromptResult` 同步支持 patch

### 47.6 🔴 一致性硬约束（这条最容易做错）

生成时发送的是（`KbOutlineGenPpt.tsx:561`、`AiOutlineGenPpt.tsx:509`）：
```
slide.prompt + KB_WRITING_CONSTRAINT_PROMPT + buildPptItemFormatPrompt(countOutlineTips(slide.subTitle), slide.layout, ...)
```

⇒ **`slide.prompt` 和 `slide.subTitle` 是两条独立数据**，要点在两边各存一份。

因此：简单层改了要点行 / 版式后，**必须同时更新 `slide.subTitle` 与 `slide.prompt` 里的要点段**，否则会出现「`buildPptItemFormatPrompt` 按新条数约束、而 prompt 里还是旧要点」的打架，模型必然输出条数不符。

要点段同步做法：用正则定位 `slide.prompt` 里 `【页面其他功能块】` / `【大纲要点】` 之后的要点行整体替换；**找不到标记时追加一段**，不要静默丢弃。

### 47.7 执行序

1. **先确认四十六是否已提交**（回执 05:08 已完成但 `git log` 仍停在 `61764c4`，改动可能还在工作区）。未提交就先提交四十六，别让两个单的改动混在工作区。
2. 47.2 `simplePptSlidePrompt`
3. 47.3 展示层（Kb + Ai 两页都走同一个 `OutlinePromptPpt`，改一处即可，但要确认 Ai 页也用了它）
4. 47.4 编辑态分层
5. 47.5 保存 patch
6. jest

### 47.8 验收（我会逐条判）

jest 并入既有 `outlineStructureAssert` 套件（不新建文件），新增 4 条：

1. `simplePptSlidePrompt` 对含 `subTitle` 的 slide：输出含页标题、含 `layoutLabel`、含编号要点；**不含**「请优先采信」「禁止」「【输出格式】」「【本页标题】」任一契约词
2. `subTitle` 为空 ⇒ 返回退化文案，**不抛错、不回退成整串 prompt**
3. **一致性**：改一条要点行后，`countOutlineTips(slide.subTitle)` 与 prompt 要点段行数**必须相等**（这条是 47.6 的回归闸）
4. `slideHasStructuredPrompt` 为 false 时编辑态走整串 TextArea 分支（渲染不报错）

UI 验收（须用户操作）：
- PPT 生成页写作大纲栏不再显示整串契约，只显示 chips + 简单层
- 点编辑：上半是版式 + 要点行，下半折叠的高级整串
- 改一条要点后重新生成，确认条数与版式约束跟着变

### 47.9 下一单

本单完成后做 **RBAC 方案 C（真·多角色）**：

1. **第一条必须先回滚 43.10 方案 A 的副作用** —— 删除当时授给 `user` 角色的「知识库管理」菜单授权（`role_res`），改授新的 `kb_manager` 角色。否则 C 落地后权限按角色并集算，**所有 user 都会带上知识库管理**。
2. 再建 `user_roles` 关联表、`_actor` 返回角色集合、前端菜单按并集渲染、用户管理界面支持勾选多角色。

⚠️ 后续任何人（我或用户）再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。


## 四十八、四十七验收判卷：两处收口（版式名两份真相 / 高级区手改被静默覆盖）（2026-10-22 05:30）

### 48.0 判卷结论：四十七**通过**

实测证据（不是复述回执）：

| 项 | 证据 |
|---|---|
| 简单层不含契约 | `simplePptSlidePrompt`（`ViewItem4Ppt.ts:1108`）输出只有「【标题】版式：X」+「本页要点：1) [要点] …」，无「请优先采信/禁止/【输出格式】」 |
| 47.6 一致性 | `syncOutlineTipsIntoPrompt`（`:1136`）覆盖了三种形态：【大纲要点】/【页面其他功能块】/追加到【写作任务】前，并有 `countPromptOutlineTipLines`（`:1165`）专供一致性断言 |
| 展示层 | `OutlinePromptPpt.tsx:80-92` chips + 简单层，结构与文档侧 `OutlinePromptDoc.tsx:94-118` 一致 |
| 编辑层分层 | `EditablePromptCollapse4Ppt.tsx:216` 简单层 Tag / `:236` 版式 Select / `:253` role Select / `:276` 添加要点行 / `:289` 高级折叠 |
| Ai 页也接了 | `AiOutlineGenPpt.tsx:711` 与 `KbOutlineGenPpt.tsx:775` 都改成 `applyPptPromptSavePatch(slide, patch)` |
| jest | **我自己跑的：20 过**（exit=0），含四十七 4 条 |

顺带澄清我上一轮的担心不成立：42.4 用例虽改成 2 条 tips，但仍是 **3 组数字**，且新增了 `expect(tipsSuggestTableLayout(tips)).toBe(false)` 反断言 ⇒ 覆盖没被削弱，反而更严。

### 48.1 版式中文名两份真相（P1）

- `pptLayoutLabelZh`（`ViewItem4Ppt.ts:1075`）与 `layoutLabel`（`outlineSerialize.ts:177`）功能重复
- 差异：前者有 `progress → '进度'`，后者**没有** progress 分支（落到 default 返回「列表」）

后果：同一张 progress 页 —— 写作大纲展示层（走 `pptLayoutLabelZh`）显示「进度」，编辑态 label（`EditablePromptCollapse4Ppt.tsx:130` 走 `layoutLabel`）显示「列表」，**同一页两个名字**。以后加版式要改两处。

修法：
1. `layoutLabel` 补上 `progress → '进度'`（顺带核对 8 种 layout 无遗漏）
2. `pptLayoutLabelZh` 改为 `return layoutLabel(layout)`，保留导出名以免动调用点

### 48.2 🔴 高级区手改要点段会被简单层**静默覆盖**（P0）

链路：
1. `EditablePromptCollapse4Ppt.tsx:105-108` 的 `onSave` **总是**构造 `{subTitle, layout, prompt}` 三字段 patch，`subTitle` 来自 `formatSlideTips(draft.tips)`
2. `applyPptPromptSavePatch`（`ViewItem4Ppt.ts:1189`）：`tips !== undefined` 且 `patch.prompt !== undefined` ⇒ 执行 `syncOutlineTipsIntoPrompt(draft.prompt, draft.tips)`
3. `draft.tips` 初始化自 `slide.subTitle`（`:78`）。**用户在高级 TextArea 里改了要点段、但没动简单层 ⇒ 保存时 prompt 要点段被旧 tips 覆盖，且没有任何提示**

你自己的回执「风险点」里写到了这条（「高级区手改要点段保存时会被简单层 tips 覆盖」），但没修。**用户手改的内容丢了且不知情，这是会挨骂的那种 bug。**

修法：
- **主修**：`onSave` 只在 tips 真正被编辑时才带 `subTitle`。加 `tipsDirty` 标记（初始化 false；`removeTip`/`addTip`/role 变更/要点文本 onChange 时置 true）。未 dirty 时 patch 只带 `{layout?, prompt}` ⇒ 走 `applyPptPromptSavePatch` 的 else 分支，不会 sync。
- **兜底**：若 `draft.prompt !== slide.prompt`（高级区确实被改过），优先保留 prompt、不做 sync，并 `message.info`「高级提示词已改动，要点段以高级区为准」。

### 48.3 jest（并入 `outlineStructureAssert`，不新建文件）

1. **回归闸（最重要）**：只改高级 prompt 的要点段、不动简单层 ⇒ 保存后 `slide.prompt` **保留手改内容**（当前会被覆盖，这条现在应该失败）
2. 只改简单层要点 ⇒ 保存后 prompt 要点段同步（强化既有一致性用例）
3. `pptLayoutLabelZh` 与 `layoutLabel` 对全部 8 种 layout 返回值**全等**

### 48.4 UI 验收（须用户操作，代码侧不用等）

- 打开 PPT 生成页「写作大纲」栏：只显示 chips + 简单层，不再有整串契约
- 点编辑：上半版式 + 要点行，下半折叠的「高级」
- 改一条要点后重新生成该页，确认条数/版式约束跟着变
- **验收 48.2**：在高级区改一句要点文字 → 保存 → 重新打开，确认改动还在（当前版本会丢）

### 48.5 验收判卷补充（2026-10-22 05:35，我已验）

**四十八通过**。实测证据：

- `layoutLabel`（`outlineSerialize.ts:177`）已补 `progress → "进度"`；`pptLayoutLabelZh`（`ViewItem4Ppt.ts:1075`）改为 `return layoutLabel(layout)`
- `tipsDirty`（`EditablePromptCollapse4Ppt.tsx:68`）+ `buildDualLayerPptSavePatch`（`ViewItem4Ppt.ts:1192`）纯函数，返回 `{patch, infoMsg}`；`applyPptPromptSavePatch:1241` 用 `syncTipsIntoPrompt !== false` 消费
- **jest 我实跑：23 过**（exit=0），含四十八 3 条
- 回归闸用例（`:380`）写得扎实：构造含【本页标题】【大纲要点】【写作任务】的真实 prompt → 模拟高级手改 → 三重断言（`subTitle` undefined / `syncTipsIntoPrompt` false / prompt 保留手改且不含旧要点）

⚠️ **本单改动尚未提交**（HEAD 仍是 `f4f27d1`，工作区 11 个文件）。**开工下一单前必须先提交本单**，别让两个单的改动混在工作区。

两条记债（本单不修）：
1. **简单层与高级区同时改** ⇒ 以高级 prompt 为准但仍写 `subTitle`，导致条数真源更新而 prompt 要点段未同步（47.6 一致性的一个例外）。现有 `message.info` 已提示，但可在两者都 dirty 时把提示加强为「条数已更新但要点段未同步，请确认一致」。
2. **值级循环依赖已确认存在**：`outlineSerialize.ts:1-12` import `ViewItem4Ppt` 的运行时函数，`ViewItem4Ppt.ts:6` 反向 import `layoutLabel`。因只在函数体内调用（非模块顶层）且 jest 通过，当前可接受；若将来 `layoutLabel` 被移到模块顶层调用链上，需把它抽到无依赖的小模块。

### 48.6 下一单

1. **先提交四十八**（见上）
2. 再做 **RBAC 方案 C（真·多角色）**：
   - **第一条必须先回滚 43.10 方案 A 的副作用** —— 删除当时授给 `user` 角色的「知识库管理」菜单授权（`role_res`），改授新的 `kb_manager` 角色。否则 C 落地后权限按角色并集算，**所有 user 都会带上知识库管理**。
   - 再建 `user_roles` 关联表、`_actor` 返回角色集合、前端菜单按并集渲染、用户管理界面支持勾选多角色。

⚠️ 后续任何人（我或用户）再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。


## 四十九、后端接口鉴权全面加固（P0：全站除 feedback 外零鉴权）

> 写章时间 2026-10-22 07:10。本单是我（WorkBuddy）验收 RBAC-C 时**实测发现**的安全问题，
> 不是用户提的需求。优先级高于一切功能单。

### 49.0 为什么必须现在做（以下全部是实测，不是推测）

**证据 1 —— 无 token 直接拖走全部用户 PII：**

```
$ curl -s http://127.0.0.1:7861/mock_api/users
{"code":200,...,"data":[{"username":"admin","email":"<邮箱>","phone":null,
 "dept":"AI技术部","address":null,...}, ...]}
```

注意：这个请求**没有带任何身份**，返回 200。

**证据 2 —— 鉴权覆盖率普查（`grep -c "require_user|current_user|_actor"`）：**

| router | 前缀 | 路由数 | 鉴权处 |
|---|---|---|---|
| `mock_api.py` | `/mock_api` | 38 | 4（仅 CurrentUser×2 + 审计 logs×2） |
| `knowledge_base.py` | `/knowledge_base` | 26 | **0** |
| `chat.py` | `/chat` | 12 | **0** |
| `kb_chat.py` | — | 1 | **0** |
| `feedback.py` | `/api/feedback` | 11 | 9 ✅ |

**77 个路由里只有 feedback 那 11 个是守住的。** 四十三章做的「真 token 校验」我当时只针对
`feedback.py` 的 `_actor` 写，没有做全站普查 —— 这是我的疏漏，等于堵了前门、后门大开。

**证据 3 —— 这些接口现在全是裸的：**

| 接口 | 后果 |
|---|---|
| `POST /knowledge_base/delete_knowledge_base` | 匿名删库 |
| `POST /knowledge_base/delete_docs` | 匿名删文档 |
| `POST /mock_api/user/add` | 匿名建号，且 `roles` 由请求体决定 ⇒ **直接建 admin** |
| `POST /mock_api/user/update` | 匿名改任意用户角色 ⇒ **提权** |
| `GET /mock_api/user/delete` | 匿名删号 |
| `PUT /mock_api/user/password` | 匿名改任意用户密码 |
| `POST /mock_api/role/add_role_menus`<br>`POST /mock_api/role/add_role_kbs` | **匿名给自己角色授权任意菜单/知识库** ⇒ 四十八刚建好的 RBAC-C 形同虚设 |
| `/menu/*`、`/org/*` | 匿名改菜单与组织 |

### 49.1 前置：先把未提交的改动落定

HEAD 仍是 `c5c15a4`（四十八）。工作区有 **23 个文件**未提交，混着两单：

1. RBAC 方案 C（`rbac.py`、`db.py`、`auth.py`、`access.ts`、`UserForm.tsx` …）
2. 06:56 那单「普通用户可看自己的反馈」（`routes.ts`、`FeedbackAdmin.tsx`、`FeedbackBadge.tsx`、`menu.ts`）

**按 48.5 定的规则，开工本单前必须先拆成两个 commit 提交**，否则本单再叠上去就回滚不到
「RBAC-C 完成」这个已知好状态。

> 顺带确认：RBAC-C 本身我验过了，**做得对**——数据库实测
> `lizy -> kb_manager` + `lizy -> user`（并集，未污染全体 user）；
> `role_res` 里 kb 授权只剩 `admin` 和 `kb_manager`，**43.10A 给 user 的授权已删干净**；
> 反馈页只读门控也正确（`FeedbackAdmin.tsx:48` `isAdmin` 控写操作、非 admin 默认 `mine=1`）。

### 49.2 方案：中间件全局守卫 + 分级依赖 + 两阶段开关

**不要逐路由加鉴权** —— 77 个路由逐个改既慢又必漏。用中间件一网打尽。

**49.2.1 新增 `backend/app/security/guard.py`**

- `AuthGuardMiddleware`：除白名单外全部要求有效 token，无/失效 → `401`
  （JSON 体，别返回 HTML，前端 `requestErrorConfig` 才好处理）。
- 复用 `app/security/auth.py` 已有的 `current_user()` / token 校验逻辑，**不要另写一套判定**。
- 两个开关（走 `Settings`，见下）：
  - `AUTH_GUARD_MODE`：`off` / `log` / `enforce`，默认 `enforce`
  - `log` 模式下**只写 `user_logs` 不拦截**，用来观察一轮有没有误伤
- ⚠️ 配置项必须**在 `Settings` 里声明字段**，不能 `os.getenv`（这是 43.1 修过的坑：
  `extra="ignore"` 会静默丢弃未声明的键）。

**49.2.2 白名单（放行，不鉴权）**

| 路径 | 理由 |
|---|---|
| `OPTIONS *` | CORS 预检，浏览器自动发且**不带 header** |
| `/`、`/health` | 健康检查（`main.py:61/71`） |
| `POST /mock_api/login/account` | 登录本身 |
| `POST /mock_api/login/outLogin` | 退出（无 token 也要能退，否则登不出去） |
| `/static`、`/assets`、`/docs`、`/openapi.json` | 静态/文档 |

**49.2.3 分级依赖（中间件只管「已登录」，敏感的另加角色闸）**

在 `guard.py` 里导出三个 FastAPI 依赖：

- `require_api_user` —— 已登录（中间件已保证，显式声明用）
- `require_api_admin` —— `is_admin(actor)`，否则 `403`
- `require_api_kb` —— `admin` 或 `kb_manager`，否则 `403`

### 49.3 ⚠️ 最大风险：流式接口可能不带 token

前端 `requestErrorConfig.ts:90-96` 是 umi-request 的**全局** requestInterceptors，
统一塞 `config.headers.token`，所以绝大多数请求是安全的。

但**流式接口要单独验**：`chat.py` / `kb_chat.py` 的 SSE 如果是 `EventSource` 或裸 `fetch` 直连，
**不会经过这个拦截器**，一上 enforce 就会全部 401，生成功能直接瘫痪。

处理顺序：
1. 先全局 grep `EventSource` / `fetch(` 直连后端的点；
2. 能改成走 `request`（带 token）就改；
3. 改不动的（SSE 协议限制）⇒ 后端对该路径**改用 query 参数 `?token=` 校验**，
   **不要**直接塞白名单放行 —— 白名单等于不鉴权，生成接口是有成本的资源。

### 49.4 角色闸映射表（照此加 `Depends`）

`mock_api`（前缀 `/mock_api`）下：

| 接口 | 依赖 |
|---|---|
| `/users`、`/user/add`、`/user/update`、`/user/delete` | `require_api_admin` |
| `/user/password` | **特例**：`body.username` 等于自己 ⇒ 放行；否则 `require_api_admin`。<br>⚠️ 个人中心改自己密码走这条，一刀切 admin 会直接打断，必须按此判 |
| `/user/logs`、`/login/logs` | `require_api_admin`（已有 `is_admin` 分支，**保留不动**，别重复加） |
| `/menus`、`/tree_menus`、`/menu/add`、`/menu/update`、`/menu/delete` | `require_api_admin` |
| `/roles`、`/role/add`、`/role/update`、`/role/delete`、`/role_menus`、`/role/add_role_menus`、`/role_kbs`、`/role/add_role_kbs` | `require_api_admin` |
| `/orgs` 及 `/org/*` 全部 | `require_api_admin` |
| `/cur_user_role_menus`、`/user-log`、`/CurrentUser`、`/currentUser` | `require_api_user`（中间件已覆盖，可不显式加） |

`knowledge_base`（前缀 `/knowledge_base`）下：

| 接口 | 依赖 |
|---|---|
| `/delete_knowledge_base`、`/delete_docs` | `require_api_kb`（admin 或 kb_manager） |
| 其余 | `require_api_user`（中间件已覆盖） |

> 知识库是核心资产，删除不能只对「已登录」开放 —— 否则 lizy 之外的任意 user 都能删。

### 49.5 验收（必须 curl 实测并把输出贴进 handoff，不接受「已完成」三个字）

前置：重启后端（中间件 + 补丁要生效）。

| # | 用例 | 期望 |
|---|---|---|
| 1 | 无 token `GET /mock_api/users` | **401**（修复前是 200，这是回归闸） |
| 2 | 无 token `POST /knowledge_base/delete_docs`（空 body） | **401**，且**不得进入业务逻辑**（看日志无 SQL） |
| 3 | lizy token `GET /mock_api/users` | **403**（lizy = user + kb_manager，非 admin） |
| 4 | hezl token `GET /mock_api/users` | 200 |
| 5 | lizy token `POST /knowledge_base/delete_docs` | 200（kb_manager 有权限） |
| 6 | 普通 user token 同上 | 403 |
| 7 | 无 token `POST /mock_api/login/account` | 仍 200（白名单，别把登录自己锁死） |
| 8 | 无 token `GET /health` | 200 |
| 9 | 无 token `GET /mock_api/roles` | 401 |
| 10 | 前端冒烟：登录 → 知识库列表 → 生成一页 → 提交反馈 → 审计页 | 全通，无 401 |

第 3、5、6 条是角色闸的关键验证：**必须证明 kb_manager 能管知识库、但不能管用户**。

pytest：新增 `backend/tests/test_auth_guard.py`，至少覆盖 1/2/3/7/8。

### 49.6 顺带：仓库卫生（`frontend/public/` 有 Windows 附件标记垃圾）

```
 D "frontend/public/pptTemplate-simple - 副本 (2).pptx:Zone.Identifier"
 D "frontend/public/pptTemplate-simple - 副本.pptx:Zone.Identifier"
?? "frontend/public/pptTemplate-simple - 副本 (2).pptxZone.Identifier"   ← 文件名编码已错乱
?? "frontend/public/pptTemplate-simple - 副本.pptxZone.Identifier"
```

`:Zone.Identifier` 是 Windows 从邮件/IM 下载文件时自动生成的安全标记（NTFS 备用数据流），
**无任何用途**，且 UNC 下读出来文件名里的冒号丢了、变成两份不同命名的未跟踪文件。

处理：
1. `.gitignore` 加 `*:Zone.Identifier` 和 `**/*Zone.Identifier*`；
2. `git rm --cached` 掉已入库的那两个；
3. ⚠️ **不要**删 `pptTemplate-simple - 副本.pptx`、`副本 (2).pptx`、`副本20260925.pptx`
   这几个本体 —— 是不是测试残留要问用户，AI 不擅自删用户的文件。

### 49.7 客户端 IP 采集链路（2026-10-22 07:05 用户实测报告，与本单同源，一并做）

**现象**：登录日志 IP 全是 `127.0.0.1`，手机访问也是。

**结论：不是取值逻辑写错，是链路上没人传真实 IP；而且一旦传了就必然被伪造。**

**49.7.1 证据链（我已实测）**

| 环节 | 实测 |
|---|---|
| 取值代码 | `auth.py:40-49` `_client_ip()` 顺序对：`X-Forwarded-For` → `X-Real-IP` → `request.client.host` ✅ |
| 调用点 | `mock_api.py:59/85/103/131` 都走 `client_meta(request)` ✅ |
| 前端 baseURL | `utils/bfBaseUrl.ts:12-14` 默认返回 `window.location.origin` ⇒ 手机访问 `http://<PC内网IP>:8000`，请求打到 **8000 同源**，由 umi dev proxy 转发 |
| 前端 proxy | `config/proxy.ts` 的 dev 段有 `'/mock_api/'` → `127.0.0.1:7861`，但**全域 `xfwd` 零命中** ⇒ http-proxy-middleware **不会**加 `X-Forwarded-For` |
| 后端启动 | `start.sh:22` `uvicorn --host 0.0.0.0 --port 7861 --reload`，**无 `--proxy-headers`** |
| 结果 | 后端 TCP 对端恒为 `127.0.0.1`（dev server 在本机发起）⇒ 落回 `request.client.host` |

**49.7.2 更严重的问题：`_client_ip` 无条件信任 header ⇒ 审计日志可被任意伪造**

我为了取证，直接打后端并自带一个**不存在**的 IP：

```
$ curl -X POST http://127.0.0.1:7861/mock_api/login/account \
    -H "X-Forwarded-For: 203.0.113.7" -d '{"username":"__probe_ip__","password":"x"}'

$ login_logs 最新一条：
  __probe_ip__ | login_fail | ip= 203.0.113.7 | 2026-10-22T07:06:34
```

⇒ **代码采信了客户端自报的 IP。** 任何人加一个 header 就能把登录记录写成任意 IP。
所以「全是 127.0.0.1」和「可以随便写」是同一个洞的两面 —— 只补前者会得到一份**看起来很真但可伪造**的审计日志。

**49.7.3 修法（三步，缺一不可）**

**① 前端 proxy：覆盖写 `X-Real-IP`，不要用 `xfwd`**

`xfwd: true` 是**追加**语义：客户端自带的伪造 IP 会留在最左，而 `_client_ip` 取 `split(",")[0]` ⇒ 仍然取到伪造值。必须用 `onProxyReq` **覆盖**：

```ts
// config/proxy.ts，'/mock_api/'、'/api/'、'/chat/'、'/knowledge_base/' 四处都要加
onProxyReq: (proxyReq: any, req: any) => {
  const raw = String(req.socket?.remoteAddress || "");
  const ip = raw.replace(/^::ffff:/, "");        // ::ffff:192.168.1.7 → 192.168.1.7
  proxyReq.setHeader("x-real-ip", ip);           // 覆盖，不是追加
  proxyReq.setHeader("x-forwarded-for", ip);
},
```

> umi 透传 http-proxy-middleware，v2 用 `onProxyReq`、v3 用 `on: { proxyReq }`。
> **先确认当前版本**，写错位置会静默不生效（配置对象里多一个没人读的键，不报错）。

**② 后端：只在直连对端可信时才采信 header**

```python
# auth.py:_client_ip
TRUSTED_PROXIES = {"127.0.0.1", "::1"}   # 可加配置项；默认只信回环

peer = (request.client.host if request.client else "") or ""
if peer not in TRUSTED_PROXIES:
    return peer                  # 外部直连：一律忽略它自带的任何 header
real = (request.headers.get("x-real-ip") or "").strip()
if real:
    return real                  # 覆盖语义最可靠，优先
xff = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
if xff:
    return xff[-1]               # 追加语义下真实值在最右；绝不用 xff[0]
return peer
```

⚠️ **`TRUSTED_PROXIES` 别写成整个内网段**（`192.168/16`）。同局域网任何机器都能直连 7861，
写宽了等于没防。默认只信回环就够：手机 ⇒ dev server 本机转发 ⇒ peer 是 `127.0.0.1`；
生产 nginx 同理。跨机部署时再单独加配置。

⚠️ **不要改成 `uvicorn --proxy-headers`**：uvicorn 自己也会取 XFF 最左，等于把 ② 的校验绕过去了。

**③ 测试污染：`testclient` 已经混进生产库**

```
distinct client_ip：'127.0.0.1' -> 12, 'testclient' -> 4, '203.0.113.7' -> 1（我这次的取证）
```

`testclient` 是 pytest `TestClient` 的默认 host，说明 **pytest 直接写进了 `backend/data/bifang.db`**。
处理：
- pytest 用独立库（`BIFANG_DB` 指向 `tmp_path`，或 conftest 里 monkeypatch `get_conn`）；
- 存量 4 条 `testclient` 行 + 我那 1 条 `__probe_ip__`/`203.0.113.7`：**删掉**（它们不是真实事件，
  留着会污染后续「异常登录」排查）。

**49.7.4 生产环境（nginx）**

```nginx
proxy_set_header X-Real-IP        $remote_addr;
proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
```

**49.7.5 验收**

| # | 用例 | 期望 |
|---|---|---|
| 1 | 后端直连，自带 `X-Forwarded-For: 203.0.113.7` 打登录 | 日志记的是 **`127.0.0.1`**（伪造被忽略）—— 这条是回归闸，现在是 `203.0.113.7` |
| 2 | 经前端 proxy 访问登录 | 日志记的是**真实对端 IP**（本机浏览器 `127.0.0.1`，**手机访问必须是 `192.168.x.x` 之类内网地址**） |
| 3 | 手机访问一次 | 日志出现手机内网 IP，且不是 127.0.0.1 |
| 4 | pytest 跑完 | `login_logs` / `user_logs` **不新增任何 `testclient` 行** |
| 5 | 存量脏数据 | `testclient` 4 条、`__probe_ip__` 1 条已删 |

第 3 条**必须用真实手机验**，这条我做不了。

### 49.8 【已发生·最高优先】守卫上线后前端 7 处 axios 直连未带 token，PPT 生成全挂

> 2026-10-22 07:25 用户实测截图：Kb 页 PPT 内容生成 `slide1`–`slide10` **全部失败**，
> 提示「Key为slideN的幻灯片文本生成请求失败了」。这不是新 bug，是 49.2 的直接副作用。

**49.8.1 实测证据**

```
$ curl -X POST http://127.0.0.1:7861/knowledge_base/local_kb/%E4%B8%87%E7%A7%91/chat/completions
{"code":401,"msg":"请先登录","data":{"isLogin":false},...}
[code=401]
```

而 PPT 页发这个请求用的是：

```ts
// KbOutlineGenPpt.tsx:526
const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
// :561 / :571
axios.post(url, buildMsg(...), { headers });
```

**用 axios 直接 `import axios from "axios"`，绕过了 `requestErrorConfig.ts:90-96` 的 umi-request 全局拦截器
⇒ 不带 token ⇒ guard 默认 `enforce` 直接 401。**

我在 49.3 写过「先全局 grep 直连后端的点」，中间件做了、这步漏了。**这是本单必须补的收尾项。**

**49.8.2 全量清单（我已扫完，共 7 处，全部缺 token）**

| 文件 | 行 | 用途 | 影响 |
|---|---|---|---|
| `pages/KbOutlineGenPpt.tsx` | 561 / 571 | Kb 页 PPT 每页内容生成（**就是截图这个**） | 全部失败 |
| `pages/AiOutlineGenPpt.tsx` | 509 / 519 | Ai 页 PPT 每页内容生成 | 全部失败 |
| `pages/KbOutlineGenDoc.tsx` | 566 | Kb 页 Word 段落生成（每段一次、全并行） | **全部失败**（用户还没试 Word） |
| `pages/AiOutlineGenDoc.tsx` | 340 | Ai 页 Word 段落生成 | 全部失败 |
| `components/DocUtil/pptItemShorten.ts` | 85 | 42.3/46.1 的「AI 精简」「自动精简」 | 静默失效（catch 返回 null） |

已确认**正确带 token、不用改**的：`ChatWithSpeech4Ppt.tsx:596`、`KbListCompSnl.tsx:26`、`KbListCompMpl.tsx:20`。
`ProductLabelNew.tsx:325` 打的是 `192.168.0.195:19912` 商品标签服务，不经毕方后端，**不受影响、不要动**。

**49.8.3 立即止血（让业务先能用）**

`backend/.env` 加一行并重启后端：

```
AUTH_GUARD_MODE=log
```

`log` 模式下守卫**只记 `auth_guard_miss` 不拦截**，业务立刻恢复；同时 `user_logs` 里会持续积累漏网请求，
可以拿它反查还有哪些点没带 token。**确认 49.8.4 改完并全量验证后，再改回 `enforce`**。

**49.8.4 根治：统一注入，不要 7 处各写一遍**

新增 `frontend/src/utils/authAxios.ts`：

```ts
import axios from 'axios';

/** 统一带 session token 的 axios 实例（绕过 umi-request 的直连请求必须用它） */
const authAxios = axios.create();

authAxios.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token') || '';
  if (token) {
    cfg.headers = { ...(cfg.headers || {}), token };
  }
  return cfg;
});

authAxios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      err.message = '登录已过期，请重新登录';
    }
    return Promise.reject(err);
  },
);

export default authAxios;
```

然后把上表 5 个文件的 `import axios from "axios"` 换成 `import axios from "@/utils/authAxios"`
（**只换这几个页面的 import**；`requestErrorConfig` 等自己的 axios 别动）。

⚠️ **必须同时修「空响应」这个误导**：守卫 401 返回体是 `{code:401,data:{isLogin:false}}`，
`parseChatCompletionData` 解析不到 `choices`，用户看到的却是「空响应」——**完全指错方向**。
在 401 分支直接给「登录已过期，请重新登录」，不要让它掉进内容解析失败的文案。

**49.8.5 验收（必须实测，不接受「已完成」）**

| # | 用例 | 期望 |
|---|---|---|
| 1 | 登录后 Kb 页生成 10 页 PPT | 全部成功，无「Key为slideN…失败」 |
| 2 | Ai 页同样生成一次 | 全部成功 |
| 3 | Kb 页 / Ai 页 Word 生成一次 | 全部成功（这条最容易漏，因为 Word 是每段一次并发） |
| 4 | 触发一次「AI 精简」（造一个 >70 字的点） | 精简生效，不静默返回原样 |
| 5 | 退出登录后再点生成 | 提示「登录已过期，请重新登录」，**不是**「空响应」 |
| 6 | `AUTH_GUARD_MODE` 改回 `enforce` 后重跑 1–3 | 仍全成功（证明 token 注入真的生效，不是靠 log 模式蒙过去） |
| 7 | `user_logs` 里 `action='auth_guard_miss'` | 改完并跑完 1–3 后**不再新增** |

第 6 条是关键：**必须在 enforce 下复测**，否则等于没修。

### 49.9 下一单

本单完成后：**无既定功能单**。等用户指定。

若用户未指定，建议顺序：
1. 49.6 的仓库卫生收尾
2. 本轮遗留的技术债：`ViewItem4Ppt ↔ outlineSerialize` 循环依赖（48.4 记过）、
   46.4「允许拆行」需先验 list 模板容量

⚠️ 后续任何人（我或用户）再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。

## 五十、反馈弹窗可拖动 / 截图可见 / 状态配色（P1 交互；含一个 P0：截图接口已全 401）

### 50.0 背景

用户四条需求（都针对反馈弹窗，截图见对话）：

1. 弹窗要能**在屏幕内拖动**，便于先把框拖开、再截当前页面。
2. Ctrl+V 粘贴后出现的「图片示意框」，**框线与文字改蓝**，让人注意到有变化。
3. **反馈内容查看处**也要能看到截图（不只是提交时能看到文件名）。
4. **状态 tag 按状态给不同颜色**，便于相关人看到进程变化。

调研时我另发现一个**用户没提但更严重的 P0**，本单必须一起修，否则第 3 条根本做不到：

```
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:7861/api/feedback/image/3eac9fb685bb4789b88504a7a1bd2228.png
401
```

`feedback.py:241` 的 `get_image` 只 `_imgs_dir()/file_name` 读文件，**不做鉴权判断**——401 是四十九的 `AuthGuardMiddleware` 拦的。而 `<img src>` / antd `<Image src>` 是**浏览器原生 GET，带不了 `token` header**，所以四十九 enforce 之后：

> **`FeedbackAdmin.tsx:293-305` 的截图预览已经全部裂图**（用户很可能还没去看）。

修法**绝不能**把 `/api/feedback/image` 加进 guard 白名单——反馈截图含内部页面、任务上下文，匿名可拉等于开口子，和刚做完的鉴权加固方向相反。必须改为**前端带 token 取 blob**（`authAxios` 已存在，`utils/authAxios.ts`）。

### 50.1 前置（先做完再动本单）

1. **提交四十九**。当前工作区 26 项未提交（`guard.py`、`authAxios.ts`、proxy、start.sh、7 处 axios 替换…）。HEAD 仍停 `ee699fd`。规矩同 48.5：开工下一单前先提交本单，否则回滚不到"四十九完成"这个已知好状态。
2. **删掉 `backend/package-lock.json`**（未跟踪）。`backend/` 是 Python 项目，这是某次误在 backend 目录跑 npm 产生的垃圾。
3. 本单改完单独提交，commit message 用 `feat(feedback): 弹窗可拖动 + 截图卡片 + 状态配色`。

### 50.2 弹窗可拖动（核心）

**不要引入 `react-draggable`**。项目 `package.json` 里没有任何拖拽库（`draggable|react-rnd|@dnd-kit` 零命中），为这点功能加一个依赖不划算，而且 antd v5 的 Modal 用 `style` 就能定位。

改 `components/Feedback/FeedbackModal.tsx`：

**a) 位置状态**

```tsx
const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = 默认居中
```

**b) 拖动只在标题栏**（表单里要选字、要拖文件，整框可拖会误触）

```tsx
title={
  <div
    style={{ cursor: 'move', userSelect: 'none' }}
    onMouseDown={onDragStart}
  >
    遇到问题？告诉我们
  </div>
}
```

**c) 起点必须实测，不许用 state 推算**

```tsx
const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
  const modalEl = (e.currentTarget as HTMLElement).closest('.ant-modal') as HTMLElement | null;
  if (!modalEl) return;
  const rect = modalEl.getBoundingClientRect();
  const start = { mx: e.clientX, my: e.clientY, x: rect.left, y: rect.top };
  e.preventDefault();
  document.body.style.userSelect = 'none';   // 拖的时候别选中页面文字
  const move = (ev: MouseEvent) => {
    const next = clampModalPos(
      start.x + (ev.clientX - start.mx),
      start.y + (ev.clientY - start.my),
      rect.width, rect.height,
      window.innerWidth, window.innerHeight,
    );
    setPos(next);
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
};
```

**d) clamp 必须是可测纯函数**（放 `components/Feedback/modalDrag.ts`）

```ts
export function clampModalPos(
  x: number, y: number,
  w: number, h: number,
  vw: number, vh: number,
): { x: number; y: number } {
  const maxX = Math.max(0, vw - w);
  const maxY = Math.max(0, vh - h);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}
```

语义写清：**整个弹窗必须留在视口内**。`h >= vh` 时 `maxY = 0`，即只能贴顶——这时靠下面的 body 滚动兜底，见 (f)。

**e) 应用位置**

```tsx
<Modal
  /* 其余 props 不变 */
  style={
    pos
      ? { position: 'fixed', top: pos.y, left: pos.x, margin: 0 }
      : undefined
  }
/>
```

`style` 落到 `.ant-modal`（antd v5 语义）。默认不传 = 维持现状居中（`top:100px` + `margin:0 auto`），只在用户拖过之后才接管，避免一打开就跳位。

**f) 长内容必须能滚**（拖动后 fixed 定位会丢掉原来 `.ant-modal-wrap` 的滚动）

```tsx
styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflow: 'auto' } }}
```

这条不加，截图多、上下文展开时**提交按钮会被推出视口且无法滚动**——比不能拖更糟。

**g) 位置记忆 + 边界复原**

- 拖动结束写 `sessionStorage['bf_fb_modal_pos']`（JSON `{x,y}`），打开时读。
- 读回来的位置**必须再过一遍 `clampModalPos`**：浏览器窗口变小后旧坐标会把框甩出屏幕。
- 反序列化失败（`"{}"`、`"null"`、脏数据）一律回落 `null`，不许抛错。

**h) 同时改掉遮罩（这条是"便于截图"的关键，用户没说但一定会撞上）**

```tsx
maskClosable={false}
styles={{ mask: { background: 'rgba(0, 0, 0, 0.06)' } }}
```

antd 默认 mask 是 `rgba(0,0,0,0.45)`，整页会被压暗，**截出来的图是灰的**。拖开只是解决"挡住"，遮罩不变暗才是解决"截得对"。

⚠️ 行为变更（必须知道）：**点遮罩不再关闭**，只能点右上角 X 或「取消」。理由：拖动和截图时鼠标很容易划到遮罩上，误关会直接丢掉已填的描述和已上传的截图。这条写进回执，别当回归 bug 报。

### 50.3 截图卡片：蓝色 + 缩略图 + 上传态

现状 `FeedbackModal.tsx:227-241`：粘完只出一个灰 `<Tag>{n.slice(0,10)}…</Tag>`——**显示的是 uuid 文件名**，用户根本认不出是哪张图，也没法判断"粘进去了没有"。这正是用户说"要能注意到有变化"的原因。

**a) `images` 类型从 `string[]` 改成结构化**

```ts
type Shot = { name: string; localUrl?: string; status?: 'uploading' | 'done' };
const [images, setImages] = useState<Shot[]>([]);
```

提交时只取 `name`（`body.images = images.filter(s => s.name).map(s => s.name)`），**别把 localUrl 发上去**。

**b) 上传前先插占位**（现在要等请求回来才有 UI，粘完 1~2 秒没反应，用户会以为没粘上）

- 粘贴/选择时立刻 `URL.createObjectURL(file)` 插入一条 `{ localUrl, status: 'uploading' }`
- 成功 → 回填 `name`、`status: 'done'`；失败 → 移除该条 + `message.error`
- 组件卸载时 `revokeObjectURL` 所有 localUrl（防内存泄漏）

**c) 卡片样式（用户明确要的"框线与文字蓝"）**

- 容器：`border: 1px solid #1677ff`、`borderRadius: 8`、`padding: 4`，尺寸 76×76
- 图：`objectFit: cover`、`borderRadius: 6`，铺满
- 文字：`截图 {i+1}`，`color: #1677ff`、`fontSize: 12`
- 删除：右上角 16px 圆形按钮，`#1677ff` 底白字 `×`
- 上传中：占位用蓝色虚线 `1px dashed #1677ff` + `<Spin size="small" />`

**不要继续用 `<Tag>`**——Tag 塞不下缩略图，且 closable 的 × 和图片叠在一起很难点。

**d) 数量上限**：`images.length >= 6` 时拒绝继续粘贴并提示「最多 6 张」。现在**没有上限**，粘 20 张会把弹窗撑爆、提交体也过大（后端单图限 8MB，但没有张数限制）。

### 50.4 截图在两处"查看"里可见（含 P0 修复）

**a) 新增 `components/Feedback/useFeedbackImages.ts`**

```ts
export function useFeedbackImages(names: string[]): Record<string, string>
```

- 对每个 `name` 走 `authAxios.get('/api/feedback/image/' + name, { responseType: 'blob' })`
- 成功 → `URL.createObjectURL(blob)`，返回 `name -> url` 映射
- 失败 → 该条不放入映射（**渲染时降级成"图片加载失败"占位，不要整块崩掉**）
- `names` 变化/卸载 → 逐个 `revokeObjectURL`
- `names` 用 `join(',')` 做依赖，避免数组引用变化导致无限重取

**b) 管理页 `FeedbackAdmin.tsx:293-305`**

现在是 `<Image src={`/api/feedback/image/${n}`} />` —— enforce 后必 401，改成：

```tsx
const imgUrls = useFeedbackImages(detail?.images || []);
...
<Image src={imgUrls[n]} fallback={...} />
```

保留 `Image.PreviewGroup` 点击放大。

**c) 弹窗右下「我的反馈（最近）」列表 `FeedbackModal.tsx:302-319`**

每项左侧加 40×40 缩略图（`useFeedbackImages(item.images)`，同名 hook 复用）；**同时显示状态中文 tag**（见 50.5）。没有截图的行不留空位。

**d) 顺手修一个数据断层**：提交成功后本地直接塞进 `mine` 的那条（`:147-153`）**没有带 `images`**，所以刚提交完看不到自己的截图，要等下次打开。补 `images: body.images`。

**e) 编号→详情入口**：列表项内容加 `onClick`，跳 `/admin/feedback?id={id}`（`FeedbackAdmin.tsx:67-68` 已支持 `?id=` 自动开抽屉）。现在点了没反应，用户看不到自己提交的处理结果。

### 50.5 状态 tag 配色（一份真相）

现状三处各写各的，且**显示的是英文原值**：

| 位置 | 现状 |
|---|---|
| `FeedbackAdmin.tsx:178` 表格列 | `<Tag>{v}</Tag>` → 显示 `pending` |
| `FeedbackAdmin.tsx:278` 抽屉 | `<Tag color="blue">` → **所有状态恒蓝** |
| `FeedbackModal.tsx:308` 我的反馈 | `<Tag>{item.status}</Tag>` → 显示 `fixed` |

**a) 在 `services/feedback.ts` 加 `feedbackStatusLabel`**（与既有 `notifyStatusLabel:113` 同构，同一文件同一风格）：

```ts
export function feedbackStatusLabel(status?: string): {
  text: string; color: string; tip?: string;
} {
  switch (status) {
    case 'pending':   return { text: '待处理', color: 'orange',  tip: '已提交，等待处理' };
    case 'resolving': return { text: '处理中', color: 'blue',    tip: '正在修复或评估' };
    case 'fixed':     return { text: '待确认', color: 'purple',  tip: '已修复，等待提交人确认' };
    case 'resolved':  return { text: '已关闭', color: 'green',   tip: '提交人已确认' };
    case 'ignored':   return { text: '已忽略', color: 'default', tip: '经评估不处理' };
    default:          return { text: status || '—', color: 'default' };
  }
}
```

配色依据：`fixed` 用紫色而不是绿/蓝——它是**唯一需要提交人动手**的状态，必须从一排蓝绿里跳出来；`pending` 橙是待办色；`resolved` 绿表示终态；`ignored` 灰表示归档。

**b) `STATUS_OPTS`（`:33-40`）改成从它派生**，别留两份文案：

```ts
const STATUS_OPTS = [
  { value: '', label: '全部状态' },
  ...(['pending','resolving','fixed','resolved','ignored'] as const)
       .map(s => ({ value: s, label: feedbackStatusLabel(s).text })),
];
```

**c) 三处统一替换**，抽屉里的 `<Tag color="blue">` 那个写死颜色必须删掉。

**d) 角标颜色**（可选，但建议做）：`FeedbackBadge.tsx:26` 的 `<Badge count>` 现在恒红。`fixed` 待确认才是真正要人处理的，保持红即可；**不要**区分颜色——Badge 只有一色，多色反而看不出重点。本项不动，写在这里是防止有人顺手改。

### 50.6 jest（并入既有 `tests/feedbackContext.test.ts`，不新建文件）

1. `clampModalPos`：给 `(x=-100, y=-100)` → `{0,0}`；给超出右下 → 夹到 `vw-w` / `vh-h`；给 `h > vh` → `y=0`。
2. `feedbackStatusLabel`：五个状态**颜色两两不相等**（防"全返回 default"这种假实现），且 `fixed` 的 `text` 必须是「待确认」不能是 `fixed`。
3. `feedbackStatusLabel('')` / `undefined` → 不抛错，`text` 为 `—`。
4. 位置持久化：`readModalPos()` 对 `'{}'` / `'null'` / `'abc'` 一律返回 `null` 不抛错。
5. `useFeedbackImages`：mock `authAxios.get` 返回 blob → 断言映射值以 `blob:` 开头；`names` 变空后 `revokeObjectURL` 被调用（需 mock `URL.createObjectURL` / `revokeObjectURL`，jsdom 无实现）。

### 50.7 验收（我判卷时会按这几条实测）

**代码侧**
1. `grep 'react-draggable' package.json` 零命中（没偷偷加依赖）。
2. `grep 'api/feedback/image' frontend/src` 只剩 `useFeedbackImages.ts` 一处拼接，`FeedbackAdmin`/`FeedbackModal` 里不再有裸 URL 进 `<Image src>`。
3. `guard.py` 白名单里**没有** `feedback/image`。
4. `grep 'color="blue"' FeedbackAdmin.tsx` 在状态 tag 那行已消失。
5. jest 全绿（原 4 条 + 新增 5 条）。

**接口侧（Curator 自测）**
6. 无 token `GET /api/feedback/image/<real>.png` → **仍 401**（不许为修图放宽鉴权）。
7. 带 admin token 同一 URL → 200 且 `content-type: image/png`。

**UI 侧（必须用户点，我做不了）**
8. 弹窗能拖、拖到边缘停住、关掉重开位置还在。
9. 拖开后页面**不再明显变暗**（能直接截）。
10. Ctrl+V 粘 2~3 张：卡片为蓝色边框、有缩略图、能单张删。
11. 管理员进 `/admin/feedback` 打开详情：截图**能看到**（这是 P0 的验收点，修前必裂）。
12. 普通用户（lizy）进 `/admin/feedback?mine=1`：看得到自己的截图与状态中文。
13. 一屏内五种状态颜色互不相同，`待确认` 最跳。

### 50.8 本单不做 / 记债

- **不做「截图模式」**（点一下把弹窗缩成标题条）：拖动已满足需求，多一个状态机不值。
- **不做截图私密隔离**：`get_image` 目前任何登录用户知道文件名就能取（uuid 不可猜，但仍是越权面）。正确做法是校验该图属于当前用户可见的反馈，属鉴权范畴，单独开单。
- **`list_feedback` 只 `LIMIT 500` 无分页**，管理页 `pagination` 是前端分页假象——记债，等反馈量上来再改。

### 50.9 下一单

本单完成后：**无既定功能单，等用户指定**。

候选（按我判断的优先级，用户可改）：
1. **46.4 拆行权限**（放宽「一条要点只对应 1 行」+ 验模板容量）—— PPT 172 字的根因之一，仍挂着。
2. **循环依赖**（`outlineSerialize.ts` ↔ `ViewItem4Ppt.ts` 双向值级 import）—— 现只在函数体内调用故安全，属结构性债。
3. **截图越权隔离**（50.8 第 2 条）。

⚠️ 后续任何人再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。

## 五十一、检索模式语义错误：混合模式恒等于向量结果集（P0 功能 bug）

### 51.0 结论

用户实测：「曹俊生」在**关键字**模式搜到 1 个文档，**语义**搜不到，**混合**也搜不到。

这**不是偶发漏召回，是必然**。当前实现里：

> **混合模式的结果集恒为向量结果集的子集（hybrid ⊆ vector）**，混合永远不可能比语义多出任何一条"只被 bm25 命中"的结果。

而 UI 文案写着「混合=语义+关键字」（`DocSearch/index.tsx:282`），两者直接矛盾。所以这是**功能 bug**，不是参数没调好。

### 51.1 根因链（`kb_service.py:176-199`）

```python
mode = (mode or "hybrid").lower()
if mode == "bm25":
    results = self._bm25_search(query, top_k * 3)
elif mode == "vector":
    results = self._vector_search(query, top_k * 3)
else:
    v = self._vector_search(query, top_k * 3)
    b = self._bm25_search(query, top_k * 3)
    results = self._rrf_fuse([v, b], top_k=top_k * 3)

if score_threshold > 0:
    if mode == "bm25":
        results = [r for r in results if float(r.get("score") or 0) >= score_threshold]
    else:
        results = [r for r in results if float(r.get("vector_score") or 0) >= score_threshold]   # ← 混合也走这里
```

三处叠加：

| # | 事实 | 位置 |
|---|---|---|
| 1 | 默认阈值 `default_score_threshold = 0.5`，且 `DocSearch/index.tsx:137` **不传** `score_threshold` ⇒ 恒用 0.5 | `config.py:37` |
| 2 | 过滤分支的 `else` **同时覆盖 vector 和 hybrid**，混合模式下 **bm25 通道的命中完全不参与门槛判定** | `kb_service.py:197-198` |
| 3 | 「曹俊生」是人名，`bge-large-zh-v1.5` 对人名几乎没有语义信号 ⇒ 该条 `vector_score` 落在 0.35~0.45 | 模型特性 |

**逻辑证明（用用户三次搜索本身即可闭合，不需要再实测）**：

- 语义模式返回 0 ⇒ 全库对「曹俊生」的 `vector_score` 都 < 0.5（语义模式用的就是同一个门槛）
- 混合模式的过滤条件 = `vector_score >= 0.5` ⇒ 结果集**必然为空**，无论 bm25 命中多强
- 所以：`hybrid ⊆ vector` 恒成立 ⇒「关键字能搜到、混合搜不到」是**结构性必然后果**

**附带第三个 bug：关键字模式的阈值形同虚设。**

`_bm25_search`（`:114-118`）里 `score = score / max_score`，即**按本次查询的最高分归一化** ⇒ 第一名恒为 1.0 ≥ 0.5 ⇒ 门槛永远拦不住任何东西。`HybridStore.search:194` 的注释自己写着「混合分里的 BM25 按本次最高分归一化，无关查询的第一名也会变成 1，不能用来判断『像不像』」——**但 `mode == "bm25"` 分支正是拿它当门槛用的**。结果是：查库里根本不存在的词，「关键字」也会返回 top_k 条。

### 51.2 修法：混合改"任一通道达标"，词面通道必须用**绝对**指标

`bm25_score` 是归一化值，不能做门槛（见上）。必须引入一个**不随本次查询归一化浮动**的词面指标：

```python
def _term_coverage(query: str, text: str) -> float:
    '''query 分词后被文档覆盖的比例（绝对值，与本次查询的最高分无关）。'''
    q = {t for t in tokenize(query) if t}
    if not q:
        return 0.0
    body = text or ""
    return sum(1 for t in q if t in body) / len(q)
```

改动四处：

**a) `_bm25_search` 每条结果附上 `term_coverage`**（用同一条 `d["page_content"]`，别用 metadata）

**b) `_rrf_fuse` 合并时 `term_coverage` 取 max**，与既有的 `vector_score` / `bm25_score` 处理方式保持一致（`:146-153`）

**c) 新增模块常量**

```python
LEX_COVERAGE_MIN = 0.5   # 词面门槛：query 分词至少一半能在正文里找到
```

**d) 过滤分支改成**

```python
if score_threshold > 0:
    if mode == "bm25":
        # 归一化分恒为 1，不能当门槛；改用绝对覆盖率
        results = [r for r in results if float(r.get("term_coverage") or 0) >= LEX_COVERAGE_MIN]
    else:
        # vector / hybrid：语义够像 **或** 词面确实命中，任一达标即保留
        results = [
            r for r in results
            if float(r.get("vector_score") or 0) >= score_threshold
            or float(r.get("term_coverage") or 0) >= LEX_COVERAGE_MIN
        ]
```

**为什么 `LEX_COVERAGE_MIN = 0.5`**：

- 单 token 查询（「曹俊生」在 jieba 下是 1 个词或几个字）⇒ coverage = 1.0，必过。
- 多词查询命中一半以上才算词面相关；3 个词只命中 1 个（0.33）不算 —— 这本来就该被砍。
- 阈值写成常量，不要散在代码里；后续要调只改一处。

⚠️ **不许改成"混合模式直接取消阈值"**。取消后 bm25 的 top_k（噪声）会全部灌进来，`_rrf_fuse` 排序权重里 bm25 占 0.25，足以把弱相关结果顶到前面。必须保留双通道判据。

### 51.3 预期行为变化（先知道，别当回归 bug 报）

| 变化 | 说明 |
|---|---|
| **「关键字」会变少，甚至变空** | 这是修对了。以前查不存在的词也返回一堆，现在真的会返回 0。用户可能感觉"以前能搜到的没了"，那是误报被清掉了 |
| **「混合」会变多** | 正是本次要的：关键字能命中的，混合也能命中 |
| **生成流程受影响** | `store.search` 是公共函数，PPT/Word 的检索（`search_docs` / `search_cross_kb_docs`）都走它。混合门槛放宽 ⇒ 召回变多，**必须回归**一页 PPT + 一段 Word 生成，确认没把无关片段塞进 prompt |
| **不会爆量** | `:199` 仍有 `results[:top_k]` 截断，条数不变，只是候选池更准 |

### 51.4 本单不做

- **不动排序权重**（`:159-162` 的 `0.7*vector + 0.25*bm25 + 0.05*rrf`）。专名场景排序确实吃亏（coverage=1 但 vector=0.35 ⇒ 0.495，会被语义更像但无关的段落压下去），但调权重会改变**全量**召回顺序，风险远大于收益。先只修"搜不到"，排序等有实测样本再单独开单。
- **不动 `default_score_threshold = 0.5`**。它是全局参数，问答/大纲/正文第一跳都在用；人名天然向量分低，要解决只能按 query 类型分档，属另一件事，记债。

### 51.5 pytest（新文件 `backend/tests/test_retrieval_modes.py`，**不加载真模型**）

用合成 store + monkeypatch `embed_query`，保证秒级：

1. 造 3 条 docs，其中 1 条正文含「曹俊生」；构造 `embeddings` 使该条对 query 的余弦 = 0.35，另两条 0.42（都 < 0.5）。
2. `mode="vector"` → **0 条**（复现现状）。
3. `mode="bm25"` → 含「曹俊生」的那条在结果里。
4. `mode="hybrid"` → **必须也返回那条**。← **回归闸，当前代码这个用例会失败**，正好用来证明修了。
5. `mode="bm25"` 查一个库里不存在的词（如「曹俊生zzz」）→ **0 条**。← 第二个回归闸（当前会返回 ≥1）。
6. `mode="hybrid"` 查「曹俊生zzz」→ 0 条（防放宽过度）。

注意：`_term_coverage` 用 jieba 分词，测试里对「曹俊生」不要假设切词结果，断言用「coverage > 0.5」而不是「等于 1」。

### 51.6 验收

**pytest**：6 条全绿，其中第 4、5 条在改之前必须失败（先跑一遍留证据，别直接一把改完说"通过了"）。

**接口实测**（用智能搜索页，管理员登录）：

| # | query | 期望 |
|---|---|---|
| 1 | 曹俊生 · 关键字 | ≥ 1 个文档 |
| 2 | 曹俊生 · 语义 | 仍可能是 0（人名，正常，**本单不承诺修语义模式**） |
| 3 | 曹俊生 · 混合 | **≥ 1 个文档**（本单核心验收） |
| 4 | 曹俊生zzz · 三种模式 | **全部 0**（关键反验，防"为了让混合有结果而把门槛拆了"） |
| 5 | 一个平时的正常业务 query（如「格力混改」） | 三种模式的条数不应显著少于改前 |

第 4 条是防作弊闸：如果只把 `if score_threshold > 0` 整块删掉，第 3 条会过但第 4 条必挂。

**回归**：PPT 抽一页重生成 + Word 一段重生成，看引用片段是否仍相关。

### 51.7 下一单

本单完成后：

1. **46.4 拆行权限**（放宽「一条要点只对应 1 行」+ 先验模板容量）—— 仍挂着。
2. 循环依赖（`outlineSerialize.ts` ↔ `ViewItem4Ppt.ts` 双向值级 import）。
3. 截图越权隔离（50.8 第 2 条：`get_image` 任意登录用户知文件名即可取）。
4. 检索排序与分级阈值（51.4 记的两条债）。

⚠️ 后续任何人再往本文档追加新章时，**必须把这条「下一单」继承到新章末尾**，否则又会丢章。

## 五十二、OpenAI SDK 直连 8 处未带会话 token（P0：智能问答 / 大纲生成全挂）

> 追加于 2026-10-22 08:40。**本单优先级高于五十一章（检索）**，先做本单。
> 起因：用户实测「智能问答调用大模型出错了」，浏览器控制台：
>
> ```
> POST http://<host>:8000/chat/chat/completions  401 (Unauthorized)
> Uncaught (in promise) AuthenticationError: 401 status code (no body)
>     at OpenAI.makeStatusError ...
> ```

### 52.0 根因（已实测，不是推测）

`openai@4.67.0` 只认 `apiKey`，并把它塞进 `Authorization: Bearer <apiKey>`；它**不经过** `requestErrorConfig.ts:90-96` 那个统一注入 `token` 头的 umi-request 拦截器。而 8 个页面把 apiKey **硬编码成同一个 `sk-f46769...`**：

```
frontend/src/pages/AiAnswerChatchat.tsx:13            apiKey: 'sk-f46769...'  baseURL: <bf>/chat
frontend/src/pages/AiAnswerChatchatDigitalMan.tsx:15  apiKey: 'sk-f46769...'  baseURL: <bf>/chat
frontend/src/pages/AiGenDocOutline.tsx:38             apiKey: 'sk-f46769...'  baseURL: <bf>/chat
frontend/src/pages/AiGenPptOutline.tsx:37             apiKey: 'sk-f46769...'  baseURL: <bf>/chat
frontend/src/pages/KbAnswer.tsx:176                   apiKey: 'sk-f46769...'  baseURL: <bf>/knowledge_base/local_kb/<kb>
frontend/src/pages/KbGenDocOutline.tsx:45             apiKey: 'sk-f46769...'  baseURL: <bf>/knowledge_base/local_kb/<kb>/
frontend/src/pages/KbGenPptOutline.tsx:45             apiKey: 'sk-f46769...'  baseURL: <bf>/knowledge_base/local_kb/<kb>/
frontend/src/pages/DocGen.tsx:15                      apiKey: 'sk-f46769...'  baseURL: <bf>/knowledge_base/local_kb/SEMIR/
```

后端 `security/auth.py:114-131 extract_token()` 的顺序是：`token` 头 → `?token=` → `Authorization: Bearer`，**且 Bearer 只在 `cand in _TOKENS`（命中会话表）时才认**。`sk-f46769...` 永远不在会话表里 ⇒ 恒 401。

实测（curl，直连 7861）：

```
POST /chat/chat/completions  Authorization: Bearer sk-f46769...
→ HTTP/1.1 401 Unauthorized   content-type: application/json   content-length: 121
```

121 字节正是 `guard.py:_unauthorized_body()` 的长度 ⇒ **401 来自四十九章的 AuthGuard，不是上游大模型**（也确认 `chat.py` 全文没有任何 `status_code=401` 的透传点）。

### 52.1 修法：自定义 fetch 注入当前 token（不要改 apiKey 为一次性字符串）

**禁止**写成 `apiKey: localStorage.getItem('token')`。原因：本单 8 处里有 3 处（`DocGen:15`、`AiAnswerChatchat:13`、`AiAnswerChatchatDigitalMan:15`）是**模块顶层**构造，模块在登录前/首次访问时就被求值，拿到的 token 可能是空；且同一会话内重新登录后 token 变了，旧实例仍是旧 token ⇒ 又 401，而且极难复现。`openai@4.67` 的 `apiKey` 类型是 `string`，不支持传函数。

**正确做法**：利用 SDK 的 `fetch` 选项（`node_modules/openai/core.d.ts:9` 已确认签名 `(url: RequestInfo, init?: RequestInit) => Promise<Response>`），在**每次请求时**读最新 token。

新建 `frontend/src/utils/bfOpenAI.ts`：

```ts
import OpenAI, { type ClientOptions } from 'openai';

/**
 * OpenAI SDK 的鉴权只走 apiKey → Authorization: Bearer，
 * 不经过 requestErrorConfig 的 umi-request 拦截器。
 * 这里用自定义 fetch 在每次请求时注入当前 session token，
 * 避免模块顶层构造时把旧 token 固化下来。
 */
export const bfAuthFetch: typeof fetch = (input, init) => {
  const token = localStorage.getItem('token') || '';
  const headers = new Headers((init?.headers as HeadersInit) || {});
  if (token) {
    headers.set('token', token);                       // 后端 extract_token 第一优先
    headers.set('Authorization', `Bearer ${token}`);    // 兼容只认 Bearer 的场景
  }
  return fetch(input, { ...init, headers });
};

export function bfOpenAI(baseURL: string, opts: Partial<ClientOptions> = {}) {
  return new OpenAI({
    apiKey: 'bf-session-token',   // 占位，真实凭据由 bfAuthFetch 注入
    baseURL,
    dangerouslyAllowBrowser: true,
    fetch: bfAuthFetch,
    ...opts,
  });
}
```

> `apiKey` 必须给一个**非空**占位：SDK 在 apiKey 为空时会直接抛 `Missing credentials`，根本不会发出请求。占位值会进 `Authorization: Bearer bf-session-token`，但随后被 `bfAuthFetch` 用真 token 覆盖，且后端 `extract_token` 先命中 `token` 头，不会走到 Bearer 分支。

### 52.2 替换 8 处构造（逐一，不许漏）

| # | 文件 | 行 | 替换为 |
|---|---|---|---|
| 1 | `pages/AiAnswerChatchat.tsx` | 13 | `const openai = bfOpenAI(getBfBaseUrl() + '/chat');` |
| 2 | `pages/AiAnswerChatchatDigitalMan.tsx` | 15 | 同上 |
| 3 | `pages/AiGenDocOutline.tsx` | 38 | 同上（去掉 `useMemo` 依赖里的多余项；`bfOpenAI` 可原地放在 useMemo 内） |
| 4 | `pages/AiGenPptOutline.tsx` | 37 | 同上 |
| 5 | `pages/KbAnswer.tsx` | 176 | `bfOpenAI(`${getBfBaseUrl()}/knowledge_base/local_kb/${selectKbName}`)`（保留 `timeout: 60000`，写进第二参 `{ timeout: 60000 }`） |
| 6 | `pages/KbGenDocOutline.tsx` | 45 | `bfOpenAI(`${getBfBaseUrl()}/knowledge_base/local_kb/${selectKbName}/`)` |
| 7 | `pages/KbGenPptOutline.tsx` | 45 | 同上 |
| 8 | `pages/DocGen.tsx` | 15 | `bfOpenAI(getBfBaseUrl() + '/knowledge_base/local_kb/SEMIR/')` |

替换后每个文件的 `import { OpenAI } from 'openai'` 若不再使用则删除（`DocGen/AiAnswerChatchat/...` 都是只有这一处构造），改为 `import { bfOpenAI } from '@/utils/bfOpenAI';`。**别留下第二个 OpenAI 构造点。**

`components/trash/` 下还有两个 `new OpenAI`（`KbChatwithSpeech4Doc.tsx:8`、`KbChatWithSpeech4Ppt.tsx:7`）：先 `grep -rn "trash/KbChat" src` 确认无人引用；无引用则**在本单一并改成 `bfOpenAI`**（成本 1 行，且能顺手清掉硬编码 key）；若被引用则必须改。

### 52.3 让 401 报出人话（P1，同一单做）

现在 SDK 拿到的是 `{"code":401,"msg":"请先登录","data":{...}}`，**不符合 OpenAI 的 error 结构**，所以 SDK 抛出的 `AuthenticationError.message` 是空的，这就是控制台那句 `401 status code (no body)` 的来源，用户完全看不出是登录过期。

在 `guard.py` 的 401 分支里，对**OpenAI 兼容路径**返回 OpenAI 格式的错误体：

```python
def _is_openai_path(path: str) -> bool:
    return path.endswith("/chat/completions") or path.endswith("/completions")

# dispatch 内 enforce 分支：
if _is_openai_path(request.url.path):
    return JSONResponse(
        status_code=401,
        content={"error": {"message": "登录已过期，请重新登录", "type": "invalid_request_error", "code": "401"}},
    )
return JSONResponse(status_code=401, content=_unauthorized_body())
```

只对 `*/chat/completions` 与 `*/completions` 生效，其他接口返回体保持不变（`requestErrorConfig` 依赖 `code` 字段，别动）。

### 52.4 验收（必须逐条贴证据）

1. **静态闸**：`grep -rn "sk-f46769" frontend/src` **必须 0 命中**（含 `components/trash/`）。
2. **静态闸**：`grep -rn "new OpenAI(" frontend/src` 只允许出现在 `utils/bfOpenAI.ts` 一处。
3. **jest 用例 1**：`bfAuthFetch` 在 `localStorage.token='T1'` 时，对任意 url 调用都会带上 `token: T1` 与 `Authorization: Bearer T1`（mock 全局 fetch 断言 init.headers）。
4. **jest 用例 2（回归闸）**：用 mock fetch 返回一个合法 chat completion JSON，构造 `bfOpenAI('http://x/chat')` 调 `client.chat.completions.create({...})`，断言**实际发出的请求头**里有当前 token —— 证明 SDK 真的走了自定义 fetch，而不只是单测了 fetch 本身。
5. **jest 用例 3**：把 `localStorage.token` 从 `T1` 改成 `T2` 后（**不重建实例**）再发一次请求，请求头必须是 `T2`。这条专门防「模块顶层固化旧 token」的写法回潮。
6. **后端**：`pytest` 断言 `POST /chat/chat/completions` 无 token 时 body 是 `{"error":{"message":"登录已过期，请重新登录",...}}` 且 status=401；带合法 token 时不再被 guard 拦截（可用 monkeypatch 让下游直接返回 200，避免真调模型）。
7. **人工（用户做）**：智能问答发一条消息，Network 里 `chat/completions` 请求头含 `token:`，返回 200 且能正常流式输出。

### 52.5 明确不要做的事

1. **不许**把 `/chat` 或 `/knowledge_base/.../chat/completions` 加进 `guard.py` 白名单。这些是**计费的大模型调用**，匿名可打等于开放算力，也失去按用户审计。
2. **不许**为了让它通而把 `AUTH_GUARD_MODE` 改回 `log`（现在 `.env:50` 是 `enforce`，是对的）。
3. **不许**在后端加「固定 API key 白名单」（例如认那个 `sk-f46769...`）。浏览器端的 key 是公开的，等于永久后门；真 token 才能把调用记到具体用户，`user_logs` 才有意义。
4. **不许**改 `apiKey` 为一次性字符串（见 52.1 的理由）。
5. 不动 `chat.py` 的检索与 prompt 逻辑；不动 `ChatWithSpeech4Doc/Ppt` 内部实现（它们只消费传入的实例，实例修好就通了）。

### 52.6 教训（写进本章，避免第三次）

连续两轮踩同一个坑：**做「全站鉴权加固」这类横切改造时，清单只覆盖了我 grep 到的那几种写法**。
- 四十九只列了 `axios.*` 与裸 `fetch(` ⇐ 漏了 `new OpenAI`；
- 本轮直接后果是 8 个页面全 401，而四十九章的验收用例（curl 打接口）**全部通过**，因为 curl 天然覆盖不到浏览器 SDK。

规则：**以后任何鉴权/网关类改造，清单必须包含五类客户端**：① umi-request ② axios/fetch 直连 ③ **第三方 SDK 构造点（`new OpenAI` / `new Anthropic` / 其他）** ④ `EventSource` ⑤ `<img src>`/`<a href>`/`window.open` 这类浏览器原生请求。
后两类天然带不了 header，必须单独设计（前者 `?token=`，后者 blob + objectURL）。

### 52.7 下一单

本单（五十二）完成后：**先停下，回 handoff 报告，不要自行开工下一单**。五十三章由 WorkBuddy 在你回执后追加。

已排定的后续链条（供参考，章尚未写出）：

1. **五十三（预览方案重构，方案已定稿，待 WorkBuddy 写章）**：毕方现行预览走外部服务 `https://poc.intronlink.com/kkfv/onlinePreview`（kkFileView），该域名实测已不可达（`curl` code=000）⇒ `KbAnswer.tsx:31-37`、`DocSearch/index.tsx:234-244` 两处预览按钮全部失效。改为**页图优先 + 逐页文本降级**：命中带 `page` 且有 `assets/<doc>/<doc>_p<N>_<i>.png` 则显示该页整页图；无页图则回退到 `extracts/<doc>.jsonl` 的逐页 `snippet`（PDF 与 PPTX 都覆盖）。参考 docuMind `GET /documents/{doc_id}/pages/{page_no}` + Modal 展示的交互。**注意毕方页图只覆盖部分页，不能照搬 docuMind 的"每页必有图"假设。** 取图接口 `asset_file` 在 enforce 下需鉴权，`<img>` 直显要么用 `?token=`（后端 `extract_token` 支持 query 分支）要么走 `authAxios` blob + objectURL，**不许加 guard 白名单**（页图=知识库原文，匿名可看等于绕过四十九的鉴权）。
2. **五十一（检索模式语义错误，6395 行）**：混合模式恒等于向量结果集、bm25 阈值被归一化架空。该章内容完整，直接执行。
3. 之后：无既定功能单，等用户指定（候选：问卷/反馈二期、知识库图-段主题闸）。

## 五十三、交付前收口：PPT 超长描述「假成功精简」+ 源码默认口令与登录提示（P0）

### 53.0 结论（先看这段）

两件事都不是"参数没调好"，各有明确代码缺陷：

**A. PPT 124 字橙叹号**：自动精简**确实跑了**，但压缩后仍超长，代码把"非空"当成"成功"，随后写回又被校验拒绝 ⇒ **页面零变化，只多一句误导性的「已自动精简 1 条超长描述」**。

实测（DeepSeek `deepseek-chat`，temperature 0.3，同一段 124 字文本）：

| 提示词口径 | 次数 | 输出字数 | 达标(≤70) |
|---|---|---|---|
| 现行 `buildShortenItemPrompt`（"保留全部数字与出处"） | 5 | 112/112/113/112/113 | **0/5** |
| 硬限制 70 + 最多 2 组数字 + 仍禁删事实 | 5 | 109/109/111/108/99 | **0/5** |
| 允许删次要主体与过程细节、只留结论性事实 | 3 | 57/57/63 | **3/3** |

⇒ 不是模型压不动，是**现行提示词明确命令它"保留全部数字与出处"，与 ≤70 字直接冲突**。把这条禁令换成"允许删细节"后 57~63 字稳定达标（口径差异 112 vs 57，远超噪声，可一次改对）。

**B. 默认口令**：`bifang.intronlink` 在源码/文案/文档共 **6 类 13 处**；最糟的是登录失败提示**把账号密码直接印在页面上**（`locales/zh-CN/pages.ts:4`），登录框 placeholder 也写着密码（`:8`）。

**编号说明**：原 52.7 排定的"五十三 = 预览重构"**顺延为五十四**，别再按 52.7 的旧编号找五十三章。理由：本单两件是"交付前必须清掉"的安全项 + 当前阻塞用户的缺陷，预览重构可晚一单。

---

## 53.A PPT：超长描述被"假成功"吞掉

### 53.A.1 现象

用户截图：生成 PPT 后「收购资金从哪来」页展开 5 点，第 1 点（股权质押）描述 **124 字**，橙叹号 tooltip「第 1 点描述须为 20～70 字（当前 124 字）」；同页第 5 点只有 40 余字，正常。

### 53.A.2 完整链路（五处，全有行号）

| # | 位置 | 行为 |
|---|---|---|
| 1 | `ViewItem4Ppt.ts:1911-1921` | `setContent` 校验失败 → `genError = vErr`、**仍 `setResult(viewItems)`**、`return false` ⇒ 124 字原文能显示出来 |
| 2 | `AiOutlineGenPpt.tsx:547-567` / `KbOutlineGenPpt.tsx:599-625` | `ok === false` 才进 `autoShortenOverlongItems`，成功则 `setViewItemsStructured(next)` |
| 3 | `pptItemShorten.ts:121-127` | 只判 `pptItemLength(compressed) > 0`，**不判 `<= dMax`** ⇒ 112 字也算"精简成功"，`shortened++` |
| 4 | `AiOutlineGenPpt.tsx:581-583` | `shortened > 0` 就 `message.info('已自动精简 N 条超长描述')` ⇒ **假成功提示** |
| 5 | `ViewItem4Ppt.ts:1850-1857` | `setViewItemsStructured(112 字)` 再次校验失败 ⇒ `return false`，**既不写回 viewItems 也不更新 genError** ⇒ UI 一切照旧 |

净效果：跑了一次 LLM、弹了一句"已精简"、页面零变化。用户看到的与"完全没精简"完全一样。

### 53.A.3 次要缺陷（同单一起修）

| # | 位置 | 问题 |
|---|---|---|
| 1 | `ViewItem4Ppt.ts:1837-1864` | `setViewItemsStructured` 成功时**不清 `genError`**（`setContent:1875` 会清）⇒ 真精简成功也残留橙叹号，直到 `reparseAllSlideContents` 或重新生成 |
| 2 | `pptItemShorten.ts:115` | `maxItems` 默认 3；一页 5 点若 4 条超长，只修前 3 条 |
| 3 | `ViewItem4Ppt.ts:1586-1594` | 「建议切表格」门槛是 `overlong>=2 && heavy>=2`；本条只 1 条超长 ⇒ **连建议都不给**（而本例正是"单条 124 字含 4 组数字"） |
| 4 | `ViewItem4Ppt.ts:1449` | 写作 prompt 只说"含 3 个以上数字必须砍铺垫"，**没有"最多几组数字"的硬上限**，模型可合法写 4 组数字 |

### 53.A.4 修法

**a) 精简提示词分两档（`pptItemShorten.ts:37-46`）**

```ts
export function buildShortenItemPrompt(item: ShortenItem, dMax: number): string {
  const len = pptItemLength(item.content);
  const heavy = len > dMax * 1.4 || countNumericUnitGroups(item.content) >= 2;
  const rule = heavy
    ? `压缩到 ${dMax} 字以内是硬限制。允许删去次要主体名称与过程细节，只保留「谁用什么方式拿到多少」这类结论性事实，` +
      `数字最多保留 2 组（优先与标题直接相关的）。不要新增事实。`
    : `压缩到 ${dMax} 字以内，保留全部数字，只删连接词与重复限定，不要新增内容。`;
  return `${rule}\n不要用 [文档N]，不要输出任何来源标注。只输出压缩后的描述正文，不要标题、编号或前言。\n` +
    `标题：${item.title}\n描述：${item.content}`;
}
```

`countNumericUnitGroups` 已从 `outlineJson.ts` 导出（`ViewItem4Ppt.ts:5` 已在用）；`pptItemShorten.ts` 直接 `import { countNumericUnitGroups } from "@/components/DocUtil/outlineJson";`（函数级调用，不新增循环依赖风险）。

**"允许删细节"这句是达标关键，不能省** —— 见 53.0 表格第 2/3 行对比。

**b) 结果必须校验，不许假成功（`pptItemShorten.ts:104-133`）**

```ts
const dMax = descMaxForPptItem(layout, i, metricCount);
const len = pptItemLength(next[i].content);
if (len <= dMax) continue;
let compressed = await shortenFn(i, next[i], dMax).catch(() => null);
// 一次不达标：换更狠的口径重试一次
if (compressed && pptItemLength(compressed) > dMax) {
  compressed = await shortenFn(i, next[i], dMax, { forceHeavy: true }).catch(() => null);
}
if (compressed && pptItemLength(compressed) <= dMax) {
  next[i] = { ...next[i], content: compressed };
  shortened += 1;
} else {
  failed.push({ index: i, len, dMax });
}
```

- 返回类型改为 `{ items, shortened, failed }`（`failed: Array<{index; len; dMax}>`）；
- `shortenFn` 签名加第 4 参 `opts?: { forceHeavy?: boolean }`；两个页面的 `shortenSlideItem` 透传给 `shortenPptItemDesc({ ..., forceHeavy })`，内部拼到 `buildShortenItemPrompt`（`forceHeavy` 为 true 时强制走 heavy 口径）；
- 页面渲染：
```ts
if (failed.length) {
  const f = failed[0];
  message.warning(`第 ${f.index + 1} 点仍超长（${f.len} 字，限 ${f.dMax} 字），建议改用表格版式或手工精简。`);
} else if (shortened > 0) {
  message.info(`已自动精简 ${shortened} 条超长描述`);
}
```
**禁止 `failed` 非空时还弹"已自动精简"。**

**c) 成功写回要清错误位（`ViewItem4Ppt.ts:1858`）**

```ts
this.setResult(viewItems);
this.content = Slide.itemsToContentText(cleaned);
this.genError = "";          // ← 补这一行
return true;
```

**d) 「建议切表格」门槛改为单条触发（`ViewItem4Ppt.ts:1582-1594`）**

```ts
const heavy = rows.filter(
  (r) => pptItemLength(r.content) > 100 && countNumericUnitGroups(r.content) >= 2,
);
if (heavy.length >= 1) {
  msg += '本点含多组数字且明显超长，建议切换为「表格」版式（主体｜数值），或只保留 2 组关键数字。';
}
```
旧门槛要求 `overlong>=2 && heavy>=2`，本例永远不触发 —— 而这恰恰是最该切表格的一页。

**e) 写作 prompt 加数字组数上限（`ViewItem4Ppt.ts:1449`）**

把
```
一条描述若含 3 个以上数字，必须砍掉铺垫，只留「主体 + 动作 + 数字」；超过 70 字即视为失败。
```
改为
```
一条描述最多保留 2 组数字；有 3 组以上时只留与标题最相关的 2 组，其余改写成定性表述（如「另有部分股权」）。
超过 70 字即视为失败。
```

**f) `maxItems` 3 → 6**（一页最多 9 点，够用；不做无限次，避免一页打十几次模型）。

### 53.A.5 验收

1. **jest（防假成功）**：假 shortenFn 返回 `dMax+10` 字 ⇒ `shortened===0` 且 `failed` 含该条。
2. **jest（重试）**：假 shortenFn 第一次返 `dMax+10`、第二次返 `dMax-5` ⇒ `shortened===1`，内容为第二次结果。
3. **jest（清错误位）**：`setViewItemsStructured` 成功写回后 `slide.genError === ''`。
4. **实测**：用 53.0 那段 124 字走 `shortenPptItemDesc`，断言 `pptItemLength(result) <= 70`（跑 3 次至少 2 次通过，LLM 仍有抖动）。
5. **人工（用户做）**：重新生成该页，橙叹号消失；若仍超长，必须看到"建议改用表格版式"的明确提示，而不是"已精简"。

---

## 53.B 源码默认口令与登录提示

### 53.B.1 全量清点

| # | 文件:行 | 现状 | 性质 |
|---|---|---|---|
| 1 | `backend/app/db.py:430-432` | 3 个种子用户密码硬编码 `bifang.intronlink` | **P0 明文** |
| 2 | `backend/app/routers/mock_api.py:173` | `user_add` 不传 password 时静默用该默认值 | **P0 明文 + 弱口令扩散** |
| 3 | `frontend/src/locales/zh-CN/pages.ts:4` | 错误提示 `错误的用户名和密码(admin/bifang.intronlink)` | **P0：把账号密码印在登录页** |
| 4 | `frontend/src/locales/zh-CN/pages.ts:8` | placeholder `密码: bifang.intronlink` | **P0：密码写在输入框** |
| 5 | 其它 8 个语言包 | `ant.design` 同款文案：`ja-JP:5,10`、`id-ID:5,10`、`bn-BD:5,8,10`、`fa-IR:4,9`、`en-US:5,8,10`、`pt-BR:5,8,10`、`zh-TW:4,7,9` | P1 陈旧默认凭据 |
| 6 | `frontend/src/pages/User/Login/index.tsx:221,235,257` | 组件内 `defaultMessage` 兜底 `admin/ant.design`、`admin or user` | P1 |
| 7 | `frontend/src/pages/User/Login/index.tsx:217-224` | 失败时用**固定文案**，不透传后端 msg ⇒「账号已停用」也显示成「密码错误」 | P1 误导 |
| 8 | `README.md:32`、`bifang-req.md:22` | 明写 `admin / bifang.intronlink` | P1 文档 |
| 9 | `backend/app/routers/mock_api.py:102-114` | 审计 reason 区分「用户不存在/密码错误」 | **可接受**（内部审计需要，只要不回传前端） |

### 53.B.2 修法

**a) 种子密码不落源码（`db.py:424-455`）**

```python
def _seed_admin_password() -> tuple[str, bool]:
    """返回 (密码, 是否自动生成)。环境变量优先；缺省随机 16 位。"""
    env = (os.getenv("BIFANG_SEED_ADMIN_PASSWORD") or "").strip()
    if env:
        return env, False
    return secrets.token_urlsafe(12), True
```

- 只在 `users` 表为空（真正首次初始化）时写入；
- 自动生成时写 `backend/data/initial_admin.txt`（内容：用户名 / 密码 / 生成时间；`os.chmod(0o600)`），并 `logger.warning` 打一次"首次管理员密码已生成，见 <路径>，请登录后立即修改"；
- **种子只建 `admin`**，删掉 `user` / `guest` 两个种子（已 grep 确认 `backend/` 与 `backend/tests/` 无任何代码/用例依赖这两个账号，`guest` 只是登录失败时的 `currentAuthority` 字面量，与账号无关）；新用户由管理员创建；
- 种子的 `must_change_password` 置 1（见 c）。

**b) `user_add` 必须带密码（`mock_api.py:170-175`）**

```python
plain = (body.get("password") or "").strip()
if not plain:
    return fail("新增用户必须设置初始密码", 400)
pw_err = validate_password_strength(plain, username)
if pw_err:
    return fail(pw_err, 400)
```

前端 `UserForm.tsx:52`：新建态（`!isEdit`）密码项 `required`，编辑态保留"留空则不修改密码"。

**c) 首登强改标记**

- `users` 加两列（照 `db.py:270-285` `_migrate_user_logs_columns` 的写法：`PRAGMA table_info` + `ALTER TABLE`）：`must_change_password INTEGER DEFAULT 0`、`pwd_changed_at TEXT`；
- `login_account` 成功返回体加 `"mustChangePassword": bool(user.get("must_change_password"))`（`mock_api.py:93-101`）；
- `change_password` 成功后置 `must_change_password=0, pwd_changed_at=now`（`:284-286`）；
- 前端 `Login/index.tsx:124-137` 成功后若有该标记：`message.warning('当前为初始密码，请立即在「个人中心 → 修改密码」修改')`（**不阻断**，避免多做一个强制改密页）。

**d) 弱口令校验（新函数，放 `backend/app/security/passwords.py`）**

```python
_MIN_LEN = 8
_WEAK = {"12345678", "password", "bifang", "bifang.intronlink", "ant.design", "admin123", "qwerty123"}

def validate_password_strength(pwd: str, username: str = "") -> str | None:
    if len(pwd or "") < _MIN_LEN:
        return f"密码至少 {_MIN_LEN} 位"
    if pwd.lower() == (username or "").lower():
        return "密码不能与用户名相同"
    if pwd.strip().lower() in _WEAK:
        return "密码过于常见，请更换"
    return None
```

> 这是**校验黑名单**（命中即拒绝，不写入任何账号），不是默认值。若你判断"源码里出现旧口令字符串"仍算泄露，可改成只存 `sha256` 摘要比对。

接入点：`user_add`（`:173` 附近）、`change_password`（`:264-287`）、管理员重置分支（`:242-246`）。

**e) 存量库：把仍在用旧默认口令的账号标记强改**

源码不写旧口令明文，只写摘要（`sha256("bifang.intronlink")`）：

```python
_LEGACY_DEFAULT_SHA256 = {"dc455c7f96748d9656c54f967a11a25fa7168015b8f7551c0b235b3cdb8d66b8"}
```

登录成功分支（`mock_api.py:76-82`，与 `needs_rehash` 同处）：

```python
if hashlib.sha256(password.encode()).hexdigest() in _LEGACY_DEFAULT_SHA256:
    conn.execute("UPDATE users SET must_change_password=1 WHERE userid=?", (user["userid"],))
```

即"谁还在用旧默认口令，下次登录就被标记强改"；无需反推 bcrypt，也不在源码出现明文。

**f) 登录提示（前端）**

- `Login/index.tsx:118-141`：失败分支同时保留后端文案
```tsx
const loginRes = await login({ ...values, type });
const msg = loginRes.data;
if (msg.status === 'ok') { ... }
setUserLoginState({ ...msg, msg: loginRes.msg });   // ← 带上后端 msg
```
- `:217-224` 改为
```tsx
{status === 'error' && loginType === 'account' && (
  <LoginMessage content={(userLoginState as API.LoginResult & { msg?: string })?.msg || '用户名或密码错误'} />
)}
```
- `:235` placeholder → `请输入用户名`；`:257` → `请输入密码`；
- 9 个语言包：`pages.login.accountLogin.errorMessage` 统一为「用户名或密码错误」（英文 `Incorrect username or password`），`password.placeholder` →「密码」、`username.placeholder` →「用户名」；
- `README.md:32`、`bifang-req.md:22` 改成「首次启动见 `backend/data/initial_admin.txt`，或由环境变量 `BIFANG_SEED_ADMIN_PASSWORD` 指定」。

**g) 交付兜底（强烈建议，成本 10 行）**

一次性开关 `BIFANG_RESET_ADMIN_PASSWORD=<新密码>`：启动时若该 env 存在且 `admin` 用户存在，则重置其密码并把 `must_change_password=1`，然后打日志「已按环境变量重置 admin 密码，请从部署环境删除该变量」。客户忘密码时不至于锁死。

### 53.B.3 验收

1. `grep -rn "bifang.intronlink" backend/app frontend/src README.md bifang-req.md` **0 命中**（`__pycache__` 不计）。
2. 删库重跑：`backend/data/initial_admin.txt` 存在（0600），其中密码 ≠ 旧值；用该密码能登录成功。
3. 设 `BIFANG_SEED_ADMIN_PASSWORD=Test@12345` 重建库 ⇒ 密码就是它。
4. `POST /mock_api/user/add`：不带 password ⇒ 400「新增用户必须设置初始密码」；`password=123` ⇒ 400「密码至少 8 位」；`username=admin&password=admin` ⇒ 400「密码不能与用户名相同」。
5. 密码错登录 ⇒ 页面显示后端 `msg`（「用户名或密码错误」），且**页面任何位置都不出现密码字符串**；停用账号登录 ⇒ 显示「账号已停用」（不再被误报成密码错）。
6. 用旧默认口令登录一次 ⇒ 响应 `mustChangePassword=true`；改密后变 false。
7. `npm run test -- Login` 快照会因文案变化失败 —— 属预期，更新快照。

---

## 53.C 明确不做

1. **不动 `PPT_ITEM_DESC_MAX = 70`**：它与 `SliderDrawer.tsx:222` 的 `maxLength` 同源，是**模板版式容量约束**，放宽前必须先验 P17 等模板（见 24 章：凭感觉改 100 会溢出）。
2. **不做"精简失败自动切表格"**：切版式会改模板槽位数，属产品决策，只给提示。
3. **不做登录失败锁定/图形验证码**：本单只清明文与提示，防爆破单独开单（记债）。
4. **不重置现有账号密码**：只标记强改。本次实测 `admin/bifang.intronlink` 登录已失败，说明现网 admin 密码已被改过，**不要覆盖**。
5. **不在 `.env` 新增默认密码变量**：`BIFANG_SEED_ADMIN_PASSWORD` 为可选覆盖，缺省走随机。

---

## 53.D 教训（写进本章）

- **"非空即成功"是假成功的温床**：凡是"把 LLM 输出写回受限字段"的路径，判定条件必须是**目标约束本身**（`len <= dMax`），不是"有返回值"。同理，写回函数校验失败时**必须把失败原因抛给调用方**，不能 `return false` 了事。
- **提示词自相矛盾时先做 A/B，不要凭感觉调数字**：本次用 3 组口径共 13 次实测，一次定位到唯一阻塞项。单次观测不可信（噪声 σ≈9%~14%），但 112 vs 57 的差异远超噪声。
- **安全文案也是代码**：`(admin/用户名密码)` 这类"帮用户登录"的文案，本质是把凭据公开在页面上。删掉即可，不需要复杂方案。

---

## 53.E 下一单

本单完成后：**回 handoff 报告，然后停下，不要自选下一单**。

下一单 = **五十四（预览方案重构）**：方案已在 52.7 第 1 条写定（页图优先 + `extracts/<doc>.jsonl` 逐页文本降级，参考 docuMind），本章不改方案，**只把编号从原"五十三"顺延为"五十四"**。等你的 53 回执到了，WorkBuddy 再补写五十四章正文。
