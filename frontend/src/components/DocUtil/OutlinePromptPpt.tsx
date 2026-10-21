import {Collapse, CollapseProps, Space, Tag} from "antd";
import {
  Chapter,
  Ppt,
  PptPromptSavePatch,
  countOutlineTips,
  pptLayoutLabelZh,
  pptTipCapacityHint,
  simplePptSlidePrompt,
  splitMetricListTips,
} from "@/components/DocUtil/ViewItem4Ppt";
import {useState} from "react";
import EditablePromptCollapse4Ppt from "@/components/DocUtil/EditablePromptCollapse4Ppt";

interface PptOutlinePromptProps {
  chapters: Chapter[];
  activeKey?: string;
  fn: (e: string) => void;
  genFn: (e: string) => void;
  cbSaveResultFn: (key: string, patch: PptPromptSavePatch | string) => void;
  cbErrorFn?: (activeKey: string) => void;
}

const panelStyle: React.CSSProperties = {
  background: "rgb(244 251 249)",
};

const PptOutlinePrompt: React.FC<PptOutlinePromptProps> = ({
  chapters,
  activeKey = "slide1",
  fn,
  genFn,
  cbSaveResultFn,
}) => {
  const [editPromptSlideKey, setPromptSlideKey] = useState<string>("-1");

  const keys = Ppt.getKeysFromKey(chapters, activeKey);
  if (!keys) {
    return null;
  }

  const onChange = (e: string[]) => {
    if (fn) fn(e[0]);
  };
  const onSubChange = (e: string[]) => {
    if (fn) fn(e[0]);
  };

  const cb4EditSlide_prompt = (key: string) => {
    const slide = Ppt.getSlide(chapters, key);
    if (slide) {
      setPromptSlideKey(key);
    } else {
      console.error(`出错了，要编辑提示词的幻灯片key为${key}。`);
    }
  };

  function onSaveResultFn(key: string, patch: PptPromptSavePatch | string) {
    cbSaveResultFn(key, patch);
    setPromptSlideKey("-1");
  }

  const get_items = (chapters: Chapter[]) => {
    const itemsNew: CollapseProps["items"] = [];
    for (const chapter of chapters) {
      const slides = chapter.slides;
      if (!Array.isArray(slides)) continue;
      const itemsSubNew: CollapseProps["items"] = [];
      for (const slide of slides) {
        const n = countOutlineTips(slide.subTitle || "");
        const chips: string[] = [pptLayoutLabelZh(slide.layout)];
        if (slide.layout === "metric_list") {
          const {metrics, lists} = splitMetricListTips(slide.subTitle || "");
          chips.push(`数据卡 ${metrics.length} / 要点 ${lists.length}`);
        } else {
          chips.push(`要点 ${n}`);
        }
        chips.push(pptTipCapacityHint(slide.layout));
        itemsSubNew.push({
          key: slide.key,
          label: slide.label,
          children: (
            <div>
              <Space size={4} wrap style={{marginBottom: 6}}>
                {chips.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </Space>
              <div style={{whiteSpace: "pre-wrap", lineHeight: 1.6}}>
                {simplePptSlidePrompt(slide)}
              </div>
            </div>
          ),
          style: panelStyle,
        });
      }
      itemsNew.push({
        key: chapter.key,
        label: chapter.label,
        children: (
          <EditablePromptCollapse4Ppt
            accordion
            items={itemsSubNew}
            onChange={onSubChange}
            fn={fn}
            slides={slides}
            activeKey={keys.slideKey}
            cbEditPromptFn={cb4EditSlide_prompt}
            genFn={genFn}
            editKey={editPromptSlideKey}
            cbSaveResultFn={onSaveResultFn}
            cbExitEditFn={() => setPromptSlideKey("-1")}
          />
        ),
      });
    }
    return itemsNew;
  };
  const newItems = get_items(chapters);

  return (
    <Collapse
      ghost
      accordion
      items={newItems}
      onChange={onChange}
      activeKey={keys.chapterKey}
    />
  );
};
export {PptOutlinePrompt};
