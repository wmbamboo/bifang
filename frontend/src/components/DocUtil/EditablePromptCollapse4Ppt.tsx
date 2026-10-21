import {CollapseProps} from "antd/es/collapse/Collapse";
import {
  Collapse,
  Tag,
  Input,
  message,
  Button,
  Tooltip,
  Space,
  Select,
  Typography,
} from "antd";
import React, {useEffect, useState} from "react";
import {
  Slide,
  SlideLayout,
  TipRole,
  OutlineTip,
  PptPromptSavePatch,
  parseSlideTips,
  formatSlideTips,
  slideHasStructuredPrompt,
  simplePptSlidePrompt,
  pptLayoutLabelZh,
} from "@/components/DocUtil/ViewItem4Ppt";
import {layoutLabel} from "@/components/DocUtil/outlineSerialize";
import {LAYOUTS} from "@/components/DocUtil/outlineJson";
import {
  CloseOutlined,
  CompassTwoTone,
  EditTwoTone,
  MinusCircleOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";

const panelStyle: React.CSSProperties = {
  background: "aliceblue",
};

type EditDraft = {
  layout: SlideLayout;
  tips: OutlineTip[];
  prompt: string;
};

interface EditablePromptCollapseProps extends CollapseProps {
  slides: Slide[];
  fn: (e: string) => void;
  genFn: (e: string) => void;
  cbEditPromptFn: (key: string) => void;
  editKey: string;
  cbSaveResultFn: (key: string, patch: PptPromptSavePatch | string) => void;
  cbExitEditFn?: () => void;
}

const LAYOUT_OPTIONS = LAYOUTS.map((v) => ({
  value: v,
  label: layoutLabel(v),
}));

const EditablePromptCollapse4Ppt: React.FC<EditablePromptCollapseProps> = (
  props,
) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (props.editKey === "-1") {
      setDraft(null);
      return;
    }
    const slide = (props.slides || []).find((s) => s.key === props.editKey);
    if (!slide) {
      setDraft(null);
      return;
    }
    const tips = parseSlideTips(slide.subTitle || "");
    setDraft({
      layout: (slide.layout || "list") as SlideLayout,
      tips: tips.length ? tips.map((t) => ({...t})) : [{role: "list", text: ""}],
      prompt: slide.prompt || "",
    });
  }, [props.editKey, props.slides]);

  const patchDraft = (partial: Partial<EditDraft>) => {
    setDraft((prev) => (prev ? {...prev, ...partial} : prev));
  };

  const onSave = (slide: Slide) => {
    if (!draft) return;
    const useDual = slideHasStructuredPrompt(slide);
    if (!useDual) {
      props.cbSaveResultFn(slide.key, draft.prompt);
      messageApi.success("提示词已保存");
      return;
    }
    const tips = draft.tips
      .map((t) => ({
        role: (t.role === "metric" ? "metric" : "list") as TipRole,
        text: (t.text || "").trim(),
      }))
      .filter((t) => t.text);
    const subTitle = formatSlideTips(tips);
    const patch: PptPromptSavePatch = {
      layout: draft.layout,
      subTitle,
      prompt: draft.prompt,
    };
    props.cbSaveResultFn(slide.key, patch);
    messageApi.success("提示词已保存");
  };

  const contentShower = (slide: Slide) => {
    const structured = slideHasStructuredPrompt(slide);
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
            {simplePptSlidePrompt(slide)}
          </pre>
        </>
      );
    }
    return (
      <>
        <p style={{marginBottom: 4}}>
          <Tag color={"volcano"}>提示词·简单层</Tag>
          <Tag>{pptLayoutLabelZh(slide.layout)}</Tag>
        </p>
        <div
          style={{
            margin: 0,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {simplePptSlidePrompt(slide)}
        </div>
      </>
    );
  };

  const updateTip = (index: number, partial: Partial<OutlineTip>) => {
    if (!draft) return;
    const tips = draft.tips.map((t, i) =>
      i === index ? {...t, ...partial} : t,
    );
    patchDraft({tips});
  };

  const removeTip = (index: number) => {
    if (!draft) return;
    if (draft.tips.length <= 1) {
      messageApi.warning("至少保留 1 条要点");
      return;
    }
    patchDraft({tips: draft.tips.filter((_, i) => i !== index)});
  };

  const addTip = () => {
    if (!draft) return;
    patchDraft({tips: [...draft.tips, {role: "list", text: ""}]});
  };

  const contentEditor = (slide: Slide) => {
    if (!draft) return null;
    const useDual = slideHasStructuredPrompt(slide);

    if (!useDual) {
      return (
        <div>
          <p>
            <Tag color={"volcano"}>提示词</Tag>
            <Space style={{float: "right", marginRight: 8}}>
              <Tooltip title="取消编辑">
                <CloseOutlined
                  style={{fontSize: "x-large", color: "#999"}}
                  onClick={() => props.cbExitEditFn?.()}
                />
              </Tooltip>
              <Tooltip title="保存">
                <SaveOutlined
                  style={{fontSize: "x-large", color: "darkcyan"}}
                  onClick={() => onSave(slide)}
                />
              </Tooltip>
            </Space>
          </p>
          <Input.TextArea
            key={"ta-" + slide.key}
            autoSize={{minRows: 4}}
            value={draft.prompt}
            onChange={(e) => patchDraft({prompt: e.target.value})}
          />
        </div>
      );
    }

    return (
      <div>
        <p>
          <Tag color={"volcano"}>提示词·简单层</Tag>
          <Space style={{float: "right", marginRight: 8}}>
            <Tooltip title="取消编辑（不保存）">
              <CloseOutlined
                style={{fontSize: "x-large", color: "#999"}}
                onClick={() => props.cbExitEditFn?.()}
              />
            </Tooltip>
            <Tooltip title="保存">
              <SaveOutlined
                style={{fontSize: "x-large", color: "darkcyan"}}
                onClick={() => onSave(slide)}
              />
            </Tooltip>
          </Space>
        </p>
        <Space direction="vertical" style={{width: "100%"}} size="middle">
          <div>
            <Typography.Text type="secondary">版式</Typography.Text>
            <div style={{marginTop: 4}}>
              <Select
                style={{width: 200}}
                value={draft.layout}
                options={LAYOUT_OPTIONS}
                onChange={(v) => patchDraft({layout: v as SlideLayout})}
              />
            </div>
          </div>
          <div>
            <Typography.Text type="secondary">本页要点</Typography.Text>
            <Space
              direction="vertical"
              style={{width: "100%", marginTop: 8}}
              size={8}
            >
              {draft.tips.map((tip, index) => (
                <Space key={index} align="start" style={{width: "100%"}}>
                  <Select
                    style={{width: 100}}
                    value={tip.role}
                    options={[
                      {value: "list", label: "要点"},
                      {value: "metric", label: "数据卡"},
                    ]}
                    onChange={(v) =>
                      updateTip(index, {role: v as TipRole})
                    }
                  />
                  <Input
                    style={{flex: 1, minWidth: 180}}
                    value={tip.text}
                    placeholder="要点正文"
                    onChange={(e) => updateTip(index, {text: e.target.value})}
                  />
                  <MinusCircleOutlined
                    style={{color: "#ff4d4f", marginTop: 8}}
                    onClick={() => removeTip(index)}
                  />
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={addTip}>
                添加要点行
              </Button>
            </Space>
          </div>
          <Collapse
            bordered={false}
            defaultActiveKey={[]}
            items={[
              {
                key: "adv",
                label: (
                  <Typography.Text type="secondary">
                    高级（改这里会覆盖简单层）
                  </Typography.Text>
                ),
                children: (
                  <Input.TextArea
                    autoSize={{minRows: 6}}
                    value={draft.prompt}
                    onChange={(e) => patchDraft({prompt: e.target.value})}
                  />
                ),
              },
            ]}
          />
        </Space>
      </div>
    );
  };

  const onChange = (e: string[]) => {
    props.fn(e[0]);
  };

  const genPptImage = (
    <>
      <CompassTwoTone style={{fontSize: "x-large"}} />
    </>
  );
  const getSlideExtra = (slide: Slide) => {
    if (props.activeKey !== slide.key) return null;
    return (
      <>
        <Tooltip title="提示词编辑">
          <Button
            icon={<EditTwoTone style={{fontSize: "x-large"}} />}
            type="dashed"
            size={"middle"}
            onClick={(event) => {
              props.cbEditPromptFn(slide.key);
              event.stopPropagation();
            }}
          />
        </Tooltip>
        <Tooltip title="重新生成">
          <Button
            icon={genPptImage}
            type="dashed"
            size={"middle"}
            onClick={(event) => {
              props.genFn(slide.key);
              event.stopPropagation();
            }}
            style={{marginLeft: "10px"}}
          />
        </Tooltip>
      </>
    );
  };

  const slides = props.slides;
  const cItemsSubNew: CollapseProps["items"] = [];
  if (Array.isArray(slides)) {
    for (const slide of slides) {
      cItemsSubNew.push({
        key: slide.key,
        label: (
          <Space size={6}>
            <span>{slide.label}</span>
            <Tag
              color={
                slide.layout === "metric"
                  ? "geekblue"
                  : slide.layout === "metric_list"
                    ? "purple"
                    : "default"
              }
            >
              {layoutLabel(slide.layout)}
            </Tag>
          </Space>
        ),
        children:
          props.activeKey === props.editKey && props.editKey === slide.key
            ? contentEditor(slide)
            : contentShower(slide),
        style: panelStyle,
        extra: getSlideExtra(slide),
      });
    }
  }
  return (
    <>
      {contextHolder}
      <Collapse
        accordion
        items={cItemsSubNew}
        onChange={onChange}
        activeKey={props.activeKey}
      />
    </>
  );
};

export default EditablePromptCollapse4Ppt;
