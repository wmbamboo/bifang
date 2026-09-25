import {ProChat, ProChatProvider, useProChat} from "@ant-design/pro-chat";
import ChatControlBar, {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {Button, message} from "antd";
import OutlineRec, {outlineTypeAiDOC, outlineTypeDOC} from "@/components/DocUtil/OutlineStore";
import SpeechToTextButton from "@/components/DocUtil/SpeechToTextButton";
import ViewItem4Doc from "@/components/DocUtil/ViewItem4Doc";
import * as React from "react";
import {OpenAI} from "openai";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';


interface ChatWithSpeechProps{
  openai: OpenAI;
  kb_name:string;
  buttonMessages:ButtonMessage[],
  cb4setOutlineRec:(or:OutlineRec)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
  //cb4showDrawer:()=>void
}
interface ChatProps{
  openai: OpenAI;
  cb4setOutlineRec:(or:OutlineRec)=>void,
  cb4setTempOutlineRecs:(ors:OutlineRec[])=>void,
  kb_name:string;
}
const KbChatWithSpeech4Doc=(props:ChatWithSpeechProps)=>{
  return (
    <ProChatProvider>
      <Chat key="chat" kb_name={props.kb_name} openai={props.openai}
          cb4setOutlineRec={props.cb4setOutlineRec} cb4setTempOutlineRecs={props.cb4setTempOutlineRecs}/>
      <ChatControlBar key={"chatCtlBar"} buttonMessages={props.buttonMessages}/>
    </ProChatProvider>
  )
}
const chats_init = {
  ZGxiX2p4: {
    content: '欢迎来到毕方平台。',
    createAt: 1697862242452,
    id: 'ZGxiX2p4',
    role: 'assistant',
    updateAt: 1697862243540,
  },
};
const Chat=(props:ChatProps)=> {
  const proChat = useProChat();
  const {cb4setOutlineRec,cb4setTempOutlineRecs} =props
  console.log("chat render: baseUrl:",props.openai.baseURL);
  const getTextFromMic = (text: string) => {
    console.log("ppt:" + text);
    proChat.sendMessage(text);
  }
  return (
    <ProChat
      style={{minHeight: '82vh', background: "aliceblue"}}
      helloMessage={'欢迎使用 毕方 ，我是你的专属知识管理机器人。'}
      chatItemRenderConfig={{
        actionsRender: (props, dom, actionsProps) => {
          const msg: string = props.message?.toString() === undefined ? "" : props.message?.toString();
          if (props?.editing || msg.length <= 150 || !msg.includes("##")) {
            return null;
          }
          return (
            <>
              <Button key={"outlineEdit"} size={"small"} style={{marginTop: "0.5em"}}
                      type="dashed"
                      onClick={() => {
                        actionsProps?.onStartEdit();
                      }}
              >
                大纲修改
              </Button>
              <Button key={"outlineSave"} size={"small"} style={{marginTop: "0.5em"}}
                      type="dashed"
                      onClick={(e) => {
                        console.log(e, props.message);
                        // actionsProps?.onStartEdit();
                        let content = "";
                        if(msg.substring(0,11)==="```markdown") {
                          if(msg.substring(msg.length-3,msg.length)==="```") {
                            content = msg.substring(12, msg.length - 3);
                          }else{
                            message.error("无法保存，大纲markdown格式有误，但未以【```】结尾。请检查并删除无用标识或内容。")
                            return;
                          }
                        }else{
                          content = msg;
                        }
                        console.log(content);
                        //TODO HEZL
                        //1、校验规格
                        //2、人工修改
                        //3、保存大纲
                        let recTitle=ViewItem4Doc.getTitleFromMsg(content);
                        let recContent=ViewItem4Doc.getContentFromMsg(content);
                        if(!recTitle||recTitle.length===0){
                          message.error("无法保存，大纲markdown格式有误,标题应该以【# 】开头单独一行，请检查并修改。")
                          return;
                        }
                        if(!recContent||recContent.length===0){
                          message.error("无法保存，PPT章节应该以【## 】开头单独一行，幻灯片应该以【### 】开头单独一行，副标题为【* 】开头单独一行，请手工检查并修改。")
                          return;
                        }
                        //TODO validate chapters
                        let newOutlineRec = new OutlineRec(recTitle,recContent);
                        console.log("the new OutlineRec:", JSON.stringify(newOutlineRec));
                        cb4setOutlineRec(newOutlineRec);
                        OutlineRec.save(outlineTypeDOC,newOutlineRec);
                        let newRecs=OutlineRec.listRecs(outlineTypeDOC)
                        cb4setTempOutlineRecs(newRecs);
                        // showDrawer();
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
            <SpeechToTextButton cb4textFn={getTextFromMic}/>,
            ...defaultDoms,
          ];
        },
        flexConfig: {
          gap: 24,
          direction: 'horizontal',
          justify: 'space-between',
        },
      }}
      request={async (messages: any) => {
        const completion = await props.openai.chat.completions.create({
          messages: messages,
          model: DEFAULT_LLM_MODEL,
          stream: true,
          // temperature: 0.8,
          // top_p: 1,
          stream_options: {
            top_k: 4,
            score_threshold: 0.76,
            temperature: 0.4, //0.8
            prompt_name: "default",
            return_direct: false
          }
        });

        console.log('messages', messages);

        // 获取 reader
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
                  // console.log(parsed);
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
        title: '小毕' /*, backgroundColor: '#67dedd'*/,
      }}
      initialChats={Object.values(chats_init)}
    />
  )
}
export default KbChatWithSpeech4Doc;
