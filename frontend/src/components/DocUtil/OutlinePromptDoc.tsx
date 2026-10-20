import {Collapse, CollapseProps, Tag} from "antd";
import {Chapter, Doc, DocPromptSavePatch} from "./ViewItem4Doc";
import {useState} from "react";
import EditablePromptCollapse4Doc from "@/components/DocUtil/EditablePromptCollapse4Doc";

interface DocOutlinePromptProps {
  id?: string,
  chapters: Chapter[],
  /** 文章标题，供 assemble / 恢复默认 */
  docTitle?: string,
  activeKey:string,
  fn: (e:string)=>void,
  genFn:(e:string)=>void,
  cbSaveResultFn:(key:string, patch: DocPromptSavePatch | string)=>void
}

const panelStyle: React.CSSProperties = {
  background: "rgb(244 251 249)", // "aliceblue",
}

const OutlinePromptDoc: React.FC <DocOutlinePromptProps>
  = ({chapters, docTitle, activeKey,fn,genFn,cbSaveResultFn}) => {
  const [editPromptParagraphKey,setEditPromptParagraphKey]=useState<string>('-1');

  const keys =Doc.getKeysFromKey(chapters,activeKey);
  /**
   * 章/段切换：切走当前编辑段或收起 → 退出编辑（未保存草稿丢弃）。
   */
  const onChange=(e:string[])=>{
    const next = e?.[0];
    if (
      editPromptParagraphKey !== "-1" &&
      (!next || next !== editPromptParagraphKey)
    ) {
      setEditPromptParagraphKey("-1");
    }
    if(fn) {
      fn(next);
    }
  }
  if (!keys) {
    return <Collapse ghost accordion items={[]} />;
  }
  /**
   * promptCollapse中的编辑按钮消息传递,根据子组件的通知更新本组件的状态
   * @param key
   */
  const cb4EditParagraph_prompt=(key:string) => {
    console.log(`outlineGenDoc.tsx#cb4Edit,prompt:${key}`);
    const paragraph = Doc.getParagraph(chapters, key);
    if (paragraph) {
      // 再点一次同一段的编辑 = 取消编辑
      if (editPromptParagraphKey === key) {
        setEditPromptParagraphKey("-1");
      } else {
        setEditPromptParagraphKey(key);
      }
    } else {
      console.error(`出错了，要编辑提示词的章节key为${key}。`)
    }
  }

  const cbExitEdit = () => setEditPromptParagraphKey("-1");

  /**
   * 根据子组件传递来的新prompt，传递给上一级组件。
   */
  function onSaveResultFn(key:string, patch: DocPromptSavePatch | string) {
    cbSaveResultFn(key, patch);
    setEditPromptParagraphKey("-1")
  }

  const get_items=(chapters:Chapter[])=> {
    const chaptersNew: CollapseProps['items'] = [];
    for (let chapter of chapters) {
      if (Array.isArray(chapter.paragraphs)) {
        const paragraphsNew: CollapseProps['items'] = [];
        for (let paragraph of chapter.paragraphs) {
          paragraphsNew.push(
            {
              key: paragraph.key,
              label: paragraph.label,
              children: <p><Tag color={"volcano"}>提示词<br/></Tag>
                {paragraph.prompt}
              </p>,
              style: panelStyle
            }
          )
        }
        chaptersNew.push(
          {
            key: chapter.key,
            label: chapter.label,
            children: <EditablePromptCollapse4Doc accordion items={paragraphsNew} paragraphs={chapter.paragraphs}
                                                  chapterTitle={chapter.title}
                                                  docTitle={docTitle || ""}
                                                  onChange={onChange} fn={fn}
                                                  activeKey={keys.paragraphKey} cbEditPromptFn={cb4EditParagraph_prompt}
                                                  genFn={genFn} editKey={editPromptParagraphKey}
                                                  cbSaveResultFn={onSaveResultFn}
                                                  cbExitEditFn={cbExitEdit}/>,
          }
        )
      }
    }
    return chaptersNew;
  }
  let newItems=get_items(chapters)

  return (
    <Collapse ghost accordion items={newItems} onChange={onChange}
              activeKey={keys.chapterKey} />
  );
}
export { OutlinePromptDoc };
