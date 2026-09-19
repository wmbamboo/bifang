import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import { useState } from 'react';
import * as React from "react";
import {OpenAI} from "openai";
import {outlineTypeDOC} from "@/components/DocUtil/OutlineStore";
import OutlineRec from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import KbListSnlComp from "@/components/KbMgt/KbListCompSnl";
import {ButtonMessage} from "@/components/ChatUtil/ChatControlBar";
import ChatWithSpeech4Doc from "@/components/ChatUtil/ChatWithSpeech4Doc";
import {DOC_OUTLINE_TEMPLATE} from "@/components/ChatUtil/OutlinePromptComposer";
import {message, Tag, Button} from "antd";
import {ALL_KB_NAME, kbLabel, opKbTagStyle} from "@/components/DocUtil/kbSelectorModal";

export const KbGenDocOutline: React.FC = () => {
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [open, setOpen] = useState(false);
  const [tempOutlineRecs, setTempOutlineRec] = useState<OutlineRec[]>([]);
  /**用于指定shower中初始化选中的radio**/
  const [defaultId, setDefaultId] = useState<string>("");
  const [selectKbName, setSelectKbName] = useState(ALL_KB_NAME);
  const handleSelectedKbItem= (kb_name:string) => {
    console.log('选择的知识库:', kb_name);
    setSelectKbName(kb_name)
  };
  const showDrawer = () => {
      setOpen(true);
  };
  const openOutlineQuery = () => {
    setTempOutlineRec(OutlineRec.listRecs(outlineTypeDOC, selectKbName));
    showDrawer();
  };
  const onClose = () => {
    setOpen(false);
  };
  //----------------------------------------------------------------------------------------------
  //  用于大模型生成文档
  //----------------------------------------------------------------------------------------------
  const outlineGen_template_init = DOC_OUTLINE_TEMPLATE;
  /***预设对话消息，title可以不填，自动提取content中的主题（注意格式：主题是【】）****/
  const buttonMessages_init:ButtonMessage[]=[
    {title: "",
      content:'作为一个撰写者，你要撰写一篇文章，主题是【万科怎么了】。\n'+outlineGen_template_init
    },
    {title: '',
      content:'为“深空探测科学目标体系图谱项目”撰写一个主题是【研制总结报告】的大纲，要求遵循GJB438B的要求。\n'+outlineGen_template_init
    },
    {title: '',
      content:'作为一个撰写者，你要撰写一篇文章，主题是【2024年男装流行趋势如何】\n'+outlineGen_template_init
    }
  ]
  const openai = new OpenAI({
    apiKey: 'sk-f46769dda93743ba8266506c28500d32',
    baseURL: `${process.env.bf_baseUrl}/knowledge_base/local_kb/${selectKbName}/`,
    dangerouslyAllowBrowser: true,
  });
  function onOutlineRecDelete(id:string) {
    OutlineRec.deleteRecById(id,outlineTypeDOC);
    let newRecs=OutlineRec.listRecs(outlineTypeDOC, selectKbName);
    // console.log(JSON.stringify(newRecs));
    // message.info(`已删除(ID:${id})大纲，目前智能大纲还有${newRecs.length}个。`)
    setTempOutlineRec(newRecs);
  }

  const cb4setTempOutlineRecs=(ors:OutlineRec[])=>{
    setTempOutlineRec(ors);
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
        <ProCard
          title="知识库选择"
          colSpan="12%"
          headerBordered
          style={{ minHeight: '82vh', background: theme.colorBgContainer }}
        >
          <Tag color="blue" style={{...opKbTagStyle, width: '100%', marginBottom: 12}}>
            <div>已选知识库：</div>
            <div style={{wordBreak: 'break-all', fontWeight: 600}}>{kbLabel(selectKbName)}</div>
          </Tag>
          <KbListSnlComp includeAll value={selectKbName} onSelectionChange={handleSelectedKbItem} />
        </ProCard>
        <ProCard style={{ minHeight: '85vh', background: theme.colorBgContainer }}>
          <ChatWithSpeech4Doc kb_name={selectKbName} openai={openai}
                              outlineType={outlineTypeDOC}
                              featureName="知识库大纲构思"
                                buttonMessages={buttonMessages_init}
                                cb4setOutlineRec={cb4setOutlineRec}
                                cb4setTempOutlineRecs={cb4setTempOutlineRecs}
          />
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"save"} open={open} outlineRecs={tempOutlineRecs} kbName={kbLabel(selectKbName)}
                           outlineType={outlineTypeDOC}
                           focusId={defaultId}
                           delFn={onOutlineRecDelete}
                           closeFn={onClose} />
    </PageContainer>
  );
};

export default KbGenDocOutline;
