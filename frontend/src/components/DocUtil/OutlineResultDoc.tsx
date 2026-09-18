import {Collapse, CollapseProps, Tag} from "antd";
import {ViewItem4Doc,Chapter,Paragraph,Doc} from "@/components/DocUtil/ViewItem4Doc";
import {CheckCircleTwoTone, CheckSquareTwoTone} from "@ant-design/icons";
import React from "react";

interface OutlineResultProps {
  chapters: Chapter[];
  activeKey: string;
  fn:(e:string)=>void;
}
const panelStyle: React.CSSProperties = {
  background: "aliceblue",
}

const OutlineResultDoc: React.FC <OutlineResultProps>= ({chapters,activeKey,fn }) => {
  const keys =Doc.getKeysFromKey(chapters,activeKey);
  // console.log("hezl-result1:-------------"+JSON.stringify(keys));
  // console.log("hezl-result2:-------------"+JSON.stringify(items));
  if (!keys) {
    return <Collapse ghost accordion items={[]} />;
  }
  const contentEmpty=() => <p><Tag color="geekblue">生成内容<br/></Tag><br/>尚未生成</p>;
  const contentShow=(paragraph:Paragraph) => {
    // console.log("hezl-result3:-------------"+JSON.stringify(item));
    return <p><Tag color="geekblue">生成内容<br/></Tag>{paragraph.content}</p>;
  }
  const onChange=(e:string[])=>{
    // console.log(e);
    fn(e[0]);
  }
  const getExtra = (resStr:string) => (
    resStr.length>0?
    <CheckCircleTwoTone twoToneColor="#52c41a"
      onClick={(event) => {
        // If you don't want click extra trigger collapse, you can prevent this:
        event.stopPropagation();
      }}
    />
      :''
  );
  const getChapterExtra = (chapter:Chapter) => {
    const paragraphs=chapter.paragraphs;
    let flag=0
    for (let paragraph of paragraphs) {
      const contentLen = paragraph.content.length;
      if(contentLen>0){
        flag+=1
      }
    }
    if (flag===chapter.paragraphs.length) {
      return <CheckSquareTwoTone twoToneColor="#52c41a"
                                 onClick={(event) => {
                                   // If you don't want click extra trigger collapse, you can prevent this:
                                   event.stopPropagation();
                                 }}
      />
    }else{
      return ""/*<CheckSquareTwoTone twoToneColor="red"
                                 onClick={(event) => {
                                   // If you don't want click extra trigger collapse, you can prevent this:
                                   event.stopPropagation();
                                 }}
      />*/
    }
  };

  const getCollapseItems=(chapters:Chapter[])=> {
    /** 关于chapter的Collapse组件 **/
    const chaptersNew: CollapseProps['items'] = [];
    // console.log("hezl-result99999999999999999999999999999999999999999:-------------"+JSON.stringify(items));
    for (let chapter of chapters) {
      if (Array.isArray(chapter.paragraphs)) {
        /** 将paragraphs改造成paragraph Collapses **/
        const paragraphsNew: CollapseProps['items'] = [];
        for (let paragraph of chapter.paragraphs) {
          paragraphsNew.push(
            {
              key: paragraph.key,
              label: paragraph.label,
              // eslint-disable-next-line react/no-unescaped-entities
              children: paragraph.content.length === 0 ? contentEmpty() : contentShow(paragraph),
              style: panelStyle,
              extra: getExtra(paragraph.content)
            }
          )
        }
        chaptersNew.push(
          {
            key: chapter.key,
            label: chapter.label,
            children:
              <Collapse accordion items={paragraphsNew} onChange={onChange}
                        activeKey={keys.paragraphKey} />,
            extra: getChapterExtra(chapter)
          }
        )
      }
    }
    return chaptersNew;
  };
  const collapseItems: CollapseProps['items'] = getCollapseItems(chapters);


  return (
    <Collapse ghost accordion items={collapseItems} onChange={onChange}
              activeKey={keys.chapterKey} />
  );
}
export {OutlineResultDoc};
