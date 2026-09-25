import React, {useEffect, useMemo, useState} from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Tag,
  Tree,
  Typography,
  message,
} from "antd";
import type {DataNode} from "antd/es/tree";
import {ArrowDownOutlined, ArrowUpOutlined, MinusCircleOutlined, PlusOutlined} from "@ant-design/icons";
import {
  Chapter,
  ColumnBlock,
  Ppt,
  Slide,
  SlideLayout,
  TipRole,
  inferSlideLayout,
  parseColumnBlocks,
  parseSlideTips,
  splitMetricListTips,
} from "@/components/DocUtil/ViewItem4Ppt";
import {
  chaptersToMarkdown,
  layoutLabel,
  setColumnTips,
  setMetricListTips,
  setSlideTips,
} from "@/components/DocUtil/outlineSerialize";

const {Text, Title} = Typography;

type OutlineTreeEditorProps = {
  title: string;
  markdown: string;
  /** 只读预览；可编辑时显示保存 */
  editable?: boolean;
  onSave?: (title: string, markdown: string) => void;
};

type Sel =
  | { kind: "doc" }
  | { kind: "chapter"; chapterKey: string }
  | { kind: "slide"; chapterKey: string; slideKey: string };

const tipLimits = (layout: SlideLayout) => {
  if (layout === "metric" || layout === "metric_list") return { min: 2, max: 5 };
  if (layout === "columns" || layout === "metric_columns") return { min: 2, max: 20 };
  if (layout === "table") return { min: 2, max: 5 };
  if (layout === "image_grid") return { min: 2, max: 4 };
  return { min: 3, max: 5 };
};

const normalizeLayout = (layout: SlideLayout | string | undefined): SlideLayout => {
  if (
    layout === "metric" ||
    layout === "metric_list" ||
    layout === "list" ||
    layout === "columns" ||
    layout === "metric_columns" ||
    layout === "table" ||
    layout === "image_grid"
  ) {
    return layout;
  }
  return "list";
};

const layoutTagColor = (layout: SlideLayout | string | undefined) => {
  if (layout === "metric") return "geekblue";
  if (layout === "metric_list") return "purple";
  if (layout === "columns") return "cyan";
  if (layout === "metric_columns") return "blue";
  if (layout === "table") return "orange";
  if (layout === "image_grid") return "magenta";
  return "default";
};

const LAYOUT_SELECT_OPTIONS = [
  { value: "list", label: "列表" },
  { value: "metric", label: "数据卡" },
  { value: "metric_list", label: "数据卡+要点" },
  { value: "columns", label: "分栏" },
  { value: "metric_columns", label: "数据卡+分栏" },
  { value: "table", label: "表格" },
  { value: "image_grid", label: "图鉴" },
];

const OutlineTreeEditor: React.FC<OutlineTreeEditorProps> = ({
  title: initTitle,
  markdown,
  editable = false,
  onSave,
}) => {
  const [docTitle, setDocTitle] = useState(initTitle || "");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "doc" });

  useEffect(() => {
    const content = (markdown || "").trim();
    const hasH1 = /^#\s+(?!#)/.test(content);
    const full = hasH1 ? content : `# ${initTitle || "未命名大纲"}\n${content}`;
    const parsedTitle = Ppt.getTitleFromMsg(full) || initTitle || "";
    const body = Ppt.getContentFromMsg(full);
    const next = Ppt.getChaptersFromContent(body);
    setDocTitle(parsedTitle.trim() || initTitle || "未命名大纲");
    setChapters(next);
    if (next[0]?.slides?.[0]) {
      setSel({ kind: "slide", chapterKey: next[0].key, slideKey: next[0].slides[0].key });
    } else if (next[0]) {
      setSel({ kind: "chapter", chapterKey: next[0].key });
    } else {
      setSel({ kind: "doc" });
    }
  }, [markdown, initTitle]);

  const bump = (next: Chapter[]) => setChapters(next.map((c) => c));

  const treeData: DataNode[] = useMemo(
    () =>
      chapters.map((chapter) => ({
        key: chapter.key,
        title: (
          <Space size={6} direction="vertical" style={{rowGap: 0}}>
            <span>{chapter.title || "未命名章节"}</span>
            {chapter.subTitle ? (
              <Text type="secondary" style={{fontSize: 12}}>
                {chapter.subTitle}
              </Text>
            ) : null}
          </Space>
        ),
        children: (chapter.slides || []).map((slide) => ({
          key: slide.key,
          title: (
            <Space size={6}>
              <span>{slide.title || "内容要点"}</span>
              <Tag color={layoutTagColor(slide.layout)}>
                {layoutLabel(slide.layout)}
              </Tag>
            </Space>
          ),
        })),
      })),
    [chapters],
  );

  const findChapter = (key: string) => chapters.find((c) => c.key === key);
  const findSlide = (chapterKey: string, slideKey: string) => {
    const chapter = findChapter(chapterKey);
    return chapter?.slides?.find((s) => s.key === slideKey);
  };

  const onSelect = (keys: React.Key[]) => {
    const key = String(keys[0] || "");
    if (!key) return;
    if (key.startsWith("chapter")) {
      setSel({ kind: "chapter", chapterKey: key });
      return;
    }
    for (const chapter of chapters) {
      if (chapter.slides?.some((s) => s.key === key)) {
        setSel({ kind: "slide", chapterKey: chapter.key, slideKey: key });
        return;
      }
    }
  };

  const selectedKeys =
    sel.kind === "chapter"
      ? [sel.chapterKey]
      : sel.kind === "slide"
        ? [sel.slideKey]
        : [];

  const updateChapterTitle = (chapterKey: string, title: string) => {
    const chapter = findChapter(chapterKey);
    if (!chapter) return;
    chapter.title = title;
    chapter.label = title;
    bump(chapters);
  };

  const updateChapterSubTitle = (chapterKey: string, subTitle: string) => {
    const chapter = findChapter(chapterKey);
    if (!chapter) return;
    chapter.subTitle = subTitle;
    bump(chapters);
  };

  const updateSlideTitle = (chapterKey: string, slideKey: string, title: string) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    slide.title = title;
    slide.label = title;
    bump(chapters);
  };

  const updateSlideLayout = (chapterKey: string, slideKey: string, layout: SlideLayout) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const prev = normalizeLayout(slide.layout);
    slide.layout = layout;
    if (layout === "metric_list" && prev !== "metric_list") {
      const tips = parseSlideTips(slide.subTitle || "");
      const metrics = tips.filter((t) => t.role === "metric").map((t) => t.text);
      const lists = tips.filter((t) => t.role === "list").map((t) => t.text);
      setMetricListTips(
        slide,
        metrics.length ? metrics : [""],
        lists.length ? lists : [""],
      );
    } else if (layout !== "metric_list" && prev === "metric_list") {
      const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
      setSlideTips(slide, [...metrics, ...lists]);
    }
    bump(chapters);
  };

  const updateTip = (chapterKey: string, slideKey: string, index: number, text: string) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const tips = (slide.subTitle || "").split("\n");
    while (tips.length <= index) tips.push("");
    tips[index] = text;
    setSlideTips(slide, tips);
    bump(chapters);
  };

  const updateMetricListTip = (
    chapterKey: string,
    slideKey: string,
    role: TipRole,
    index: number,
    text: string,
  ) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
    const rows = role === "metric" ? [...metrics] : [...lists];
    while (rows.length <= index) rows.push("");
    rows[index] = text;
    setMetricListTips(
      slide,
      role === "metric" ? rows : metrics,
      role === "list" ? rows : lists,
    );
    bump(chapters);
  };

  const addTip = (chapterKey: string, slideKey: string) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const layout = normalizeLayout(slide.layout);
    const { max } = tipLimits(layout);
    const tips = (slide.subTitle || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (tips.length >= max) {
      message.warning(`当前版式最多 ${max} 条要点`);
      return;
    }
    tips.push("");
    setSlideTips(slide, tips);
    bump(chapters);
  };

  const addMetricListTip = (chapterKey: string, slideKey: string, role: TipRole) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const { max } = tipLimits("metric_list");
    const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
    if (role === "metric") {
      if (metrics.length >= max) {
        message.warning(`数据卡最多 ${max} 条`);
        return;
      }
      setMetricListTips(slide, [...metrics, ""], lists);
    } else {
      if (lists.length >= max) {
        message.warning(`列表要点最多 ${max} 条`);
        return;
      }
      setMetricListTips(slide, metrics, [...lists, ""]);
    }
    bump(chapters);
  };

  const removeTip = (chapterKey: string, slideKey: string, index: number) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const layout = normalizeLayout(slide.layout);
    const { min } = tipLimits(layout);
    const tips = (slide.subTitle || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (tips.length <= min) {
      message.warning(`当前版式至少 ${min} 条要点`);
      return;
    }
    tips.splice(index, 1);
    setSlideTips(slide, tips);
    bump(chapters);
  };

  const removeMetricListTip = (chapterKey: string, slideKey: string, role: TipRole, index: number) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    const { min } = tipLimits("metric_list");
    const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
    if (role === "metric") {
      if (metrics.length <= min) {
        message.warning(`数据卡至少 ${min} 条`);
        return;
      }
      const next = [...metrics];
      next.splice(index, 1);
      setMetricListTips(slide, next, lists);
    } else {
      if (lists.length <= min) {
        message.warning(`列表要点至少 ${min} 条`);
        return;
      }
      const next = [...lists];
      next.splice(index, 1);
      setMetricListTips(slide, metrics, next);
    }
    bump(chapters);
  };

  const ensureColumns = (slide: Slide): ColumnBlock[] => {
    const cols = parseColumnBlocks(slide.subTitle || "");
    if (cols.length >= 2) return cols.map((c) => ({
      title: c.title || "",
      sub: c.sub || "",
      items: c.items?.length ? [...c.items] : [""],
    }));
    return [
      { title: "栏1", sub: "", items: [""] },
      { title: "栏2", sub: "", items: [""] },
    ];
  };

  const updateColumns = (
    chapterKey: string,
    slideKey: string,
    cols: ColumnBlock[],
    layout: "columns" | "metric_columns",
  ) => {
    const slide = findSlide(chapterKey, slideKey);
    if (!slide) return;
    setColumnTips(slide, cols, layout);
    bump(chapters);
  };

  const autoLayout = (slide: Slide) => {
    const tips = (slide.subTitle || "").split("\n").map((s) => s.trim()).filter(Boolean);
    slide.layout = inferSlideLayout(tips);
    bump(chapters);
  };

  const save = () => {
    const chk = Ppt.checkChapter(chapters);
    if (chk.code !== 0) {
      message.error(chk.msg);
      return;
    }
    for (const chapter of chapters) {
      for (const slide of chapter.slides || []) {
        const layout = normalizeLayout(slide.layout);
        if (layout === "metric_list") {
          const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
          const { min, max } = tipLimits("metric_list");
          if (metrics.length < min || metrics.length > max) {
            message.error(`「${slide.title}」数据卡要点须为 ${min}～${max} 条（当前 ${metrics.length}）`);
            return;
          }
          if (lists.length < min || lists.length > max) {
            message.error(`「${slide.title}」列表要点须为 ${min}～${max} 条（当前 ${lists.length}）`);
            return;
          }
          continue;
        }
        if (layout === "columns" || layout === "metric_columns") {
          const cols = parseColumnBlocks(slide.subTitle || "");
          if (cols.length < 2) {
            message.error(`「${slide.title}」分栏至少 2 栏（当前 ${cols.length}）`);
            return;
          }
          if (cols.some((c) => !(c.title || "").trim() || (c.items || []).filter(Boolean).length < 1)) {
            message.error(`「${slide.title}」每栏需要栏标题和至少 1 条短条目（大纲里写好，勿等内容生成）`);
            return;
          }
          continue;
        }
        const { min, max } = tipLimits(layout);
        const tips = parseSlideTips(slide.subTitle || "").map((t) => t.text);
        if (tips.length < min || tips.length > max) {
          message.error(`「${slide.title}」要点须为 ${min}～${max} 条（当前 ${tips.length}）`);
          return;
        }
      }
    }
    const md = chaptersToMarkdown(docTitle, chapters);
    onSave?.(docTitle.trim(), md);
    message.success("大纲已保存");
  };

  const renderTipGroup = (
    slide: Slide,
    role: TipRole,
    rows: string[],
    label: string,
    placeholder: string,
  ) => {
    const { min, max } = tipLimits("metric_list");
    const filled = rows.filter((t) => t.trim()).length;
    const display = rows.length ? rows : [""];
    return (
      <div>
        <Text type="secondary">{label}（{min}～{max} 条）</Text>
        <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={8}>
          {display.map((tip, index) => (
            <Card
              key={`${role}-${sel.kind === "slide" ? sel.slideKey : ""}-${index}`}
              size="small"
              title={`${role === "metric" ? "数据卡" : "要点"} ${index + 1}`}
              extra={
                editable && filled > min ? (
                  <MinusCircleOutlined
                    style={{ color: "#ff4d4f" }}
                    onClick={() =>
                      removeMetricListTip(sel.kind === "slide" ? sel.chapterKey : "", sel.kind === "slide" ? sel.slideKey : "", role, index)
                    }
                  />
                ) : null
              }
            >
              <Input.TextArea
                value={tip}
                disabled={!editable}
                placeholder={placeholder}
                autoSize={{ minRows: 1, maxRows: 3 }}
                onChange={(e) =>
                  updateMetricListTip(
                    sel.kind === "slide" ? sel.chapterKey : "",
                    sel.kind === "slide" ? sel.slideKey : "",
                    role,
                    index,
                    e.target.value,
                  )
                }
              />
            </Card>
          ))}
        </Space>
        {editable ? (
          <Button
            type="dashed"
            block
            style={{ marginTop: 8 }}
            icon={<PlusOutlined />}
            disabled={filled >= max}
            onClick={() =>
              addMetricListTip(
                sel.kind === "slide" ? sel.chapterKey : "",
                sel.kind === "slide" ? sel.slideKey : "",
                role,
              )
            }
          >
            添加{role === "metric" ? "数据卡" : "列表"}要点
          </Button>
        ) : null}
      </div>
    );
  };

  const renderEditor = () => {
    if (sel.kind === "doc") {
      return (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Title level={5} style={{ margin: 0 }}>全文标题</Title>
          <Input
            value={docTitle}
            disabled={!editable}
            onChange={(e) => setDocTitle(e.target.value)}
          />
          <Text type="secondary">左侧选择章节或幻灯片后编辑。版式由下拉修改，不会在正文里露出 layout 原文。</Text>
        </Space>
      );
    }
    if (sel.kind === "chapter") {
      const chapter = findChapter(sel.chapterKey);
      if (!chapter) return <Empty description="未找到章节" />;
      return (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Title level={5} style={{ margin: 0 }}>章节标题</Title>
          <Input
            value={chapter.title}
            disabled={!editable}
            onChange={(e) => updateChapterTitle(sel.chapterKey, e.target.value)}
            placeholder="简洁明确，如：关注哪些类目涨"
          />
          <Title level={5} style={{ margin: 0 }}>章节副标题</Title>
          <Input
            value={chapter.subTitle || ""}
            disabled={!editable}
            onChange={(e) => updateChapterSubTitle(sel.chapterKey, e.target.value)}
            placeholder="目录说明，如：看懂抖音男装大盘"
          />
        </Space>
      );
    }
    const slide = findSlide(sel.chapterKey, sel.slideKey);
    if (!slide) return <Empty description="未找到幻灯片" />;
    const layout = normalizeLayout(slide.layout);

    if (layout === "metric_list") {
      const { metrics, lists } = splitMetricListTips(slide.subTitle || "");
      return (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Title level={5} style={{ margin: 0 }}>幻灯片标题</Title>
          <Input
            value={slide.title}
            disabled={!editable}
            onChange={(e) => updateSlideTitle(sel.chapterKey, sel.slideKey, e.target.value)}
          />
          <div>
            <Text type="secondary">版式</Text>
            <div style={{ marginTop: 6 }}>
              <Select
                style={{ width: 180 }}
                value={layout}
                disabled={!editable}
                options={LAYOUT_SELECT_OPTIONS}
                onChange={(v) => updateSlideLayout(sel.chapterKey, sel.slideKey, v)}
              />
              {editable ? (
                <Button type="link" onClick={() => autoLayout(slide)}>
                  按要点重判
                </Button>
              ) : null}
            </div>
          </div>
          {renderTipGroup(
            slide,
            "metric",
            metrics,
            "数据卡要点：原数字 + 空格 + 短口径",
            "例：1462亿元 上半年男装销售额",
          )}
          {renderTipGroup(
            slide,
            "list",
            lists,
            "列表要点：短决策/判断句",
            "例：价格敏感与品质升级并存，货盘要分档",
          )}
        </Space>
      );
    }

    if (layout === "columns" || layout === "metric_columns") {
      const cols = ensureColumns(slide);
      const metrics =
        layout === "metric_columns"
          ? splitMetricListTips(slide.subTitle || "").metrics
          : [];
      return (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Title level={5} style={{ margin: 0 }}>幻灯片标题</Title>
          <Input
            value={slide.title}
            disabled={!editable}
            onChange={(e) => updateSlideTitle(sel.chapterKey, sel.slideKey, e.target.value)}
          />
          <div>
            <Text type="secondary">版式</Text>
            <div style={{ marginTop: 6 }}>
              <Select
                style={{ width: 180 }}
                value={layout}
                disabled={!editable}
                options={LAYOUT_SELECT_OPTIONS}
                onChange={(v) => updateSlideLayout(sel.chapterKey, sel.slideKey, v)}
              />
            </div>
          </div>
          {layout === "metric_columns"
            ? renderTipGroup(
                slide,
                "metric",
                metrics,
                "上半数据卡：原数字 + 空格 + 短口径",
                "例：586亿 男装大盘销售额",
              )
            : null}
          <Text type="secondary">分栏（每栏：标题 + 可选副标 + 短条目）</Text>
          {cols.map((col, ci) => (
            <Card
              key={`col-${sel.slideKey}-${ci}`}
              size="small"
              title={`栏 ${ci + 1}`}
              extra={
                editable ? (
                  <Space size={8}>
                    <ArrowUpOutlined
                      style={{
                        color: ci === 0 ? "#d9d9d9" : undefined,
                        cursor: ci === 0 ? "not-allowed" : "pointer",
                      }}
                      title="栏上移"
                      onClick={() => {
                        if (ci === 0) return;
                        const next = [...cols];
                        [next[ci - 1], next[ci]] = [next[ci], next[ci - 1]];
                        updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                      }}
                    />
                    <ArrowDownOutlined
                      style={{
                        color: ci >= cols.length - 1 ? "#d9d9d9" : undefined,
                        cursor: ci >= cols.length - 1 ? "not-allowed" : "pointer",
                      }}
                      title="栏下移"
                      onClick={() => {
                        if (ci >= cols.length - 1) return;
                        const next = [...cols];
                        [next[ci], next[ci + 1]] = [next[ci + 1], next[ci]];
                        updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                      }}
                    />
                    {cols.length > 2 ? (
                      <MinusCircleOutlined
                        style={{ color: "#ff4d4f" }}
                        onClick={() => {
                          const next = cols.filter((_, i) => i !== ci);
                          updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                        }}
                      />
                    ) : null}
                  </Space>
                ) : null
              }
            >
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                <Input
                  value={col.title}
                  disabled={!editable}
                  placeholder="栏标题，如：学生党"
                  onChange={(e) => {
                    const next = cols.map((c, i) =>
                      i === ci ? { ...c, title: e.target.value } : c,
                    );
                    updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                  }}
                />
                <Input
                  value={col.sub}
                  disabled={!editable}
                  placeholder="栏副标（可选），如：预算敏感追潮流"
                  onChange={(e) => {
                    const next = cols.map((c, i) =>
                      i === ci ? { ...c, sub: e.target.value } : c,
                    );
                    updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                  }}
                />
                {(col.items?.length ? col.items : [""]).map((item, ii) => (
                  <Space key={`col-${ci}-item-${ii}`} style={{ width: "100%" }}>
                    <Input
                      style={{ flex: 1 }}
                      value={item}
                      disabled={!editable}
                      placeholder="短条目，如：街头宽松"
                      onChange={(e) => {
                        const items = [...(col.items?.length ? col.items : [""])];
                        items[ii] = e.target.value;
                        const next = cols.map((c, i) =>
                          i === ci ? { ...c, items } : c,
                        );
                        updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                      }}
                    />
                    {editable ? (
                      <>
                        <ArrowUpOutlined
                          style={{
                            color: ii === 0 ? "#d9d9d9" : undefined,
                            cursor: ii === 0 ? "not-allowed" : "pointer",
                          }}
                          onClick={() => {
                            if (ii === 0) return;
                            const items = [...(col.items?.length ? col.items : [""])];
                            [items[ii - 1], items[ii]] = [items[ii], items[ii - 1]];
                            const next = cols.map((c, i) =>
                              i === ci ? { ...c, items } : c,
                            );
                            updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                          }}
                        />
                        <ArrowDownOutlined
                          style={{
                            color:
                              ii >= (col.items || [""]).length - 1
                                ? "#d9d9d9"
                                : undefined,
                            cursor:
                              ii >= (col.items || [""]).length - 1
                                ? "not-allowed"
                                : "pointer",
                          }}
                          onClick={() => {
                            const items = [...(col.items?.length ? col.items : [""])];
                            if (ii >= items.length - 1) return;
                            [items[ii], items[ii + 1]] = [items[ii + 1], items[ii]];
                            const next = cols.map((c, i) =>
                              i === ci ? { ...c, items } : c,
                            );
                            updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                          }}
                        />
                      </>
                    ) : null}
                    {editable && (col.items || []).filter((t) => t.trim()).length > 1 ? (
                      <MinusCircleOutlined
                        style={{ color: "#ff4d4f" }}
                        onClick={() => {
                          const items = [...(col.items || [])];
                          items.splice(ii, 1);
                          const next = cols.map((c, i) =>
                            i === ci ? { ...c, items: items.length ? items : [""] } : c,
                          );
                          updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                        }}
                      />
                    ) : null}
                  </Space>
                ))}
                {editable && (col.items || []).length < 5 ? (
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const items = [...(col.items || []), ""];
                      const next = cols.map((c, i) =>
                        i === ci ? { ...c, items } : c,
                      );
                      updateColumns(sel.chapterKey, sel.slideKey, next, layout);
                    }}
                  >
                    添加条目
                  </Button>
                ) : null}
              </Space>
            </Card>
          ))}
          {editable && cols.length < 5 ? (
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => {
                updateColumns(
                  sel.chapterKey,
                  sel.slideKey,
                  [...cols, { title: `栏${cols.length + 1}`, sub: "", items: [""] }],
                  layout,
                );
              }}
            >
              添加一栏
            </Button>
          ) : null}
        </Space>
      );
    }

    const { min, max } = tipLimits(layout);
    const tips = parseSlideTips(slide.subTitle || "").map((t) => t.text);
    const tipRows = tips.length ? tips : [""];
    return (
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Title level={5} style={{ margin: 0 }}>幻灯片标题</Title>
        <Input
          value={slide.title}
          disabled={!editable}
          onChange={(e) => updateSlideTitle(sel.chapterKey, sel.slideKey, e.target.value)}
        />
        <div>
          <Text type="secondary">版式</Text>
          <div style={{ marginTop: 6 }}>
            <Select
              style={{ width: 180 }}
              value={layout}
              disabled={!editable}
              options={LAYOUT_SELECT_OPTIONS}
              onChange={(v) => updateSlideLayout(sel.chapterKey, sel.slideKey, v)}
            />
            {editable ? (
              <Button type="link" onClick={() => autoLayout(slide)}>
                按要点重判
              </Button>
            ) : null}
          </div>
        </div>
        <div>
          <Text type="secondary">
            {layout === "metric"
              ? `数据卡要点（${min}～${max} 条）：原数字 + 空格 + 短口径（约 4～16 字）`
              : layout === "table"
                ? `表格行（${min}～${max} 行）：用 | 分隔单元格，如 维度|金额|增速|口径`
                : layout === "image_grid"
                  ? `图注（${min}～${max} 条）：每条对应一格图片说明`
                  : `列表要点（${min}～${max} 条）：短决策/动作句`}
          </Text>
          <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={8}>
            {tipRows.map((tip, index) => (
              <Card
                key={`tip-${sel.slideKey}-${index}`}
                size="small"
                title={`第 ${index + 1} 条`}
                extra={
                  editable && tipRows.filter((t) => t.trim()).length > min ? (
                    <MinusCircleOutlined
                      style={{ color: "#ff4d4f" }}
                      onClick={() => removeTip(sel.chapterKey, sel.slideKey, index)}
                    />
                  ) : null
                }
              >
                <Input.TextArea
                  value={tip}
                  disabled={!editable}
                  placeholder={
                    layout === "metric"
                      ? "例：1462亿元 上半年男装销售额"
                      : layout === "table"
                        ? "例：价格带|销售额|增速|口径"
                        : layout === "image_grid"
                          ? "例：爆款 Polo · 商务通勤"
                          : "例：优先锁定高增速核心类目再下钻单品"
                  }
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  onChange={(e) => updateTip(sel.chapterKey, sel.slideKey, index, e.target.value)}
                />
              </Card>
            ))}
          </Space>
          {editable ? (
            <Button
              type="dashed"
              block
              style={{ marginTop: 8 }}
              icon={<PlusOutlined />}
              disabled={tipRows.filter((t) => t.trim()).length >= max}
              onClick={() => addTip(sel.chapterKey, sel.slideKey)}
            >
              添加要点
            </Button>
          ) : null}
        </div>
      </Space>
    );
  };

  if (!chapters.length) {
    return <Empty description="大纲为空或格式无法解析" />;
  }

  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 520 }}>
      <div style={{ width: "38%", overflow: "auto", borderRight: "1px solid #f0f0f0", paddingRight: 8 }}>
        <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setSel({ kind: "doc" })}>
          {docTitle || "全文"}
        </Button>
        <Tree
          treeData={treeData}
          selectedKeys={selectedKeys}
          defaultExpandAll
          onSelect={onSelect}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", paddingLeft: 4 }}>
        {renderEditor()}
        {editable ? (
          <Button type="primary" style={{ marginTop: 16 }} onClick={save}>
            保存大纲
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default OutlineTreeEditor;
