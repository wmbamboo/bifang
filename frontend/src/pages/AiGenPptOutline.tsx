import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import { useState } from 'react';
import * as React from "react";
import {OpenAI} from "openai";
import OutlineRec, {outlineTypeAiPPT} from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import ChatWithSpeech4Ppt from "@/components/ChatUtil/ChatWithSpeech4Ppt";
import {PPT_OUTLINE_WELCOME_SAMPLES} from "@/components/ChatUtil/outlineWelcomeSamples";
import {message, Button} from "antd";

const AiGenPptOutline: React.FC = () => {
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [open, setOpen] = useState(false);
  const [tempOutlineRecs, setTempOutlineRec] = useState<OutlineRec[]>([]);
  /**用于指定shower中初始化选中的radio**/
  const [defaultId, setDefaultId] = useState<string>("");
  const showDrawer = () => {
      setOpen(true);
  };
  const openOutlineQuery = () => {
    setTempOutlineRec(OutlineRec.listRecs(outlineTypeAiPPT));
    showDrawer();
  };
  const onClose = () => {
    setOpen(false);
  };
  //----------------------------------------------------------------------------------------------
  //  用于大模型生成文档
  //----------------------------------------------------------------------------------------------
  /** 样例与知识库侧共用；点选后走定框 */
  const buttonMessages_init:ButtonMessage[] = PPT_OUTLINE_WELCOME_SAMPLES;
  const openai = new OpenAI({
    apiKey: 'sk-f46769dda93743ba8266506c28500d32',
    baseURL: process.env.bf_baseUrl+'/chat',
    dangerouslyAllowBrowser: true,
  });

  function onOutlineRecDelete(id:string) {
    const idx=tempOutlineRecs.findIndex((item:any) => item.id === id);
    OutlineRec.deleteRecById(id,outlineTypeAiPPT);
    let newRecs=OutlineRec.listRecs(outlineTypeAiPPT);
    // console.log(JSON.stringify(newRecs));
    // message.info(`已删除(ID:${id})大纲，目前智能大纲还有${newRecs.length}个。`)
    setTempOutlineRec(newRecs)
  }

  const cb4setTempOutlineRecs=(ors:OutlineRec[])=>{
    setTempOutlineRec(ors)
    showDrawer()
  }


  /**chat组件中大纲保存新记录的通知回调**/
  function cb4setOutlineRec(id:string) {
    // setGenOutlineId(id);
    message.info(`大纲保存。大纲ID是：${id}`,30);
    setDefaultId(id);
  }

  return (
    <PageContainer breadcrumb={{}} extra={<Button onClick={openOutlineQuery}>大纲查询</Button>}>
      <ProCard
        split="vertical"
        bodyStyle={{
          backgroundImage:
            initialState?.settings?.navTheme === 'realDark'
              ? 'background-image: linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
              : 'background-image: linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
        }}
      >
        <ProCard style={{ minHeight: '82vh', background: theme.colorBgContainer }}>
          <ChatWithSpeech4Ppt openai={openai}
                              outlineType={outlineTypeAiPPT}
                              featureName="智能PPT大纲"
                              buttonMessages={buttonMessages_init}
                              cb4setOutlineRec={cb4setOutlineRec}
                              cb4setTempOutlineRecs={cb4setTempOutlineRecs}
          />
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"save"} open={open} outlineRecs={tempOutlineRecs}
                           focusId={defaultId}
                           /*selFn={onSelectRec}*/ outlineType={outlineTypeAiPPT}
                           delFn={onOutlineRecDelete}
                           closeFn={onClose} />
    </PageContainer>
  );
};

export default AiGenPptOutline;
