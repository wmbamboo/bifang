import {Collapse, CollapseProps, Tag} from "antd";
import {ViewItem4Doc,Chapter,Doc} from "./ViewItem4Doc";
// import {outlineType, outlineTypeDOC} from "@/components/DocUtil/OutlineStore";
import {useState} from "react";
import EditablePromptCollapse4Doc from "@/components/DocUtil/EditablePromptCollapse4Doc";

interface DocOutlinePromptProps {
  id?: string,
  chapters: Chapter[],
  activeKey:string,
  fn: (e:string)=>void,
  genFn:(e:string)=>void,
  cbSaveResultFn:(key:string,newPrompt:string)=>void
}

const panelStyle: React.CSSProperties = {
  background: "rgb(244 251 249)", // "aliceblue",
}

const OutlinePromptDoc: React.FC <DocOutlinePromptProps>
  = ({chapters,activeKey,fn,genFn,cbSaveResultFn}) => {
  const [editPromptParagraphKey,setEditPromptParagraphKey]=useState<string>('-1');

  const keys =Doc.getKeysFromKey(chapters,activeKey);
  /**
   * 这是章节间的切换。
   * @param e
   */
  const onChange=(e:string[])=>{
    console.log(e);
    // setIsEditing(false);
    if(fn) {
      fn(e[0]);
    }
  }
  if (!keys) {
    return <Collapse ghost accordion items={[]} />;
  }
  /**
   * children 里的 change消息
   * @param e
   */
  const onSubChange=(e:string[])=>{
    console.log(e);
    // setIsEditing(false);
    if(fn) {
      fn(e[0]);
    }
  }
  /**
   * promptCollapse中的编辑按钮消息传递,根据子组件的通知更新本组件的状态
   * @param key
   */
  const cb4EditParagraph_prompt=(key:string) => {
    console.log(`outlineGenDoc.tsx#cb4Edit,prompt:${key}`);
    const paragraph = Doc.getParagraph(chapters, key);
    if (paragraph) {
      // setIsEditing(true)
      setEditPromptParagraphKey(key)
    } else {
      console.error(`出错了，要编辑提示词的章节key为${key}。`)
    }
  }

  /**
   * 根据子组件传递来的新prompt，传递给上一级组件。
   * @param key
   * @param newPrompt
   */
  function onSaveResultFn(key:string,newPrompt:string) {
    cbSaveResultFn(key,newPrompt);
    setEditPromptParagraphKey("-1")
  }

  const get_items=(chapters:Chapter[])=> {
    /** 构造新chapter collapse数组**/
    const chaptersNew: CollapseProps['items'] = [];
    for (let chapter of chapters) {
      // const items=item1.childItems;
      if (Array.isArray(chapter.paragraphs)) {
        /** 构造新paragraph collapse数组**/
        const paragraphsNew: CollapseProps['items'] = [];
        for (let paragraph of chapter.paragraphs) {
          paragraphsNew.push(
            {
              key: paragraph.key,
              label: paragraph.label,
              // eslint-disable-next-line react/no-unescaped-entities
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
                                                  onChange={onChange} fn={fn}  /*isEditing={isEditing}*/
                                                  activeKey={keys.paragraphKey} cbEditPromptFn={cb4EditParagraph_prompt}
                                                  genFn={genFn} editKey={editPromptParagraphKey}
                                                  cbSaveResultFn={onSaveResultFn}/>,
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
