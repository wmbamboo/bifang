import {ProChat, ProChatProvider, useProChat} from "@ant-design/pro-chat";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {sampleLabel} from "@/components/ChatUtil/sampleLabel";
import {Button, message, Space} from "antd";
import {clean4PptTitle, Ppt} from "@/components/DocUtil/ViewItem4Ppt";
import OutlineRec, {
  outlineType,
  outlineTypePPT
} from "@/components/DocUtil/OutlineStore";
import SpeechToTextButton from "@/components/DocUtil/SpeechToTextButton";
import {OpenAI} from "openai";
import * as React from "react";
import welcomeStyles from "./ChatWelcome.less";
import OutlinePromptComposer, {composePptOutlinePrompt} from "@/components/ChatUtil/OutlinePromptComposer";


interface ChatWithSpeechProps{
  openai:OpenAI;
  outlineType:outlineType;
  /** 功能名，用于欢迎词「专属XXXX机器人」 */
  featureName: string;
  /***
   kb_name:
   当outlineType是outlineTypeDOC、outlineTypePPT时需要，
   当outlineType是outlineTypeAiDOC、outlineTypeAiPPT时不需要，
   **/
  kb_name?:string;
  buttonMessages:ButtonMessage[],
  cb4setOutlineRec:(id:string)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
}
interface ChatProps{
  openai:OpenAI;
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
const ChatWithSpeech4Ppt=(props:ChatWithSpeechProps)=>{
  const chatProps = {
    openai: props.openai,
    outlineType: props.outlineType,
    featureName: props.featureName,
    welcomeSamples: props.buttonMessages,
    cb4setOutlineRec: props.cb4setOutlineRec,
    cb4setTempOutlineRecs: props.cb4setTempOutlineRecs,
    ...(props.outlineType === outlineTypePPT ? { kb_name: props.kb_name } : {}),
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
  const getTextFromMic = (text: string) => {
    console.log("麦克风识别文本:" + text);
    setTopic(text);
  }

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
                  onClick={() => proChat.sendMessage(sample.content)}
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
      style={{ minHeight: '82vh',background:"aliceblue" }}
      helloMessage={welcomeMessage}
      chatItemRenderConfig={{
        actionsRender: (props, dom, actionsProps) => {
          const msg:string=props.message?.toString()===undefined?"":props.message?.toString();
          if (props?.editing || msg.length<=150 || !msg.includes("##")) {
            return null;
          }
          return (
            <>
              <Button key={"outlineEdit"} size={"small"} style={{marginTop:"0.5em"}}
                      type="dashed"
                      onClick={() => {
                        actionsProps?.onStartEdit();
                      }}
              >
                大纲修改
              </Button>
              <Button  key={"outlineSave"} size={"small"} style={{marginTop:"0.5em"}}
                      type="dashed"
                      onClick={(e) => {
                        console.log(e,props.message);
                        let content=clean4PptTitle(msg);
                        let recTitle=Ppt.getTitleFromMsg(content);
                        let recContent=Ppt.getContentFromMsg(content);
                        if(!recTitle||recTitle.length===0){
                          message.error("无法保存，大纲markdown格式有误,标题应该以【# 】开头并在第一行单独成行，请检查并修改。",20)
                          return;
                        }
                        const chapters=Ppt.getChaptersFromContent(recContent)
                        const t=Ppt.checkChapter(chapters);
                        if(t.code!==0){
                          const msg1="注意：无法保存，PPT章节应该以【## 】开头并单独一行，幻灯片应该以【### 】开头并单独一行，副标题为【* 】开头单独一行，请手工检查并修改。"
                          message.error(t.msg+"\n"+msg1,20)
                          return;
                        }
                        message.success(t.msg)
                        let newPptOutlineRec=new OutlineRec(
                          recTitle,
                          recContent,
                          outlineType===outlineTypePPT ? (kb_name || "samples") : (kb_name || ""),
                          "",
                        );
                        console.log("the new OutlineRec:", JSON.stringify(newPptOutlineRec));
                        OutlineRec.save(outlineType,newPptOutlineRec)
                        cb4setOutlineRec(newPptOutlineRec.outlineId!);
                        let newRecs=OutlineRec.listRecs(outlineType, outlineType===outlineTypePPT ? (kb_name || "samples") : undefined)
                        cb4setTempOutlineRecs(newRecs);
                      }}
              >
                大纲保存
              </Button>
            </>
          );
        },
      }}
      actions={{
        render: (defaultDoms) => {
          return [
            <SpeechToTextButton key={"speech"} cb4textFn={getTextFromMic}/>,
            ...defaultDoms,
          ];
        },
        flexConfig: {
          gap: 24,
          direction: 'horizontal',
          justify: 'space-between',
        },
      }}
      inputAreaRender={(_defaultDom, onMessageSend) => (
        <OutlinePromptComposer
          topic={topic}
          setTopic={setTopic}
          composePrompt={composePptOutlinePrompt}
          onSend={onMessageSend}
        />
      )}
      request={async (messages: any) => {
        const completion = await openai.chat.completions.create({
          messages: messages,
          model: 'glm4:9b-chat-q8_0',
          stream: true,
          stream_options:{
            top_k: 4,
            temperature: 0.4,
            prompt_name:"default",
            return_direct: false
          }
        });
        console.log('messages', messages);
        const reader = completion.toReadableStream().getReader();
        const decoder = new TextDecoder('utf-8');
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            function push() {
              reader
                .read()
                .then(({ done, value }) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  const chunk = decoder.decode(value, { stream: true });
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
export default ChatWithSpeech4Ppt;
