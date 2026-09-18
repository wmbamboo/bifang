import {CollapseProps} from "antd/es/collapse/Collapse";
import {Collapse, Tag, Input, message, Button, Tooltip,Image} from "antd";
import React, {useState} from "react";
import {Slide} from "@/components/DocUtil/ViewItem4Ppt";
import {
  CheckCircleTwoTone, CompassTwoTone,
  EditTwoTone,
  FilePptTwoTone,
  RocketTwoTone,
  SaveOutlined,
  ThunderboltFilled, ThunderboltTwoTone
} from "@ant-design/icons";
import Icon from "antd/es/icon";
import genPptSvg from "../../../public/generate_ppt.svg"
const panelStyle: React.CSSProperties = {
  background: "aliceblue",
}
interface EditablePromptCollapseProps extends CollapseProps{
  // isEditing:boolean;
  slides:Slide[];
  /**
   * 用于切换collapse的操作消息传递
   * @param e
   */
  fn:(e:string)=>void;
  /**
   * 用于独立生成按钮消息传递
   * @param e
   */
  genFn:(e:string)=>void;
  /**
   * 用于编辑按钮消息传递回调函数
   * @param key
   */
  cbEditPromptFn:(key:string)=>void;
  /**
   * 用于传递编辑状态
   */
  editKey:string;
  /**
   * 用于保存提示词时的回调函数
   * @param key
   * @param newPrompt
   */
  cbSaveResultFn:(key:string,newPrompt:string)=>void;
}

const EditablePromptCollapse4Ppt: React.FC <EditablePromptCollapseProps>=(props: EditablePromptCollapseProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [value, setValue] = React.useState("");
  // const [editPromptSlideKey, setPromptSlideKey] = useState<string>(props.editKey);
  const info = (msg:string) => {
    messageApi.open({
      type: 'info',
      content: msg,
    });
  };
  const onTextChange=(e: { target: { value: React.SetStateAction<string>; }; })=>{
    // info("OK")
    setValue(e.target.value);
  }
  const onSave=(key:string)=>{
    props.cbSaveResultFn(key, value);
  }
  const contentShower=(slide:Slide) => (
    <>
      <p><Tag color={"volcano"}>提示词</Tag></p>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 1.6,
      }}>{slide.prompt}</pre>
    </>
  );
  const contentEditor = (slide: Slide) => {
    return <div><p><Tag color={"volcano"}>提示词</Tag>
      <Tooltip title="提示词保存"><SaveOutlined  style={{fontSize:"x-large",float:"right",color:"darkcyan",marginRight:"15px"}}
                                                 onClick={()=>onSave(slide.key)}/></Tooltip>
      </p><p>
      <Input.TextArea key={"ta-" + slide.key}  autoSize onChange={onTextChange} defaultValue={slide.prompt} />
    </p>
    </div>;
  }
  const onChange=(e:string[])=>{
    // setPromptSlideKey("-1")
    props.fn(e[0])
    // info("switch to other collapse,editKey:"+props.editKey+".chage:"+e[0])
  }
  // const genPptImage= <Icon component={() => <Image src={"/generate_ppt.svg"} width="48px" height="48px"/> } /> ;
  // const genPptImage= <Icon component={genPptSvg} style={{width:"48px",height:"48px"}}/>  ;
  const genPptImage= <><CompassTwoTone style={{fontSize:"x-large"}}/></>
  const getSlideExtra = (slide:Slide) => {
    if (props.activeKey===slide.key) {
      return <>
        <Tooltip title="提示词编辑">
        <Button icon={<EditTwoTone style={{fontSize:"x-large"}}/>} type="dashed" size={"middle"}
                onClick={(event) => {
                  setValue(slide.prompt);
                  props.cbEditPromptFn(slide.key)
                  event.stopPropagation();
                }}>
        </Button>
        </Tooltip>
        <Tooltip title="重新生成">
        <Button icon={genPptImage} type="dashed" size={"middle"}
                onClick={(event) => {
                  props.genFn(slide.key)
                  event.stopPropagation();
                }} style={{marginLeft:"10px"}}>
        </Button>
        </Tooltip>
      </>
    }
  };
  const slides= props.slides;
  const cItemsSubNew: CollapseProps['items'] = [];
  if (Array.isArray(slides)) {
    for (let slide of slides) {
      cItemsSubNew.push(
        {
          key: slide.key,
          label: slide.label,
          // eslint-disable-next-line react/no-unescaped-entities
          children: props.activeKey===props.editKey && props.editKey===slide.key ?  contentEditor(slide):contentShower(slide) ,
          style: panelStyle,
          extra: getSlideExtra(slide)
        }
      )
    }
  }
  return (<>{contextHolder}<Collapse accordion items={cItemsSubNew} onChange={onChange}
                   activeKey={props.activeKey} /></>);
}

export default EditablePromptCollapse4Ppt;
