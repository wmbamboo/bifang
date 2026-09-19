import React, {useEffect, useState} from "react";
import {Button, Col, Divider, Drawer, Flex, message, Modal, Row, Space, Typography} from "antd";
import {ProCard} from "@ant-design/pro-components";
import MdViewer from "@/components/DocUtil/mdViewer";
import OutlineRec, {outlineType, outlineTypeAiPPT, outlineTypePPT} from "@/components/DocUtil/OutlineStore";
import OutlineSelectRadio from "@/components/DocUtil/OutlineSelectRadio";
import {ContainerOutlined, ReadOutlined} from "@ant-design/icons";
import {Ppt} from "@/components/DocUtil/ViewItem4Ppt";
import {Doc} from "@/components/DocUtil/ViewItem4Doc";
import OutlineUploader from "@/components/DocUtil/OutlineUploader";

interface OutlineSelectDrawerProps {
  open?:boolean,
  /**
   * type: select 用于genDoc页面
   * type: save  用于genOutline页面
   */
  type:'select'|'save',
  outlineType:outlineType,
  outlineRecs: OutlineRec[],
  /** 知识库文章/PPT 大纲按知识库过滤时，用于标题提示 */
  kbName?: string,
  selFn?:(id:string) => void,
  delFn:(id:string) => void,
  closeFn:() => void,
  /** 保存后预览时，定位到这条大纲；不传则选中列表第一条 */
  focusId?: string,
  cb4ImportOutline?:(title:string,content:string)=>void
}

const OutlineDrawer: React.FC<OutlineSelectDrawerProps> = (props:OutlineSelectDrawerProps) => {

  const [currentId, setCurrentId] = useState("");
  const [recIndexDeleted, setRecIndexDeleted] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [olRecs, setOlRecs] = useState(props.outlineRecs);

  const handleOk = () => {
    props.delFn(recIndexDeleted);
    // setprops.outlineRecs(props.outlineRecs
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  const getContent= (currentId:string)=> {
    const or=OutlineRec.getRecById(olRecs,currentId);
    return or?or.outlineContent:"";
  }
  /**
   *  大纲选择后的确认关闭函数
   *  1、生成大纲页使用时，无需使用selFn
   *  2、生成文档页使用时，使用selFn
   */
  const selectConfirm = () => {
    if(props.selFn){
      const or=OutlineRec.getRecById(olRecs,currentId)
      if(!or){
        message.info(`出错了，没找到ID为${currentId}的大纲。`)
        return false
      }
      if (props.outlineType===outlineTypePPT||props.outlineType===outlineTypeAiPPT){
        const chapters=Ppt.getChaptersFromContent(or.outlineContent);
        const {code,msg}=Ppt.checkChapter(chapters);
        if(code!==0){
          const msg1="因此无法选择该大纲，请检查或告知管理员。"
          message.error(msg+"\n"+msg1)
          return false;
        }else{
          message.success(`该大纲（${or.outlineId} [${or.outlineName}]）格式没问题。`)
        }
      }else{
        const chapters=Doc.getChaptersFromContent(or.outlineContent)
        const chkMsg=Doc.checkChapter(chapters);
        if(chkMsg.code!==0){
          const msg1="因此无法选择该大纲，请检查或告知管理员。"
          message.error(chkMsg.msg+"\n"+msg1)
          return false;
        }else{
          message.success(`该大纲（${or.outlineId} [${or.outlineName}]）格式没问题。`)
        }
      }
      props.selFn(currentId);
    }
    props.closeFn();
  };

  /**
   * * 大纲删除确认对话框的删除确认
   */
  const deleteConfirm = (id:string) => {
    // message.info(`大纲删除确认（ID：${id}）`);
    setRecIndexDeleted(id);
    setShowConfirm(true);
    // console.log("the content of newOutline Selected： " + props.outlineRecs[recIndex].outlineContent);
  }
  /**
   * 大纲选择时，设定currentId用于展现本页的markdown内容。
   */
  const onOutlineSelected = (id:string) => {
    // message.info(`sel: currentId:${currentId}`);
    setCurrentId(id);
  }

  const onClose = () => {
    props.closeFn();
  };

  // useEffect(() => {
  //
  // },[props.outlineRecs])
  useEffect(() => {
    setOlRecs(props.outlineRecs)
    const focusHit = props.focusId && props.outlineRecs.some((r) => r.outlineId === props.focusId);
    if (focusHit) {
      setCurrentId(props.focusId || "");
    } else if (props.outlineRecs.length > 0 && props.outlineRecs[0]?.outlineId) {
      setCurrentId(props.outlineRecs[0].outlineId);
    } else {
      setCurrentId("");
    }
  }, [props.outlineRecs, props.outlineType, props.type, props.focusId]);

  let extraUploadButton: React.JSX.Element =<></>
  if(props.cb4ImportOutline) {
    extraUploadButton = <OutlineUploader cb4ImportOutline={props.cb4ImportOutline}/>
  }
  const extraTitleButton = <div><ContainerOutlined style={{fontSize:"large"}}/><b>&nbsp;大纲标题列表</b></div>
  const extraOutlineButton=<div><ReadOutlined style={{fontSize:"large"}}/><b>&nbsp;大纲内容</b></div>

    return (
    <Drawer
      title={props.type!=="select"
        ? `大纲预览${props.kbName ? `（知识库：${props.kbName}）` : ''}`
        : `请选择大纲${props.kbName ? `（知识库：${props.kbName}）` : ''}`}
      placement="right"
      width='1400px'
      onClose={onClose}
      open={props.open}
      extra={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          {props.type!=="select"?"":<Button type="primary" onClick={selectConfirm}>
            选择大纲
          </Button>}
        </Space>
      }
    >
      <ProCard
        split="vertical"
        bordered
        boxShadow
        bodyStyle={{height: '85vh'}}
      >
        <ProCard
          title={extraTitleButton}
          subTitle="请选择下列大纲"
          // extra={extraTitleButton}
          colSpan="45%"
          headerBordered
          headStyle={{backgroundColor:"peachpuff"}}
          bodyStyle={{height: '100%'}}
        >
          {/*<OutlineSelectRadio type={props.type} outlineRecs={OutlineRec.listRecs(outlineTypePPT)} outlineSelectFn={onOutlineSelected} />*/}
          <Flex vertical={true}>
          <Col span={24}>
            <Row style={{height:'570px', overflowY:'auto'}}>
            <OutlineSelectRadio outlineType={props.outlineType}
                                outlineRecs={props.outlineRecs}
                                focusId={props.focusId}
                                outlineDeleteFn={deleteConfirm} outlineSelectFn={onOutlineSelected}/>
            </Row>
            <Row>
              <Divider type="horizontal" />
              {extraUploadButton}
            </Row>
          </Col>
          </Flex>
        </ProCard>
        <ProCard
          title={extraOutlineButton}
          colSpan="55%"
          headerBordered
          headStyle={{backgroundColor:"peachpuff"}}
          bodyStyle={{height: '100%'}}
        >
          <Typography style={{height:'750px',overflowY:'auto'}}>
            <MdViewer source={getContent(currentId)}/>
          </Typography>
        </ProCard>
      </ProCard>
      {showConfirm && (
        <Modal
          title="确认删除"
          visible={showConfirm}
          onOk={handleOk}
          onCancel={handleCancel}
        >
          <p>确认要删除这个大纲吗？</p>
        </Modal>
      )}
    </Drawer>)
};

export default OutlineDrawer;
