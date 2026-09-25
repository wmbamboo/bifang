import React, {useMemo, useState} from 'react';
import {Alert, Button, Collapse, Form, Input, Modal, Select, Space, Typography, message} from 'antd';

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
  '【layout 枚举】list | metric | columns | metric_columns | metric_list | table | image_grid。\n' +
  '- metric：页主题是「看规模/增速/占比等数字」；材料里多半能抽出 ≥2 个含 %/亿/万 的原数字。' +
  '标题含「规模/增速/大盘/销售额/同比」且材料有原数字时**优先 metric**，不要用 list 把数字句平铺成清单。拿不准有没有原数字时不要选。\n' +
  '- columns：页主题是「少数几个并列轴/角色/对照组」对照，且每个轴下面还要挂若干下属事实。后文有分页展开的总览页常用。\n' +
  '- metric_columns：上半要数字卡，下半还要分轴对照。仅支持 2～5 卡+2 栏，或 5 卡+3 栏；其它组合改 metric_list/columns。\n' +
  '- metric_list：上半数字卡，下半判断清单（不分栏）。\n' +
  '- list：同一主题下的平铺要点/枚举答案；一页只回答一个名单或一套动作时优先。\n' +
  '- table：价格带/榜单等对照表，tips 用「维度|数值|增速|口径」竖线分行；image_grid：2×2 图鉴，tips 为 2～4 条短图注。\n' +
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
  '3) 占比/分布类（面料、价格带等）：同一表内同类口径列齐，且必须含份额最大的一项；禁止只摘中间两项漏掉第一名。\n' +
  '4) 自检：删掉本页标题后若仍像在讲别的页 → 重写。\n' +
  '【口径对齐·最重要】同一材料片段常并排「男装大盘」与「衬衫/polo」数字。tip 里的数字必须与口径实体、页标题一致：\n' +
  '- 标题含「大盘」：只用标注为男装大盘的数字（采样窗内常见为千万级销量、数十亿销售额），禁止把同页衬衫/polo 子类销量（通常百万级）写成大盘。\n' +
  '- 标题含「衬衫」或「polo」：只用该品类数字，口径写清品类名；禁止互串。\n' +
  '- 价格带页：每条 tip 口径须点名价格带（如「￥50-100 销量」），禁止多条都只写「同比增速」，禁止只输出「100」「200」碎片。\n' +
  '- 主题写明采样时间时，优先采用材料中同一采样区间的数字；其它周期（其它月份单品文）的大盘数一律不用。\n' +
  '- 同一数字禁止填进同页两条 tip；材料没有的数字禁止编造。\n' +
  '【短写】tips 短；材料没有的数字与周期禁止编造。\n';

type FillLayoutKey = 'list' | 'metric' | 'columns' | 'metric_columns' | 'metric_list';

/** 按 layout 拆开的 tips 语法：调用时只拼本页用到的块（勿写领域词表） */
export const PPT_OUTLINE_LAYOUT_RULES: Record<FillLayoutKey, string> = {
  metric:
    '【本页 layout=metric】tips 必须且只能是 2～5 条「原数字 + 空格 + 短口径」（口径 4～16 字）；原数字须含 % / 亿 / 万，来自检索。\n' +
    '禁止无数字的名词清单或叙述句充当数据卡。材料不足 2 个原数字时不要硬选 metric。\n' +
    '正例：["586亿 2024H1男装大盘销售额","+42.3% 同比增速"]\n' +
    '反例：["类目A、类目B、类目C均保持较高增长"]\n',
  columns:
    '【本页 layout=columns】用于「少数分组轴」对照，不是把答案清单拆成空栏。\n' +
    'tips 多行数组：每栏以 `col: 轴名`(≤12 字，轴名须含品类/大盘词，如「col: 衬衫」「col: 大盘」「col: polo」) 开头 → 可选 `colSub:`（各栏副标宜区分） → **紧跟 ≥1 条短条目**(4～16 字)。整页 **2～4 栏**。\n' +
    '结构自检：任意两个 `col:` 之间（以及最后一个 `col:` 到数组末尾）必须出现至少 1 条非 col:/colSub:/metric: 的短条目，否则不合格。\n' +
    '栏标题 = 分组/角色/对照轴；栏内条目 = 该轴下的事实或标签。禁止把「对等叶子答案」逐个写成只有 `col:`、没有栏内条目。\n' +
    '禁止把多行 Markdown 列表塞进同一个 tip 字符串：`col:轴名` 与每条短标签必须是 tips 数组里的独立元素。\n' +
    '若发现自己在写 col:项1、col:项2、col:项3… 且栏下无条目 → 应改用 list，或合并成 2～3 个真正的轴再写条目。\n' +
    '正例：["col: 高举高打","colSub: 预算前置拉声量","官方媒体背书","单日播放破500万+","col: 精种准打","colSub: 圈层强种草","数据定位破圈","内容赛马","col: 聚流快打","colSub: 预算集中做爆点","星推搜直","矩阵收拔"]\n' +
    '反例：多开一栏「col: 星推搜直种收一体」（轴下玩法升成第 4 轴）。\n' +
    '反例：["col: 高举高打——长段定义\\n- 条目1\\n- 条目2"]（整段塞进一个 tip）。\n' +
    '反例：["col: 叶子1","col: 叶子2","col: 叶子3"]（全是空栏）。\n',
  metric_columns:
    '【本页 layout=metric_columns】tips：先 2～5 条「metric: 原数字 短口径」（贴本页标题、含 %/亿/万、来自检索），' +
    '再按 columns 写 2～4 栏（每栏 `col:` + 可选 `colSub:` + ≥1 条短条目）。禁止空栏。\n',
  metric_list:
    '【本页 layout=metric_list】上半数据卡 + 下半判断清单（不分栏）。\n' +
    '- 2～4 条「metric: 单个原数字 + 空格 + 短口径」；一条只含一个数字。\n' +
    '- 2～3 条「list: 短判断」(≤22 字)。\n' +
    '正例：["metric: 586亿 2024H1男装大盘销售额","metric: +42.3% 同比增速","list: 核心类目多数超大盘","list: 领涨子类可核对"]\n',
  list:
    '【本页 layout=list】tips 3～5 条平铺要点；每条「短标题（4～12 字）：短说明（≤22 字）」或单句 ≤22 字。\n' +
    '适合回答「有哪些/是什么」的对等枚举；不要为了「好看」改成空的 columns。\n',
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
  layoutRulesFor(['metric', 'columns', 'metric_columns', 'metric_list', 'list']) +
  '【输出格式·整章】\n' +
  '{"title":"…","chapters":[{"title":"…","subtitle":"…","slides":[' +
  '{"title":"规模与增速口径","layout":"metric_list","tips":["metric: 586亿 某口径销售额","metric: +42.3% 同比增速","list: 核心子类多数超大盘","list: 领涨子类可核对"]},' +
  '{"title":"三种打法对照","layout":"columns","tips":["col: 轴A","colSub: A侧打法","下属事实1","下属事实2","col: 轴B","colSub: B侧打法","下属事实3","下属事实4","col: 轴C","colSub: C侧打法","下属事实5","下属事实6"]},' +
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

/** 文章大纲：骨架进 system 时用 */
export const DOC_OUTLINE_SKELETON =
  '你是文章大纲撰写助手。只输出符合契约的中文 Markdown 大纲。\n' +
  '请拟一个中文大纲，必须输出完整三级，缺一级即为不合格。\n' +
  '【层级】\n' +
  '1. 全文只有 1 行一级标题，以「# 」开头。\n' +
  '2. 每个章节以「## 」开头，不要用「第一章」这类序号代替层级。\n' +
  '3. 每个章节下必须有至少 2 个段落，段落以「### 」开头。禁止只写到 ## 就结束。\n' +
  '【示例】\n' +
  '# 2024年男装流行趋势\n' +
  '## 色彩与面料\n' +
  '### 主色与撞色\n' +
  '### 面料与质感\n' +
  '## 版型与单品\n' +
  '### 宽松与修身\n' +
  '### 外套与内搭\n';

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
): string {
  const t = topic.trim();
  const role = (vars?.role || '').trim() || '读者';
  const object = (vars?.object || '').trim() || t;
  const scope = sanitizeOutlineScope((vars?.scope || '').trim());
  const scopePart = scope ? `，范围「${scope}」` : '';
  return (
    `撰写PPT大纲，主题是【${t}】。` +
    `面向「${role}」，对象「${object}」${scopePart}。` +
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

export function buildDocOutlineSystemPrompt(): string {
  return DOC_OUTLINE_SKELETON;
}

export function composeDocOutlineUserMessage(topic: string): string {
  return `撰写一篇文章大纲，主题是【${topic.trim()}】。`;
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
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [role, setRole] = useState(initialVars?.role ?? '');
  const [object, setObject] = useState(initialVars?.object ?? '');
  const [scope, setScope] = useState(initialVars?.scope ?? '');
  const [displayTitle, setDisplayTitle] = useState('');
  const [domainPack, setDomainPack] = useState<PptDomainPack>(
    initialVars?.domainPack ?? 'generic',
  );
  const [inferring, setInferring] = useState(false);
  const [inferNote, setInferNote] = useState('');
  const lastPreviewSignal = React.useRef(0);

  const openPreview = async () => {
    const t = topic.trim();
    if (!t) {
      message.warning('请先输入主题');
      return;
    }

    if (mode === 'doc' || !showVars) {
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
              // 远程常把细分类目清单塞进 scope；过长则退回规则结果（如「男装」）
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
      onSend({
        userMessage: composeDocOutlineUserMessage(t),
        systemPrompt: buildDocOutlineSystemPrompt(),
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
      onSend({
        userMessage: composePptOutlineUserMessage(t, {
          ...vars,
          scope: sanitizeOutlineScope(vars.scope),
        }),
        systemPrompt: buildPptOutlineStructureSystemPrompt(pack),
        domainPack: pack,
        displayTitle: shortTitle,
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
  };

  const bubblePreview = useMemo(
    () =>
      composePptOutlineUserMessage(topic.trim() || '（主题）', {
        role,
        object,
        scope,
        domainPack,
      }),
    [topic, role, object, scope, domainPack],
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
          {showVars && mode === 'ppt' ? '定框并构思' : '确认并构思'}
        </Button>
      </Space.Compact>
      <Modal
        title={showVars && mode === 'ppt' ? '确认定框' : '确认构思'}
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
        {showVars && mode === 'ppt' ? (
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
            </Form>
            <div style={{marginTop: 12}}>
              <Text type="secondary" style={{fontSize: 12}}>
                对话里只会看到下面这句；格式/版式契约在系统侧注入，不会出现在气泡中。
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
