import {ProChat, ProChatProvider, useProChat} from "@ant-design/pro-chat";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {sampleLabel} from "@/components/ChatUtil/sampleLabel";
import {Button, message, Space, Tag} from "antd";
import OutlineRec, {outlineType, outlineTypeDOC} from "@/components/DocUtil/OutlineStore";
import SpeechToTextButton from "@/components/DocUtil/SpeechToTextButton";
import {clean4DocTitle, Doc, stripDocOutlineMetaLines, normalizeDocOutlineMarkdown, docOutlineNeedsNormalizeHint} from "@/components/DocUtil/ViewItem4Doc";
import * as React from "react";
import {OpenAI} from "openai";
import welcomeStyles from "./ChatWelcome.less";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';
import OutlinePromptComposer, {
  OutlineSendPayload,
  buildDocOutlineSystemPrompt,
  parseInferredVarsJson,
} from "@/components/ChatUtil/OutlinePromptComposer";


interface ChatWithSpeechProps{
  openai: OpenAI,
  outlineType:outlineType,
  /** 功能名，用于欢迎词「专属XXXX机器人」 */
  featureName: string,
  /***
   kb_name:
   当outlineType是outlineTypeDOC、outlineTypePPT时需要，
   当outlineType是outlineTypeAiDOC、outlineTypeAiPPT时不需要，
   **/
  kb_name?:string,
  buttonMessages:ButtonMessage[],
  cb4setOutlineRec:(id:string)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
}
interface ChatProps{
  openai: OpenAI;
  outlineType:outlineType;
  featureName: string;
  welcomeSamples: ButtonMessage[];
  /***
   kb_name:
   当outlineType是outlineTypeDOC、outlineTypePPT时需要，
   当outlineType是outlineTypeAiDOC、outlineTypeAiPPT时不需要，
   **/
  kb_name?:string;
  cb4setOutlineRec:(id:string)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
}
const ChatWithSpeech4Doc=(props:ChatWithSpeechProps)=>{
  const chatProps = {
    openai: props.openai,
    outlineType: props.outlineType,
    featureName: props.featureName,
    welcomeSamples: props.buttonMessages,
    cb4setOutlineRec: props.cb4setOutlineRec,
    cb4setTempOutlineRecs: props.cb4setTempOutlineRecs,
    ...(props.outlineType === outlineTypeDOC ? { kb_name: props.kb_name } : {}),
  };
  return (
    <ProChatProvider>
      <Chat key="chat" {...chatProps} />
    </ProChatProvider>
  )
}
const Chat=(props:ChatProps)=> {
  const proChat = useProChat();
  const {kb_name,openai,outlineType,featureName,welcomeSamples,cb4setOutlineRec,cb4setTempOutlineRecs} =props
  const [topic, setTopic] = React.useState('');
  const pendingSystemRef = React.useRef(buildDocOutlineSystemPrompt());
  /** 欢迎区样例点击 → 递增以打开定框弹框（与 PPT 对齐） */
  const [previewSignal, setPreviewSignal] = React.useState(0);
  const getTextFromMic = (text: string) => {
    console.log("麦克风识别文本:" + text);
    setTopic(text);
  }

  const sendOutline = (payload: OutlineSendPayload) => {
    pendingSystemRef.current = payload.systemPrompt || buildDocOutlineSystemPrompt();
    const topicMatch = (payload.userMessage || '').match(/主题是【(.+?)】/);
    if (topicMatch?.[1]) setTopic(topicMatch[1].trim());
    proChat.sendMessage(payload.userMessage);
  };

  const sendSample = (sample: ButtonMessage) => {
    const content = (sample.content || '').trim();
    const topicMatch = content.match(/主题是【(.+?)】/);
    const topicText = topicMatch?.[1]?.trim() || sample.title || content.slice(0, 40);
    setTopic(topicText);
    // 走定框弹框，不要直接开跑（与 ChatWithSpeech4Ppt 一致）
    setPreviewSignal((n) => n + 1);
  };

  const welcomeMessage = (
    <div className={welcomeStyles.welcomeBlock}>
      <div className={welcomeStyles.welcomeText}>
        {`欢迎使用 毕方 ，我是你的专属${featureName}机器人。`}
      </div>
      {welcomeSamples?.length > 0 && (
        <div className={welcomeStyles.welcomeSamples}>
          <div className={welcomeStyles.welcomeSamplesLabel}>你可以试着构思：</div>
          <Space wrap size={[8, 8]}>
            {welcomeSamples.map((sample, idx) => {
              const label = sampleLabel(sample.title, sample.content);
              return (
                <Button
                  key={`welcome-sample-${idx}`}
                  size="small"
                  className={welcomeStyles.sampleBtn}
                  onClick={() => sendSample(sample)}
                >
                  {label}
                </Button>
              );
            })}
          </Space>
        </div>
      )}
    </div>
  );

  return (
    <ProChat
      style={{minHeight: '82vh', background: "aliceblue"}}
      helloMessage={welcomeMessage}
      chatItemRenderConfig={{
        actionsRender: (props) => {
          const msg: string = props.message?.toString() === undefined ? "" : props.message?.toString();
          const role = (props as any)?.originData?.role;
          const placement = (props as any)?.placement;
          const isUser = role === "user" || placement === "right";
          // 用户消息不提供大纲操作；助手大纲仅保留保存 / 规范化
          if (isUser || props?.editing || msg.length <= 150 || !msg.includes("##")) {
            return null;
          }
          const needNorm = docOutlineNeedsNormalizeHint(msg);
          return (
            <Space key={"outlineOps"} direction="vertical" size={4} style={{marginTop: "0.5em"}}>
              {needNorm ? (
                <Tag color="warning">段落标记不规范</Tag>
              ) : null}
              <Space size={8}>
              {needNorm ? (
                <Button
                  size={"small"}
                  type="dashed"
                  onClick={() => {
                    const content = clean4DocTitle(msg);
                    const fixed = normalizeDocOutlineMarkdown(content);
                    // ProChat 无稳定 API 改历史气泡：复制到剪贴板并提示用户粘贴后保存
                    void navigator.clipboard?.writeText(fixed).then(
                      () => message.success("已规范化并复制到剪贴板，请粘贴到编辑框确认后点「大纲保存」"),
                      () => message.info("规范化结果：\n" + fixed.slice(0, 400) + "…"),
                    );
                    // 直接尝试按规范化内容保存
                    const recTitle = Doc.getTitleFromMsg(fixed);
                    let recContent = Doc.getContentFromMsg(fixed);
                    recContent = stripDocOutlineMetaLines(recContent);
                    if (!recTitle || !recContent) {
                      message.error("规范化后仍缺标题或章节，请手工检查。");
                      return;
                    }
                    const chapters = Doc.getChaptersFromContent(recContent);
                    const t = Doc.checkChapter(chapters);
                    if (t.code < 0) {
                      message.error(t.msg);
                      return;
                    }
                    if (t.code > 0) message.warning(t.msg);
                    else message.success(t.msg);
                    const newOutlineRec = new OutlineRec(
                      recTitle,
                      recContent,
                      outlineType === outlineTypeDOC ? (kb_name || "samples") : (kb_name || ""),
                      "",
                    );
                    OutlineRec.save(outlineType, newOutlineRec);
                    cb4setOutlineRec(newOutlineRec.outlineId!);
                    const newRecs = OutlineRec.listRecs(
                      outlineType,
                      outlineType === outlineTypeDOC ? (kb_name || "samples") : undefined,
                    );
                    cb4setTempOutlineRecs(newRecs);
                  }}
                >
                  规范化并保存
                </Button>
              ) : null}
            <Button key={"outlineSave"} size={"small"}
                    type="dashed"
                    onClick={(e) => {
                      console.log(e,props.message);
                      let content = "";
                      content=clean4DocTitle(msg)
                      let recTitle=Doc.getTitleFromMsg(content);
                      let recContent=Doc.getContentFromMsg(content);
                      if(!recTitle||recTitle.length===0){
                        message.error("无法保存，大纲markdown格式有误,标题应该以【# 】开头单独一行，请检查并修改。")
                        return;
                      }
                      if(!recContent||recContent.length===0){
                        message.error("无法保存，一级文档章节应以【## 】开头单独一行，二级文档段落应以【### 】开头单独一行，请手工检查并修改。")
                        return;
                      }
                      recContent = stripDocOutlineMetaLines(recContent);
                      const chapters=Doc.getChaptersFromContent(recContent)
                      const t =Doc.checkChapter(chapters);
                      if(t.code < 0){
                        const msg1="注意：无法保存，一级文档章节应以【## 】开头单独一行，二级文档段落应以【### 】开头单独一行，请手工检查并修改。"
                        message.error(t.msg+"\n"+msg1)
                        return;
                      }
                      if(t.code > 0){
                        message.warning(t.msg);
                      } else {
                        message.success(t.msg)
                      }
                      let newOutlineRec = new OutlineRec(
                        recTitle,
                        recContent,
                        outlineType===outlineTypeDOC ? (kb_name || "samples") : (kb_name || ""),
                        "",
                      );
                      console.log("the new OutlineRec:", JSON.stringify(newOutlineRec));
                      OutlineRec.save(outlineType,newOutlineRec);
                      cb4setOutlineRec(newOutlineRec.outlineId!);
                      let newRecs=OutlineRec.listRecs(outlineType, outlineType===outlineTypeDOC ? (kb_name || "samples") : undefined)
                      cb4setTempOutlineRecs(newRecs);
                    }}
            >
              大纲保存
            </Button>
              </Space>
            </Space>
          );
        },
      }}
      actions={{
        render: (defaultDoms) => {
          return [
            <SpeechToTextButton  key={"speech"}  cb4textFn={getTextFromMic}/>,
            ...defaultDoms,
          ];
        },
        flexConfig: {
          gap: 24,
          direction: 'horizontal',
          justify: 'space-between',
        },
      }}
      inputAreaRender={(_defaultDom) => (
        <OutlinePromptComposer
          topic={topic}
          setTopic={setTopic}
          mode="doc"
          showVars
          kbName={kb_name}
          onSend={sendOutline}
          openPreviewSignal={previewSignal}
          inferVars={async (t) => {
            const completion = await openai.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content:
                    "你从文章主题里抽出三个短字段，只返回JSON：" +
                    '{"role":"岗位","object":"写作对象或核心议题","scope":"短范围"}。' +
                    "scope 是品类/赛道短标签：优先主题里的具体品类对（如「商务男装衬衫/polo衫」「男装」），" +
                    "可用斜杠连接 1～2 个品类，≤20字；禁止顿号罗列细分类目清单；主题未写范围则 scope 用空字符串。" +
                    "不要解释，不要编造主题里没有的岗位。",
                },
                { role: "user", content: `主题：${t}` },
              ],
              model: DEFAULT_LLM_MODEL,
              stream: false,
              temperature: 0.2,
            } as any);
            const text = completion?.choices?.[0]?.message?.content || "";
            return parseInferredVarsJson(String(text));
          }}
        />
      )}
      request={async (messages: any) => {
        const rest = (Array.isArray(messages) ? messages : []).filter(
          (m: any) => m?.role !== 'system',
        );
        const apiMessages = [
          { role: 'system', content: pendingSystemRef.current || buildDocOutlineSystemPrompt() },
          ...rest,
        ];
        const completion = await openai.chat.completions.create({
          messages: apiMessages,
          model: DEFAULT_LLM_MODEL,
          stream: true,
          stream_options: {
            top_k: 4,
            temperature: 0.4,
            prompt_name: "default",
            return_direct: false
          }
        });
        console.log('messages', apiMessages);
        const reader = completion.toReadableStream().getReader();
        const decoder = new TextDecoder('utf-8');
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            function push() {
              reader
                .read()
                .then(({done, value}) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  const chunk = decoder.decode(value, {stream: true});
                  const message = chunk.replace('data: ', '');
                  const parsed = JSON.parse(message);
                  controller.enqueue(encoder.encode(parsed.choices[0].delta.content));
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
  )
}
export default ChatWithSpeech4Doc;
