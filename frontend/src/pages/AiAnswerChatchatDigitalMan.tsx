import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import {ProChat, ProChatProvider, useProChat} from '@ant-design/pro-chat';
import { useTheme } from 'antd-style';
import { OpenAI } from 'openai';
import * as React from "react";
import SpeechToTextButton from "@/components/DocUtil/SpeechToTextButton";
import DigitalMan from "@/components/DigitalMan/DigitalMan";
import {useState} from "react";
import ChatControlBar, {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';

//使用毕方后台提供的接口，
const openai = new OpenAI({
  apiKey: 'sk-f46769dda93743ba8266506c28500d32',
  baseURL: process.env.bf_baseUrl+'/chat',
  dangerouslyAllowBrowser: true,
});

const Welcome: React.FC = () => {
  // const { token } = theme.useToken();

  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const chats = {
    ZGxiX2p4: {
      content: '欢迎来到毕方平台。',
      createAt: 1697862242452,
      id: 'ZGxiX2p4',
      role: 'assistant',
      updateAt: 1697862243540,
    },
  };
  let childRef:any = React.createRef();
  let imojis=["youshoubixin","chuishou","youshoubaibai","youshoudianzan","fanshou","huanzhuang","woshou","yaotou","youtanshou","keaidiantou","lingting","keaiyoutanshou","qiantanshou","idle"];

  const genImoji=()=>{
    const imoji=imojis[Math.floor(Math.random()*(imojis.length-1))]
    console.log("hezl:----gen imoji:",imoji)
    return imoji;
  }
  const buttonMessages_init:ButtonMessage[]=[
    {title: "大模型训练方法有哪些?...",
      content:'大模型训练方法有哪些?'
    },
    {title: '毕方鸟出自哪里?...',
      content:'毕方鸟出自哪里?'
    },
    {title: '研制总结报告怎么写?...',
      content:'研制总结报告怎么写?'
    },
    {title: '2024年男装流行趋势如何？...',
      content:'2024年男装流行趋势如何？'
    }
  ]

  const ChatWithSpeech=()=>{
    return (
      <ProChatProvider>
        <Chat/>
        <ChatControlBar buttonMessages={buttonMessages_init} messagePrefix={"智能问答样例"}/>
      </ProChatProvider>
    )
  }
  const Chat=()=> {
    const proChat = useProChat();
    const [digitalManText, setDigitalManText] = useState<string>('');
    const [digitalManImoji, setDigitalManImoji] = useState<string>('idle');
    const getTextFromMic = (text: string) => {
      proChat.sendMessage(text);
    }
    return (
      <>
      <ProChat
        style={{minHeight: '82vh', background: "aliceblue"}}
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
        helloMessage={'欢迎使用 毕方 ，我是你的专属知识管理机器人。'}
        request={async (messages: any) => {
          const completion = await openai.chat.completions.create({
            messages: messages,
            model: DEFAULT_LLM_MODEL,
            stream: true,
          });

          console.log('messages', messages);
          // 获取 reader
          const reader = completion.toReadableStream().getReader();
          const decoder = new TextDecoder('utf-8');
          const encoder = new TextEncoder();
          let responseText=""
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
                    const intermText=parsed.choices[0].delta.content
                    const interm= encoder.encode(intermText)
                    controller.enqueue(interm);
                    responseText+=intermText;
                    if(parsed.choices[0].finish_reason==="stop") {
                      // console.log("hezl:------streamout:", responseText);
                      if(responseText&&responseText.length>0){
                        console.log("hezl:-------render_text:",responseText.substring(0,2))
                        setDigitalManText(responseText.substring(0,20));
                        const imoji=genImoji()
                        console.log("hezl:-------render_imoji:",imoji);
                        setDigitalManImoji(imoji);
                      }
                    }else{
                      // console.log("hezl:------intermText:",intermText,parsed.choices[0].finish_reason,parsed.choices[0]);
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
          const resp=new Response(readableStream)
          console.log("hezl------streamout:",responseText)
          return resp;
        }}
        userMeta={{
          avatar: '/avart.svg',
          title: '毕方',
        }}
        assistantMeta={{
          avatar: '/robot.svg',
          title: '小毕' /*, backgroundColor: '#67dedd'*/,
        }}
        initialChats={Object.values(chats)}
      />
    <DigitalMan render_text={digitalManText} render_imoji={digitalManImoji} />
      </>
    )
  }
  return(
    <PageContainer breadcrumb={{}}>
      <ProCard
        split="vertical"
        style={{ height: '100%', minHeight: '720px' }}
        bodyStyle={{
          backgroundImage:
            initialState?.settings?.navTheme === 'realDark'
              ? 'background-image: linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
              : 'background-image: linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
        }}
      >
        <ProCard style={{ height: '85vh', background: theme.colorBgContainer,width:"65vw" }}>
          {/*<FloatButton style={{position:"fixed",top:"100px",right:"10px"}} icon={<UserSwitchOutlined />} type="primary" onClick={showDrawer} />*/}
          <ChatWithSpeech/>
        </ProCard>
      </ProCard>
    </PageContainer>
  );
};

export default Welcome;
