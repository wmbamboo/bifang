# 《2026-09-29 doc-quality-plan》复核报告（WorkBuddy）

> 复核对象：`docs/2026-09-29-doc-quality-plan.md`（12,743 B，08:20 落盘）
> 复核方式：① 逐条核对方案给出的 file:line 锚点；② 解剖方案依据的两份 docx 原文（元数据/标题/表格/引用/数值/图）；③ 与仓库当前 HEAD（`a907b61`）+ 工作区未提交改动（Cursor 09-29 00:04 那批）对齐。
> 结论口径：方案**锚点真实度很高**（14 项锚点全部命中，见附录 A），但**层级判断有系统性偏差**——它把前端渲染链的能力缺口记到了后端账上，且 5 处根因与当前代码不符。若照原样开工，至少 3 个 PR 会白做或造成双套机制。

---

## 0. 一句话结论

| 任务 | 锚点真实？ | 层级对？ | 判定 |
|---|---|---|---|
| ①标题丢字 B1 | 锚点在仓库里存在，但**不是根因** | ✗（真凶在**前端**） | **改方案**：真凶已定位到 `ViewItem4Doc.ts:15-24` |
| ②实体闸 B2 | ✓ | ✗（"并入既有三道闸"不存在） | **先定层**：三道闸在 TS 前端，后端新建=第二套闸 |
| ③榜单排名 B3 | ✓ | △（结构化数据已在抽取层） | **可下沉**：不必新建 OCR 排序产物 |
| ④跨页去重 B4 | ✓ | ✗（假设的"按页循环"不存在） | **需重设计**：真实是 N 个并行无状态请求 |
| ⑤引用统一 B5 | ✓（唯一产出口核实无误） | ✓ | 可做，但**盲映射有错引风险** |
| ⑥占位符闸扩展 B6 | ✗（位置让 Cursor 自己 grep） | ✗（空表在模板、噪声在 OCR） | **拆成两处**，非一个 PR |
| ⑦图片编排 B7 | 锚点真实但与**已落地工作重叠** | ✗ | **重写**：真凶是 `AiOutlineGenDoc.tsx:258/268` 传空清单 |
| ⑧结论层 B8 | ✓ | ✓ | 可做，与②共用闸，顺序合理 |

**Bug 清单本身是对的**：B1/B2/B3/B4/B5/B6/B8 我都在 docx 原文里复现到了（见附录 B），只有 B7 的根因判断错。

---

## 1. 任务 ①（B1 标题丢字）——根因找错了坐标，但真凶已抓到

### 1.1 方案怎么写的
> 疑似根因正则：`backend/app/services/kb_service.py:1134`（硬编码 `商务男装...|衬衫/polo...` 主题匹配）

### 1.2 实测
`kb_service.py:1125-1134` 的真实身份是 `_scope_extras()`：

```python
def _scope_extras(src: str) -> list[str]:
    """定框范围「商务男装衬衫/polo衫」→ 整段 + 斜杠拆分，助召回品类页事实。"""
    ...
    matched = re.search(
        r"主题是【[^】]{0,120}?(商务男装[^】]{0,30}|衬衫/polo[^】]{0,10})", src)
```

它是**检索侧加词**用的（把范围串拆成召回关键词 append 进 extras），**只增不删**，既不碰标题、也不可能吃掉字符。它和 B1 唯一的关系是"都含 `衬衫/polo` 字样"——这是**字面同族、机制无关**。

并且：全仓库（前后端）搜不到任何"否定字符类"标题清洗正则：

```
frontend/src  replace(/[^  → 0 命中
backend/app   re.sub(r"[^ → 只有 kb_service.py:1037 / 1048（_take_short_name，抽查询专名用）
```

→ **后端整条链路都不碰标题**，`test_title_fidelity.py` 按方案写法无法复现 B1。

### 1.3 真凶（已实证）
前端 `frontend/src/components/DocUtil/ViewItem4Doc.ts`：

```ts
const charsToReplace=[
  "\_"," ","#",
  "＋","——","－",
  "1","2","3","4","5","6","7","8","9","0",   // ← 全部阿拉伯数字
  "一","二","三","四","五","六","七","八","九","十",  // ← 中文数字
  "I","II","III","IV","VI","VII",
  "第","部分","章","节","段",
  "：","Chapter"
]
const replaceCharsInString=(charsToReplace: string[], bigString: string)=>{
  charsToReplace.forEach((char) => {
    bigString = bigString.replace(new RegExp(char, 'g'), '');   // L34
  });
  bigString= bigString.replace(/[.*+-。:]/g,'')                 // L36
  return bigString;
}
const cleanString=(bigString: string)=>{ return replaceCharsInString(charsToReplace,bigString) }  // L39
```

调用点**正是标题**（`getChaptersFromContent` 里）：

```ts
currentChapter = new Chapter(chapterIndex, cleanString(chapterMatch[1]));   // L530 章标题
const paragraph = new Paragraph(paragraphIndex, cleanString(paragraphTitle)); // L540 段标题
```

我用同一规则跑样本，逐字符复现了 docx 里的现象：

| 输入标题 | `cleanString` 输出 | docx 实际 |
|---|---|---|
| 衬衫**200**元价格带表现 | 衬衫**元**价格带表现 | 「衬衫元价格带表现」✓ |
| 衬衫**TOP6**款式 | 衬衫**TOP**款式 | 同类现象 ✓ |
| **3C**配件大盘 | **C**配件大盘 | — |
| **第**一**章** 男装 | 男装 | — |

→ **B1 的数字侧 100% 是本函数**（前端、标题专用、编译进产物）。

### 1.4 但"polo 消失"这一半没被它解释
`cleanString` 实测**保留** `polo`（表里只有 `I/II/III/IV/VI/VII` 这些罗马数字，不含字母）。而 docx 里 18/18 条段标题全是纯中文、零 ASCII，正文却保留 `polo`×22、`200`×42 —— 说明**标题路径上还有一个只作用于标题的字母剥离**，或**大纲原文本身就没有 polo**。

两种可能的区分办法（**建议交给 Cursor，15 分钟可判**）：

1. 在 `KbOutlineGenDoc`/`AiOutlineGenDoc` 收到大纲 markdown 的入口 `console.log(content)`，生成一次，看**原始 LLM 大纲**里 `polo衫销量与销售额口径` 是否已丢字母；
2. 若是 → 属**模型/提示词**层（骨架未约束"标题保留字母数字品类名"），修法是提示词规则 + 保存期"标题字符保真"断言；
   若否 → 在下游按 `getChaptersFromContent` 前后逐段 diff，二分定位（`OutlineSelectDrawer`→`ViewItem4Doc`→`docxtemplater setData`）。

### 1.5 修正后的任务 1（建议直接替换原小节）

- 涉及文件：**`frontend/src/components/DocUtil/ViewItem4Doc.ts`**（不是 kb_service.py）
- 改法：
  1. `charsToReplace` 收缩：**只保留真正的序数/装饰符号**（`#`、`\_`、`：`、`Chapter`、罗马数字），删掉 `"0"-"9"`、删掉 `一~十`（这两个是数据，不是编号，`200元`、`¥100-200`、`第三象限` 全在误伤面）；
  2. 若要继续去"第一章/第2节"这类编号，改成**锚定前缀**的 `^(第\s*[0-9一二三四五六七八九十]+\s*[章节段部分]\s*)` 剥离，而不是全局字符删除；
  3. 加断言：`cleanString(title)` 前后做**字符集合差**，差集里出现 `0-9a-zA-Z` 即 `console.warn`（先 Warn 不拒单，与八·3 的 code 语义一致）。
- 验收改到前端：新增 `frontend/tests/docTitleFidelity.test.ts`（对齐仓库金样本风格，挂进 `ci.yml` 第 29 行那个 `--testPathPattern` 清单），断言 `polo衫销量与销售额口径`、`衬衫200元价格带表现`、`3C配件大盘` 经 `getChaptersFromContent` 往返后逐字符一致。

---

## 2. 任务 ②（B2 实体闸）——"并入既有三道闸"不成立，先定层

- 方案说"并入既有三道闸体系，作为第四道『实体闸』"，落点 `backend/app/services/fidelity_gate.py`（新建）。
- 实测：**仓库里"三道闸"是前端 TS**，后端没有任何闸：
  - `frontend/src/components/DocUtil/outlineEvidenceValidate.ts`（46 KB，数值忠实/实体口径判定，含 `ENTITY_SHIRT`/`ENTITY_POLO`/`CATEGORY_TITLE_RE`）
  - `frontend/src/components/DocUtil/PptProductGate.ts`（成品闸）
  - 后端搜 `占位符闸|gate_report|data_gate|coverage_gate` → **0 命中**（后端只有 `extract_service.py:213` 的"占位名 warning"，层级完全不同）
- 所以原方案落到后端 = **另起第二套闸**，会出现两处数值/实体规则各自演化（这正是过去几天反复踩的坑：同一件事两套规则、一处改了另一处漏）。
- 另外，实体闸需要的证据在**前端就有**：后端返回的检索结果带 `⟦chunk:{id}|page:{p}|src:{source}|assets:…⟧` 边界标记（`kb_service.py:921-927`），前端 PPT 侧早已在消费这套标记做同块校验。
- **建议**：把"实体-口径三元组"规则加进 `outlineEvidenceValidate.ts` 的既有判定（复用其数值/实体抽取），证据取 `⟦chunk⟧` 标记；只有在**需要后端在写之前就拦住**时才下沉（那时也应抽公共规则表，而非两套）。
- `fidelity_gate.py` 若要建，也只承载**后端独有**的东西（如 OCR/抽取层结构）。

---

## 3. 任务 ③（B3 榜单排名）——不必新建 OCR 排序产物

- 锚点真实：`ocr_service.py:220 pair_label_pct_lines`、`:237 enrich_vl_chart_boxes` 都存在。
- 但"标签-百分比配对"在**上一层已经有**：`table_structure.py:681` 已有 `([\u4e00-\u9fffA-Za-z]{1,12})\s*\n\s*(\d+(?:\.\d+)?\s*[%％])` 的成对抽取，`table_structure.py:352` 已有排序。
- docx 里也证实结构化属性表**已经进到检索结果**：表12「维度|属性|销量占比」8 行、表13「图案花纹|占比|面料材质|占比」6 行 —— 数据在，缺的是**"首位/第一"这类断言没有对着它核**。
- **建议（更省的顺序）**：第 1 步改判定（正则捕 `位居首位|排名第一|是第一|最大`，与同段共现的百分数取 max 比对，冲突即改写/拦），落在既有闸里；第 2 步若发现"条形图没出数/顺序丢了"才去动 OCR 侧落排序 JSON。**先验数据、再改采集**。

---

## 4. 任务 ④（B4 跨页去重）——方案假设的运行形态不存在，必须重设计

方案写：

> `retrieve_for_writing` 增加 `used_chunk_ids: set[str]`（**跨页调用方透传，全文生成器按页循环时累计**）

实际调用形态（`AiOutlineGenDoc.tsx:252-287`、`KbOutlineGenDoc.tsx` 同构）：

```ts
for (let chapter of chapters) for (let paragraph of chapter.paragraphs)
  promiseArr.push(axios.post(url, buildMsg(paragraph.prompt + …)));   // 每段一个 HTTP
...
Promise.allSettled(promiseArr.map(...))     // ← 全部并行
```

- 即：**后端每次请求都是无状态的单段检索**，"全文生成器按页循环"在后端根本不存在；并发下也没有确定的先后，`used_chunk_ids` 无法被后端累计。
- 三个可行方向（择一，别按原方案写）：
  1. **前移约束**：客户端把"本段专有查询词"做得更可分（现检索靠段标题，段标题系统性地丢了数字/字母——**和 B1 是同一个根因的连锁后果**，B1 修完重复可能自己下降）；
  2. **后端加会话级去重**：请求里带 `gen_session_id`，后端在会话内维护已用 chunk（需接受并发下的近似去重）；
  3. **客户端收集**：段 1 完成后把 `chunk_id` 列表回传给后续请求（需把并行改成"分批有限并发"，会牺牲速度）。
- `cosine>0.92` 阈值本身没问题，但方案里"同一 chunk_id 全文最多命中 1 次"要配**兜底**：某页唯一证据就是那条 chunk 时不能饿死（改为"第 2 次命中降权，不删"）。

---

## 5. 任务 ⑤（B5 引用统一）——锚点对，但盲映射会造出错引

- 锚点核实无误：`kb_service.py:929` 确实只有一处产出 `[文档{i}] 来源：{source}{loc}`，且 `ref_docs` 同处构造（`id/title/source/kb_name/chunk_id/page/asset_ids`）。
- docx 实测确为两套并存：文件1 `[文档N]`×8 + 裸 `[N]`×78；文件2 `[文档N]`×0 + 裸 `[N]`×65。
- **风险**：裸 `[N]` 是模型自己的编号习惯，**未必**与检索序号一致。方案写的"映射为 `[文档\1]`""两套编号同时存在时以 `[文档N]` 序列为准重建映射表"——这是一个**没有依据的假设**，一旦错位就把正确引用改成错误引用（比不统一更糟）。
- **建议**：(a) 提示词层禁掉裸引用（最省、最稳）；(b) 后处理只做**能判定的**：同一文档内既有 `[文档2]` 又有 `[2]` 且上下文同源时才归一；(c) 无法判定 → **删除**裸引用而不是猜测映射，并把删除数写进 report。

---

## 6. 任务 ⑥（B6 空表/噪声）——一件事拆成两处，不是一个 PR

- 方案自己也没定位到实现："占位符闸实现位置（grep `占位符闸` / `gate` 定位）"。实测该闸不在后端（见 §2）。
- 而 B6 的两个子项**分属不同层**：
  - **27 行全空表**（文件1 表3 = 模板里的「文档修改记录」，非空行仅表头）→ 在 **docx 模板**里，方案说的"在 docx 模板里直接移除"是对的、也是最省的（改 `frontend/public/docTemplate-simple.docx` 即 `[Content_Types]/document.xml` 层面的手术，与 PPT 模板改造同一套做法）；
  - **OCR 噪声词**（`激情增高` 两份都出现 1 次）→ 属**抽取/后处理**层，噪声词表放 `backend/app/config.py` 或前端后处理都行，但要明确 `config.py` 是否被前端读到（前端读的是 `frontend/src/data/corpusProfiles/*.json` 那一套，注意别建成第三份配置）。
- **建议**：拆成 (a) 模板手术（无代码）+ (b) 空表/噪声渲染期检查（前端 `DocBlockInjector`/saveDoc 侧，与七·7 的"图片缺失不静默丢"同风格）。

---

## 7. 任务 ⑦（B7 图片编排）——**与 09-29 00:04 已落地的工作重叠，必须重写**

### 7.1 方案怎么写的
> 现状盘点：资产层**已存在**……缺口只在生成侧注入与渲染端嵌入。
> 7a `add()` 的 `metadatas` 增加字段 `page_assets`；7b 写作 prompt 追加【可用图片】段 + `![图：…](asset:{asset_id})`；7c 渲染端解析 `asset:` URI → `resolve_asset_path`。

### 7.2 实测（这是全篇最重要的一处）
三件事**已经做完**，且用的是一套**和方案不同的契约**：

| 方案以为缺 | 实际 |
|---|---|
| chunk 没挂资产 | `kb_service.py:921` `asset_ids = _sort_asset_ids(meta.get("asset_ids"))`，:923 吐 `⟦chunk:…\|src:…\|assets:a,b⟧` **已有** |
| 生成侧没注入图片引用 | `frontend/src/components/DocUtil/docFigureAssets.ts`（**注释里直接写着"九·2"**）已提供 `buildFigureAssetAppendix` / `figureAssetsFromAssetList` / `figureAssetsFromKbDocs`；`KbOutlineGenDoc.tsx:254` 已在段落 prompt 里拼【可用插图资产】 |
| 渲染端不支持 | 不支持的是**旧的 `asset:` 设想**；实际契约是 ```figure 围栏 + `ref: kb:<fileName>/<assetId>`，`DocBlockInjector.ts`（16 KB）+ `resolveBlocksToPayloads` + 注入 `fetchKbAsset` 已实现，`AiOutlineGenDoc.tsx:188-197`/`KbOutlineGenDoc.tsx:204-213` 都在调用 |

Cursor 自己的交接（`.workbuddy-handoff.md` 末章）也确认："九：Ai 页补 kbName+fetchKbAsset；Kb/Ai 段落 prompt 拼【可用插图资产】"。

### 7.3 所以"文档零图"的真实原因
两份 docx 实测：`media` 空、`w:drawing` 0、`asset:` 0、`图片缺失` 0。原因不是"渲染端不支持"，而是：

1. **智能文档页把清单写死成空**：`AiOutlineGenDoc.tsx:258` 与 `:268`
   ```ts
   buildFigureAssetAppendix([])   // ← 空数组 ⇒ 走"无可用资产，不要写 figure"分支
   ```
   `docFigureAssets.ts:78-82` 明确：空清单 → 硬约束**禁止写 figure**。所以智能文档页**结构性地**不可能出图。对照 `KbOutlineGenDoc.tsx:245-255` 是有真实清单的（`figureAssetsFromAssetList(list,12)`）→ 该页才有出图可能。
2. **知识库页也没出图**：文件2 的 `[Content_Types].xml` 已有 `png Default`（说明注入器跑过、且判定需要图片），但 `w:drawing`=0 —— 属另一条待查线索（清单为空 / 模型没写围栏 / 锚点数≠块数导致整篇放弃）。**建议 Cursor 先在 saveDoc 打印 `blockLists.length`、`payloads` 与 `inj.warning`**——注入器失败是不静默的，`message.warning` 会弹。
3. Cursor 已自陈的风险（同为图片质量隐患）：**"资产清单目前用 listAssets 全库前 12 条（非段落级检索）"** → 这正是**图张冠李戴**的温床（第五章已踩过一次"按下标取图"）。

### 7.4 修正后的任务 7（建议替换）
- **7-0（一行级，先做）**：`AiOutlineGenDoc.tsx:258/268` 的空清单换成与 Kb 页同源的清单（或明示"智能页无源文档 ⇒ 不出图"作为产品决策）。
- **7a′（原 7a 的正确版本）**：**不是"新增 page_assets 字段"**，而是把已存在的 `chunk.metadata.asset_ids` 变成**段落级**筛选（按页/按 chunk 取资产），替掉"全库前 12 条"。这是"图配错"的根治项。
- **7b′**：删掉 `asset:` 内联 URI 设想，**统一到 ````figure` + `kb:<fileName>/<assetId>`**（七章已落地的契约）；提示词里【可用插图资产】段保留。
- **7c′**：渲染端**无需新建**；只补"终稿 `ref` 必须可 resolve，不可 resolve 拦截"的校验（这一条方案是对的）。
- **验收**：可完全复用我已跑通的离线样本思路（`frontend/tests/DocBlockPreview.test.ts` 用真实 KB 图 + `upload:` 生成 docx 并断言 EMU 分支），**不必依赖 UI 目检**。

---

## 8. 任务 ⑧（B8 结论层）——可以做，注意两点

- 锚点真实（写作模板/模式确在 `kb_service.py:1620+` 的 `_TASK_SUMMARY`；注意该表目前是 **PPT 视角**的 `outline/slide/outline_slide_fill` + 一个极薄的 `paragraph`——给 Word 加"结论与建议"槽要连带这条链的层归属一起定）。
- "结论数值必须 ⊆ 已通过实体闸的三元组集合"：方向正确，但**依赖②先定层**（闸在哪一侧决定这个集合存在哪一侧）。
- `（推演）` 标记思路好：注意"推演句"要同时禁止引入新材料没有的数字与周期（与 PPT_DOMAIN_PACKS 里 `selection` 的既有约束对齐）。

---

## 9. 工程配套的三处修正

1. **CI**：`ci.yml` 后端步骤（L48-51）确实全量跑 `backend/tests/`，新增 `test_*.py` 自动生效 ✅ 不用改 workflow。但——
   - **前端新增的闸/金标测试必须加进 L29 的 `--testPathPattern` 清单**，否则只在 L31 全量跑里兜着（"必看闸"的语义会丢）；
   - "`gate_report.blocked_count > 0` 则 CI 红"：CI 里没有运行时产物，只能**由测试用 fixture 现场生成 report 再断言**。措辞要改成"测试内断言"。
2. **`fidelity_gate.py` 不存在**（已核实），方案标注"新增"没问题；但 §2 说的定层问题在先。
3. **`workbuddy-review.mdc` 增补规则**：可行。注意该文件是 **Cursor→WB 的交接规则**（`alwaysApply`），加"涉及写作链路必须同步更新 gate 测试"没问题，但**不要**往这里塞 WB→Cursor 的内容（那是 `workbuddy-task.mdc` 的职责）。

---

## 10. 建议的 Cursor 执行顺序（修正版）

```
批次 A（立即可做，锚点已核实、无层级争议）
  A1 任务① cleanString 收缩 + 前端标题保真断言（改 ViewItem4Doc.ts，非后端）
  A2 任务⑦-0  AiOutlineGenDoc 空清单（一行）
  A3 B1 字母侧二分（§1.4 的两步，先定性再改）
批次 B（先定层再动）
  B1 任务② 定层：实体-口径三元组进 outlineEvidenceValidate（或抽公共规则表）
  B2 任务③ 排名断言（先改判定，再决定是否动 OCR）
  B3 任务⑤ 引用统一（禁裸引用优先，删除而非盲映射）
批次 C（需设计）
  C1 任务④ 去重（先定"会话级/客户端"路线，再写代码）
  C2 任务⑥ 拆两处：模板空表手术（无代码）+ 渲染期检查
  C3 任务⑦ a′/b′/c′ 重写版
批次 D
  D1 任务⑧ 结论层（依赖 B1 的定层结论）
```

**废弃/合并**：原 7a（新增 `page_assets`）→ 并入 7a′；原 7b 的 `asset:` 内联 URI → 废弃；原任务 1 的后端落点 → 改前端；原任务 4 的 `used_chunk_ids: set[str]` 签名 → 重设计。

---

## 附录 A · 锚点核对（14/14 命中）

| 方案引用 | 实测 | 结论 |
|---|---|---|
| `kb_service.py:74` `add(chunks, metadatas, vectors)` | 同签名 | ✓ |
| `kb_service.py:176` `search` | `def search(` | ✓ |
| `kb_service.py:492` `extract_page_assets` | 命中 | ✓ |
| `kb_service.py:517` `list_doc_assets` | 命中 | ✓ |
| `kb_service.py:678` `resolve_asset_path` | `(kb_name, file_name, asset_id) -> Optional[Path]` | ✓ |
| `kb_service.py:929` 唯一引用产出口 | `contexts.append(f"[文档{i}] 来源：{source}{loc}\n…")` | ✓ |
| `kb_service.py:1134` 硬编码主题正则 | 存在但是 `_scope_extras` 检索加词 | ✗ 非根因 |
| `kb_service.py:1206-1262` 检索侧路由 | 命中（`【本页标题】/【大纲要点】/文章标题是` 三路由） | ✓ |
| `kb_service.py:1324` `retrieve_for_writing` | 命中 | ✓ |
| `kb_service.py:1629` 写作 prompt 各模式 | `_TASK_SUMMARY` 起始区 | ✓ |
| `kb_service.py:1677` 口径对齐 prompt | 【口径对齐】段位于该表 `outline_slide_fill` 内 | ✓ |
| `ocr_service.py:220` `pair_label_pct_lines` | 命中 | ✓ |
| `ocr_service.py:237` `enrich_vl_chart_boxes` | 命中 | ✓ |
| `ocr_service.py:351` `crop_element_assets_from_page` | 命中 | ✓ |
| `app/scripts/backfill_element_assets.py` | 存在 | ✓ |
| `tests/test_kb_assets_api.py` | 存在（另有 `test_element_crop.py`/`test_ocr_chart_box.py`） | ✓ |
| `fidelity_gate.py` | 不存在 | ✓（待新建） |
| `ci.yml` 有 pytest 步骤 | L48-51 `PYTHONPATH=. python -m pytest tests/ -v` | ✓ |

## 附录 B · 两份 docx 解剖（复核依据）

以 `C:\Users\zelin\Desktop\` 下两份产物为样本：

| 指标 | …爆品选品-Ai-v2026829.docx（00:10） | …选品分析-Ai-v2026829.docx（09:03） |
|---|---|---|
| 体积 / 表数 | 55 KB / 16 表 | 47 KB / 10 表 |
| `word/media` | **无** | **无** |
| `w:drawing` | 0 | 0 |
| `png Default` 声明 | False | True（注入器跑过） |
| 标题 ASCII 字符 | **0**（18/18 全中文） | **0**（14/14 全中文） |
| 正文 `polo` / `200` | 22 / 42 | 17 / 31 |
| `[文档N]` vs 裸 `[N]` | 8 : 78 | 0 : 65 |
| 空表 | 表3 = 27 行/非空 1（模板「文档修改记录」） | 表3 = 27 行/非空 1（同） |
| 同形价格带表 | 表5/8/10/11（列序互异）+ 表9 | 表5/6/7 |
| B2 实证 | `403.7万` 同文既作「销量TOP6」又作「销售额TOP6」 | 同 |
| B3 实证 | 「落肩袖以 15.06% 位居首位」与「常规袖占 79.76%」并存在同一节 | 同 |
| B6 实证 | `激情增高`×1 | `激情增高`×1 |

（B7 的"零图"见 §7.3；B8 缺结论章：两份均为 4 章、均无「结论/建议」章。）

## 附录 C · 落盘位置提醒

用户提到方案"落盘两处：工作区 `bifang-doc-quality-plan.md` + 仓库 `docs/2026-09-29-doc-quality-plan.md`"。实测**工作区那份不存在**（`C:\Users\zelin\WorkBuddy\2026-09-24-12-08-46\` 根目录只有 `.workbuddy/ review/ scripts/`）。若需工作区副本，请从仓库复制一份，或直接以仓库那份为准（Cursor 本就能读仓库）。


## 11. 用户新反馈：方案的问题域不对准（2026-09-29 上午补，先读这节）

用户手动对比「WorkBuddy 生成的文档」与「毕方生成的文档」，给毕方列了五个症状：

1. 章节构成不知所云　2. 目标模糊　3. 没有结论　4. 没有替换为选品师角色思考　5. 内容大量重复

逐条对号（证据见附录 B 与本节实测）：

| 症状 | 方案里对应谁 | 覆盖度 | 实测证据 |
|---|---|---|---|
| 章节不知所云 | 任务①(B1 丢字) 擦边；真正的机制在**八·5 体裁包**（不在本方案内） | 半个 | 标题实证：`衫销量与销售额口径`、`衬衫元价格带表现`（`ViewItem4Doc.ts:15-24` 的 `charsToReplace` 吃掉数字与「polo」）；两篇成品的章节都是同构 4 章「大盘 / 价格带 / 属性 / 店铺」＝**材料维度罗列**，不是决策链 |
| 目标模糊 | **无任务** | 0 | 段落 prompt ＝ 标题＋字数（`ViewItem4Doc.ts:668-671`），无读者视角、无本章要回答的问题 |
| 没有结论 | 任务⑧(B8) | 半个（落层错） | 两篇均 4 章、均无「结论/建议」章；⑧ 的落点写在后端写作 prompt，而 docx 由**前端**渲染 |
| 无人设 / 选品师角色 | **无任务** | 0 | doc 分支 `role: role.trim() \|\| '读者'`（`OutlinePromptComposer.tsx:840`）；`DOC_DOMAIN_PACKS` 无 selection；段落 prompt 不含岗位 |
| 内容大量重复 | 任务④(B4) | 半个（机制不成立） | 表5/6/8/10/11 同形、列序互异；§1.2/1.3/2.3/2.4 复述同一组数字 |

**一句话结论：8 个任务里只有 ⑧ 直击叙事质量，①②④ 擦边，其余 5 个都是「数字可信」类。方案全做完，文档依然会目标模糊、无人设、无结论章。**

### 11.1 共同根因（新增，任何方案里都没有）

段落写作 prompt 是「文章标题 ＋ 章名 ＋ 段名 ＋ 200~400 字」的最简式：

```ts
// frontend/src/components/DocUtil/ViewItem4Doc.ts:668-671  (setAllPrompt)
let prompt =
  `文章标题是<${pptTitle}>，请为它的【${chapter.title}】章节中的段落： [${paragraph.title}]撰写大约200~400个字左右的具体内容。` +
  `直接输出正文，不要以「根据知识库内容」等套话开头。`;
```

四项缺席：① 读者/岗位视角；② 本章要回答的问题；③ 与相邻段的分工边界（"别重复前段说过的"）；④ 全文结论归谁。
且每段一次独立并发 `axios.post`（`AiOutlineGenDoc.tsx:258`、`KbOutlineGenDoc.tsx:292`），**段间互不可见** →

> 「目标模糊 + 无人设 + 大量重复」三条症状同一个根，都在段落 prompt 的组装处，不在检索、不在闸门。

### 11.2 本轮附带实测到的四个新 bug

1. **doc 体裁包被自己的默认值短路**：`inferDocDomainPack`（`OutlinePromptComposer.tsx:596-607`）`if (forced && DOC_DOMAIN_PACKS[forced]) return forced;`，而调用点 L839 传的是 `{domainPack: docPack}`，`docPack` 默认 `'generic'` 恰好是合法值 → **正则推断永不执行**，doc 永远走 generic。八·5 落了代码但机制实际失效。
2. **`DOC_DOMAIN_PACKS` 没有 selection**：只有 generic / report / research / review。PPT 侧有 `PPT_DOMAIN_PACKS.selection`（含"推演不得引入材料没有的数字与周期"）。选品主题在 doc 侧拿不到选品骨架。
3. **`role` 默认 `'读者'`** 且被原样写进 user message（"面向岗位：读者。"）—— 对选品类主题是反向误导。
4. **`markdown_init` 是遗留 6 章样板**（`AiOutlineGenDoc.tsx:28`、`KbOutlineGenDoc.tsx:34`）：用 `* 1.1` 兼容写法（正好触发 `checkChapter` 的 warn 分支），且「六、总结评估」下的内容是「考察选品师能力 / 抒达能力测试」——与文档目标无关，还会被标题清洗吃掉数字。

### 11.3 建议新增「批 0 / 任务 9：文章质量层」（全无 UI 依赖，可与批 A 并行）

- **9.1 段落 prompt 四要素**：在 `setAllPrompt`（`ViewItem4Doc.ts:662`，签名已带 `format_prompt`）再加一个 `ctx` 参数：`岗位（role）＋ 本章要回答的问题 ＋ 相邻段边界（列出本章其他段题并注明"勿重复"）＋ 结论归属`。同步改两处调用点。**一条同时治"目标模糊＋重复＋无人设"。**
- **9.2 补 selection 体裁包 + 修短路**：`DOC_DOMAIN_PACKS` 增 `selection`（骨架建议：**机会面 → 证据对照 → 风险与不选什么 → 选品结论与动作**）；`inferDocDomainPack` 改为「只有用户显式选择才 forced」，默认值传 `undefined`。
- **9.3 结论章进骨架**：`DOC_OUTLINE_SKELETON` 增「末章须为结论/建议类，且不得重述前章同一组数字」；`checkChapter` 配一条 **Warn（不拒单）**。
- **9.4 重复的根治要看 9.1**：任务④只改检索去重治不了根本（段间互不可见，同一 chunk 会被多个段各自召回到）。必须叠加 9.1 的边界声明 ＋ 大纲阶段段题互斥的可执行校验（`DOC_OUTLINE_SKELETON` 已有此句但无校验）。

### 11.4 给 Cursor 的合并建议

把「任务 9」并入**批 A**（9.1 / 9.2 全无 UI 依赖，且是用户抱怨的直接对症项）；9.3 与八·3 的 `checkChapter` 改动同批；9.4 与任务④同批重设计。

---

## 12. 「材料池 + 分段分配器」节的独立复核（2026-09-29 补）

用户提出「**分段生成不是病因，分段检索才是**」的分析并要求补进方案。补入前我逐条核了它引用的锚点——**机制判断正确，但有两处说法需改写**。方案已改：任务 4 加「语义已修正」块并降为子步骤，另新增 **任务 4B**。

### 12.1 核对通过（锚点实测命中）

| 断言 | 实测 | 判定 |
|---|---|---|
| `routers/chat.py:98-112` 每请求一次检索 | `:103-112` 即调 `retrieve_for_writing` | ✅ |
| `kb_service.py:1206-1246` 解析「【本页标题】/【大纲要点】」 | 确为该分支；**且内含领域硬编码**（见 12.3） | ✅ |
| `kb_service.py:1461-1469` `merged`/`seen` 为局部 | 确认，返回即销毁 | ✅ |
| `kb_service.py:1596` 单段上限 14 | `merged[: settings.writing_context_limit]` | ✅ |
| `config.py:50 = 14` | 确认 | ✅ |
| 跨调用零状态 | grep `used_chunk\|seen_chunk\|chunk_ledger` = **0 命中** | ✅ |
| `kb_service.py:1324` 签名无账本参数 | 确认（7 参，无 `exclude_keys`） | ✅ |
| `kb_service.py:1271` `_doc_key` | `kb_name\|source\|chunk\|head[:48]` | ✅ |
| `kb_service.py:1627-1692` 规则行 | `:1641 / :1643 / :1659 / :1660 / :1671 / :1677` 全部命中 | ✅ |
| `chat_service.py:94-99 / :128-132 / :157-160` 写回存在 | 确认存在（但语义见 12.2a） | ✅ |

### 12.2 必须改写的两处

**（a）`ret_docs` 是"空插座"，不是"现成数据"**
原分析：「`chat_service.py:128-132` 已经把每一轮检索到的 `ret_docs` 持久化进 `chat_msgs.extra`——现成有，只是没人读」。实测全仓（忽略大小写）grep `last_acc_docs|ret_docs` **只命中 `chat_service.py` 自身**：

- **无生产者**：前端 **0 处**发送 `last_acc_docs`（`bat_add_msgs` 的入参由 `routers/chat.py:236` 透传 `body`，前端从不带此字段）→ 该 `if` 分支实际**永不进入**；
- **无消费者**：后端 **0 处**读取 `ret_docs`；
- **粒度也不对**：写回在 `for msg in messages` 循环内，把**同一个** `last_acc_docs` 盖到**每一条** assistant 消息上——"单块"而非"按页"。

→ 正确表述：**JSON 槽位与写回钩子现成，数据没有、粒度也不匹配**。方案 4B.4 已按此改写，并补了"不落库、仅前端一次流程内驻留"这个更小方案。

**（b）「生成第 N 页前读历史账本」没有执行点**
原分析的最小改动写「生成第 N 页前，读同会话历史 assistant 消息的 `extra.ret_docs`」。实测前端是**全并行**：

- `AiOutlineGenDoc.tsx:250-287`：双重 `for` 把**所有**段落的 `axios.post` push 进 `promiseArr`，最后一次性 `Promise.allSettled` → 同一 tick 全部发出，**不存在"第 N 页之前"**；
- `KbOutlineGenDoc.tsx:321` 同形；
- 且本批消息要到批结束才落库（`bat_add_msgs` 是整会话 `DELETE` + 全量重插），生成期间**历史里没有本批**。

→ 跨段协调只能落在**阶段 2 一次算完**，或**合并成新端点**。方案 4B.3 已加 ⚠️ 块列明两条禁令（不要读历史账本 / 不要放模块作用域）。

### 12.3 额外查到的第三条（原分析未提，对 4B 是决定性的）

`kb_service.py:1215-1246` 的页级路由**本身就是领域硬编码**：

```
if title and "大盘" in title and "男装大盘" not in extras: extras.append("男装大盘")
... 男士衬衫 / polo衫 / 价格带 / 面料|材质|属性|图案|厚薄|袖型 的显式分支
```

→ 分配器若直接复用 `plan_writing_retrieval` 做"章节→片段"打分，会把这套**服装领域词表固化成架构的一部分**（与 B1 同族的"换品类就要改代码"）。已写入方案 **4B.6 陷阱**，并把"分配打分**不 import 领域词表常量**"列为 **4B.7.4** 验收项。

### 12.4 与既有结论的一致性

- 与 **§3**（任务④原方案不成立）一致：原④把状态放在 `kb_service.py:1324` 函数内部，"作用域活不过一次请求"。本节把这条从"不成立"细化为：**必须由调用方持有，而调用方当前是全并行、根本没有循环**。
- 与 **§11**（文章质量层）互补不重叠：§11 治"段间互不可见 → 目标模糊/无人设/重复"的**写作侧**；4B 治"材料未全局分配 → 重复召回"的**检索侧**。两者需**同时做**才能真正消灭重复（§11.4 已注明）。
- 归因边界（4B.0）与 §3 的分批一致：B1/B3/B5/B6 不属检索架构问题，仍留在原任务。

### 12.5 落盘位置

- **方案**：`docs/2026-09-29-doc-quality-plan.md` → 任务 4（语义修正块 + 实测事实表）、**任务 4B**（新增，4B.0–4B.7）、执行顺序（`PR6=4B → PR7=任务4`）、使用方式（+2 条）。
- **交接通道**：`.workbuddy/workbuddy-to-cursor.md` **第十二章**（Cursor「按交接做」会读到）。
