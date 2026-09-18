import React, {useEffect} from 'react';
import { Button, Col, Drawer, Flex, Input, Row, Space, Typography, Alert, Card, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Slide, ViewItem4Ppt, PPT_ITEM_TITLE_MAX, PPT_ITEM_TITLE_MIN, PPT_ITEM_DESC_MAX, PPT_ITEM_DESC_MIN, validateSlideViewItems } from "@/components/DocUtil/ViewItem4Ppt";

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
    const next = existing.length > 0
      ? existing
      : [emptyItem(), emptyItem(), emptyItem()];
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
    setItems((prev) => (prev.length >= MAX_ITEMS ? prev : [...prev, emptyItem()]));
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= MIN_ITEMS) return prev;
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
    const err = validateSlideViewItems(current);
    if (err) {
      message.error(err);
      return;
    }
    const ok = props.fn(current);
    if (ok !== false) {
      props.closeFn();
    }
  };

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
            description={`每条概括标题 ${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX} 字，具体描述 ${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX} 字。保存后写回幻灯片，用于 PPT 模板填充。`}
          />
          <Row gutter={28} style={{width: '100%'}}>
            <Col span={24}>
              <Title level={5}>幻灯片标题</Title>
              <Input value={props.slide.title} disabled={true}/>
            </Col>
          </Row>

          <Title level={5} style={{marginBottom: 0}}>小项列表</Title>
          <Space direction="vertical" style={{width: '100%'}} size={10}>
            {items.map((item, index) => (
              <Card
                key={`edit-item-${index}`}
                size="small"
                title={`第 ${index + 1} 点`}
                extra={
                  items.length > MIN_ITEMS ? (
                    <MinusCircleOutlined
                      onClick={() => removeItem(index)}
                      style={{color: '#ff4d4f'}}
                    />
                  ) : null
                }
              >
                <Space direction="vertical" style={{width: '100%'}} size={8}>
                  <div>
                    <Text type="secondary">概括标题（{item.title.trim().length}/{PPT_ITEM_TITLE_MAX}，须 {PPT_ITEM_TITLE_MIN}～{PPT_ITEM_TITLE_MAX} 字）</Text>
                    <Input
                      value={item.title}
                      maxLength={PPT_ITEM_TITLE_MAX}
                      placeholder={`${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX} 字`}
                      onChange={(e) => updateItem(index, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Text type="secondary">具体描述（{item.content.trim().length}/{PPT_ITEM_DESC_MAX}，须 {PPT_ITEM_DESC_MIN}～{PPT_ITEM_DESC_MAX} 字）</Text>
                    <Input.TextArea
                      value={item.content}
                      maxLength={PPT_ITEM_DESC_MAX}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder={`${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX} 字`}
                      onChange={(e) => updateItem(index, { content: e.target.value })}
                    />
                  </div>
                </Space>
              </Card>
            ))}
          </Space>

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            disabled={items.length >= MAX_ITEMS}
            onClick={addItem}
          >
            添加小项（最多 {MAX_ITEMS} 条）
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
