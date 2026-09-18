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
import {PPT_OUTLINE_TEMPLATE} from "@/components/ChatUtil/OutlinePromptComposer";
import {message} from "antd";

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
  const onClose = () => {
    setOpen(false);
  };
  //----------------------------------------------------------------------------------------------
  //  用于大模型生成文档
  //----------------------------------------------------------------------------------------------
  const outlineGen_template_init = PPT_OUTLINE_TEMPLATE;
  /***预设对话消息，title可以不填，自动提取content中的主题（注意格式：主题是【】）****/
  const buttonMessages_init:ButtonMessage[]=[
    {title: "",
      content:'撰写Ppt大纲，主题是【帮助选品师筛选出抖音男装爆品】'+outlineGen_template_init
    },
    {title: '',
      content:'撰写Ppt大纲，主题是【深空探测图谱项目研制总结报告】，要求遵循GJB438B的要求，' +outlineGen_template_init
    },
    {title: '',
      content:'撰写Ppt大纲，主题是【万科怎么了】' +outlineGen_template_init
    }
  ]
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
    <PageContainer breadcrumb={{}}>
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
                           /*selFn={onSelectRec}*/ outlineType={outlineTypeAiPPT}
                           delFn={onOutlineRecDelete}
                           closeFn={onClose} />
    </PageContainer>
  );
};

export default AiGenPptOutline;
