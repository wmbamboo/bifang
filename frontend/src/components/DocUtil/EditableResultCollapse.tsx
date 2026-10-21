import {CollapseProps} from "antd/es/collapse/Collapse";
import {Collapse, Tag, Input, Button, Tooltip, Space, Card, Typography} from "antd";
import React from "react";
import {Slide, parseColumnBlocks, alignItemsToColumnSlots} from "@/components/DocUtil/ViewItem4Ppt";
import {
  CheckCircleTwoTone,
  ExclamationCircleTwoTone,
  FormOutlined,
  MinusCircleTwoTone,
} from "@ant-design/icons";
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
  '内容已生成但格式不正确，请【内容修改】或大纲【重新生成】（须「1. 标题 - 描述」）';

type SlideStatus = 'ok' | 'warn' | 'bad' | 'empty';

function slideStatus(slide: Slide): SlideStatus {
  const hasItems = !!(slide.viewItems && slide.viewItems.length > 0);
  const hasRaw = !!(slide.content && slide.content.trim());
  const genErr = !!(slide.genError && slide.genError.trim());
  if (hasItems) return genErr ? 'warn' : 'ok';
  if (hasRaw || genErr) return 'bad';
  return 'empty';
}

function slideStatusTip(slide: Slide): string {
  const status = slideStatus(slide);
  const err = (slide.genError || '').trim();
  if (status === 'ok') return '已就绪';
  if (status === 'warn') return err || '有校验提示，可下载前请人工复核';
  if (status === 'bad') {
    if (err) return err;
    if (slide.content?.trim()) return FORMAT_HINT;
    return '生成失败';
  }
  return '尚未生成';
}

const EditableResultCollapse: React.FC <CollapseEditableProps>=(props: CollapseEditableProps) => {
  const contentEmpty=() => (
    <p>
      <Tag color="default">生成内容</Tag>
      <br />
      <Text type="secondary">尚未生成</Text>
    </p>
  );
  const contentShow=(slide:Slide) => {
      const cols =
        slide.layout === 'columns' || slide.layout === 'metric_columns'
          ? parseColumnBlocks(slide.subTitle || '')
          : [];
      if (cols.length >= 2 && (slide.viewItems || []).length > 0) {
        const aligned = alignItemsToColumnSlots(
          slide.subTitle || '',
          (slide.viewItems || []).map((vi) => ({ title: vi.title, content: vi.content })),
        );
        const byCol = cols.map((col, ci) => ({
          col,
          slice: aligned.filter((a) => a.colIndex === ci),
        }));
        return (
          <div>
            <Tag color="cyan" style={{marginBottom: 8}}>生成内容（分栏）</Tag>
            <Space direction="vertical" style={{width: '100%'}} size={10}>
              {byCol.map(({ col, slice }, gi) => (
                <Card
                  key={`${slide.key}-col-${gi}`}
                  size="small"
                  title={
                    <Space direction="vertical" size={0}>
                      <Text strong>{col.title || `栏 ${gi + 1}`}</Text>
                      {col.sub ? <Text type="secondary" style={{fontSize: 12}}>{col.sub}</Text> : null}
                    </Space>
                  }
                >
                  <Space direction="vertical" style={{width: '100%'}} size={6}>
                    {(slice.length ? slice : [{ title: '（暂无生成条目）', content: '' }]).map((item, ii) => (
                      <div key={`${slide.key}-col-${gi}-i-${ii}`}>
                        <Text>{item.title}</Text>
                        {item.content ? (
                          <div><Text type="secondary" style={{whiteSpace: 'pre-wrap'}}>{item.content}</Text></div>
                        ) : null}
                      </div>
                    ))}
                  </Space>
                </Card>
              ))}
            </Space>
          </div>
        );
      }
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
      return (
        <p>
          <Tag color="default">生成内容（未解析）</Tag>
          <TextArea key={"ta-raw-" + slide.key} value={slide.content} autoSize contentEditable={false}/>
        </p>
      );
  }
  const contentGenFailed=() => {
      return (
        <p>
          <Tag color="default">生成内容</Tag>
          <br />
          <Text type="secondary">生成未成功（悬停左侧标记查看原因）</Text>
        </p>
      );
  }
  const onChange=(e:string[])=>{
    props.fn(e[0])
  }
  const openEdit = (slide: Slide, event: React.MouseEvent) => {
    event.stopPropagation();
    props.editResultFn(slide.key);
  };
  const statusIcon = (slide: Slide) => {
    const status = slideStatus(slide);
    const tip = slideStatusTip(slide);
    let icon: React.ReactNode;
    if (status === 'ok') {
      icon = <CheckCircleTwoTone twoToneColor="#52c41a" />;
    } else if (status === 'warn') {
      icon = <ExclamationCircleTwoTone twoToneColor="#faad14" />;
    } else if (status === 'bad') {
      icon = <ExclamationCircleTwoTone twoToneColor="#ff4d4f" />;
    } else {
      icon = <MinusCircleTwoTone twoToneColor="#bfbfbf" />;
    }
    return <Tooltip title={tip}>{icon}</Tooltip>;
  };
  const getSlideExtra = (slide:Slide) => {
    const status = slideStatus(slide);
    const showEdit = status !== 'empty';
    return (
      <Space size={4} onClick={(e) => e.stopPropagation()}>
        {statusIcon(slide)}
        {showEdit ? (
          <Tooltip title="内容修改">
            <Button
              type="dashed"
              size="small"
              danger={status === 'bad' || status === 'warn'}
              icon={<FormOutlined />}
              onClick={(e) => openEdit(slide, e)}
            />
          </Tooltip>
        ) : null}
      </Space>
    );
  };
  const slides= props.slides;
  const cItemsSubNew: CollapseProps['items'] = [];
  if (Array.isArray(slides)) {
    for (let slide of slides) {
      const status = slideStatus(slide);
      const hasItems = status === 'ok' || status === 'warn';
      const hasRaw = status === 'bad' && !!(slide.content && slide.content.trim()) && !(slide.viewItems?.length);
      const genFailedOnly = status === 'bad' && !hasRaw;
      cItemsSubNew.push(
        {
          key: slide.key,
          label: slide.layout === 'metric'
            ? `${slide.label}（数据卡）`
            : slide.layout === 'metric_list'
              ? `${slide.label}（数据卡+要点）`
              : slide.layout === 'columns'
                ? `${slide.label}（分栏）`
                : slide.layout === 'metric_columns'
                  ? `${slide.label}（数据卡+分栏）`
                  : slide.label,
          children: hasItems
            ? contentShow(slide)
            : hasRaw
              ? contentRawUnparsed(slide)
              : genFailedOnly
                ? contentGenFailed()
                : contentEmpty(),
          style: panelStyle,
          extra: getSlideExtra(slide)
        }
      )
    }
  }
  return (<Collapse accordion items={cItemsSubNew} onChange={onChange}
                   activeKey={props.activeKey}/>);
}

export default EditableResultCollapse;
