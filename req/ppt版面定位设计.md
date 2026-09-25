## 版面定位
版式位置不是运行时扫占位符找出来的，而是写死在 `frontend/src/components/DocUtil/PptTemplate.ts` 的 `pptPage` 里。页码就是模板文件 `pptTemplate-simple.pptx` 里的幻灯片序号，对应压缩包里的 `ppt/slides/slide{N}.xml`。

定位公式在 `getTemplatePageNumber`：

- 封面、章节分隔页、尾页直接取固定页码。
- 目录和列表按「项数 + 风格」算页码：`页码 = 风格序号 × 3 + (项数 - 3) + 起始页`。项数只认 3、4、5。
- metric / columns：`页码 = start + (槽位数 - 2)`，槽位 2～5。
- metric_columns：2～5 卡 + 2 栏 → 32～35；5 卡 + 3 栏 → 36。

当前这套模板的对照是：

| 版式 | 模板页 | 说明 |
|---|---|---|
| 封面 `cover` | 第 1 页 | 固定 |
| 章节分隔 `chapterCover` | 第 2 页 | 已登记 |
| 目录 `catalog` | 第 3–5 页 | 3 / 4 / 5 章，只有 1 套风格 |
| 内容 `list` | 第 6–23 页 | 6 套风格，每套连续 3 页（3、4、5 个小项） |
| 数据卡 `metric` | 第 24–27 页 | 2 / 3 / 4 / 5 卡 |
| 分栏 `columns` | 第 28–31 页 | 2 / 3 / 4 / 5 栏（每栏最多 5 条短条目） |
| 复合 `metric_columns` | 第 32–35 页 | 2～5 卡 + 2 栏 |
| 复合 `metric_columns` | 第 36 页 | 5 卡 + 3 栏 |
| 未使用 | 第 37–41 页 | `restSlide` |
| 尾页 `tail` | 第 42 页 | 固定 |

**成稿页数与模板页数解耦**：下载时从模板**按需复制版式页**再灌数；`presentation.xml.rels` / `sldIdLst` / `[Content_Types].xml` 按生成页序重建。成稿可以多于或少于模板的 42 页；`slideMax` 只表示模板里有多少可选用的版式页。

列表那一段可以按风格展开：

- 风格 0：第 6、7、8 页（3、4、5 项）
- 风格 1：第 9、10、11 页
- 风格 2：第 12、13、14 页
- 风格 3：第 15、16、17 页
- 风格 4：第 18、19、20 页
- 风格 5：第 21、22、23 页

---

## 占位符速查

### list（已用）

- 页：`{slideTitle}`
- 小项：`{vItem.itemN}` + `{vItem.itemN_Desc}`（标题 4～12 + 描述 20～70）

### metric（第 24–27 页）

- 页：`{slideTitle}`
- 卡：`{vItem.itemN}` = **原数字**，`{vItem.itemN_Desc}` = **短口径**（4～16 字）
- N = 1…2 / 3 / 4 / 5

### columns（第 28–31 页）

- 页：`{slideTitle}`
- 栏：`{colNTitle}` `{colNSub}`（Sub 可选）
- 栏内：`{colN.itemM}`（短词；不强制 Desc）；每栏模板预留 item1…item5
- N = 栏序号 1…2 / 3 / 4 / 5

### metric_columns（第 32–36 页）

- 上半：`{vItem.item*}` + `{vItem.item*_Desc}`（同 metric）
- 下半：`{col*Title}` `{col*Sub}` `{col*.item*}`（同 columns）
- 32～35：2～5 卡 + 2 栏；36：5 卡 + 3 栏
