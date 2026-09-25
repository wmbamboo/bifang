import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import { useState } from 'react';
import * as React from "react";
import {OpenAI} from "openai";

import {outlineTypeAiDOC} from "@/components/DocUtil/OutlineStore";
import OutlineRec from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import ChatWithSpeech4Doc from "@/components/ChatUtil/ChatWithSpeech4Doc";
import {composeDocOutlineUserMessage} from "@/components/ChatUtil/OutlinePromptComposer";
import {message, Button} from "antd";

export const AiGenDocOutline: React.FC = () => {
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
    setTempOutlineRec(OutlineRec.listRecs(outlineTypeAiDOC));
    showDrawer();
  };
  const onClose = () => {
    setOpen(false);
  };
  //----------------------------------------------------------------------------------------------
  //  用于大模型生成文档
  //----------------------------------------------------------------------------------------------
  const buttonMessages_init:ButtonMessage[]=[
    {title: "",
      content: composeDocOutlineUserMessage('如何帮助选品师判断抖音男装的流行趋势')
    },
    {title: '',
      content: composeDocOutlineUserMessage('研制总结报告') + '（深空探测科学目标体系图谱项目，遵循GJB438B）'
    },
    {title: '',
      content: composeDocOutlineUserMessage('2024年男装流行趋势如何')
    }
  ]
  const openai = new OpenAI({
    apiKey: 'sk-f46769dda93743ba8266506c28500d32',
    baseURL: process.env.bf_baseUrl+'/chat',
    dangerouslyAllowBrowser: true,
  });
  function onOutlineRecDelete(id:string) {
    OutlineRec.deleteRecById(id,outlineTypeAiDOC);
    let newRecs=OutlineRec.listRecs(outlineTypeAiDOC);
    // console.log(JSON.stringify(newRecs));
    // message.info(`已删除(ID:${id})大纲，目前智能大纲还有${newRecs.length}个。`)
    setTempOutlineRec(newRecs)
  }

  const cb4setTempOutlineRecs=(ors:OutlineRec[])=>{
    setTempOutlineRec(ors)
    showDrawer();
  }
  /**chat组件中大纲保存新记录的通知回调**/
  function cb4setOutlineRec(id:string) {
    // setGenOutlineId(id);
    message.info(`大纲保存。大纲ID是：${id}`,30);
    setDefaultId(id);
  }

  return(
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
        <ProCard style={{ minHeight: '85vh', background: theme.colorBgContainer }}>
          <ChatWithSpeech4Doc openai={openai} outlineType={outlineTypeAiDOC}
                              featureName="智能大纲构思"
                          buttonMessages={buttonMessages_init}
                          cb4setOutlineRec={cb4setOutlineRec}
                          cb4setTempOutlineRecs={cb4setTempOutlineRecs}
          />
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"save"} open={open} outlineRecs={tempOutlineRecs}
                           focusId={defaultId}
                           /*selFn={onSelectRec}*/ outlineType={outlineTypeAiDOC}
                           delFn={onOutlineRecDelete}
                           closeFn={onClose} />
    </PageContainer>
  );
};

export default AiGenDocOutline;
