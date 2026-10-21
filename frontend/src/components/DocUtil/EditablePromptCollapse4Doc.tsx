import {CollapseProps} from "antd/es/collapse/Collapse";
import {
  Collapse,
  Tag,
  Input,
  InputNumber,
  message,
  Button,
  Tooltip,
  Switch,
  Drawer,
  Space,
  Typography,
  Divider,
} from "antd";
import React, {useEffect, useState} from "react";
import {
  CompassTwoTone,
  CloseOutlined,
  EditTwoTone,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Paragraph,
  DocPromptSavePatch,
  assembleDocParagraphPrompt,
  paragraphHasStructuredPrompt,
  paragraphPointLabels,
  simpleDocParagraphPrompt,
  wordBudgetFor,
  clampWordBudget,
  formatWordBudgetZh,
} from "@/components/DocUtil/ViewItem4Doc";
import {buildKbDocWritingConstraintPrompt} from "@/components/DocUtil/parseChatCompletion";

const panelStyle: React.CSSProperties = {
  background: "aliceblue",
};

interface EditablePromptCollapse4DocProps extends CollapseProps {
  paragraphs: Paragraph[];
  /** 章节标题：拼 prompt / 恢复默认时用 */
  chapterTitle?: string;
  /** 文章标题 */
  docTitle?: string;
  fn: (e: string) => void;
  genFn: (e: string) => void;
  cbEditPromptFn: (key: string) => void;
  editKey: string;
  cbSaveResultFn: (key: string, patch: DocPromptSavePatch | string) => void;
  /** 取消编辑（不保存） */
  cbExitEditFn?: () => void;
}

type EditDraft = {
  wordMin: number;
  wordMax: number;
  role: string;
  question: string;
  allowTable: boolean;
  allowFigure: boolean;
  pointsText: string;
  prompt: string;
  promptManual: boolean;
};

function draftFromParagraph(p: Paragraph): EditDraft {
  const b = wordBudgetFor(p);
  return {
    wordMin: b.min,
    wordMax: b.max,
    role: p.role || "",
    question: p.question || "",
    allowTable: p.allowTable !== false,
    allowFigure: p.allowFigure !== false,
    // points 可能已被 fold 进 pointGuide，须回读
    pointsText: paragraphPointLabels(p).join("\n"),
    prompt: p.prompt || "",
    promptManual: !!p.promptManual,
  };
}

function applyDraftToPrompt(
  paragraph: Paragraph,
  draft: EditDraft,
  chapterTitle: string,
  docTitle: string,
  forceAssemble: boolean,
): string {
  if (draft.promptManual && !forceAssemble) {
    return draft.prompt;
  }
  const points = draft.pointsText
    .split(/[\n、,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
  const shadow = new Paragraph(paragraph.index, paragraph.title, paragraph.subTitle);
  shadow.heading = paragraph.heading;
  shadow.container = paragraph.container;
  // 草稿要点写入 points，清空 guide，让 assemble 用同一路径拼【本段要点】
  shadow.points = points;
  shadow.pointGuide = "";
  shadow.wordBudget = clampWordBudget({
    min: draft.wordMin,
    max: draft.wordMax,
  });
  shadow.role = draft.role;
  shadow.question = draft.question;
  shadow.allowTable = draft.allowTable;
  shadow.allowFigure = draft.allowFigure;
  shadow.promptManual = false;
  return assembleDocParagraphPrompt(shadow, {
    docTitle: docTitle || "文章",
    chapterTitle: chapterTitle || "",
    includeFormat: true,
  });
}

const EditablePromptCollapse4Doc: React.FC<EditablePromptCollapse4DocProps> = (
  props,
) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const chapterTitle = props.chapterTitle || "";
  const docTitle = props.docTitle || "";

  useEffect(() => {
    if (props.editKey && props.editKey !== "-1") {
      const p = props.paragraphs.find((x) => x.key === props.editKey);
      if (p) setDraft(draftFromParagraph(p));
    } else {
      setDraft(null);
      setAdvOpen(false);
    }
  }, [props.editKey, props.paragraphs]);

  const patchDraft = (partial: Partial<EditDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const onSave = (paragraph: Paragraph) => {
    if (!draft) return;
    const structured = paragraphHasStructuredPrompt(paragraph) || !paragraph.prompt;
    let prompt = draft.prompt;
    let promptManual = draft.promptManual;
    if (structured && !draft.promptManual) {
      prompt = applyDraftToPrompt(paragraph, draft, chapterTitle, docTitle, true);
      promptManual = false;
    } else if (!structured) {
      // 存量整串：只保存 TextArea
      promptManual = true;
    }
    const points = draft.pointsText
      .split(/[\n、,，;；]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
    const patch: DocPromptSavePatch = {
      prompt,
      wordBudget: clampWordBudget({ min: draft.wordMin, max: draft.wordMax }),
      role: draft.role,
      question: draft.question,
      allowTable: draft.allowTable,
      allowFigure: draft.allowFigure,
      promptManual,
      // 允许清空；落盘时 applyDocPromptSavePatch 会同步进 pointGuide
      points,
    };
    props.cbSaveResultFn(paragraph.key, patch);
    messageApi.success("提示词已保存");
  };

  const onRestoreDefault = (paragraph: Paragraph) => {
    if (!draft) return;
    const next = {
      ...draft,
      promptManual: false,
      wordMin: wordBudgetFor({
        heading: paragraph.heading,
        container: paragraph.container,
      }).min,
      wordMax: wordBudgetFor({
        heading: paragraph.heading,
        container: paragraph.container,
      }).max,
    };
    const prompt = applyDraftToPrompt(
      paragraph,
      next,
      chapterTitle,
      docTitle,
      true,
    );
    setDraft({ ...next, prompt, promptManual: false });
    messageApi.info("已按字段重拼提示词");
  };

  const contentShower = (paragraph: Paragraph) => {
    const b = wordBudgetFor(paragraph);
    const structured = paragraphHasStructuredPrompt(paragraph);
    // 十四·14.3.5：默认只展示简单层字段，整串进高级抽屉；存量无结构化字段才展示整串
    if (!structured) {
      return (
        <>
          <p>
            <Tag color={"volcano"}>提示词</Tag>
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "inherit",
              fontSize: "inherit",
              lineHeight: 1.6,
            }}
          >
            {simpleDocParagraphPrompt(paragraph)}
          </pre>
        </>
      );
    }
    return (
      <>
        <p style={{ marginBottom: 4 }}>
          <Tag color={"volcano"}>提示词·简单层</Tag>
          <Tag>{formatWordBudgetZh(b)} 字</Tag>
          {paragraph.role ? <Tag color="blue">{paragraph.role}</Tag> : null}
          {paragraph.allowTable === false ? <Tag>禁表</Tag> : (
            <Tag color="cyan">出表</Tag>
          )}
          {paragraph.allowFigure === false ? <Tag>禁图</Tag> : (
            <Tag color="cyan">出图</Tag>
          )}
          {paragraph.promptManual ? (
            <Tag color="orange">已手改高级模板</Tag>
          ) : null}
        </p>
        {/* 三十八·5：展示面只用简单提示词；整串契约仅在高级抽屉 */}
        <div
          style={{
            margin: 0,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {simpleDocParagraphPrompt(paragraph)}
        </div>
      </>
    );
  };

  const contentEditor = (paragraph: Paragraph) => {
    if (!draft) return null;
    // 有结构化字段 → 双层；存量仅整串 prompt → 整段 TextArea
    const useDual = paragraphHasStructuredPrompt(paragraph);

    if (!useDual) {
      return (
        <div>
          <p>
            <Tag color={"volcano"}>提示词</Tag>
            <Space style={{ float: "right", marginRight: 8 }}>
              <Tooltip title="取消编辑">
                <CloseOutlined
                  style={{ fontSize: "x-large", color: "#999" }}
                  onClick={() => props.cbExitEditFn?.()}
                />
              </Tooltip>
              <Tooltip title="保存">
                <SaveOutlined
                  style={{ fontSize: "x-large", color: "darkcyan" }}
                  onClick={() => onSave(paragraph)}
                />
              </Tooltip>
            </Space>
          </p>
          <Input.TextArea
            key={"ta-" + paragraph.key}
            autoSize={{ minRows: 4 }}
            value={draft.prompt}
            onChange={(e) =>
              patchDraft({ prompt: e.target.value, promptManual: true })
            }
          />
        </div>
      );
    }

    return (
      <div>
        <p>
          <Tag color={"volcano"}>提示词·简单层</Tag>
          <Space style={{ float: "right", marginRight: 8 }}>
            <Tooltip title="高级：整串模板">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setAdvOpen(true)}
              />
            </Tooltip>
            <Tooltip title="取消编辑（不保存）">
              <CloseOutlined
                style={{ fontSize: "x-large", color: "#999" }}
                onClick={() => props.cbExitEditFn?.()}
              />
            </Tooltip>
            <Tooltip title="保存">
              <SaveOutlined
                style={{ fontSize: "x-large", color: "darkcyan" }}
                onClick={() => onSave(paragraph)}
              />
            </Tooltip>
          </Space>
        </p>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text type="secondary">字数预算</Typography.Text>
            <Space style={{ marginLeft: 8 }}>
              <InputNumber
                min={40}
                max={2000}
                value={draft.wordMin}
                onChange={(v) =>
                  patchDraft({
                    wordMin: Number(v) || 40,
                    promptManual: false,
                  })
                }
              />
              <span>～</span>
              <InputNumber
                min={40}
                max={2000}
                value={draft.wordMax}
                onChange={(v) =>
                  patchDraft({
                    wordMax: Number(v) || 400,
                    promptManual: false,
                  })
                }
              />
              <span>字</span>
            </Space>
          </div>
          <div>
            <Typography.Text type="secondary">岗位视角</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={draft.role}
              placeholder="如：抖音男装选品运营"
              onChange={(e) =>
                patchDraft({ role: e.target.value, promptManual: false })
              }
            />
          </div>
          <div>
            <Typography.Text type="secondary">本章要回答的问题</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              autoSize={{ minRows: 2 }}
              value={draft.question}
              onChange={(e) =>
                patchDraft({ question: e.target.value, promptManual: false })
              }
            />
          </div>
          <div>
            <Typography.Text type="secondary">
              本段要点（每行一条，可选）
            </Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              autoSize={{ minRows: 2 }}
              value={draft.pointsText}
              placeholder="可留空"
              onChange={(e) =>
                patchDraft({ pointsText: e.target.value, promptManual: false })
              }
            />
          </div>
          <Space>
            <span>允许出表</span>
            <Switch
              checked={draft.allowTable}
              onChange={(v) =>
                patchDraft({ allowTable: v, promptManual: false })
              }
            />
            <span>允许出图</span>
            <Switch
              checked={draft.allowFigure}
              onChange={(v) =>
                patchDraft({ allowFigure: v, promptManual: false })
              }
            />
          </Space>
          {draft.promptManual ? (
            <Typography.Text type="warning">
              已手改高级模板；改简单层字段后点「恢复默认」才会重拼。
            </Typography.Text>
          ) : null}
        </Space>

        <Drawer
          title="高级：整串提示词模板"
          open={advOpen}
          onClose={() => setAdvOpen(false)}
          width={520}
          extra={
            <Space>
              <Button onClick={() => onRestoreDefault(paragraph)}>
                恢复默认
              </Button>
              <Button type="primary" onClick={() => onSave(paragraph)}>
                保存
              </Button>
            </Space>
          }
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            手改下方全文后保存，将按整串发送（不再自动用简单层字段重拼）。
            「恢复默认」按当前简单层字段重新 assemble。
          </Typography.Paragraph>
          <Input.TextArea
            autoSize={{ minRows: 12 }}
            value={
              draft.promptManual
                ? draft.prompt
                : applyDraftToPrompt(
                    paragraph,
                    draft,
                    chapterTitle,
                    docTitle,
                    true,
                  )
            }
            onChange={(e) =>
              patchDraft({ prompt: e.target.value, promptManual: true })
            }
          />
          <Divider />
          <Typography.Text strong>运行时追加（只读）</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            生成时由系统拼在末尾，不可在此编辑。
          </Typography.Paragraph>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f5f5f5",
              padding: 8,
              fontSize: 12,
            }}
          >
            {buildKbDocWritingConstraintPrompt(
              clampWordBudget({ min: draft.wordMin, max: draft.wordMax }),
              {allowFigure: draft.allowFigure},
            )}
            {"\n"}
            【可用插图资产】…（有材料池时按段注入）
          </pre>
        </Drawer>
      </div>
    );
  };

  const onChange = (e: string[]) => {
    const next = e?.[0];
    // 切到其他段或收起 → 退出编辑（与章级切换一致）
    if (
      props.editKey &&
      props.editKey !== "-1" &&
      (!next || next !== props.editKey)
    ) {
      props.cbExitEditFn?.();
    }
    props.fn(next);
  };
  const genDocIcon = (
    <>
      <CompassTwoTone style={{ fontSize: "x-large" }} />
    </>
  );
  const getParagraphExtra = (paragraph: Paragraph) => {
    if (props.activeKey === paragraph.key) {
      return (
        <>
          <Tooltip title="提示词编辑">
            <Button
              icon={<EditTwoTone style={{ fontSize: "x-large" }} />}
              type="dashed"
              size={"middle"}
              onClick={(event) => {
                setDraft(draftFromParagraph(paragraph));
                props.cbEditPromptFn(paragraph.key);
                event.stopPropagation();
              }}
            ></Button>
          </Tooltip>
          <Tooltip title="独立生成">
            <Button
              icon={genDocIcon}
              type="dashed"
              size={"middle"}
              onClick={(event) => {
                props.genFn(paragraph.key);
                event.stopPropagation();
              }}
              style={{ marginLeft: "10px" }}
            ></Button>
          </Tooltip>
        </>
      );
    }
  };
  const paragraphs = props.paragraphs;
  const paragraphsNew: CollapseProps["items"] = [];
  if (Array.isArray(paragraphs)) {
    for (let paragraph of paragraphs) {
      paragraphsNew.push({
        key: paragraph.key,
        label: paragraph.label,
        children:
          props.activeKey === props.editKey && props.editKey === paragraph.key
            ? contentEditor(paragraph)
            : contentShower(paragraph),
        style: panelStyle,
        extra: getParagraphExtra(paragraph),
      });
    }
  }
  return (
    <>
      {contextHolder}
      <Collapse
        accordion
        items={paragraphsNew}
        onChange={onChange}
        activeKey={props.activeKey}
      />
    </>
  );
};

export default EditablePromptCollapse4Doc;
