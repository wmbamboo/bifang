# 反馈闭环 · 需求文档（P0 可测试版）

> 日期：2026-10-21　提出人：产品（LTC 项目方案 + 录屏）　承接：毕方
> 依据：`feedback-analytics` / `tracking` skill 与 `workflow.md` 铁律（需求未确认不写代码）
> 目标读者：产品（提缺陷/建议）、开发（Cursor）
> 状态：**三个决策点已于 2026-10-21 由用户拍板，见第十节**；仅剩 SMTP 凭据待提供（不阻塞 P0 主体）

---

## 一、做什么

在毕方加一条**能从界面提交缺陷/建议、并能看到处理状态回传**的闭环。第一期不做用户行为分析，只做「提得进、看得见、追得到」。

一句话验收：**产品同事打开任意页面，三步内提交一条带上下文的缺陷，并能看到它从「待处理」走到「已修复」。**

## 二、为什么这样做（而不是照搬 LTC 全套）

LTC 的方案是三段：`埋点 → AI 洞察 → 建议转需求`。毕方现在一段数据都没有，直接上三段会有两个问题：
1. 埋点从零接、AI 洞察没有样本可分析，**产品同事第一周拿不到任何东西**；
2. 产品同事的原话是「先加上，这样我能加入测试，提缺陷或建议」——他要的是**入口**，不是分析报告。

所以第一期切在「提交 + 回传」，埋点与 AI 聚类放二期（见第七节）。

### 与 LTC 最大的差异：反馈对象不是「页面」，是「一次生成任务」

LTC 是企业内部系统，页面行为确定，`page + content` 就够复现。
毕方是**概率性生成**（同一提示词每次产出不同），只写「图配错了」无法复现。因此每条反馈必须自动携带**生成上下文快照**：

| 字段 | 来源 | 为什么必须 |
|---|---|---|
| `gen_id` | 生成开始时前端生成 uuid，随每段请求带上 | 把同一批生成的 13 段/12 页串起来 |
| `gen_type` | `kb-doc` / `ai-doc` / `kb-ppt` / `ai-ppt` | 四个页面链路完全不同 |
| `outline_id` | `outlineRecs` 记录 id | 能回到那次大纲 |
| `target_key` | 段序号（doc）或 `slide.key`（ppt） | 定位到「哪一段/哪一页」 |
| `prompt_hash` + `model` + `temperature` | 生成请求参数 | 换模型/改提示词后可对比 |
| `asset_ref` + `allowed_refs` | `paragraph.blocks[].assetRef` / `allowedFigureRefs` | **图配错时唯一可定位的证据** |
| `doc_file` + `mtime` | 用户导出的文件名 | 与产物对账（判新旧只看 mtime） |
| `console_tail` | 最近 50 条 console（`warn`/`error`） | 现在要一行 `[DocBlock] figure-blocked {ref, allowed}` 得靠人手抄，这条能直接省掉 |
| `ua` / `viewport` / `pathname` | 浏览器 | 复现环境 |

> 这条不只是"更全"，它解决的是**过去几轮反复卡住的那个问题**：定位图缺失要点名 Console 里的 ref 与 allowed，而用户无法稳定提供。

## 三、影响范围

| 层 | 改动 | 现有可复用地基 |
|---|---|---|
| DB | 新增 `feedbacks`、`feedback_comments` 两张表；`menus` 加 1 条、`role_res` 加 1 条 | **权限体系已存在且完整**（见 3.1），不需要新建角色/用户管理 |
| 后端 | 新增 `routers/feedback.py`（6 个接口）+ 图片上传 + 可选邮件通知 | `main.py:53-56` 注册四个 router，照样式加一行 |
| 前端 | `FeedbackFloatEntry`（右下浮动）+ `FeedbackModal` + `FeedbackAdmin` 列表页 | `app.tsx:12` 的 `UploadTaskFloatEntry` 是同款浮动入口，照抄结构；`app.tsx:61` `actionsRender` 右上角可挂未读角标 |
| 生成链路 | 透传 `gen_id` / `target_key` 到 context | 生成已按段/按页独立请求，加两个字段即可，不动并行结构 |

### 3.1 更正：毕方已有 RBAC，不要新建（上一轮判断有误，以此节为准）

上一轮我写「后端无鉴权中间件、需新建角色体系」——**是错的**。实测 `backend/app/db.py` 已具备：

| 已有 | 位置 | 用途 |
|---|---|---|
| `users.access` | `db.py:54`（`admin` / `user`） | 管理员判定直接用这一列 |
| `roles` 表 | `db.py:216-223`，初始 admin/user | 角色字典 |
| `menus` 表 | `db.py:227-259`，20 条菜单，`p_id=12` 是「系统管理」 | **反馈管理页挂这里**，新 id=21 |
| `role_res` 表 | `db.py:262-273`，角色→菜单授权 | admin 全量授权，user 白名单 |
| `orgs` 表 | `db.py:276` | 将来客户分机构预留 |

⇒ **本单权限工作 = 加一条菜单 + 一条授权 + 接口里判 `access`，不做用户/角色管理界面。**

## 四、数据模型（SQLite，按 db.py 现有风格）

```sql
CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY,              -- uuid，前端可先生成（离线也不丢）
  feedback_type TEXT NOT NULL,      -- bug / suggestion / data / other
  content TEXT NOT NULL,            -- 纯文本（富文本二期）
  page TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',    -- pending / resolving / fixed / resolved / ignored
  -- ↓ 角色与指派（决策 1）
  assignee TEXT DEFAULT '',         -- 被指派人 username；空=未指派
  assignee_name TEXT DEFAULT '',
  resolved_by TEXT DEFAULT '',      -- 谁置的 resolved
  resolved_at TEXT DEFAULT '',
  -- ↓ 可见性（决策 2：内部测试 → 将来给客户）
  visibility TEXT DEFAULT 'internal',  -- internal / public；public 时提交人可见他人同类反馈
  env TEXT DEFAULT '',              -- dev / prod，写入时取 DATA_DIR 或配置项
  -- ↓ 通知（决策 3）
  notify_status TEXT DEFAULT '',    -- '' / pending / sent / failed / skipped
  notify_at TEXT DEFAULT '',
  -- ↓ 生成上下文
  gen_id TEXT DEFAULT '',
  gen_type TEXT DEFAULT '',
  outline_id TEXT DEFAULT '',
  target_key TEXT DEFAULT '',
  context_json TEXT DEFAULT '',     -- 第 2 节那张表的整体快照（JSON 字符串）
  images TEXT DEFAULT '',           -- JSON 数组，本地文件名
  contact TEXT DEFAULT '',
  user TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  reply TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fb_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_fb_gen ON feedbacks(gen_id);
CREATE INDEX IF NOT EXISTS idx_fb_created ON feedbacks(created_at);
CREATE INDEX IF NOT EXISTS idx_fb_assignee ON feedbacks(assignee);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id TEXT NOT NULL,
  user TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fbc_fb ON feedback_comments(feedback_id);
```

权限矩阵（`access` 取自当前登录用户；未登录 = guest）：

| 操作 | guest | user | admin |
|---|---|---|---|
| 提交 | ✅（user 留空） | ✅ | ✅ |
| 看自己的 | 按 id 查 | ✅ | ✅ |
| 看全部 / 按状态筛选 | ❌ | ❌ | ✅ |
| 改状态 / 指派 / 回复 | ❌ | ❌ | ✅ |
| 置 `resolved`（确认已修复） | — | 仅本人提交的 | ✅ |
| 重开（须填原因） | — | 仅本人提交的 | ✅ |

状态流转（沿用 LTC，产品同事已熟悉）：

```
pending ──► resolving ──► fixed ──► resolved(提交人确认)
   ▲            │            │
   └────────────┴────────────┘  (fixed→pending 需填重开原因)
                    ignored（任意状态可进，可回退 pending）
```

## 五、接口

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/feedback` | 所有人 | 提交（含 context_json / images） |
| GET | `/api/feedback` | user 仅 `?mine=1`；admin 全量 | 列表（`?mine=1` / `?status=` / `?assignee=`） |
| GET | `/api/feedback/{id}` | 本人或 admin | 详情（含 comments） |
| POST | `/api/feedback/{id}/comments` | 本人或 admin | 追加评论 |
| PUT | `/api/feedback/{id}` | admin（改状态/指派/回复）；user 仅可置 resolved 或重开本人条目 | 见权限矩阵 |
| POST | `/api/feedback/upload-image` | 所有人 | 截图上传（复用 `knowledge_base` 的 `FileResponse` 风格，**不做鉴权**，与现有资产路由一致） |

⚠️ 权限判定**只做后端**（`users.access`），前端菜单显隐靠现有 `role_res`。不做中间件层，与现有四个 router 的无鉴权风格保持一致——但 `PUT` 必须校验，否则任何人都能改状态。

## 六、前端交互（P0 三步内提交）

1. 右下角常驻「反馈」按钮（`UploadTaskFloatEntry` 同款），快捷键 `Ctrl+Shift+F`；
2. 弹窗：类型（缺陷/建议/数据问题/其他）+ 描述 + 截图（粘贴/拖拽）+ 「自动附加：当前页面 / 生成任务 / 最近日志」勾选（默认勾，可展开看具体内容）；
3. 提交后 toast 带反馈编号，弹窗就地显示「我的反馈」最近 3 条与状态。

**关键：自动附加的内容要可预览、可取消勾选。** 用户对"偷偷上传上下文"的容忍度极低，产品同事自己测试时也会在意。

### 6.1 内部 → 客户演进（决策 2 的落地方式，本期只做预埋）

| 项 | 本期做法 | 将来给客户时改什么 |
|---|---|---|
| 入口 | 不做 `?debug=1` 隐藏，常驻可见 | 加配置项 `FEEDBACK_ENTRY`（`on`/`off`/`admin-only`），客户环境可控 |
| 文案 | 写成通用："遇到问题？告诉我们" | 不动，已通用 |
| 隐私声明 | 弹窗底部一行灰字占位（见下） | 换成正式文案 |
| `visibility` | 提交时写 `internal` | 切换默认值即 `public` |
| 上下文脱敏 | `console_tail` 全带 | 加开关：客户环境只带 `gen_id`/`target_key`，不带 console |

隐私占位文案（本期就写进去，避免将来漏）：
> 提交内容仅用于产品改进。截图与运行日志会随反馈一并保存，请勿包含敏感信息。

### 6.2 与 LTC 成品形态对齐（= 产品同事心里的验收口径）

录屏里 LTC 的 `/analytics/feedback` 长这样，**产品同事看毕方时会拿它当参照系**，所以处理台要尽量同构：

| LTC 已有 | 毕方 P0 | 说明 |
|---|---|---|
| 反馈列表（编号/类型/状态/提交人/时间） | ✅ 做 | 同构 |
| **右侧详情抽屉**：截图 + 指派 + 内部记录 + 评论 | ✅ 做 | **必须做抽屉，不要做跳转页**——这是他最熟悉的形态；内部记录 = 我们多出来的 `context_json`，正好放这里 |
| 提交人排行 | ⬜ 不做 | 内部测试就几个人，没意义 |
| 状态分布图（按提交人 × 状态） | ⬜ 不做 | 同上，≥50 条后再说 |
| AI 行为分析 / 优化建议 / 建议转需求 | ⬜ 不做 | P2，且毕方该做「缺陷聚类」不是「行为洞察」 |

⇒ 一句话：**列表 + 详情抽屉，不做图表，不做 AI 洞察。**

## 七、分期

| 期 | 内容 | 出口条件 |
|---|---|---|
| **P0（本单）** | 提交 + 上下文快照 + 处理台 + 状态回传 + 菜单/权限挂载 | 产品能提、能看到状态变化 |
| P1 | 段/页级「就地反馈」（图卡片旁一个「这张图不对」按钮，自动带 `asset_ref`） | 图文类缺陷不必写文字描述 |
| P2 | 埋点（接 `user_logs`，主动/被动分离）+ 反馈聚类（同类缺陷自动合并，替代 LTC 的 AI 洞察第一层） | 有 ≥50 条反馈后再谈分析 |

## 八、通知方案（决策 3，配置已就位并实测通过）

**结论：产品内为主（必需），邮件为辅（仅两个事件，异步、失败不阻断）。**

**凭据状态（2026-10-22 00:30 实测）**：`smtp.exmail.qq.com:465`（SSL）**CONNECT ok / LOGIN OK**（`ab/smtp_probe.py`，只握手未发信）。已写入 `backend/.env`（`**/.env` 已在 `.gitignore`，不入库），占位键同步进 `backend/.env.example`。

实现要点：465 用 `smtplib.SMTP_SSL(host, port, timeout=15)`；587 走 `SMTP()` + `starttls()`。发件人与用户名同为 `hezeling@zptxtech.cn`，`From` 显示名建议「毕方反馈」。

| 渠道 | 触发时机 | 说明 |
|---|---|---|
| 产品内角标 | 状态变更为 `fixed`（待你确认）/ 被指派到你 | `app.tsx:61` `actionsRender` 挂红点，点进列表页 |
| 邮件 | 仅 `fixed`（请你确认是否修好）与 `resolved`（关闭通知）两个事件 | 收件人 = 提交人 `users.email`；为空则 `notify_status='skipped'` |

为什么不全用邮件：
1. 反馈闭环的核心是"追得到"，提交人回来看状态是天然动作，邮件只补足"你不用一直盯着"这一个场景；
2. 毕方跑在内网/客户环境，SMTP 出网常被封，做成**异步 + 失败降级**（写 `notify_status='failed'`，列表页可见）才不会影响主流程；
3. 只在两个事件发，避免"每条评论都发一封"把人淹掉。

实现约束：`smtplib` 是标准库，**不引新依赖**；配置走 `backend/.env`（`SMTP_HOST/PORT/USER/PASS/FROM`，未配置则整段跳过，P0 不阻塞）。

## 九、验收标准（可执行）

- [ ] 任意页面打开反馈弹窗，提交一条 bug，返回 200 且列表可见；
- [ ] 详情里 `context_json` 含 `gen_id` / `gen_type` / `target_key` / `pathname`，且与当次生成一致；
- [ ] 截图粘贴上传成功，详情能回显；
- [ ] **菜单**：以 admin 登录，左侧「系统管理」下出现「反馈管理」；以 user 登录，不出现；
- [ ] **权限**：user 直接 `PUT /api/feedback/{id}` 改状态 → 403（只有 admin 通）；
- [ ] 管理员改状态 `pending→resolving→fixed`，提交人侧看到状态变化并能「确认已修复」/「重新打开（须填原因）」；
- [ ] 指派：admin 把一条指派给自己，`?assignee=me` 能筛出来；
- [ ] 断网提交不崩（入本地队列，联网重发）；连续点两次提交不产生两条（前端置灰 + 后端按 id 幂等）；
- [ ] 不登录时提交不报错（`user` 留空，不阻断）；
- [ ] `console_tail` 上限 50 条、单条 ≤500 字，整体 `context_json` ≤32KB；
- [ ] 未配置 SMTP 时，改状态不报错且 `notify_status` 被写入（不为 NULL 空转）。

## 十、决策记录

### 10.1 已拍板（2026-10-21，用户）

| # | 问题 | 决策 | 落地方式 |
|---|---|---|---|
| 1 | 谁来处理 | **需要管理员/多使用者/指派角色，但目前主要由我处理** | 复用现有 RBAC（`users.access` + `menus` + `role_res`），不新建角色体系；反馈表加 `assignee` 字段、列表支持按指派筛选；**本期不做用户/角色管理界面** |
| 2 | 给谁用 | **现在是内部测试，将来肯定给客户** | 入口常驻不隐藏（加配置项预留开关）；`visibility` / `env` 字段入库；隐私声明本期就占位；客户场景只改默认值与脱敏开关，不改结构 |
| 3 | 通知渠道 | **产品内为主；邮件我有账号** | 产品内角标为必需；邮件只发 `fixed` / `resolved` 两个事件，异步 + 失败降级；配置走 `.env`，未配置自动跳过 |

### 10.2 已确认（2026-10-22）：SMTP 为完整发信凭据

| 项 | 值 | 处置 |
|---|---|---|
| 服务器 / 端口 | `smtp.exmail.qq.com` : `465`（SSL；587 STARTTLS 备用） | 写入 `backend/.env`（已 gitignore，不入库） |
| 发信账号 | `hezeling@zptxtech.cn` | 同上；`.env.example` 只放占位键 |
| 密码 | 已提供 | **仅存 `.env`，禁止写进任何文档/代码/交接/提交信息** |

⇒ 邮件通知从"可选占位"升级为 **P0 必做**（41.4 不再是可跳过项）。

### 10.3 明确不做（防范围膨胀）

- 不做富文本编辑器（纯文本 + 截图足够）；
- 不做 @提及 / 企微通知 / Gitee 同步；
- 不做用户管理、角色管理、组织架构界面（**已存在**，本单只加菜单与授权记录）；
- 不接 `user_logs` 埋点（P2）；
- 不做 AI 洞察与建议投票（P2，且毕方更适合做"缺陷聚类"而非"用户行为洞察"）；
- 不做邮件模板美化（纯文本，含反馈编号 + 状态 + 直达链接）。
