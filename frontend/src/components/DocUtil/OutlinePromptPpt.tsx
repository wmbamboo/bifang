import {Collapse, CollapseProps, Tag} from "antd";
import {Chapter, Ppt, PptKeys} from "@/components/DocUtil/ViewItem4Ppt";
import {useState} from "react";
import EditablePromptCollapse4Ppt from "@/components/DocUtil/EditablePromptCollapse4Ppt";

interface PptOutlinePromptProps {
  chapters: Chapter[];
  activeKey?:string;
  fn: (e:string)=>void;
  genFn:(e:string)=>void;
  cbSaveResultFn:(key:string,newPrompt:string)=>void;
  cbErrorFn?:(activeKey:string)=>void;
}

const panelStyle: React.CSSProperties = {
  background: "rgb(244 251 249)", // "aliceblue",
}

const PptOutlinePrompt: React.FC <PptOutlinePromptProps>
  = ({chapters,activeKey="slide1",fn,genFn,cbSaveResultFn,cbErrorFn}) => {
  const [editPromptSlideKey, setPromptSlideKey] = useState<string>("-1");

  const keys=Ppt.getKeysFromKey(chapters,activeKey);
  if (!keys) {
    return null;
  }
  // if (!keys) {
  //   cbErrorFn(activeKey);
  // }
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
  const cb4EditSlide_prompt=(key:string) => {
    console.log(`outlineGenPpt.tsx#cb4Edit,prompt:${key}`);
    const slide = Ppt.getSlide(chapters, key);
    if (slide) {
      // setIsEditing(true)
      setPromptSlideKey(key)
    } else {
      console.error(`出错了，要编辑提示词的幻灯片key为${key}。`)
    }
  }

  /**
   * 根据子组件传递来的新prompt，传递给上一级组件。
   * @param key
   * @param newPrompt
   */
  function onSaveResultFn(key:string,newPrompt:string) {
    cbSaveResultFn(key,newPrompt);
    setPromptSlideKey("-1")
  }

  const get_items=(chapters:Chapter[])=>{
    const itemsNew: CollapseProps['items'] = [];
    for (let chapter of chapters) {
      const slides=chapter.slides
      if( Array.isArray(slides) ){
        const itemsSubNew:  CollapseProps['items'] = [];
        for( let slide of slides){
          itemsSubNew.push(
            {
              key: slide.key,
              label: slide.label+""+<Tag color={"volcano"}>提示词<br/></Tag>,
              // eslint-disable-next-line react/no-unescaped-entities
              children:<p>
                {slide.prompt}
              </p> ,
              style: panelStyle
            }
          )
        }
        itemsNew.push(
          {
            key: chapter.key,
            label: chapter.label,
            children: <EditablePromptCollapse4Ppt accordion items={itemsSubNew} onChange={onSubChange}
                                                  fn={fn} slides={slides} /*isEditing={isEditing}*/
                                                  activeKey={keys.slideKey} cbEditPromptFn={cb4EditSlide_prompt}
                                                  genFn={genFn} editKey={editPromptSlideKey}
                                                  cbSaveResultFn={onSaveResultFn}/>,
          }
        )
      }
    }
    return itemsNew;
  }
  let newItems = get_items(chapters)

  return (
    <Collapse ghost accordion items={newItems} onChange={onChange}
              activeKey={keys.chapterKey} />
  );
}
export { PptOutlinePrompt };
