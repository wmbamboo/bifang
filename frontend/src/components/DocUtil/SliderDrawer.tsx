import React, {useEffect} from 'react';
import { Button, Col, Drawer, Flex, Input, Row, Space, Typography, Alert, Card, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Slide, ViewItem4Ppt, PPT_ITEM_TITLE_MAX, PPT_ITEM_TITLE_MIN, PPT_ITEM_DESC_MAX, PPT_ITEM_DESC_MIN, PPT_METRIC_TITLE_MIN, PPT_METRIC_TITLE_MAX, PPT_METRIC_DESC_MIN, PPT_METRIC_DESC_MAX, validateSlideViewItems, splitMetricListTips, parseColumnBlocks, alignItemsToColumnSlots } from "@/components/DocUtil/ViewItem4Ppt";

const { Title, Text } = Typography;

export type SlideEditItem = { title: string; content: string };

interface SliderDrawerProps {
  key:string;
  slide: Slide;
  open:boolean,
  closeFn:()=>void,
  /** 返回 false 表示校验未通过，抽屉不关闭 */
  fn:(items: SlideEditItem[]) => boolean | void
}

const MAX_ITEMS = 5;
const MIN_ITEMS = 1;

const emptyItem = (): SlideEditItem => ({ title: '', content: '' });

const SlideDrawer: React.FC<SliderDrawerProps>= (props:SliderDrawerProps)=>{
  const [items, setItems] = React.useState<SlideEditItem[]>([emptyItem()]);
  const [rawDraft, setRawDraft] = React.useState('');
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!props.open) return;
    const existing = (props.slide?.viewItems || [])
      .map((vi) => ({ title: vi.title || '', content: vi.content || '' }));
    let next = existing.length > 0
      ? existing
      : [emptyItem(), emptyItem(), emptyItem()];
    // 分栏：打开时按大纲槽位对齐，去掉栏标题伪条目
    if (
      (props.slide?.layout === 'columns' || props.slide?.layout === 'metric_columns') &&
      existing.length > 0
    ) {
      const aligned = alignItemsToColumnSlots(props.slide?.subTitle || '', existing);
      if (aligned.length) {
        next = aligned.map((s) => ({ title: s.title, content: s.content }));
      }
    }
    itemsRef.current = next;
    setItems(next);
    setRawDraft(props.slide?.content || '');
  }, [props.open, props.slide?.key]);

  const onClose = () => {
    props.closeFn();
  };

  const updateItem = (index: number, patch: Partial<SlideEditItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    setItems((prev) => {
      const layout = props.slide?.layout;
      const cap = layout === 'metric' ? 4 : layout === 'metric_list' ? 8 : MAX_ITEMS;
      return prev.length >= cap ? prev : [...prev, emptyItem()];
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const layout = props.slide?.layout;
      const floor = layout === 'metric' ? 2 : layout === 'metric_list' ? 4 : MIN_ITEMS;
      if (prev.length <= floor) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const parseRawIntoItems = () => {
    const parsed = ViewItem4Ppt.genViewItemByRegex(rawDraft);
    if (!parsed || parsed.length === 0) {
      message.error('无法从原始文本解析出小项，请按「1. 标题 - 描述」每行一条，或直接在下方结构化编辑。');
      return;
    }
    setItems(parsed.map((vi) => ({ title: vi.title, content: vi.content })));
    message.success(`已解析出 ${parsed.length} 条小项`);
  };

  const onSave=()=>{
    const current = itemsRef.current;
    const layout = props.slide?.layout === 'metric'
      ? 'metric'
      : props.slide?.layout === 'metric_list'
        ? 'metric_list'
        : props.slide?.layout === 'columns'
          ? 'columns'
          : props.slide?.layout === 'metric_columns'
            ? 'metric_columns'
            : 'list';
    const metricCount = layout === 'metric_list' || layout === 'metric_columns'
      ? splitMetricListTips(props.slide?.subTitle || '').metrics.length
      : undefined;
    const err = validateSlideViewItems(current, layout, { metricCount });
    if (err) {
      message.error(err);
      return;
    }
    const ok = props.fn(current);
    if (ok !== false) {
      props.closeFn();
    }
  };

  const layout = props.slide?.layout === 'metric'
    ? 'metric'
    : props.slide?.layout === 'metric_list'
      ? 'metric_list'
      : props.slide?.layout === 'columns'
        ? 'columns'
        : props.slide?.layout === 'metric_columns'
          ? 'metric_columns'
          : 'list';
  const metricCount = layout === 'metric_list' || layout === 'metric_columns'
    ? splitMetricListTips(props.slide?.subTitle || '').metrics.length
    : 0;
  const colBlocks =
    layout === 'columns' || layout === 'metric_columns'
      ? parseColumnBlocks(props.slide?.subTitle || '')
      : [];
  const itemColMeta =
    colBlocks.length >= 2
      ? alignItemsToColumnSlots(
          props.slide?.subTitle || '',
          items.map((it) => ({ title: it.title, content: it.content })),
        )
      : [];
  const maxItems = layout === 'metric' ? 4 : layout === 'metric_list' ? 8 : layout === 'columns' || layout === 'metric_columns' ? 20 : MAX_ITEMS;
  const minItems = layout === 'metric' ? 2 : layout === 'metric_list' ? 4 : layout === 'columns' || layout === 'metric_columns' ? 2 : MIN_ITEMS;

  return (
    <>
      <Drawer
        title="内容修改"
        width={480}
        onClose={onClose}
        open={props.open}
        styles={{
          body: {
            paddingBottom: 80,
          },
        }}
        extra={
          <Space>
            <Button onClick={onClose}>退出</Button>
            <Button onClick={onSave} type="primary">
              保存
            </Button>
          </Space>
        }
      >
        <Flex gap="middle" align="flex-start" vertical>
          <Alert
            type="info"
            showIcon
            message="结构化编辑"
            description={layout === 'metric'
              ? `数据卡：每条数字 ${PPT_METRIC_TITLE_MIN}～${PPT_METRIC_TITLE_MAX} 字（须含百分号、亿或万），解读 ${PPT_METRIC_DESC_MIN}～${PPT_METRIC_DESC_MAX} 字，共 2～4 条。`
              : layout === 'metric_list'
                ? `数据卡+要点：前 ${metricCount || 2}～4 条为数据卡（原数字+短解读），其后为列表要点（概括+描述），合计最多 8 条。`
                : layout === 'columns' || layout === 'metric_columns'
                  ? `分栏短条目：按栏顺序编辑短词/短句（宜 4～16 字）；栏标题与副标来自大纲，此处只改条目。`
                  : `每条概括标题 ${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX} 字，具体描述 ${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX} 字。保存后写回幻灯片，用于 PPT 模板填充。`}
          />
          <Row gutter={28} style={{width: '100%'}}>
            <Col span={24}>
              <Title level={5}>幻灯片标题</Title>
              <Input value={props.slide.title} disabled={true}/>
            </Col>
          </Row>

          <Title level={5} style={{marginBottom: 0}}>
            {layout === 'columns' || layout === 'metric_columns' ? '分栏条目' : '小项列表'}
          </Title>
          <Space direction="vertical" style={{width: '100%'}} size={10}>
            {items.map((item, index) => {
              const asMetric = layout === 'metric' || ((layout === 'metric_list' || layout === 'metric_columns') && index < metricCount);
              const asColumn = (layout === 'columns' || layout === 'metric_columns') && !asMetric;
              const tMin = asMetric ? PPT_METRIC_TITLE_MIN : asColumn ? 2 : PPT_ITEM_TITLE_MIN;
              const tMax = asMetric ? PPT_METRIC_TITLE_MAX : asColumn ? 16 : PPT_ITEM_TITLE_MAX;
              const dMin = asMetric ? PPT_METRIC_DESC_MIN : asColumn ? 0 : PPT_ITEM_DESC_MIN;
              const dMax = asMetric ? PPT_METRIC_DESC_MAX : asColumn ? 28 : PPT_ITEM_DESC_MAX;
              const cardTitle = asColumn && itemColMeta[index]
                ? itemColMeta[index].label
                : `第 ${index + 1} 点${layout === 'metric_list' ? (asMetric ? '（数据卡）' : '（要点）') : ''}`;
              return (
              <Card
                key={`edit-item-${index}`}
                size="small"
                title={cardTitle}
                extra={
                  items.length > minItems ? (
                    <MinusCircleOutlined
                      onClick={() => removeItem(index)}
                      style={{color: '#ff4d4f'}}
                    />
                  ) : null
                }
              >
                <Space direction="vertical" style={{width: '100%'}} size={8}>
                  <div>
                    <Text type="secondary">{asMetric ? '原数字' : asColumn ? '短条目' : '概括标题'}（{item.title.trim().length}/{tMax}{asColumn ? '' : `，须 ${tMin}～${tMax} 字`}）</Text>
                    <Input
                      value={item.title}
                      maxLength={tMax}
                      placeholder={asColumn ? '4～16 字短词/短句' : `${tMin}～${tMax} 字`}
                      onChange={(e) => updateItem(index, { title: e.target.value })}
                    />
                  </div>
                  {!asColumn || item.content ? (
                  <div>
                    <Text type="secondary">{asMetric ? '数字解读' : asColumn ? '补充说明（可选）' : '具体描述'}（{item.content.trim().length}/{dMax}{asColumn ? '' : `，须 ${dMin}～${dMax} 字`}）</Text>
                    <Input.TextArea
                      value={item.content}
                      maxLength={dMax}
                      autoSize={{ minRows: asColumn ? 1 : 2, maxRows: 5 }}
                      placeholder={asColumn ? '可留空' : `${dMin}～${dMax} 字`}
                      onChange={(e) => updateItem(index, { content: e.target.value })}
                    />
                  </div>
                  ) : null}
                </Space>
              </Card>
              );
            })}
          </Space>

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            disabled={items.length >= maxItems}
            onClick={addItem}
          >
            添加小项（最多 {maxItems} 条）
          </Button>

          <Title level={5} style={{marginBottom: 0}}>原始文本（可选）</Title>
          <Text type="secondary">漏解析时可粘贴模型原文，点「解析到小项」自动填入上方列表。</Text>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            value={rawDraft}
            onChange={(e) => setRawDraft(e.target.value)}
            placeholder={'1. 标题 - 描述\n2. 标题 - 描述'}
          />
          <Button onClick={parseRawIntoItems}>解析到小项</Button>
        </Flex>
      </Drawer>
    </>
  );
};

export default SlideDrawer;
