import {Collapse, CollapseProps, Tooltip} from "antd";
import {Chapter, Ppt, } from "@/components/DocUtil/ViewItem4Ppt";
import {
  CheckSquareTwoTone,
  ExclamationCircleTwoTone,
  MinusCircleTwoTone,
} from "@ant-design/icons";
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
    if (!slides?.length) return '';
    const badNames: string[] = [];
    const emptyNames: string[] = [];
    let okCount = 0;
    for (const slide of slides) {
      const title = slide.title || slide.label || slide.key;
      const contentLen = slide.content?.length || 0;
      const viewItemsLen = slide.viewItems ? slide.viewItems.length : 0;
      const genFailed = !!(slide.genError && slide.genError.length > 0);
      const allowsEmpty = Ppt.slideAllowsEmptyVItem(slide.layout, slide.subTitle);
      if (genFailed || (viewItemsLen === 0 && contentLen > 0 && !allowsEmpty)) {
        badNames.push(title);
      } else if (viewItemsLen > 0 || allowsEmpty) {
        okCount++;
      } else {
        emptyNames.push(title);
      }
    }
    const stop = (event: React.MouseEvent) => event.stopPropagation();
    if (badNames.length) {
      return (
        <Tooltip title={`未完成：${badNames.slice(0, 4).join('、')}${badNames.length > 4 ? '…' : ''}`}>
          <ExclamationCircleTwoTone twoToneColor="#ff4d4f" onClick={stop} />
        </Tooltip>
      );
    }
    if (emptyNames.length || okCount === 0) {
      return (
        <Tooltip title={emptyNames.length ? `尚未生成：${emptyNames.slice(0, 4).join('、')}${emptyNames.length > 4 ? '…' : ''}` : '尚未生成'}>
          <MinusCircleTwoTone twoToneColor="#bfbfbf" onClick={stop} />
        </Tooltip>
      );
    }
    return (
      <Tooltip title="本章已就绪">
        <CheckSquareTwoTone twoToneColor="#52c41a" onClick={stop} />
      </Tooltip>
    );
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
