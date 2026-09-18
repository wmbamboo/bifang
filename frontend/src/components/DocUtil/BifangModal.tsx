import {message, Modal} from "antd";
import React, {useState} from "react";
import {outlineType} from "@/components/DocUtil/OutlineStore";


interface BifangDelModalProps{
  title: string,
  description: string,
  visible: boolean,
  outlineId?: string,
  outlineType?: outlineType,
  /*****
   * 1、如果id==="ALL"则全删
   * 2、如果id==="XXX",outlineType="xxx"则删除特定
   * 3、其他情形不处理
   ******/
  cbDelFn:(id:string,outlineType?:outlineType)=>void,
}

const BifangDelModal = (props:BifangDelModalProps) => {
  const [showConfirm, setShowConfirm] = useState(props.visible);

  const handleOk = () => {
    // outlineDel(outlineType,outlineNameDeleted)
    if (props.outlineId === "ALL") {
      props.cbDelFn(props.outlineId)
    } else {
      if (!(props.outlineId === undefined || props.outlineId.length === 0 || props.outlineType === undefined)) {
        props.cbDelFn(props.outlineId, props.outlineType)
      } else {
        message.warning("删除的大纲类型或id尚未指定。")
      }
    }
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };
  // 确认要删除吗？ "确认删除"
  return (
    <Modal
      title={props.title}
      open={showConfirm}
      onOk={handleOk}
      onCancel={handleCancel}
    >
      <p>{props.description}</p>
    </Modal>
  )
}

export default BifangDelModal;
