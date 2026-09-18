import {CollapseProps} from "antd/es/collapse/Collapse";
import {Collapse, Tag, Input, message, Button, Tooltip, Space, Card, Typography} from "antd";
import React from "react";
import {Slide} from "@/components/DocUtil/ViewItem4Ppt";
import {CheckCircleTwoTone, FormOutlined} from "@ant-design/icons";
const {TextArea} = Input;
const {Text} = Typography;
const panelStyle: React.CSSProperties = {
  background: "aliceblue",
}
interface CollapseEditableProps extends CollapseProps{
  slides:Slide[];
  /**
   * 用于切换collapse的操作消息传递
   * @param e
   */
  fn:(e:string)=>void;
  /**
   * 用于编辑按钮消息传递
   * @param key
   */
  editResultFn:(key:string)=>void;
}

const FORMAT_HINT =
  '内容生成了，但格式不正确，需要点击右侧【内容修改】按钮或点击大纲对应项目的【重新生成】';

const EditableResultCollapse: React.FC <CollapseEditableProps>=(props: CollapseEditableProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const warnFormat = () => {
    messageApi.open({
      type: 'error',
      content: FORMAT_HINT,
      duration: 6,
    });
  };
  const contentEmpty=() => <p><Tag color="geekblue">生成内容</Tag><br/>尚未生成</p>;
  const contentShow=(slide:Slide) => {
      return (
        <div>
          <Tag color="geekblue" style={{marginBottom: 8}}>生成内容（结构化）</Tag>
          <Space direction="vertical" style={{width: '100%'}} size={8}>
            {(slide.viewItems || []).map((item) => (
              <Card
                key={`${slide.key}-vi-${item.index}`}
                size="small"
                title={<Text strong>{`${item.index}. ${item.title}`}</Text>}
                styles={{ body: { padding: '8px 12px' } }}
              >
                <Text type="secondary" style={{whiteSpace: 'pre-wrap'}}>{item.content}</Text>
              </Card>
            ))}
          </Space>
        </div>
      );
  }
  const contentRawUnparsed=(slide:Slide) => {
      return <p>
        <Tag color="error">{FORMAT_HINT}</Tag>
        <TextArea key={"ta-raw-" + slide.key} value={slide.content} autoSize contentEditable={false}/>
      </p>;
  }
  const onChange=(e:string[])=>{
    props.fn(e[0])
  }
  const openEdit = (slide: Slide, event: React.MouseEvent) => {
    event.stopPropagation();
    props.editResultFn(slide.key);
  };
  const getSlideExtra = (slide:Slide) => {
    const contentLen = slide.content?.length || 0;
    const viewItemsLen = slide.viewItems?slide.viewItems.length:0;
    if (viewItemsLen > 0) {
      return (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <CheckCircleTwoTone twoToneColor="#52c41a" />
          <Tooltip title="内容修改">
            <Button
              type="dashed"
              size="small"
              icon={<FormOutlined />}
              onClick={(e) => openEdit(slide, e)}
            />
          </Tooltip>
        </Space>
      );
    } else if(viewItemsLen === 0 && contentLen>0){
      return (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <CheckCircleTwoTone
            twoToneColor="red"
            onClick={() => warnFormat()}
          />
          <Tooltip title="内容修改">
            <Button
              type="dashed"
              size="small"
              danger
              icon={<FormOutlined />}
              onClick={(e) => {
                warnFormat();
                openEdit(slide, e);
              }}
            />
          </Tooltip>
        </Space>
      );
    }else{
      return ''
    }
  };
  const slides= props.slides;
  const cItemsSubNew: CollapseProps['items'] = [];
  if (Array.isArray(slides)) {
    for (let slide of slides) {
      const hasItems = slide.viewItems && slide.viewItems.length > 0;
      const hasRaw = !hasItems && slide.content && slide.content.length > 0;
      cItemsSubNew.push(
        {
          key: slide.key,
          label: slide.label,
          // eslint-disable-next-line react/no-unescaped-entities
          children: hasItems ? contentShow(slide) : hasRaw ? contentRawUnparsed(slide) : contentEmpty(),
          style: panelStyle,
          extra: getSlideExtra(slide)
        }
      )
    }
  }
  return (<>{contextHolder}<Collapse accordion items={cItemsSubNew} onChange={onChange}
                   activeKey={props.activeKey}/></>);
}

export default EditableResultCollapse;
