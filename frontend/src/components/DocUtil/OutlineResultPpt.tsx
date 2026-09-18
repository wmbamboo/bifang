import {Collapse, CollapseProps} from "antd";
import {Chapter, Ppt, } from "@/components/DocUtil/ViewItem4Ppt";
import {CheckSquareTwoTone} from "@ant-design/icons";
import EditableResultCollapse from "@/components/DocUtil/EditableResultCollapse";
import React from "react";
interface PptOutlineResultProps {
  chapters: Chapter[];
  activeKey?:string;
  fn:(e:string)=>void;
  cb4EditSlide:(key:string)=>void;
}

const PptOutlineResult: React.FC <PptOutlineResultProps>= ({chapters, activeKey, fn, cb4EditSlide }) => {
  if (!chapters?.length || !chapters[0]?.slides?.length) {
    return null;
  }
  const resolvedKey = activeKey || chapters[0].slides[0].key;
  Ppt.reparseAllSlideContents(chapters);

  const keys =Ppt.getKeysFromKey(chapters, resolvedKey);
  if (!keys) {
    return null;
  }
  const onChange=(e:string[])=>{
    fn(e[0])
  }

  const getChapterExtra = (chapter:Chapter) => {
    const slides=chapter.slides;
    let flag=0
    for (let slide of slides) {
      const contentLen = slide.content.length;
      const viewItemsLen = slide.viewItems?slide.viewItems.length:0;
      if(viewItemsLen === 0 && contentLen>0){
        flag=2
        break;
      }
      if(contentLen>0){
        flag=1
      }
    }
    if (flag===1) {
      return <CheckSquareTwoTone twoToneColor="#52c41a"
                                 onClick={(event) => {
                                   // If you don't want click extra trigger collapse, you can prevent this:
                                   event.stopPropagation();
                                 }}
      />
    }else if(flag===2){
      return <CheckSquareTwoTone twoToneColor="red"
                                 onClick={(event) => {
                                   // If you don't want click extra trigger collapse, you can prevent this:
                                   event.stopPropagation();
                                 }}
      />
    }else{
      return ''
    }
  };

  const getCollapseItems=(chapters:Chapter[])=> {
    const cItemsNew: CollapseProps['items'] = [];
    for (let chapter of chapters) {
      const slides= chapter.slides;
      if (Array.isArray(slides)) {
        let cItemsSubNew: CollapseProps['items'] =[]
        cItemsNew.push(
          {
            key: chapter.key,
            label: chapter.label,
            children:
              <EditableResultCollapse accordion items={cItemsSubNew} onChange={onChange} fn={fn} slides={slides}
                                      activeKey={keys.slideKey} editResultFn={cb4EditSlide}/>,
            extra: getChapterExtra(chapter)
          }
        )
      }
    }
    return cItemsNew;
  };
  const collapseItems: CollapseProps['items'] = getCollapseItems(chapters);
  return (<>
    <Collapse ghost accordion items={collapseItems} onChange={onChange}
              activeKey={keys.chapterKey} /></>
  );
}
export {PptOutlineResult};
