import {Collapse, CollapseProps, Space, Tag} from "antd";
import {
  Chapter,
  Paragraph,
  Doc,
  countChapterMedia,
  countParagraphMedia,
} from "@/components/DocUtil/ViewItem4Doc";
import {CheckCircleTwoTone, CheckSquareTwoTone} from "@ant-design/icons";
import React from "react";

interface OutlineResultProps {
  chapters: Chapter[];
  activeKey: string;
  fn: (e: string) => void;
}
const panelStyle: React.CSSProperties = {
  background: "aliceblue",
};

const stop = (event: React.MouseEvent) => {
  event.stopPropagation();
};

/** 表/图状态 Tag + 生成完成勾 */
function MediaExtra(props: {
  tables: number;
  figures: number;
  doneIcon?: React.ReactNode;
}) {
  const {tables, figures, doneIcon} = props;
  if (!tables && !figures && !doneIcon) return null;
  return (
    <Space
      size={4}
      onClick={stop}
      style={{flexWrap: "wrap", justifyContent: "flex-end"}}
    >
      {tables > 0 ? (
        <Tag color="orange" style={{marginInlineEnd: 0}}>
          表{tables}
        </Tag>
      ) : null}
      {figures > 0 ? (
        <Tag color="magenta" style={{marginInlineEnd: 0}}>
          图{figures}
        </Tag>
      ) : null}
      {doneIcon}
    </Space>
  );
}

const OutlineResultDoc: React.FC<OutlineResultProps> = ({
  chapters,
  activeKey,
  fn,
}) => {
  const keys = Doc.getKeysFromKey(chapters, activeKey);
  if (!keys) {
    return <Collapse ghost accordion items={[]} />;
  }
  const contentEmpty = () => (
    <p>
      <Tag color="geekblue">
        生成内容
        <br />
      </Tag>
      <br />
      尚未生成
    </p>
  );
  const contentShow = (paragraph: Paragraph) => {
    const {tables, figures} = countParagraphMedia(paragraph);
    return (
      <div>
        <p>
          <Tag color="geekblue">
            生成内容
            <br />
          </Tag>
          {(tables > 0 || figures > 0) && (
            <span style={{marginLeft: 8}}>
              {tables > 0 ? (
                <Tag color="orange" style={{marginInlineEnd: 4}}>
                  含表{tables}
                </Tag>
              ) : null}
              {figures > 0 ? (
                <Tag color="magenta" style={{marginInlineEnd: 4}}>
                  含图{figures}
                </Tag>
              ) : null}
            </span>
          )}
        </p>
        <div style={{whiteSpace: "pre-wrap"}}>{paragraph.content}</div>
      </div>
    );
  };
  const onChange = (e: string[]) => {
    fn(e[0]);
  };
  const getParagraphExtra = (paragraph: Paragraph) => {
    const {tables, figures} = countParagraphMedia(paragraph);
    const done =
      paragraph.content.length > 0 ? (
        <CheckCircleTwoTone twoToneColor="#52c41a" />
      ) : null;
    return (
      <MediaExtra tables={tables} figures={figures} doneIcon={done} />
    );
  };
  const getChapterExtra = (chapter: Chapter) => {
    const paragraphs = chapter.paragraphs;
    let flag = 0;
    for (const paragraph of paragraphs) {
      if (paragraph.content.length > 0) flag += 1;
    }
    const {tables, figures} = countChapterMedia(chapter);
    const allDone =
      paragraphs.length > 0 && flag === paragraphs.length ? (
        <CheckSquareTwoTone twoToneColor="#52c41a" />
      ) : null;
    return (
      <MediaExtra tables={tables} figures={figures} doneIcon={allDone} />
    );
  };

  const getCollapseItems = (chs: Chapter[]) => {
    const chaptersNew: CollapseProps["items"] = [];
    for (const chapter of chs) {
      if (Array.isArray(chapter.paragraphs)) {
        const paragraphsNew: CollapseProps["items"] = [];
        for (const paragraph of chapter.paragraphs) {
          paragraphsNew.push({
            key: paragraph.key,
            label: paragraph.label,
            children:
              paragraph.content.length === 0
                ? contentEmpty()
                : contentShow(paragraph),
            style: panelStyle,
            extra: getParagraphExtra(paragraph),
          });
        }
        chaptersNew.push({
          key: chapter.key,
          label: chapter.label,
          children: (
            <Collapse
              accordion
              items={paragraphsNew}
              onChange={onChange}
              activeKey={keys.paragraphKey}
            />
          ),
          extra: getChapterExtra(chapter),
        });
      }
    }
    return chaptersNew;
  };
  const collapseItems: CollapseProps["items"] = getCollapseItems(chapters);

  return (
    <Collapse
      ghost
      accordion
      items={collapseItems}
      onChange={onChange}
      activeKey={keys.chapterKey}
    />
  );
};
export {OutlineResultDoc};
