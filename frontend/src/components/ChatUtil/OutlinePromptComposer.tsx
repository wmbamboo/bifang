import React, {useState} from 'react';
import {Button, Input, Modal, Space, message} from 'antd';

const {TextArea} = Input;

/** PPT 大纲构思模板（与样例按钮同一套约束） */
export const PPT_OUTLINE_TEMPLATE =
  '请拟 15~20 页幻灯片，分配到 3~5 个章节。\n' +
  '【章节】每个章节只写主题名称，不要写「第一章」「第1章」「Chapter 1」等序号（顺序由 ## 层级体现）。\n' +
  '【幻灯片】每个幻灯片写一个标题，其下必须且只能有 3～5 条以「- 」开头的要点，禁止写出第 6 条。材料里的条款超过 5 条时，重新摘要进这 3～5 条，不要另起一条，也不要只保留原文前几条。\n' +
  '【格式】必须同时出现三级，缺一级不合格：全文 1 个「# 」标题、若干「## 」章节、每个章节下若干「### 」幻灯片，幻灯片下用「- 」写要点。\n' +
  '【示例】只示范层级写法，不要照抄其中的标题或要点，也不要把它扩写成正文。标题必须来自本次【主题】。知识库没有相关依据时，只说明无法从知识库生成大纲，不要按示例编造 15～20 页。\n' +
  '# 周会纪要\n' +
  '## 本周进展\n' +
  '### 已完成事项\n' +
  '- 事项一\n' +
  '- 事项二\n' +
  '错误示例：## 第一章 本周进展';

/** 文章大纲构思模板：必须三级，避免模型只写到章节 */
export const DOC_OUTLINE_TEMPLATE =
  '请拟一个中文大纲，必须输出完整三级，缺一级即为不合格。\n' +
  '【层级】\n' +
  '1. 全文只有 1 行一级标题，以「# 」开头。\n' +
  '2. 每个章节以「## 」开头，不要用「第一章」这类序号代替层级。\n' +
  '3. 每个章节下必须有至少 2 个段落，段落以「### 」开头。禁止只写到 ## 就结束。\n' +
  '【示例】\n' +
  '# 2024年男装流行趋势\n' +
  '## 色彩与面料\n' +
  '### 主色与撞色\n' +
  '### 面料与质感\n' +
  '## 版型与单品\n' +
  '### 宽松与修身\n' +
  '### 外套与内搭\n';

export function composePptOutlinePrompt(topic: string): string {
  return `撰写Ppt大纲，主题是【${topic.trim()}】。\n${PPT_OUTLINE_TEMPLATE}`;
}

export function composeDocOutlinePrompt(topic: string): string {
  return `撰写一篇文章大纲，主题是【${topic.trim()}】。\n${DOC_OUTLINE_TEMPLATE}`;
}

interface OutlinePromptComposerProps {
  topic: string;
  setTopic: (value: string) => void;
  composePrompt: (topic: string) => string;
  onSend: (message: string) => void | Promise<any>;
}

/** 主题输入 → 生成可编辑提示词 → 确认后发送 */
const OutlinePromptComposer: React.FC<OutlinePromptComposerProps> = ({
  topic,
  setTopic,
  composePrompt,
  onSend,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [beforeTopic, setBeforeTopic] = useState('');
  const [topicMark, setTopicMark] = useState('');
  const [afterTopic, setAfterTopic] = useState('');

  const generate = () => {
    const t = topic.trim();
    if (!t) {
      message.warning('请先输入主题');
      return;
    }
    const full = composePrompt(t);
    const marker = `【${t}】`;
    const at = full.indexOf(marker);
    if (at < 0) {
      setBeforeTopic('');
      setTopicMark('');
      setAfterTopic(full);
    } else {
      setBeforeTopic(full.slice(0, at + 1));
      setTopicMark(t);
      setAfterTopic(full.slice(at + 1 + t.length));
    }
    setPreviewOpen(true);
  };

  const send = () => {
    const text = `${beforeTopic}${topicMark}${afterTopic}`.trim();
    if (!text) {
      message.warning('提示词为空，请先生成或填写');
      return;
    }
    onSend(text);
    setPreviewOpen(false);
    setTopic('');
    setBeforeTopic('');
    setTopicMark('');
    setAfterTopic('');
  };

  return (
    <div style={{width: '100%'}}>
      <Space.Compact style={{width: '100%'}}>
        <Input
          value={topic}
          placeholder="输入主题，例如：帮助选品师筛选抖音男装爆品"
          onChange={(e) => setTopic(e.target.value)}
          onPressEnter={generate}
        />
        <Button type="default" onClick={generate}>
          生成提示词
        </Button>
      </Space.Compact>
      <Modal
        title="确认提示词"
        open={previewOpen}
        width={640}
        onCancel={() => setPreviewOpen(false)}
        destroyOnClose={false}
        footer={
          <Space>
            <Button onClick={() => setPreviewOpen(false)}>取消</Button>
            <Button type="primary" onClick={send}>
              开始构思
            </Button>
          </Space>
        }
      >
        <div style={{lineHeight: 1.7, marginBottom: 8}}>
          {beforeTopic}
          {topicMark ? (
            <span style={{fontWeight: 700, textDecoration: 'underline', color: '#1677ff'}}>
              {topicMark}
            </span>
          ) : null}
          {afterTopic.split('\n')[0]}
        </div>
        <TextArea
          value={afterTopic.includes('\n') ? afterTopic.slice(afterTopic.indexOf('\n') + 1) : ''}
          autoSize={{minRows: 8, maxRows: 14}}
          onChange={(e) => {
            const head = afterTopic.split('\n')[0] || '';
            setAfterTopic(head ? `${head}\n${e.target.value}` : e.target.value);
          }}
        />
      </Modal>
    </div>
  );
};

export default OutlinePromptComposer;
