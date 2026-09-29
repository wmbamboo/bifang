import React, {useEffect, useMemo, useState} from 'react';
import {Alert, Button, Collapse, Form, Input, Modal, Radio, Select, Space, Typography, message} from 'antd';
import {metaDiagnosticBanClause} from '@/components/DocUtil/outlineMetaDiagnostic';
import {
  defaultRetrievalScope,
  retrievalScopeLabel,
  type RetrievalScope,
} from '@/components/DocUtil/retrievalScope';
import {listDocs} from '@/services/chatchat/kb';
import {ALL_KB_NAME} from '@/components/DocUtil/kbSelectorModal';

const {Text, Paragraph} = Typography;

/**
 * PPT 大纲提示词分层（勿串层）
 *
 * | 层 | 常量 / 入口 | 写什么 | 不写什么 |
 * |----|-------------|--------|----------|
 * | L1 骨架·结构 | STRUCTURE_SKELETON → buildPptOutlineStructureSystemPrompt | 标题树密度、页语义分工、同页对照偏好 | layout / tips 语法、领域决策链 |
 * | L1 骨架·选型 | LAYOUT_CATALOG → buildPptOutlineLayoutAssignSystemPrompt | layout 枚举与选型 | tips 写法、岗位变量、领域全文 |
 * | L1 骨架·填充 | FILL_CORE + LAYOUT_RULES → buildPptOutlineSlideFillSystemPrompt | 锁定/兄弟页分工、本页 tips 语法 | 改标题树、领域阈值 |
 * | L2 领域 | PPT_DOMAIN_PACKS | 决策顺序、章主题参考、领域禁忌 | layout / tips 语法、条数硬规则 |
 * | L3 变量 | composePptOutlineUserMessage | 主题/岗位/对象/范围短句 | 骨架与领域全文 |
 *
 * 正式流水线：结构(+领域) → 选型(仅目录) → 按页填充(CORE+本页细则+领域禁忌)。
 */

/** L2：领域框架包（普通用户可选，管理员可扩展） */
export type PptDomainPack = 'generic' | 'selection' | 'report' | 'review';

/** L3：变量层（每次构思可改；只进用户消息 / 定框表单） */
export type PptOutlineVars = {
  role: string;
  object: string;
  scope: string;
  domainPack?: PptDomainPack;
  /** 全文页数硬约束；默认 10～15 */
  pageTarget?: { min: number; max: number };
};

export const DEFAULT_PPT_OUTLINE_VARS: PptOutlineVars = {
  role: '读者',
  object: '',
  scope: '',
  domainPack: 'generic',
  pageTarget: { min: 10, max: 15 },
};

/** 冲突仲裁：骨架硬约束 > 领域 > 变量（写进领域注入头） */
export const PPT_PROMPT_LAYER_PRIORITY =
  '【层级优先】骨架硬约束（章页数/layout 枚举/tips 条数）> 领域决策链与禁忌 > 变量层（岗位/对象/范围）。冲突时以上层为准；领域全文超长时先裁示例再裁规则。\n';
// ─── L1 骨架·结构段（只定标题树）───────────────────────────────────────────

/**
 * 结构段：只输出 title 树。禁止写 layout / tips；领域决策链由 PPT_DOMAIN_PACKS 另拼。
 */
export const PPT_OUTLINE_STRUCTURE_SKELETON =
  '你是 PPT 大纲「结构规划」助手。只输出一个 JSON 对象，不要 Markdown，不要前言后语。\n' +
  '目标：先定「少章多页」标题树，再进入下一阶段选版式与填要点。\n' +
  '【约束】\n' +
  '- title 为全文短标题（来自主题，≤20 字），不要写成某一章的长句标题。\n' +
  '- chapters 必须恰好 3～5 个（推荐 4）；超过 5 不合格。每个 chapter.slides 长度 2～4（建议 3）；全文 slides 合计须落在 pageTarget（默认 10～15，见用户变量）。\n' +
  '- 禁止一章只有 1 张幻灯片；禁止把单页标题升成章标题；禁止把材料目录逐条升成章（宁可合并成少章多页）。\n' +
  '- chapter.title：名词短语、简洁明确，≤12 字。禁止「先看/再看/接着/最后看/首先」口语导语，禁止「A：B」冒号设问长句。\n' +
  '- chapter.subtitle（必填）：一句目录说明，≤16 字，补充「这一章要讲清什么」，不要重复 title。\n' +
  '- slide 对象本段只写 title，禁止写 layout / tips。\n' +
  '- slide.title ≤16 字，具体可汇报；禁止「未命名」「PPT大纲」。\n' +
  '- 【章页同题】每页标题必须能回答「这一章要讲清什么」；禁止把后一章才该讲的主题提前塞进前一章。\n' +
  '- 同一章内多页分工清晰（常见：数据/事实 → 对照/拆解 → 动作/结论），页标题同属该章主题。\n' +
  '- 页标题语义宜可区分：至少有偏「规模/增速/口径」的页、偏「对照/分维/角色」的页、偏「动作/筛选/结论」的页。\n' +
  '- 标题含「规模/增速/大盘销售额」等看数语义的页，留给下一阶段优先选 metric（本段仍只写 title）。\n' +
  '- 【大盘与子类】主题已收窄到具体品类时：优先「同页对照」（一页内大盘与该品类销量/销售额/增速，口径分开）；' +
  '仅当材料足够厚、分拆后每页仍有 ≥3 条独立事实时才拆成两页。禁止为凑页数拆成内容过稀的两页。\n' +
  '- 【双品类】主题同时写「衬衫/polo」等并列品类时：规模与价格带相关页应覆盖二者（标题写「衬衫与polo」或分两页），禁止整份大纲只写其一。\n' +
  '- 【总览与展开】若后续页会分别展开 A/B/C：总览页标题写「三种××对照/打法」；分页各自点名顶层轴/案例。' +
  '总览负责一眼对照；分页负责更细事实。轴下工具/玩法禁止升成总览第 4 轴，也禁止同章再单开一页与总览并列——写进对应轴展开页或总览该栏短标签。\n' +
  '- 不要照搬素材原目录；按读者决策顺序分章。\n' +
  '【输出格式·仅此形状】\n' +
  '{"title":"全文标题","chapters":[{"title":"章标题","subtitle":"章副标题","slides":[{"title":"页标题"},{"title":"页标题"},{"title":"页标题"}]}]}\n' +
  '字段名必须用英文 title / subtitle / chapters / slides。每个 chapter.title、chapter.subtitle、slide.title 不能为空。\n' +
  '【形状示例·勿照抄标题】\n' +
  '{"title":"周会纪要","chapters":[' +
  '{"title":"本周进展","subtitle":"交付与阻塞一览","slides":[{"title":"已完成事项"},{"title":"关键指标一览"},{"title":"风险与阻塞"}]},' +
  '{"title":"资源协作","subtitle":"产能与分工对照","slides":[{"title":"分工对照"},{"title":"产能与缺口"},{"title":"下周动作"}]}' +
  ']}\n';

// ─── L1 骨架·选型（只定 layout）────────────────────────────────────────────

/** 版式一句话目录：选型段用；不展开 tips 语法、不写领域词表 */
export const PPT_OUTLINE_LAYOUT_CATALOG =
  '【layout 枚举】list | progress | metric | columns | metric_columns | metric_list | table | image_grid。\n' +
  '- metric：页主题是「看规模/增速/占比等数字」；材料里多半能抽出 ≥2 个含 %/亿/万 的原数字。' +
  '标题含「规模/增速/大盘/销售额/同比」且材料有原数字时**优先 metric**，不要用 list 把数字句平铺成清单。拿不准有没有原数字时不要选。\n' +
  '- columns：页主题是「少数几个并列轴/角色/对照组」对照，且每个轴下面还要挂若干下属事实。后文有分页展开的总览页常用。\n' +
  '- metric_columns：上半要数字卡，下半还要分轴对照。仅支持 2～5 卡+2 栏，或 5 卡+3 栏；其它组合改 metric_list/columns。\n' +
  '- metric_list：上半数字卡，下半判断清单（不分栏）。\n' +
  '- list：同一主题下的平铺要点/枚举答案；一页只回答一个名单或一套动作时优先。' +
  '【打乱测试】把 N 条重排意思不变 → list；重排即破坏先后/因果 → 才用 progress。\n' +
  '- progress：材料本身含流程/阶段/路径/转化链路时用；相邻要点有先后或递进。' +
  '禁用并列枚举、属性占比、多轴对照、纯数字规模。禁止把并列卖点机械套成「第一步/第二步」。' +
  '不要为「好看」硬造 progress（无硬配额）。\n' +
  '- table：价格带/榜单等对照表，tips 每行用「|」分格（表头行 + 记录行，2～8 行、2～5 列；4 列「维度|数值|增速|口径」或 5 列「排名|店铺/单品|销量|销售额|同比」）；image_grid：图鉴，tips 为 2～9 条短图注（4=2×2、6=3×2、8=4×2、9=3×3；材料图少则少写）。\n' +
  '【columns vs list】columns 的栏标题必须是「分组轴」；若页标题问「有哪些/是什么」或答案是对等叶子项，用 list。\n' +
  '【混合】本章若有原数字，至少 1 页 metric*；若有多轴对照，至少 1 页 columns*。禁止本章几乎全是 list。\n';

// ─── L1 骨架·填充（tips 契约）──────────────────────────────────────────────

/**
 * 填充·共用短契约：锁定 + 兄弟页分工 + 短写。
 * 不含各 layout 的 tips 语法（见 LAYOUT_RULES）；不含领域决策链。
 */
export const PPT_OUTLINE_FILL_CORE =
  '你是 PPT 大纲「要点填充」助手。只输出一个 JSON 对象，不要 Markdown，不要前言后语。\n' +
  '【锁定】给出的标题与 layout 已锁定：不得改 title / subtitle / layout，不得增删页。\n' +
  '【同章页分工】先看兄弟页标题再写本页。每页只贡献「相对兄弟页多出来的那一块」：\n' +
  '1) 总览→展开：总览短标签对照（栏数=顶层轴数；轴下玩法只做该栏短标签或写进对应轴展开页）。案例页写更深事实节点（可带原数字）。\n' +
  '2) 大盘→细分：主题已点名品类时，规模页优先同页写「大盘 + 该品类」原数字对照；纯细分页写该品类内容，勿整段粘贴大盘叙述。\n' +
  '   「品类位置/对照」（intent=category-position）：可用大盘总销量作对照，但 tip 须显式写明「大盘」或品类名，禁止裸数字对照；同页必须另有衬衫或 polo 的品类数字。\n' +
  '   位次/占大盘份额 tip：必须「品类名 + 主量 + 占大盘x%」，如「3.3亿 男士衬衫销售额，占大盘5.6%」；禁止只写「3.3亿 占大盘5.6%」（漏品类会被拒）。\n' +
  '3) 占比/分布类（面料、价格带等）：同一表内同类口径列齐，且必须含份额最大的一项；禁止只摘中间两项漏掉第一名。\n' +
  '4) 自检：删掉本页标题后若仍像在讲别的页 → 重写。\n' +
  '【口径对齐·最重要】同一材料片段常并排「男装大盘」与「衬衫/polo」数字。tip 里的数字必须与口径实体、页标题一致：\n' +
  '- 标题含「大盘」：只用标注为男装大盘的数字（采样窗内常见为千万级销量、数十亿销售额），禁止把同页衬衫/polo 子类销量（通常百万级）写成大盘。\n' +
  '- 标题含「衬衫」或「polo」：只用该品类数字，口径写清品类名；禁止互串。\n' +
  '- 价格带页：每条 tip 口径须点名价格带（如「￥50-100 销量」），禁止多条都只写「同比增速」，禁止只输出「100」「200」碎片。\n' +
  '- 双品类主题的「价格带筛选」table：行须同时覆盖衬衫与 polo（至少各 1 行），禁止整表只有单一品类；若材料只够一边，标题须改成该品类专用。\n' +
  '- 属性/面料/图案/厚薄/袖型页：tips 须含材料原数字（占比/销量）；材料无数字则并入有证据的页，禁止只写计划语。\n' +
  '- 卡题轴对齐：标题或卡头点名「袖型/厚薄/面料/图案」时，同卡数据必须是该轴标签（袖型≠薄款/加厚；图案验证≠只堆面料占比）。禁止把邻列属性挂到错题下。\n' +
  '- 同页禁止重复短标签：款名核心相同（即使价签不同，如「腰腹加宽/高弹衬衫 ¥129」与「¥119」）禁止填两卡。\n' +
  '- 禁止半句截断：日期须写全日（勿「至2024-04-」），勿留「均为各价格」残词或句尾「的/与/为」。\n' +
  '- 禁止把图表坐标轴/刻度（¥50/¥100、TOP款口径、销量席位）当 tip；须写成含口径的短句。\n' +
  '- 主题写明采样时间时，优先采用材料中同一采样区间的数字；其它周期（其它月份单品文）的大盘数一律不用。\n' +
  '- 同一数字禁止填进同页两条 tip；材料没有的数字禁止编造。\n' +
  '- slide.title 保持≤16 字短标题；禁止把 tip 长句/口径说明写进 title。\n' +
  '- 跨文档数字：仅当检索为「扩展知识库」时，非主文档数字须写「（来源：文档名）」；定性趋势词可无来源。单文档模式禁止引用库外数字，禁止整页跑题到未绑定品类（如防晒服）。\n' +
  '- 禁止把检索引注「[文档1]」写进 tips 或成品文案。\n' +
  '【短写】tips 短；材料没有的数字与周期禁止编造。\n';

type FillLayoutKey =
  | 'list'
  | 'progress'
  | 'metric'
  | 'columns'
  | 'metric_columns'
  | 'metric_list'
  | 'table'
  | 'image_grid';

/** 按 layout 拆开的 tips 语法：调用时只拼本页用到的块（勿写领域词表） */
export const PPT_OUTLINE_LAYOUT_RULES: Record<FillLayoutKey, string> = {
  metric:
    '【本页 layout=metric】tips 必须且只能是 2～9 条「原数字 + 空格 + 短口径」（口径 4～16 字）；原数字须含 % / 亿 / 万，来自检索。常用 2～5；材料够多可到 6～9（运行时克隆扩卡）。\n' +
    '禁止无数字的名词清单或叙述句充当数据卡。材料不足 2 个原数字时不要硬选 metric。\n' +
    '正例：["586亿 2024H1男装大盘销售额","+42.3% 同比增速"]\n' +
    '反例：["类目A、类目B、类目C均保持较高增长"]\n',
  columns:
    '【本页 layout=columns】用于「少数分组轴」对照，不是把答案清单拆成空栏。\n' +
    'tips 多行数组：每栏以 `col: 轴名`(≤12 字，轴名须含品类/大盘词，如「col: 衬衫」「col: 大盘」「col: polo」) 开头 → 可选 `colSub:`（各栏副标宜区分） → **紧跟 ≥1 条短条目**(4～16 字)。整页 **2～9 栏**（常用 2～5；更多靠克隆）。\n' +
    '结构自检：任意两个 `col:` 之间（以及最后一个 `col:` 到数组末尾）必须出现至少 1 条非 col:/colSub:/metric: 的短条目，否则不合格。\n' +
    '栏标题 = 分组/角色/对照轴；栏内条目 = 该轴下的事实或标签。禁止把「对等叶子答案」逐个写成只有 `col:`、没有栏内条目。\n' +
    '禁止把多行 Markdown 列表塞进同一个 tip 字符串：`col:轴名` 与每条短标签必须是 tips 数组里的独立元素。\n' +
    '若发现自己在写 col:项1、col:项2、col:项3… 且栏下无条目 → 应改用 list，或合并成 2～3 个真正的轴再写条目。\n' +
    metaDiagnosticBanClause() +
    '。\n' +
    '正例（轴名须能在检索证据中找到痕迹；勿照抄营销口号当轴）：' +
    '["col: 衬衫","colSub: 销量口径","296.2万 本期销量","占大盘可核对",' +
    '"col: polo衫","colSub: 销量口径","403.7万 本期销量","同比领涨",' +
    '"col: 男装大盘","colSub: 对照分母","7280.1万 总销量","作占比分母"]\n' +
    '反例：["col: 高举高打","col: 精种准打"]（域外口号轴，证据无词 → 会被栏轴闸拒收）。\n' +
    '反例：["col: 衬衫——长段定义\\n- 条目1\\n- 条目2"]（整段塞进一个 tip）。\n' +
    '反例：["col: 叶子1","col: 叶子2","col: 叶子3"]（全是空栏）。\n',
  metric_columns:
    '【本页 layout=metric_columns】tips：先 2～5 条「metric: 原数字 短口径」（贴本页标题、含 %/亿/万、来自检索），' +
    '再按 columns 写 2～4 栏（每栏 `col:` + 可选 `colSub:` + ≥1 条短条目）。禁止空栏。\n',
  metric_list:
    '【本页 layout=metric_list】上半数据卡 + 下半判断清单（不分栏）。\n' +
    '- 2～9 条「metric: 单个原数字 + 空格 + 短口径」（常用 2～5）；一条只含一个数字。\n' +
    '- 2～9 条「list: 短判断」(≤22 字；常用 2～4）。\n' +
    '正例：["metric: 586亿 2024H1男装大盘销售额","metric: +42.3% 同比增速","list: 核心类目多数超大盘","list: 领涨子类可核对"]\n',
  list:
    '【本页 layout=list】tips 3～9 条平铺要点（常用 3～5；材料够多可到 6～9，运行时克隆扩行）；每条「短标题（4～12 字）：短说明（≤22 字）」或单句 ≤22 字。\n' +
    '适合回答「有哪些/是什么」的对等枚举；不要为了「好看」改成空的 columns。超过 9 条会降为 table。\n',
  progress:
    '【本页 layout=progress】有向序列（阶段/步骤/路径），不是并列枚举。tips 3～9 条（常用 3～5；6～9 靠克隆），强制两段式：' +
    '「阶段名（4～12 字）：该阶段动作或产出（≤22 字）」。模板已有节点序号，文本里不许写「第一步/阶段1」。\n' +
    '首条=起点/输入，末条=终点/产出。禁止把并列卖点套成伪顺序。超过 9 条会降为 table。\n' +
    '正例：["选品定锚：锁定高增速品类与价格带","内容起量：以卖点短视频撬动自然流","货架承接：搜索与推荐位同步放量","复购沉淀：私域承接拉长生命周期"]\n' +
    '反例：["价格带50-100占比18.8%","面料以棉为主","袖型常规最多"]（并列属性 → 应走 list/metric）\n',
  table:
    '【本页 layout=table】tips 是表格行：每个 tip 一行，单元格用竖线 | 分隔（不要 Markdown 表格线、不要行号）。\n' +
    '- 首行必须是表头（列名），其后每行一条记录；整表 **2～8 行**（含表头）、**2～5 列**。\n' +
    '- 列规格（按内容选一种，同一页不要混）：4 列「维度|数值|增速|口径」，或带排名的 5 列「排名|店铺/单品|销量|销售额|同比」。\n' +
    '- 单元格短（≤14 字）；数字用材料原数字，禁止自造合计/平均。\n' +
    '- 价格带表：行须覆盖衬衫与 polo（至少各 1 行），否则把标题改成该品类专用。\n' +
    '正例：["价格带|本期销量(占比)|销量同比|本期销售额(占比)","￥50以下|1200.5万(12.3%)|+8.2%|3.6亿(11.0%)"]\n' +
    '反例：["¥50","¥100","¥200"]（价格带碎片当行）；["价格带|销量"]（只有表头没有记录行）。\n',
  image_grid:
    '【本页 layout=image_grid】图鉴：tips 2～9 条短图注（每条 4～16 字），一条对应一格。' +
    '4=2×2、6=3×2、8=4×2、9=3×3；材料图少则少写，不要凑空格。\n' +
    '图注须写材料事实（品类/属性/卖点），不要写「见图」「图1」这类指代，也不要写计划语。\n',
};

/** 把若干 layout 的 tips 细则拼进 system（去重保序） */
export function layoutRulesFor(layouts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of layouts) {
    let key = String(raw || 'list').toLowerCase().replace(/-/g, '_');
    if (key === 'column') key = 'columns';
    const norm = (key in PPT_OUTLINE_LAYOUT_RULES ? key : 'list') as FillLayoutKey;
    if (seen.has(norm)) continue;
    seen.add(norm);
    parts.push(PPT_OUTLINE_LAYOUT_RULES[norm]);
  }
  return parts.join('');
}

/**
 * @deprecated 整章长契约（选型+全部 layout 细则）；正式流水线用选型短契约 + 按页细则。
 */
export const PPT_OUTLINE_FILL_SKELETON =
  PPT_OUTLINE_FILL_CORE +
  PPT_OUTLINE_LAYOUT_CATALOG +
  layoutRulesFor(['metric', 'columns', 'metric_columns', 'metric_list', 'list', 'progress', 'table', 'image_grid']) +
  '【输出格式·整章】\n' +
  '{"title":"…","chapters":[{"title":"…","subtitle":"…","slides":[' +
  '{"title":"规模与增速口径","layout":"metric_list","tips":["metric: 586亿 某口径销售额","metric: +42.3% 同比增速","list: 核心子类多数超大盘","list: 领涨子类可核对"]},' +
  '{"title":"品类对照","layout":"columns","tips":["col: 衬衫","colSub: 销量口径","下属事实1","下属事实2","col: polo衫","colSub: 销量口径","下属事实3","下属事实4","col: 男装大盘","colSub: 对照分母","下属事实5","下属事实6"]},' +
  '{"title":"案例展开页","layout":"list","tips":["节点一：可核对事实","节点二：可核对事实","节点三：带原数字的结果"]}' +
  ']}]}\n';

/** @deprecated 单段兼容；正式构思走结构 → 选型 → 按页填充 */
export const PPT_OUTLINE_SKELETON =
  PPT_OUTLINE_STRUCTURE_SKELETON + '\n' + PPT_OUTLINE_FILL_SKELETON;

/** @deprecated 兼容旧引用；等价于不变骨架 */
export const PPT_OUTLINE_TEMPLATE = PPT_OUTLINE_SKELETON;

// ─── L2 领域（决策链 / 章主题 / 禁忌；不写 layout·tips）────────────────────

/**
 * 领域框架：只写决策链、章主题参考、领域禁忌。
 * 不重复骨架里的层级密度、layout 语法与 tips 条数。
 */
export const PPT_DOMAIN_PACKS: Record<
  PptDomainPack,
  { label: string; prompt: string }
> = {
  generic: {
    label: '通用',
    prompt:
      '【领域：通用】按读者完成任务的决策顺序组织章节，不要照搬素材原目录。证据页优先；需要行动建议时可写推演页，但推演不得引入材料没有的数字与周期。',
  },
  selection: {
    label: '选品',
    prompt:
      '【领域：选品】按选品决策顺序合并为 3～5 章（推荐 4，禁止 6 章以上）。章主题参考（改写勿照抄）：' +
      '大盘与类目机会 → 赛道与货盘 → 风格与卖点 → 筛选与打法。\n' +
      '【章主题归属】\n' +
      '- 「大盘与类目机会」：规模与增速、核心类目增长、机会/趋势新赛道、人群概览；禁止塞单品「颜色偏好/材质卖点/款式卖点」。\n' +
      '- 「风格与卖点」：颜色偏好、材质/功能卖点、款式趋势等单品内容。\n' +
      '- 「赛道与货盘 / 筛选与打法」：赛道角色、货盘结构、打法对照与案例。\n' +
      '不要照搬行业报告原目录。不要把「7:2:1」「各维度打分」等领域阈值写死进每一页，除非用户主题明确要求。',
  },
  report: {
    label: '汇报',
    prompt:
      '【领域：汇报】按「结论先行 → 依据 → 风险/待决 → 下一步」分章；每章多页展开。管理层可读，少操作步骤清单，多判断与取舍。',
  },
  review: {
    label: '复盘',
    prompt:
      '【领域：复盘】按「目标 → 结果 → 归因 → 改进」分章；每章多页。结果与差距优先落证据主题页，改进落动作主题页。推演改进不得编造未提供的基数。',
  },
};

export const PPT_DOMAIN_PACK_OPTIONS = (
  Object.keys(PPT_DOMAIN_PACKS) as PptDomainPack[]
).map((id) => ({ value: id, label: PPT_DOMAIN_PACKS[id].label }));

// ─── 文章大纲（独立，不参与 PPT 三层）──────────────────────────────────────

/** 文章大纲：骨架进 system 时用（对齐 PPT 的「定框强度」，但不引入 layout） */
export const DOC_OUTLINE_SKELETON =
  '你是文章大纲撰写助手。只输出符合契约的中文 Markdown 大纲，不要前言后语，不要解释。\n' +
  '【层级·缺一级即不合格】\n' +
  '1. 全文只有 1 行一级标题，以「# 」开头（短名 ≤20 字，勿把长主题整句塞进标题）。\n' +
  '2. 章节以「## 」开头；全文 **3～5 章**（推荐 4；禁止 1 章或超过 6 章）。不要用「第一章」代替层级。\n' +
  '3. 每章下必须有 **2～4 个段落**，段落以「### 」开头。禁止只写到 ## 就结束；禁止一章堆 8 个以上 ###。\n' +
  '【内容】\n' +
  '- 章/段标题要能独立成题（读者只看标题能懂要写什么）；禁止「概述/小结/其他」空壳标题。\n' +
  '- 同级标题互不重复；后文段落是前文的展开，不要换题重说。\n' +
  '- 材料有流程/阶段时可用「路径/节奏」类章题；有多轴对照时章题点名对照对象；纯枚举用清单式段题。\n' +
  '- 段落标记只能用「### 」；禁止用「* 」「+ 」「- 」代替 ### 写段落。\n' +
  '- 禁止出现 layout / tips / intent / 版式 等字段行（Word 没有分区概念，出现即不合格）。\n' +
  '- 不要在大纲里写正文，也不要写 ```table / ```figure 围栏（图表由正文阶段按材料决定）。\n' +
  '【段类型】\n' +
  '- 每段默认是散文段。\n' +
  '- 数据密集段（销量/占比/构成/对比）：段题直接点名数据口径，如「销量与占比结构」；不要在段题里写「表」「图」字样。\n' +
  '- 图表由正文阶段依据材料决定，大纲不预先承诺配图配表（避免产出「无图可配」的空段）。\n' +
  '【结论章】\n' +
  '- 末章须为结论/建议类（题含「结论」「建议」「动作」「取舍」「下一步」等），给出可执行判断；不得重述前章同一组数字。\n' +
  '【示例·正确】\n' +
  '# 2024年男装流行趋势\n' +
  '## 色彩与面料\n' +
  '### 主色与撞色\n' +
  '### 面料与质感\n' +
  '## 版型与单品\n' +
  '### 宽松与修身\n' +
  '### 外套与内搭\n' +
  '## 渠道与转化\n' +
  '### 内容起量\n' +
  '### 货架承接\n' +
  '## 结论与建议\n' +
  '### 优先方向\n' +
  '### 近两周动作\n' +
  '【示例·错误·勿仿】\n' +
  '# 2024年男装流行趋势\n' +
  '## 社媒热度与节奏\n' +
  '* layout: metric\n' +
  '- 近一年男装作品量与互动量\n' +
  '- 下半年热度高于上半年\n' +
  '## 西服品类的品牌竞争\n' +
  '* layout: list\n' +
  '- 高作品量主力品牌\n';
/** @deprecated */
export const DOC_OUTLINE_TEMPLATE = DOC_OUTLINE_SKELETON;

const SCOPE_WORDS = [
  '男装', '女装', '童装', '男鞋', '女鞋', '配饰', '内衣', '运动装', '防晒',
  '夹克', 'T恤', '羽绒服', '衬衫', '裤装', '连衣裙',
];

export function inferPptDomainPack(topic: string, vars?: Partial<PptOutlineVars>): PptDomainPack {
  if (vars?.domainPack) return vars.domainPack;
  const t = `${topic || ''} ${vars?.role || ''} ${vars?.object || ''}`;
  if (/选品|爆品|货盘|赛道/.test(t)) return 'selection';
  if (/汇报|述职|周会|月报|管理层/.test(t)) return 'report';
  if (/复盘|回顾|归因|改进/.test(t)) return 'review';
  return 'generic';
}

/**
 * 从主题句法推断岗位 / 对象 / 范围，供用户确认。
 */
export function inferPptOutlineVarsFromTopic(topic: string): PptOutlineVars {
  const t = (topic || '').trim();
  let role = '';
  let object = '';
  let scope = '';

  const help = t.match(
    /帮助\s*([\u4e00-\u9fffA-Za-z0-9]{2,12}?)\s*(?:筛选|判断|完成|撰写|生成|制作|梳理|分析)/,
  );
  if (help) role = help[1];

  const roleAlt = t.match(
    /(?:面向|给|为)\s*([\u4e00-\u9fffA-Za-z0-9]{2,12}?)\s*(?:的|做|撰写|生成)?/,
  );
  if (!role && roleAlt) role = roleAlt[1];

  const obj =
    t.match(/筛选出?\s*(.+)$/) ||
    t.match(/判断\s*(.+)$/) ||
    t.match(/关于\s*(.+)$/) ||
    t.match(/主题是【(.+?)】/);
  if (obj) {
    object = obj[1]
      .replace(/^帮助[\u4e00-\u9fffA-Za-z0-9]{2,12}/, '')
      .replace(/^(?:筛选出?|判断)/, '')
      .trim();
  }
  if (!object) {
    object = t
      .replace(/^帮助[\u4e00-\u9fffA-Za-z0-9]{2,12}\s*(?:筛选出?|判断|完成|撰写|生成|制作)?/, '')
      .trim();
  }
  if (!object) object = t;

  const scopes = SCOPE_WORDS.filter((w) => t.includes(w));
  if (scopes.length) scope = Array.from(new Set(scopes)).join('、');

  if (!role) {
    if (/选品/.test(t)) role = '选品师';
    else if (/运营/.test(t)) role = '运营';
    else if (/汇报|领导|管理层/.test(t)) role = '管理者';
    else role = '读者';
  }

  return {
    role,
    object,
    scope,
    domainPack: inferPptDomainPack(t, { role, object, scope }),
  };
}

export function parseInferredVarsJson(text: string): PptOutlineVars | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    const data = JSON.parse(fenced[0]);
    const role = String(data.role || data.岗位 || '').trim();
    const object = String(data.object || data.对象 || '').trim();
    const scope = sanitizeOutlineScope(String(data.scope || data.范围 || '').trim());
    if (!role && !object && !scope) return null;
    return {
      role: role || '读者',
      object,
      scope,
      domainPack: inferPptDomainPack(`${role} ${object} ${scope}`),
    };
  } catch {
    return null;
  }
}

/**
 * 范围应是品类/赛道短标签（如「男装」「商务男装衬衫/polo衫」）。
 * 禁止把细分类目清单（顿号罗列一长串 SKU）灌进来。
 */
export function sanitizeOutlineScope(scope: string, fallback = ''): string {
  const s = String(scope || '').trim();
  if (!s) return fallback;
  // 顿号清单才视为滥填；斜杠连接的品类对保留
  const commaParts = s
    .split(/[、,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (commaParts.length >= 4 || s.length > 28) {
    if (fallback) return fallback;
    const hit = SCOPE_WORDS.find((w) => s.includes(w));
    if (hit) return hit;
    return commaParts[0] ? commaParts[0].slice(0, 16) : s.slice(0, 16);
  }
  return s;
}

/** 从长主题/对象生成大纲显示名（列表名 / # 标题），≤20 字 */
export function suggestPptDocTitle(
  topic: string,
  vars?: Partial<PptOutlineVars>,
): string {
  const obj = (vars?.object || '').trim();
  if (obj) return obj.length <= 20 ? obj : obj.slice(0, 20);
  const scope = sanitizeOutlineScope((vars?.scope || '').trim());
  if (scope) return scope.length <= 20 ? scope : scope.slice(0, 20);
  const t = (topic || '').trim()
    .replace(/^帮助[\u4e00-\u9fffA-Za-z0-9]{2,12}[，,]?/, '')
    .replace(/^通过[^，,]{0,40}的数据/, '')
    .replace(/^筛选/, '')
    .trim();
  if (t) return t.length <= 20 ? t : t.slice(0, 20);
  return '未命名大纲';
}

/** L1+L2：结构段 = 结构骨架 + 领域（决策链） */
export function buildPptOutlineStructureSystemPrompt(
  pack: PptDomainPack = 'generic',
  pageTarget: { min: number; max: number } = { min: 10, max: 15 },
): string {
  const domain = PPT_DOMAIN_PACKS[pack] || PPT_DOMAIN_PACKS.generic;
  const pt =
    `【pageTarget】全文 slides 合计须在 ${pageTarget.min}～${pageTarget.max} 页（含）。\n`;
  return `${PPT_PROMPT_LAYER_PRIORITY}${PPT_OUTLINE_STRUCTURE_SKELETON}\n${pt}${domain.prompt}\n`;
}

/** @deprecated 整章长契约；正式流水线用 layout 选型 + 按页填充 */
export function buildPptOutlineFillSystemPrompt(
  pack: PptDomainPack = 'generic',
  lockedTreeJson: string,
): string {
  const domain = PPT_DOMAIN_PACKS[pack] || PPT_DOMAIN_PACKS.generic;
  return (
    `${PPT_OUTLINE_FILL_SKELETON}\n${domain.prompt}\n` +
    `【已锁定结构·原样保留 title / subtitle】\n${lockedTreeJson}\n`
  );
}

/** L1 选型：只定 layout + 可选 intent（不加领域全文，避免串层） */
export function buildPptOutlineLayoutAssignSystemPrompt(
  _pack: PptDomainPack = 'generic',
  lockedChapterJson: string,
): string {
  return (
    '你是 PPT 大纲「版式选型」助手。只输出 JSON，不要 Markdown。\n' +
    '【锁定】不得改 title / subtitle，不得增删页；只为每个 slide 选 layout，并可选标注 intent。\n' +
    PPT_OUTLINE_LAYOUT_CATALOG +
    '【intent 可选枚举】category-position | macro-market | category-detail | price-band\n' +
    '- category-position：品类相对大盘的位置/份额对照（可用大盘数作对照，须写明「大盘」口径）\n' +
    '- macro-market：纯男装大盘规模/增速\n' +
    '- category-detail：单一品类事实（禁止大盘总销量冒充品类）\n' +
    '- price-band：价格带分布\n' +
    '拿不准可省略 intent。\n' +
    `【本章标题树】\n${lockedChapterJson}\n` +
    '【输出格式】\n' +
    '{"slides":[{"title":"页标题","layout":"columns","intent":"category-position"},{"title":"页标题","layout":"list"}]}\n' +
    'slides 顺序与长度必须与锁定树一致；title 与锁定一致。\n'
  );
}

/** L1+L2 按页填充：FILL_CORE + 本页 tips 细则 + 领域禁忌 */
export function buildPptOutlineSlideFillSystemPrompt(
  pack: PptDomainPack = 'generic',
  layout: string,
  siblingBlock: string,
  lockedSlideJson: string,
): string {
  const domain = PPT_DOMAIN_PACKS[pack] || PPT_DOMAIN_PACKS.generic;
  const lay = String(layout || 'list');
  // metric_columns 依赖 columns 的 col: 写法，一并附上
  const ruleLayouts =
    lay === 'metric_columns' ? ['metric_columns', 'columns'] : [lay];
  return (
    PPT_OUTLINE_FILL_CORE +
    layoutRulesFor(ruleLayouts) +
    `${domain.prompt}\n` +
    (siblingBlock ? `【同章兄弟页（分工参考，勿抢戏）】\n${siblingBlock}\n` : '') +
    `【本页锁定】\n${lockedSlideJson}\n` +
    '【输出格式】只输出本页：{"title":"…","layout":"' +
    lay +
    '","tips":["…"]}\n'
  );
}

/** @deprecated 单段兼容；请用结构/选型/填充流水线 */
export function buildPptOutlineSystemPrompt(pack: PptDomainPack = 'generic'): string {
  return buildPptOutlineStructureSystemPrompt(pack);
}

/**
 * L3 用户消息：仅变量短句，进对话气泡。
 * 禁止写入骨架（层级/layout/条数）与领域全文（决策链）。
 */
export function composePptOutlineUserMessage(
  topic: string,
  vars?: Partial<PptOutlineVars>,
  retrieval?: {scope?: RetrievalScope; boundFiles?: string[]},
): string {
  const t = topic.trim();
  const role = (vars?.role || '').trim() || '读者';
  const object = (vars?.object || '').trim() || t;
  const scope = sanitizeOutlineScope((vars?.scope || '').trim());
  const scopePart = scope ? `，范围「${scope}」` : '';
  const files = (retrieval?.boundFiles || []).filter(Boolean);
  const rScope =
    retrieval?.scope || defaultRetrievalScope(files);
  let retrievePart = '';
  if (files.length) {
    const names = files.slice(0, 3).join('、') + (files.length > 3 ? '…' : '');
    retrievePart =
      rScope === 'bound_only'
        ? `，检索「仅用所选文档：${names}」`
        : `，检索「扩展知识库补充（主文档：${names}；跨文档数字须标注来源）」`;
  } else if (rScope === 'kb_supplement') {
    retrievePart = '，检索「知识库补充」';
  }
  return (
    `撰写PPT大纲，主题是【${t}】。` +
    `面向「${role}」，对象「${object}」${scopePart}${retrievePart}。` +
    `请按「${role}」的决策顺序组织，不要照搬素材原目录。`
  );
}

/**
 * @deprecated 旧版把骨架拼进用户消息；请改用 buildPptOutlineSystemPrompt + composePptOutlineUserMessage
 */
export function composePptOutlinePrompt(topic: string, vars?: Partial<PptOutlineVars>): string {
  const pack = inferPptDomainPack(topic, vars);
  return `${composePptOutlineUserMessage(topic, vars)}\n${buildPptOutlineSystemPrompt(pack)}`;
}

export type DocDomainPack =
  | 'generic'
  | 'selection'
  | 'report'
  | 'research'
  | 'review';

export const DOC_DOMAIN_PACKS: Record<DocDomainPack, {label: string; prompt: string}> = {
  generic: {
    label: '通用',
    prompt: '【体裁：通用】按读者理解路径组织章节；不照搬材料原目录。',
  },
  selection: {
    label: '选品',
    prompt:
      '【体裁：选品】按选品决策顺序合并为 3～5 章（推荐 4）。章主题参考（改写勿照抄）：' +
      '机会面 → 证据对照 → 风险与不选什么 → 选品结论与动作。\n' +
      '推演不得引入材料没有的数字与周期；末章必须落可执行结论与动作。',
  },
  report: {
    label: '汇报总结',
    prompt: '【体裁：汇报总结】结论先行 → 依据 → 问题与风险 → 结论建议。',
  },
  research: {
    label: '调研研究',
    prompt: '【体裁：调研研究】背景与方法 → 现状与结构 → 归因 → 判断与建议；判断须有材料依据。',
  },
  review: {
    label: '复盘归因',
    prompt: '【体裁：复盘】目标 → 结果 → 归因 → 改进；不得编造未提供的基数。',
  },
};

export const DOC_DOMAIN_PACK_OPTIONS = (
  Object.keys(DOC_DOMAIN_PACKS) as DocDomainPack[]
).map((id) => ({value: id, label: DOC_DOMAIN_PACKS[id].label}));

/**
 * 体裁推断。仅当调用方传入**显式** domainPack 时才 forced；
 * 勿把 UI 默认值 `generic` 塞进来，否则会永久短路主题推断（十一·2）。
 */
export function inferDocDomainPack(
  topic: string,
  vars?: {domainPack?: string},
): DocDomainPack {
  const forced = (vars?.domainPack || '').trim() as DocDomainPack | '';
  if (forced && DOC_DOMAIN_PACKS[forced]) return forced;
  const t = `${topic || ''}`;
  if (/选品|爆品|货盘|赛道/.test(t)) return 'selection';
  if (/总结|汇报|研制|结题|述职|周报|月报/.test(t)) return 'report';
  if (/调研|研究|白皮书|趋势|分析/.test(t)) return 'research';
  if (/复盘|回顾|归因|改进/.test(t)) return 'review';
  return 'generic';
}

export type DocOutlineVars = {
  role: string;
  object: string;
  scope: string;
  /** 体裁由 system 承载，不进 L3 气泡（八·5） */
  domainPack?: DocDomainPack;
};

export function buildDocOutlineSystemPrompt(pack?: DocDomainPack): string {
  const p = pack && DOC_DOMAIN_PACKS[pack] ? pack : 'generic';
  return DOC_OUTLINE_SKELETON + '\n' + DOC_DOMAIN_PACKS[p].prompt;
}

export type DocOutlineRetrievalHint = {
  scope?: RetrievalScope;
  boundFiles?: string[];
};

export function composeDocOutlineUserMessage(
  topic: string,
  vars?: Partial<PptOutlineVars>,
  retrieval?: DocOutlineRetrievalHint,
): string {
  const t = topic.trim();
  const lines = [`撰写一篇文章大纲，主题是【${t}】。`];
  const role = (vars?.role || '').trim();
  const object = (vars?.object || '').trim();
  const scope = sanitizeOutlineScope((vars?.scope || '').trim());
  if (role) lines.push(`面向岗位：${role}。`);
  if (object) lines.push(`核心议题/对象：${object}。`);
  if (scope) lines.push(`范围：${scope}。`);
  const files = (retrieval?.boundFiles || []).filter(Boolean);
  if (files.length) {
    const scopeLab =
      retrieval?.scope === 'bound_only' ? '仅用下列源文档' : '以下源文档优先，可扩展知识库';
    lines.push(`检索约束（${scopeLab}）：${files.join('、')}。`);
  }
  lines.push('请按系统契约输出完整三级 Markdown 大纲。');
  return lines.join('\n');
}

export function composeDocOutlinePrompt(topic: string): string {
  return `${composeDocOutlineUserMessage(topic)}\n${DOC_OUTLINE_SKELETON}`;
}

export type OutlineSendPayload = {
  userMessage: string;
  systemPrompt: string;
  /** 流水线用；缺省则从 system 或 generic 推断 */
  domainPack?: PptDomainPack;
  /** 列表/# 标题用短名；缺省则用主题或对象 */
  displayTitle?: string;
  /** 绑定的源文档文件名（库内） */
  boundSourceFiles?: string[];
  /** 检索范围：有绑定默认仅用所选文档，无绑定默认扩库 */
  retrievalScope?: RetrievalScope;
};

interface OutlinePromptComposerProps {
  topic: string;
  setTopic: (value: string) => void;
  /** 发送短用户消息 + 系统提示（骨架/领域），由对话层注入 system */
  onSend: (payload: OutlineSendPayload) => void | Promise<any>;
  /** PPT：定框变量；文章可不传 */
  showVars?: boolean;
  initialVars?: Partial<PptOutlineVars>;
  inferVars?: (topic: string) => Promise<Partial<PptOutlineVars> | null>;
  /** 文章模式：无变量层，确认后直接发短句 */
  mode?: 'ppt' | 'doc';
  /** 递增时打开定框弹框（欢迎区样例用）；0 表示未触发 */
  openPreviewSignal?: number;
  /** 当前知识库名；具体库时可绑定源文档。缺省/全库则无文件选择 */
  kbName?: string;
}

/** 主题 → 确认变量（可选）→ 短用户消息 + system 骨架开构思 */
const OutlinePromptComposer: React.FC<OutlinePromptComposerProps> = ({
  topic,
  setTopic,
  onSend,
  showVars = false,
  initialVars,
  inferVars,
  mode = 'ppt',
  openPreviewSignal = 0,
  kbName,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [role, setRole] = useState(initialVars?.role ?? '');
  const [object, setObject] = useState(initialVars?.object ?? '');
  const [scope, setScope] = useState(initialVars?.scope ?? '');
  const [displayTitle, setDisplayTitle] = useState('');
  const [domainPack, setDomainPack] = useState<PptDomainPack>(
    initialVars?.domainPack ?? 'generic',
  );
  // 默认 undefined=自动推断；勿默认 generic（会短路 inferDocDomainPack）
  const [docPack, setDocPack] = useState<DocDomainPack | undefined>(() => {
    const p = (initialVars as DocOutlineVars | undefined)?.domainPack;
    return p && DOC_DOMAIN_PACKS[p] ? p : undefined;
  });
  const [inferring, setInferring] = useState(false);
  const [inferNote, setInferNote] = useState('');
  const lastPreviewSignal = React.useRef(0);
  const [kbFileOptions, setKbFileOptions] = useState<
    Array<{label: string; value: string}>
  >([]);
  const [boundSourceFiles, setBoundSourceFiles] = useState<string[]>([]);
  const [retrievalScope, setRetrievalScope] = useState<RetrievalScope>(
    'kb_supplement',
  );
  const [filesLoading, setFilesLoading] = useState(false);

  const canBindFiles =
    Boolean(kbName) && kbName !== ALL_KB_NAME && showVars;

  // 绑定关系 → 默认 scope（用户改过也可因清空绑定而回落）
  useEffect(() => {
    setRetrievalScope(defaultRetrievalScope(boundSourceFiles));
  }, [boundSourceFiles]);

  useEffect(() => {
    if (!previewOpen || !canBindFiles || !kbName) {
      setKbFileOptions([]);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    listDocs(kbName)
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
            ? res
            : [];
        const opts = rows
          .map((r: any) => String(r?.file_name || '').trim())
          .filter(Boolean)
          .map((name: string) => ({label: name, value: name}));
        setKbFileOptions(opts);
      })
      .catch(() => {
        if (!cancelled) setKbFileOptions([]);
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, canBindFiles, kbName]);

  // 换库清空绑定
  useEffect(() => {
    setBoundSourceFiles([]);
  }, [kbName]);

  const openPreview = async () => {
    const t = topic.trim();
    if (!t) {
      message.warning('请先输入主题');
      return;
    }

    if (!showVars) {
      setPreviewOpen(true);
      return;
    }

    setInferring(true);
    setInferNote('');
    try {
      let next = inferPptOutlineVarsFromTopic(t);
      setInferNote('已根据主题初步推断，请修正后开始构思。');
      if (inferVars) {
        try {
          const remote = await inferVars(t);
          if (remote) {
            next = {
              role: (remote.role || '').trim() || next.role,
              object: (remote.object || '').trim() || next.object,
              scope: sanitizeOutlineScope(
                (remote.scope || '').trim(),
                next.scope,
              ),
              domainPack: remote.domainPack || next.domainPack,
            };
            setInferNote('已结合模型根据主题推断，请修正后开始构思。');
          }
        } catch {
          // 规则结果已够用
        }
      }
      setRole(next.role);
      setObject(next.object);
      setScope(next.scope);
      setDomainPack(next.domainPack || inferPptDomainPack(t, next));
      setDisplayTitle(suggestPptDocTitle(t, next));
      setPreviewOpen(true);
    } finally {
      setInferring(false);
    }
  };

  // 欢迎区样例：填入主题后由父组件递增 signal，打开定框弹框（勿直接 send）
  React.useEffect(() => {
    if (!openPreviewSignal || openPreviewSignal === lastPreviewSignal.current) return;
    lastPreviewSignal.current = openPreviewSignal;
    if (topic.trim()) {
      void openPreview();
    }
    // 仅跟随 signal；openPreview 闭包用当前 topic
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPreviewSignal, topic]);

  const send = () => {
    const t = topic.trim();
    if (!t) {
      message.warning('请先输入主题');
      return;
    }
    if (mode === 'doc') {
      // 体裁只进 system；role 空则不写进 user（勿默认「读者」反向误导，十一·2）
      const vars: DocOutlineVars = {
        role: role.trim(),
        object: object.trim() || t,
        scope: scope.trim(),
        domainPack: docPack,
      };
      const pack = inferDocDomainPack(
        t,
        docPack ? {domainPack: docPack} : undefined,
      );
      const files = canBindFiles ? boundSourceFiles : [];
      const effectiveScope: RetrievalScope =
        files.length === 0 ? 'kb_supplement' : retrievalScope;
      onSend({
        userMessage: composeDocOutlineUserMessage(
          t,
          {
            role: vars.role,
            object: vars.object,
            scope: sanitizeOutlineScope(vars.scope),
          },
          {scope: effectiveScope, boundFiles: files},
        ),
        systemPrompt: buildDocOutlineSystemPrompt(pack),
        displayTitle: displayTitle.trim() || suggestPptDocTitle(t, {
          role: vars.role || undefined,
          object: vars.object,
          scope: vars.scope,
          domainPack: pack === 'selection' ? 'selection' : 'generic',
        }),
        boundSourceFiles: files,
        retrievalScope: effectiveScope,
      });
    } else {
      const vars: PptOutlineVars = {
        role: role.trim() || '读者',
        object: object.trim() || t,
        scope: scope.trim(),
        domainPack,
      };
      const pack = vars.domainPack || inferPptDomainPack(t, vars);
      const shortTitle =
        displayTitle.trim() || suggestPptDocTitle(t, vars);
      const files = canBindFiles ? boundSourceFiles : [];
      const effectiveScope: RetrievalScope =
        files.length === 0 ? 'kb_supplement' : retrievalScope;
      onSend({
        userMessage: composePptOutlineUserMessage(
          t,
          {
            ...vars,
            scope: sanitizeOutlineScope(vars.scope),
          },
          {scope: effectiveScope, boundFiles: files},
        ),
        systemPrompt: buildPptOutlineStructureSystemPrompt(pack),
        domainPack: pack,
        displayTitle: shortTitle,
        boundSourceFiles: files,
        retrievalScope: effectiveScope,
      });
    }
    setPreviewOpen(false);
    setTopic('');
    setRole('');
    setObject('');
    setScope('');
    setDisplayTitle('');
    setDomainPack('generic');
    setInferNote('');
    // 保留 boundSourceFiles / retrievalScope，便于同库连续构思
  };

  const bubblePreview = useMemo(
    () => {
      const vars = {
        role,
        object,
        scope,
        domainPack,
      };
      const retrieval = {
        scope:
          boundSourceFiles.length === 0
            ? ('kb_supplement' as RetrievalScope)
            : retrievalScope,
        boundFiles: canBindFiles ? boundSourceFiles : [],
      };
      if (mode === 'doc') {
        return composeDocOutlineUserMessage(
          topic.trim() || '（主题）',
          vars,
          retrieval,
        );
      }
      return composePptOutlineUserMessage(
        topic.trim() || '（主题）',
        vars,
        retrieval,
      );
    },
    [
      mode,
      topic,
      role,
      object,
      scope,
      domainPack,
      boundSourceFiles,
      retrievalScope,
      canBindFiles,
    ],
  );

  return (
    <div style={{width: '100%'}}>
      <Space.Compact style={{width: '100%'}}>
        <Input
          value={topic}
          placeholder="输入主题，例如：帮助选品师，通过采样时间20240319-20240417的数据筛选抖音商务男装衬衫/polo衫爆品"
          onChange={(e) => setTopic(e.target.value)}
          onPressEnter={openPreview}
        />
        <Button type="default" loading={inferring} onClick={openPreview}>
          {showVars ? '定框并构思' : '确认并构思'}
        </Button>
      </Space.Compact>
      <Modal
        title={showVars ? '确认定框' : '确认构思'}
        open={previewOpen}
        width={520}
        onCancel={() => setPreviewOpen(false)}
        destroyOnClose={false}
        footer={
          <Space>
            <Button onClick={() => setPreviewOpen(false)}>取消</Button>
            <Button type="primary" onClick={send}>
              开始构思
            </Button>
          </Space>
        }
      >
        {showVars ? (
          <>
            {inferNote ? (
              <Alert type="info" showIcon style={{marginBottom: 12}} message={inferNote} />
            ) : null}
            <Form layout="vertical" size="small">
              <Form.Item
                label={<Text strong>主题</Text>}
                style={{marginBottom: 8}}
              >
                <Text style={{color: '#1677ff', fontWeight: 500}}>{topic.trim()}</Text>
              </Form.Item>
              <Form.Item
                label={<Text strong>大纲显示名</Text>}
                extra="列表与 # 标题用的短名，可改；不影响长主题检索。"
                style={{marginBottom: 8}}
              >
                <Input
                  value={displayTitle}
                  maxLength={20}
                  onChange={(e) => setDisplayTitle(e.target.value)}
                  placeholder="如：商务男装衬衫/polo"
                />
              </Form.Item>
              <Space wrap style={{width: '100%'}} size={[12, 0]}>
                <Form.Item label={<Text strong>岗位</Text>} style={{marginBottom: 8, minWidth: 140}}>
                  <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="如：选品师" />
                </Form.Item>
                <Form.Item label={<Text strong>对象</Text>} style={{marginBottom: 8, minWidth: 200}}>
                  <Input value={object} onChange={(e) => setObject(e.target.value)} placeholder="筛选/判断对象" />
                </Form.Item>
                <Form.Item label={<Text strong>范围</Text>} style={{marginBottom: 8, minWidth: 220}}>
                  <Input
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="如：商务男装衬衫/polo衫"
                  />
                </Form.Item>
              </Space>
              {canBindFiles ? (
                <>
                  <Form.Item
                    label={<Text strong>源文档（可选）</Text>}
                    extra="选定后默认「仅用所选文档」；不选则默认从知识库补充。"
                    style={{marginBottom: 8}}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      loading={filesLoading}
                      placeholder="选择库内文档作为本次证据承诺"
                      options={kbFileOptions}
                      value={boundSourceFiles}
                      onChange={(v) => setBoundSourceFiles(v)}
                      optionFilterProp="label"
                      maxTagCount="responsive"
                    />
                  </Form.Item>
                  <Form.Item
                    label={<Text strong>检索范围</Text>}
                    extra={
                      boundSourceFiles.length
                        ? `当前默认：${retrievalScopeLabel(defaultRetrievalScope(boundSourceFiles))}（可改）`
                        : '未绑定文档时只能扩展知识库'
                    }
                    style={{marginBottom: 8}}
                  >
                    <Radio.Group
                      value={
                        boundSourceFiles.length === 0
                          ? 'kb_supplement'
                          : retrievalScope
                      }
                      onChange={(e) =>
                        setRetrievalScope(e.target.value as RetrievalScope)
                      }
                      disabled={boundSourceFiles.length === 0}
                      options={[
                        {label: '仅用所选文档', value: 'bound_only'},
                        {label: '扩展知识库补充', value: 'kb_supplement'},
                      ]}
                    />
                  </Form.Item>
                </>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  style={{marginBottom: 8}}
                  message="当前为全库或未选具体知识库：检索默认「知识库补充」。选定具体库后可绑定源文档。"
                />
              )}
              {mode === 'ppt' ? (
              <Collapse
                ghost
                size="small"
                items={[
                  {
                    key: 'adv',
                    label: <Text strong>高级（主题类型）</Text>,
                    children: (
                      <Form.Item
                        label={<Text strong>主题类型</Text>}
                        extra="影响系统侧领域框架；普通构思保持默认即可。"
                        style={{marginBottom: 0}}
                      >
                        <Select
                          style={{width: 160}}
                          value={domainPack}
                          options={PPT_DOMAIN_PACK_OPTIONS}
                          onChange={(v) => setDomainPack(v)}
                        />
                      </Form.Item>
                    ),
                  },
                ]}
              />
              ) : (
              <Collapse
                ghost
                size="small"
                items={[
                  {
                    key: 'doc-adv',
                    label: <Text strong>高级（体裁）</Text>,
                    children: (
                      <Form.Item
                        label={<Text strong>体裁</Text>}
                        extra="写入系统侧文章骨架；不出现在聊天气泡。"
                        style={{marginBottom: 0}}
                      >
                        <Select
                          allowClear
                          placeholder="自动推断"
                          style={{width: 160}}
                          value={docPack}
                          options={DOC_DOMAIN_PACK_OPTIONS}
                          onChange={(v) => setDocPack(v)}
                        />
                      </Form.Item>
                    ),
                  },
                ]}
              />
              )}
            </Form>
            <div style={{marginTop: 12}}>
              <Text type="secondary" style={{fontSize: 12}}>
                对话里只会看到下面这句；格式契约在系统侧注入，不会出现在气泡中。
              </Text>
              <Paragraph
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  padding: '8px 10px',
                  background: '#f7f8fa',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {bubblePreview}
              </Paragraph>
            </div>
          </>
        ) : (
          <Alert
            type="info"
            showIcon
            message="确认后开始构思；大纲格式由系统约束，不会出现在对话气泡里。"
          />
        )}
      </Modal>
    </div>
  );
};

export default OutlinePromptComposer;
