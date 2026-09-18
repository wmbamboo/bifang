import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { ProChat, ProChatProvider, useProChat } from '@ant-design/pro-chat';
import { useTheme } from 'antd-style';
import { useMemo, useState } from 'react';
import { Button, Space } from 'antd';
import * as React from 'react';
import { CloseOutlined, FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import { OpenAI } from 'openai';
import KbListSnlComp from '@/components/KbMgt/KbListCompSnl';
import SpeechToTextButton from '@/components/DocUtil/SpeechToTextButton';
import styles from './KbAnswer.less';

export interface RelatedDoc {
  docNumber: string;
  title: string;
  source: string;
  kbName: string;
  /** 文件内片段序号，与引用编号 [1] 不是同一件事 */
  chunkId?: number | string;
  snippet: string;
  content: string;
  link?: string;
  score?: number;
}

const base64Encode = (str: string) => btoa(encodeURIComponent(str));

const handlePreview = (docPath: string, kbName: string) => {
  const url = `https://poc.intronlink.com/kkfv/kbfiles/${kbName}/content/${docPath}`;
  const previewUrl = `https://poc.intronlink.com/kkfv/onlinePreview?url=${encodeURIComponent(
    base64Encode(url),
  )}`;
  window.open(previewUrl);
};

const parseLegacyDocText = (text: string): RelatedDoc => {
  const headerRegex = /出处\s*\[(\d+)\]\s*\[(.*?)\]\((.*?)\)\s*\n\n/;
  const headerMatch = text.match(headerRegex);
  if (headerMatch) {
    const content = text
      .replace(headerRegex, '')
      .replace(/<><><>+/g, '')
      .split('\n')
      .filter((line) => line.trim())
      .join('\n');
    const title = headerMatch[2];
    return {
      docNumber: headerMatch[1],
      title,
      source: title,
      kbName: '',
      snippet: content.replace(/\s+/g, ' ').slice(0, 160),
      content,
      link: headerMatch[3],
    };
  }
  return {
    docNumber: '',
    title: '相关文档',
    source: '',
    kbName: '',
    snippet: text.replace(/\s+/g, ' ').slice(0, 160),
    content: text,
  };
};

const normalizeDocs = (raw: any[]): RelatedDoc[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (typeof item === 'string') {
      const parsed = parseLegacyDocText(item);
      return { ...parsed, docNumber: parsed.docNumber || String(index + 1) };
    }
    const title = item.title || item.source || `文档${index + 1}`;
    const content = item.content || item.text || '';
    return {
      docNumber: String(item.id || index + 1),
      title,
      source: item.source || title,
      kbName: item.kb_name || '',
      chunkId: item.chunk_id,
      snippet: item.snippet || String(content).replace(/\s+/g, ' ').slice(0, 160),
      content: String(content),
      link: item.link,
      score: item.score,
    };
  });
};

/** 根据本轮问答与引用文档生成追问样例 */
const buildFollowUps = (question: string, answer: string, docs: RelatedDoc[]): string[] => {
  const tips: string[] = [];
  const q = (question || '').replace(/[？?！!。]/g, '').trim();
  docs.slice(0, 2).forEach((d) => {
    const short = (d.title || '').replace(/\.[^.]+$/, '');
    if (short) tips.push(`结合《${short}》再展开说明一下关键要点`);
  });
  if (/趋势|流行|爆款/.test(q)) {
    tips.push('这些趋势对选品和运营有哪些具体建议？');
    tips.push('有哪些数据和案例可以支撑上述结论？');
  } else if (/如何|怎么|怎样/.test(question || '')) {
    tips.push(`请给出可落地的步骤清单：${q}`);
    tips.push('常见坑有哪些？如何规避？');
  } else {
    tips.push(`请用三条要点总结：${q || '刚才的问题'}`);
    tips.push('还有哪些相关背景需要补充？');
  }
  // 从回答中抓取加粗标题作追问
  const headings = Array.from((answer || '').matchAll(/\*\*([^*]{4,24})\*\*/g)).map((m) => m[1]);
  headings.slice(0, 2).forEach((h) => tips.push(`关于「${h}」能否再详细讲讲？`));

  const uniq: string[] = [];
  tips.forEach((t) => {
    if (t && !uniq.includes(t)) uniq.push(t);
  });
  return uniq.slice(0, 4);
};

const WELCOME_TEXT =
  '欢迎使用毕方知识库问答。请选择左侧知识库后提问，回答将附带可核对的参考文档。';

/** 欢迎词后的入门样例（点击即提问） */
const WELCOME_SAMPLES = [
  '男装T恤爆款分析',
  '深空探测图谱如何构建?',
  '研制总结报告怎么写?',
  '2024年男装流行趋势如何？',
];

const KbAnswerPage: React.FC = () => {
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc[]>([]);
  const [docsPanelOpen, setDocsPanelOpen] = useState(false);
  const [selectKbName, setSelectKbName] = useState('samples');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [followUpsVisible, setFollowUpsVisible] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  /** 每轮回答正文开头 -> 该轮参考文档，供消息尾部「参考：」点击打开 */
  const [docsByAnswer, setDocsByAnswer] = useState<{ key: string; docs: RelatedDoc[] }[]>([]);

  const openDocsPanel = (docs: RelatedDoc[], docNumber?: string) => {
    if (!docs?.length) return;
    setRelatedDocs(docs);
    setDocsPanelOpen(true);
    setActiveDocId(docNumber || null);
    if (docNumber) {
      // 等侧栏展开后再滚到对应卡片
      requestAnimationFrame(() => {
        document.getElementById(`kb-ref-doc-${docNumber}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
    }
  };

  const findDocsForMessage = (messageText: string): RelatedDoc[] | null => {
    if (!messageText) return null;
    const hit = docsByAnswer.find(
      (item) => messageText.startsWith(item.key) || messageText.includes(item.key),
    );
    return hit?.docs || null;
  };

  const handleSelectedKbItem = (kb_name: string) => {
    setSelectKbName(kb_name);
  };

  const openai = useMemo(
    () =>
      new OpenAI({
        apiKey: 'sk-f46769dda93743ba8266506c28500d32',
        baseURL: `${process.env.bf_baseUrl}/knowledge_base/local_kb/${selectKbName}`,
        dangerouslyAllowBrowser: true,
        timeout: 60000,
      }),
    [selectKbName],
  );

  const Chat = () => {
    const proChat = useProChat();

    const getTextFromMic = (text: string) => {
      proChat.sendMessage(text);
    };

    const pickFollowUp = (q: string) => {
      setFollowUpsVisible(false);
      proChat.sendMessage(q);
    };

    const welcomeMessage = (
      <div className={styles.welcomeBlock}>
        <div className={styles.welcomeText}>{WELCOME_TEXT}</div>
        <div className={styles.welcomeSamples}>
          <div className={styles.welcomeSamplesLabel}>你可以试着问：</div>
          <Space wrap size={[8, 8]}>
            {WELCOME_SAMPLES.map((q) => (
              <Button
                key={q}
                size="small"
                className={styles.followUpBtn}
                onClick={() => proChat.sendMessage(q)}
              >
                {q}
              </Button>
            ))}
          </Space>
        </div>
      </div>
    );

    return (
      <div className={styles.chatWrap}>
        <ProChat
          className={styles.proChat}
          style={{ height: '100%', background: 'transparent' }}
          helloMessage={welcomeMessage}
          chatItemRenderConfig={{
            actionsProps: {
              user: {
                actions: ['regenerate', 'edit'],
                moreActions: ['del', 'copy'],
              },
            },
            contentRender: (itemProps, defaultDom) => {
              const role = (itemProps as any)?.originData?.role;
              const placement = (itemProps as any)?.placement;
              const isAssistant = role === 'assistant' || placement === 'left';
              if (!isAssistant) return defaultDom;

              const raw = (itemProps as any)?.originData?.content ?? (itemProps as any)?.message;
              const messageText = typeof raw === 'string' ? raw : '';
              const docs = findDocsForMessage(messageText);
              if (!docs?.length) return defaultDom;

              return (
                <div>
                  {defaultDom}
                  <div className={styles.refBar}>
                    <Button
                      type="primary"
                      ghost
                      size="small"
                      icon={<FileTextOutlined />}
                      className={styles.refTrigger}
                      onClick={() => openDocsPanel(docs)}
                    >
                      <span className={styles.refTriggerText}>
                        参考：
                        {docs.map((d) => (
                          <span
                            key={d.docNumber}
                            className={styles.refNum}
                            title={d.title}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDocsPanel(docs, d.docNumber);
                            }}
                          >
                            [{d.docNumber}]
                          </span>
                        ))}
                      </span>
                    </Button>
                  </div>
                </div>
              );
            },
          }}
          actions={{
            render: (defaultDoms) => {
              const modifiedDoms = defaultDoms.map((dom: any) => {
                if (dom?.key === 'clear') {
                  return React.cloneElement(dom, {
                    onConfirm: () => {
                      setRelatedDocs([]);
                      setDocsByAnswer([]);
                      setFollowUps([]);
                      setFollowUpsVisible(false);
                      setDocsPanelOpen(false);
                      dom.props?.onConfirm?.();
                    },
                  });
                }
                return dom;
              });
              return [
                <div key="followups" className={styles.followUpSlot}>
                  {followUpsVisible && followUps.length > 0 && (
                    <div className={styles.followUps}>
                      <div className={styles.followUpsHead}>
                        <span>继续追问</span>
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={() => setFollowUpsVisible(false)}
                        />
                      </div>
                      <Space wrap size={[8, 8]}>
                        {followUps.map((q) => (
                          <Button
                            key={q}
                            size="small"
                            className={styles.followUpBtn}
                            onClick={() => pickFollowUp(q)}
                          >
                            {q}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  )}
                </div>,
                <SpeechToTextButton key="stt" cb4textFn={getTextFromMic} />,
                ...modifiedDoms,
              ];
            },
            flexConfig: {
              gap: 16,
              direction: 'horizontal',
              justify: 'space-between',
            },
          }}
          request={async (messages: any) => {
            const lastUser = [...(messages || [])].reverse().find((m: any) => m.role === 'user');
            const userQuestion =
              typeof lastUser?.content === 'string'
                ? lastUser.content
                : Array.isArray(lastUser?.content)
                  ? lastUser.content.map((c: any) => c?.text || c?.content || '').join('')
                  : '';

            setDocsPanelOpen(false);
            setActiveDocId(null);

            const body = {
              messages,
              model: 'deepseek-chat',
              stream: true,
              stream_options: {
                top_k: 4,
                temperature: 0.7,
                prompt_name: 'default',
                return_direct: false,
              },
            };
            const completion = await openai.chat.completions.create(body);
            const reader = completion.toReadableStream().getReader();
            const decoder = new TextDecoder('utf-8');
            const encoder = new TextEncoder();

            let turnDocs: RelatedDoc[] = [];
            let responseContent = '';

            const readableStream = new ReadableStream({
              async start(controller) {
                function push() {
                  reader
                    .read()
                    .then(({ done, value }) => {
                      if (done) {
                        if (turnDocs.length > 0) {
                          const key = responseContent.slice(0, 96);
                          setDocsByAnswer((prev) => {
                            const next = prev.filter((x) => x.key !== key);
                            return [...next, { key, docs: turnDocs }];
                          });
                          setRelatedDocs(turnDocs);
                          // 侧栏默认关闭，需点击回答末尾「参考：」打开
                        }
                        const tips = buildFollowUps(userQuestion, responseContent, turnDocs);
                        setFollowUps(tips);
                        setFollowUpsVisible(tips.length > 0);
                        controller.close();
                        return;
                      }

                      const chunk = decoder.decode(value, { stream: true });
                      const message = chunk.replace(/^data:\s*/, '');
                      try {
                        const parsed = JSON.parse(message);
                        if (parsed.docs) {
                          turnDocs = normalizeDocs(parsed.docs);
                          setRelatedDocs(turnDocs);
                          setActiveDocId(null);
                        }
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                          responseContent += content;
                          controller.enqueue(encoder.encode(content));
                        }
                      } catch (e) {
                        // ignore keep-alive / non-json
                      }
                      push();
                    })
                    .catch((err) => {
                      console.error('读取流中的数据时发生错误', err);
                      controller.error(err);
                    });
                }
                push();
              },
            });
            return new Response(readableStream);
          }}
          userMeta={{
            avatar: '/avart.svg',
            title: '毕方',
          }}
          assistantMeta={{
            avatar: '/robot.svg',
            title: '小毕',
          }}
        />
      </div>
    );
  };

  const showDocs = docsPanelOpen && relatedDocs.length > 0;

  return (
    <PageContainer className={styles.page} breadcrumb={{}}>
      <ProCard
        className={styles.layout}
        split="vertical"
        ghost
        bodyStyle={{
          height: '100%',
          padding: 0,
          backgroundImage:
            initialState?.settings?.navTheme === 'realDark'
              ? 'linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
              : 'linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
        }}
      >
        <ProCard
          title="知识库选择"
          colSpan="11%"
          headerBordered
          className={styles.sideCol}
          style={{ background: theme.colorBgContainer }}
        >
          <KbListSnlComp onSelectionChange={handleSelectedKbItem} />
        </ProCard>

        <ProCard
          colSpan={showDocs ? '58%' : '89%'}
          className={styles.chatCol}
          bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
          style={{ background: theme.colorBgContainer }}
        >
          <div className={styles.chatColInner}>
            <ProChatProvider>
              <Chat />
            </ProChatProvider>
          </div>
        </ProCard>

        {showDocs && (
          <ProCard
            colSpan="31%"
            headerBordered
            className={styles.sideCol}
            style={{ background: theme.colorBgContainer }}
            title={
              <div className={styles.docsHeader}>
                <span>参考文档</span>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => setDocsPanelOpen(false)}
                  aria-label="关闭参考文档"
                />
              </div>
            }
          >
            <div className={styles.docsList}>
              {relatedDocs.map((doc) => {
                const active = activeDocId === doc.docNumber;
                return (
                  <div
                    key={doc.docNumber}
                    id={`kb-ref-doc-${doc.docNumber}`}
                    className={`${styles.docCard} ${active ? styles.docCardActive : ''}`}
                    onClick={() => setActiveDocId(active ? null : doc.docNumber)}
                  >
                    <div className={styles.docMeta}>
                      <FileTextOutlined className={styles.docIcon} />
                      <span className={styles.docKb}>{doc.kbName || selectKbName}</span>
                      <span className={styles.docBadge}>{doc.docNumber}</span>
                    </div>
                    <div className={styles.docTitle} title={doc.title}>
                      {doc.title.replace(/\.[^.]+$/, '') || doc.title}
                    </div>
                    {doc.chunkId !== undefined && doc.chunkId !== null && doc.chunkId !== '' ? (
                      <div className={styles.docKb}>片段 {String(doc.chunkId)}</div>
                    ) : null}
                    <div className={styles.docSnippet}>
                      {active ? doc.content : doc.snippet || '暂无摘要'}
                    </div>
                    <div className={styles.docActions} onClick={(e) => e.stopPropagation()}>
                      {doc.link && (
                        <a href={doc.link} target="_blank" rel="noreferrer">
                          <LinkOutlined /> 原文
                        </a>
                      )}
                      <a
                        onClick={() =>
                          handlePreview(doc.source || doc.title, doc.kbName || selectKbName)
                        }
                      >
                        预览
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </ProCard>
        )}
      </ProCard>
    </PageContainer>
  );
};

export default KbAnswerPage;
