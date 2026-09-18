import {CollapseProps} from "antd/es/collapse/Collapse";
import {Collapse, Tag, Input, message, Button, Tooltip,Image} from "antd";
import React, {useState} from "react";
import {
  CompassTwoTone,
  EditTwoTone,
  SaveOutlined,
} from "@ant-design/icons";
import {Paragraph} from "@/components/DocUtil/ViewItem4Doc";
const panelStyle: React.CSSProperties = {
  background: "aliceblue",
}
interface EditablePromptCollapse4DocProps extends CollapseProps{
  // isEditing:boolean;
  paragraphs:Paragraph[];
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

const EditablePromptCollapse4Doc: React.FC <EditablePromptCollapse4DocProps>=(props: EditablePromptCollapse4DocProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [value, setValue] = React.useState("");
  // const [editPromptParagraphKey, setPromptParagraphKey] = useState<string>(props.editKey);
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
  const contentShower=(paragraph:Paragraph) => (
    <>
      <p><Tag color={"volcano"}>提示词</Tag></p>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 1.6,
      }}>{paragraph.prompt}</pre>
    </>
  );
  const contentEditor = (paragraph: Paragraph) => {
    return <div><p><Tag color={"volcano"}>提示词</Tag>
      <Tooltip title="提示词保存"><SaveOutlined  style={{fontSize:"x-large",float:"right",color:"darkcyan",marginRight:"15px"}}
                                                 onClick={()=>onSave(paragraph.key)}/></Tooltip>
      </p><p>
      <Input.TextArea key={"ta-" + paragraph.key}  autoSize onChange={onTextChange} defaultValue={paragraph.prompt} />
    </p>
    </div>;
  }
  const onChange=(e:string[])=>{
    // setPromptparagraphKey("-1")
    props.fn(e[0])
    // info("switch to other collapse,editKey:"+props.editKey+".chage:"+e[0])
  }
  // const genPptImage= <Icon component={() => <Image src={"/generate_ppt.svg"} width="48px" height="48px"/> } /> ;
  // const genPptImage= <Icon component={genPptSvg} style={{width:"48px",height:"48px"}}/>  ;
  const genDocIcon= <><CompassTwoTone style={{fontSize:"x-large"}}/></>
  const getParagraphExtra = (paragraph:Paragraph) => {
    if (props.activeKey===paragraph.key) {
      return <>
        <Tooltip title="提示词编辑">
        <Button icon={<EditTwoTone style={{fontSize:"x-large"}}/>} type="dashed" size={"middle"}
                onClick={(event) => {
                  // If you don't want click extra trigger collapse, you can prevent this:
                  // setPromptparagraphKey(paragraph.key)
                  setValue(paragraph.prompt);
                  props.cbEditPromptFn(paragraph.key)
                  event.stopPropagation();
                }}>
        </Button>
        </Tooltip>
        <Tooltip title="独立生成">
        <Button icon={genDocIcon} type="dashed" size={"middle"}
                onClick={(event) => {
                  // If you don't want click extra trigger collapse, you can prevent this:
                  props.genFn(paragraph.key)
                  event.stopPropagation();
                }} style={{marginLeft:"10px"}}>
        </Button>
        </Tooltip>
      </>
    }
  };
  const paragraphs= props.paragraphs;
  const paragraphsNew: CollapseProps['items'] = [];
  if (Array.isArray(paragraphs)) {
    for (let paragraph of paragraphs) {
      paragraphsNew.push(
        {
          key: paragraph.key,
          label: paragraph.label,
          // eslint-disable-next-line react/no-unescaped-entities
          children: props.activeKey===props.editKey && props.editKey===paragraph.key ?  contentEditor(paragraph):contentShower(paragraph) ,
          style: panelStyle,
          extra: getParagraphExtra(paragraph)
        }
      )
    }
  }
  return (<>{contextHolder}<Collapse accordion items={paragraphsNew} onChange={onChange}
                   activeKey={props.activeKey} /></>);
}

export default EditablePromptCollapse4Doc;
