import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import {Button, Empty, Spin, message, Flex, Progress, Tag} from 'antd';
import React, {useEffect, useState} from "react";
import axios from "axios";
import {parseChatCompletionData, WRITING_SYSTEM_PROMPT, KB_WRITING_CONSTRAINT_PROMPT, KB_GEN_EMPTY_ERROR} from "@/components/DocUtil/parseChatCompletion";

import {OutlinePromptDoc} from "@/components/DocUtil/OutlinePromptDoc";
import {OutlineResultDoc} from "@/components/DocUtil/OutlineResultDoc";
import {ViewItem4Doc, Chapter, Doc, Paragraph, clean4DocTitle} from "@/components/DocUtil/ViewItem4Doc";
import PizZipUtils from "pizzip/utils";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from 'file-saver'
import OutlineRec, {outlineTypeDOC, outlineTypePPT} from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import KnowledgeBaseSelector, {opStackStyle, opBtnStyle, opKbTagStyle, ALL_KB_NAME, kbLabel} from "@/components/DocUtil/kbSelectorModal";
import {CompassTwoTone, FileWordTwoTone, FolderOpenTwoTone} from "@ant-design/icons";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';


// 定义一个markdown字串，当localstorage中一个文档也没有的情况下暂时使用。
const markdown_init = "# 如何帮助选品师筛选出抖音男装的爆品\n\n## 一、了解市场需求\n\n* 1.1 趋势分析：关注抖音上的流行趋势，研究赛博机能、末日竞赛等热门主题。\n* 1.2 用户偏好：分析用户对于衣服的审美要求与功能需求。\n* 1.3 目标受众定位：针对年轻受众的需求进行细分。\n\n## 二、考察产品特点\n\n* 2.1 设计元素：选择符合流行趋势且具个性化、创意性的设计风格，如做旧、解构、拼接等。\n* 2.2 色彩搭配：选取银色、黑色、灰色等主流颜色或者具有冲击力的撞色效果。\n* 2.3 功能性需求：关注舒适度、实用性和时尚感，满足多元化运动场景。\n* 2.4 品质把控：要求供应商提供高品质的产品，保障商品的耐用性与满意度。\n\n## 三、数据分析\n\n* 3.1 热销爆款分析：查看抖音男装销量情况，了解热销爆款的销量规律。\n* 3.2 官方数据：关注各大电商平台和抖音平台的数据报告。\n* 3.3 社交热度：跟踪抖音热点话题和相关标签的热度。\n\n## 四、供应商与合作\n\n* 4.1 优质供应商选择：寻找有品牌形象、生产实力和网络营销能力合格的供应商。\n* 4.2 考察合作店铺：调研店铺信誉好、客群广泛的销售渠道和搭配公式。\n* 4.3 平台政策：关注抖音平台相关的选品规范和优惠政策。\n\n## 五、营销策略\n\n* 5.1 视频创意：根据服装特点制作优质的宣传视频，提高用户观看兴趣。\n* 5.2 选品类目：策划与服装特点相符的产品活动、打折促销等策略吸引消费者。\n* 5.3 晒单反馈：注重用户体验，主动收集产品反馈信息。\n\n## 六、总结评估\n\n* 6.1 抒达能力测试：评价写作者对于市场需求和趋势的认识能力。\n* 6.2 产品知识掌握程度：考察选品师对各品类产品的了解与掌握程度。\n* 6.3 持续关注市场动态，优化和调整策略。\n";
// const get_chapters_from_outlineRecs=(outlineRecs:OutlineRec[],id:string,formatPrompt="")=>{
//   const or=OutlineRec.getRecById(outlineRecs,id);
//   init_title =or?or.outlineName:"";
//   init_content =or?or.outlineContent:"";
//   /**
//    * 先初始化chapters结构，再设置所有提示词(重设)。
//    */
//   init_chapters =Doc.getChaptersFromContent(init_content);
//   /** TODO 后续可以检查一下格式**/
//   if(init_title===""||init_content===""||init_chapters.length===0){
//     init_chapters=[]
//   }else {
//     init_chapters = Doc.setAllPrompt(init_chapters, init_title, formatPrompt);
//   }
//   return init_chapters;
// }
// const get_kbName_from_outlineRecs=(outlineRecs:OutlineRec[],id:string)=>{
//   const or=OutlineRec.getRecById(outlineRecs,id);
//   init_kbName=or?or.outline_source_kbName:"";
//   init_kbName=init_kbName?.length>0?init_kbName:"samples";
//   return init_kbName;
// }


/**
 * 设置word文档模板
 */
const slideTemplates=[
  {id:1,name:"市场调研分析报告",pict:"doc_template_1.jpg",file:"template_1.docx",labels:["商业"]},
  {id:2,name:"简约活动报告",pict:"doc_template_2.jpg",file:"template_2.docx",labels:["日常","简约"]},
  {id:3,name:"简约课题报告",pict:"doc_template_4.jpg",file:"template_4.docx",labels:["学院","科技"]},
  {id:4,name:"商务汇报",pict:"doc_template_3.jpg",file:"template_3.docx",labels:["商业","时尚"]},
  {id:5,name:"简约售前报告",pict:"doc_template_5.jpg",file:"template_5.docx",labels:["IT","科技"]},
  {id:6,name:"商业活动策划",pict:"doc_template_6.jpg",file:"template_6.docx",labels:["商业"]}
]
function init():[OutlineRec[],string,string,Chapter[],string]{
  const formatPrompt = "";
  const outlineRecs = OutlineRec.listRecs(outlineTypeDOC, ALL_KB_NAME);
  if (!outlineRecs.length) {
    return [[], "", ALL_KB_NAME, [], formatPrompt];
  }
  const init_id = outlineRecs[0].outlineId!;
  const [init_title, _, __, init_chapters] = Doc.get_chapters_from_outlineRecs(outlineRecs, outlineTypeDOC, init_id, formatPrompt);
  return [outlineRecs, init_title, ALL_KB_NAME, init_chapters, formatPrompt];
}

const KbOutlineGenDoc: React.FC = () => {
  const [loading, setLoading] = useState(false);
  // const [downloading, setDownloading] = useState(false);
  const [downloadable, setDownloadable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ProgressHidden, setProgressHidden] = useState(true);
  let [outlineRecs,init_title,init_kbName,init_chapters,formatPrompt]=init();
  init_title=init_title?init_title:"";
  init_chapters=init_chapters?init_chapters:[];
  const [key,setKey] = useState<string>(
    init_chapters[0]?.paragraphs?.[0]?.key || init_chapters[0]?.key || '',
  );
  const [chapters,setChapters] = useState(init_chapters);
  const [title, setTitle] = useState<string>(init_title);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [kbName,setKbName]=useState(init_kbName);
  const [kbModelOpen,setKbModelOpen]=useState(false);
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [ParagraphTemplateDrawerOpen, setParagraphTemplateDrawerOpen] = useState(false);
  const [olRecs, setOlRecs] = useState<OutlineRec[]>(outlineRecs);

  useEffect(() => {
    const recs = OutlineRec.listRecs(outlineTypeDOC, kbName);
    setOlRecs(recs);
    const belongs = !!title && recs.some((r) => r.outlineName === title);
    if (!belongs) {
      setChapters([]);
      setTitle('');
      setDownloadable(false);
    }
  }, [kbName]);

  const onOutlineRecSelect= (id:string)=>{
    const [newTitle,_,newKbName,newChapters]=Doc.get_chapters_from_outlineRecs(OutlineRec.listRecs(outlineTypeDOC),outlineTypeDOC,id,formatPrompt)
    if(newTitle&&newKbName&&newChapters) {
      setChapters(newChapters);
      setKbName(newKbName);
      setTitle(newTitle);   //(or?or.outlineName:"");
      setDownloadable(false);
      return true
    }
    message.warning(`出错了，ID为${id}的大纲中，主题、知识库、章节这三项之一无内容`);
    return false;
  }

  function onOutlineRecDelete(id:string) {
    // let outlineRec=olRecs[idx]
    const or=OutlineRec.getRecById(olRecs,id);
    if(or) {
      OutlineRec.deleteRecById(or.outlineId, outlineTypeDOC);
      let newRecs = OutlineRec.listRecs(outlineTypeDOC, kbName);
      setOlRecs(newRecs);
      if (newRecs.length === 0 || !newRecs.some((r) => r.outlineName === title)) {
        setChapters([]);
        setTitle('');
        setDownloadable(false);
      }
    }else{
      message.warning(`未找到要删除ID：${id}的大纲。`)
    }
  }
  const drawerClose=()=>{
    setDrawerOpen(false);
  }
  const paragraphTemplateDrawerClose=()=>{
    setParagraphTemplateDrawerOpen(false);
  }

  const beforeOutlineSelect =()=>{
    const recs = OutlineRec.listRecs(outlineTypeDOC, kbName);
    setOlRecs(recs);
    if(recs.length===0){
      message.warning(`知识库「${kbLabel(kbName)}」下尚无文章大纲，请先在【大纲构思】中生成并保存。`);
      return false;
    }
    setDrawerOpen(true);
  }
  function loadFile(url:string, callback:(err:Error,data:string)=>void ){
    PizZipUtils.getBinaryContent(url, callback);
  }
  const beforeTemplateSelect =()=>{
    setParagraphTemplateDrawerOpen(true);
    // warning("drawerOpenStatus:"+drawerOpen);
  }
  const saveDoc=()=>{
      setLoading(true);
      loadFile(
        // the "template" example hosted by us
        "/docTemplate-simple.docx",
        function (error: any, content: PizZip.LoadData) {
          if (error) {
            throw error;
          }
          const curDate = new Date();
          const curDateStr = curDate.getFullYear()+"-"+curDate.getMonth()+"-"+curDate.getDate();
          const curSimpleDateStr = curDate.getFullYear()+""+curDate.getMonth()+""+curDate.getDate();
          const zip = new PizZip(content);
          const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
          });

          // Render the document (Replace {first_name} by John, {last_name} by Doe)
          doc.render({
            // company: "北京英创互联科技",
            company: "北京AI智能联盟",
            department: "AI智能工作室",
            author: "智能小毕",
            curDate: curDateStr,
            title: title,
            first_name: "John",
            last_name: "Doe",
            phone: "+33666666",
            description: "The Acme Product",
            itemName1: "test1",
            itemName2: "test2",
            chapters: chapters,
          });

          const blob = doc.getZip().generate({
            type: "blob",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            // compression: DEFLATE adds a compression step.
            // For a 50MB output document, expect 500ms additional CPU time
            compression: "DEFLATE",
          });
          // Output the document using Data-URI
          saveAs(blob, title+"-Ai-v"+curSimpleDateStr+".docx");
          setLoading(false);
          // setDownloadable(false);
        }
      );
  }

  const genDoc = async (genKey:string="") => {
    setLoading(true);
    // 需要使用kbName
    const url=process.env.bf_baseUrl+'/knowledge_base/local_kb'+`/${kbName}/chat/completions`;
    // 指定header
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    // 生成请求的序号与每个item的key的对应
    type tIdx={
      key: string;
      idx: number;
    }
    const tArray=new Array<tIdx>();
    // const getTIdxFromTArray=(idx:number) => {tArray.filter((t)=> {return t.idx===idx})}
    const getKeyFromTArray=(idx:number) => {
      for(let t of tArray){
        if(idx===t.idx){
          return t.key.toString();
        }
      }
      return "paragraph0";
    }
    //---------------------------------------------
    const buildMsg=(prompt:string )=>{
      setDownloadable(false);
      const msg={messages:[{content:WRITING_SYSTEM_PROMPT,role:"system",name:"string"},{content: prompt,role:"user",name:"string"}],model:DEFAULT_LLM_MODEL,frequency_penalty:0,stream:false,temperature:0.7,top_logprobs:0,top_p:0}
      return JSON.stringify(msg);
    }

    let startTime=new Date().getTime();
    let promiseArr= [];
    let index=0;
    for (let chapter of chapters){
      if(Array.isArray(chapter.paragraphs)){
        for (let paragraph of chapter.paragraphs){
          /*** 生成全部 ***/
          if(genKey.length===0) {
            if (paragraph.prompt.length > 0) {
              promiseArr.push(axios.post(url, buildMsg(paragraph.prompt + formatPrompt + KB_WRITING_CONSTRAINT_PROMPT), {headers: headers}));
              tArray.push({key: paragraph.key, idx: index});
              index++;
            } else {
              message.warning("提示词未填写。")
            }
            /***各段落独立生成****/
          }else{
            if(genKey === paragraph.key){
              if (paragraph.prompt.length > 0) {
                promiseArr.push(axios.post(url, buildMsg(paragraph.prompt + formatPrompt + KB_WRITING_CONSTRAINT_PROMPT), {headers: headers}));
                tArray.push({key: paragraph.key, idx: index});
                index++;
              }else{
                message.warning("提示词未填写。")
              }
              break;
            }
          }
        }
      }
    }
    console.log(promiseArr);
    console.log(`hezl setkey:${JSON.stringify(tArray)}`);
    setProgress(1);
    setProgressHidden(false);
    try{
      let completeCnts=0;
      let wordCnts=0;
      Promise.allSettled(promiseArr.map(
        (p,idx)=>
          p.then(value=>{
            completeCnts++;
            setProgress(Math.min(100, parseFloat(((100 * completeCnts) / promiseArr.length).toFixed(1))));
            const parsed = parseChatCompletionData(value.data, { requireKbHits: true });
            if (parsed.ok) {
              const key = getKeyFromTArray(idx);
              Doc.setContent(chapters, key, parsed.content);
              wordCnts += parsed.content.length;
            } else {
              console.warn("段落生成失败:", parsed.error, value.data);
            }
            return value
          }).catch(error=>{
            const key=getKeyFromTArray(idx);
            message.warning(`Key为${key}的段落文本生成请求失败了。`)
          })
      )).then(results=>{
        const completeCount=results.filter(r=>r.status==='fulfilled').length;
        console.info("返回的所有结果："+results.length+"个;results："+JSON.stringify(results))
        const errMsgs=results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map((r) => parseChatCompletionData(r.value?.data, { requireKbHits: true }))
          .filter((p): p is { ok: false; error: string } => !p.ok)
          .map((p) => p.error);
        if(errMsgs&&errMsgs.length>0){
          const kbEmptyCnt = errMsgs.filter((e) => e === KB_GEN_EMPTY_ERROR).length;
          if (kbEmptyCnt > 0) {
            message.error(KB_GEN_EMPTY_ERROR);
          } else {
            message.warning("内容生成请求有"+errMsgs.length+"个文档段落返回错误："+errMsgs[0]+"(...)");
          }
          if (errMsgs.length===completeCount) {
            setLoading(false);
            setProgressHidden(true);
            setDownloadable(false);
            return;
          }
        }
        if(completeCount===promiseArr.length){
          console.log(JSON.stringify(tArray));
          console.log("共完成了："+completeCount+"段文字写作。")
          let endTime=new Date().getTime();
          const timeDiff=((endTime-startTime)/1000/60).toFixed(1);
          console.log("共耗时约:"+timeDiff+"分钟");
          // Item.setContent(items,2,"tset2!");
          // Item.setContent(items,4,"tset4!");
          const wordCntsStr=(wordCnts/10000).toFixed(2);
          message.info("共完成了："+completeCount+"段"+wordCntsStr+"万字写作, 总耗时约:"+timeDiff+"分钟");
          console.log("---------------------------"+JSON.stringify(tArray));
          console.log("!!!!docGen result::::---------------------------"+JSON.stringify(chapters));
          setLoading(false);
          setProgressHidden(true);
          setChapters(chapters);
          setDownloadable(true);
        }else{
          message.warning("发生了一些错，完成个数："+completeCount+";少于请求文档段落个数："+promiseArr.length)
          setLoading(false);
          setProgressHidden(true);
        }
      });
    }catch(error){
      // @ts-ignore
      console.error('出错了:',error.message);
    }
  };
  /***
   ** 有内容的正常返回：
   **{"status":"fulfilled","value":{"data":"{\"id\": \"chat8ddcd5e7-9300-4f3e-a603-f243ef4947ae\", \"object\": \"chat.completion\", \"model\": \"glm4:9b-chat-q8_0\", \"created\": 1735585518, \"status\": null,
   * \"message_type\": 1, \"message_id\": null, \"is_ref\": false, \"choices\": [{\"message\": {\"role\": \"assistant\", \"content\": \"1. 选择新鲜猪肉 - 选用猪后腿肉，肉质鲜嫩适合做鱼香肉丝。\\n2. 切片细长 - 将猪肉切成薄片，长度约5厘米，宽度约1厘米，便于入味和炒制。\\n3. 腌制调味 - 用生抽、老抽、料酒等腌制肉片，增加风味。\\n4. 炒制技巧 - 中火快速翻炒肉片，避免肉片变硬或粘锅。\\n5. 控制火候 - 锅中油热后先爆香葱姜蒜，再下肉片炒制。\",
   * \"finish_reason\": null, \"tool_calls\": []}}]}",
   * "status":200,"statusText":"OK","headers":{"access-control-allow-credentials":"true","access-control-allow-origin":"http://localhost:8000","connection":"close","content-length":"774","content-type":"application/json","date":"Mon, 30 Dec 2024 19:04:50 GMT","server":"uvicorn","vary":"Origin, Accept-Encoding","x-powered-by":"Express","x-real-url":"http://127.0.0.1:7861/knowledge_base/local_kb/samples/chat/completions"},"config":{"transitional":{"silentJSONParsing":true,"forcedJSONParsing":true,"clarifyTimeoutError":false},"adapter":["xhr","http","fetch"],"transformRequest":[null],"transformResponse":[null],"timeout":0,"xsrfCookieName":"XSRF-TOKEN","xsrfHeaderName":"X-XSRF-TOKEN","maxContentLength":-1,"maxBodyLength":-1,"env":{},"headers":{"Accept":"application/json","Content-Type":"application/json"},"method":"post","url":"http://localhost:8000/knowledge_base/local_kb/samples/chat/completions","data":"{\"messages\":[{\"content\":\"作为文档撰写员，请根据知识库回答问题\",\"role\":\"system\",\"name\":\"string\"},{\"content\":\"Ppt标题是<如何做好鱼香肉丝>，请指出[幻灯片 1 肉类的选择与处理]具体怎么做。撰写3至5个小点，每个小点给出12个字以内的概括，再给出大约20~45个字的具体描述。写出来的格式为：1. [概括]-[具体描述]。\",\"role\":\"user\",\"name\":\"string\"}],\"model\":\"glm4:9b-chat-q8_0\",\"frequency_penalty\":0,\"stream\":false,\"temperature\":0.7,\"top_logprobs\":0,\"top_p\":0}"},"request":{}}},
   **/
  /***
   ** 错误返回：
   * {
   *     "status": "fulfilled",
   *     "value": {
   *         "data": {
   *             "code": 404,
   *             "msg": "未找到知识库 SEMIR",
   *             "data": null
   *         },
   *         "status": 200,
   *         "statusText": "OK",
   *         "headers": {
   *             "access-control-allow-credentials": "true",
   *             "access-control-allow-origin": "http://localhost:8000",
   *             "connection": "close",
   *             "content-length": "57",
   *             "content-type": "application/json",
   *             "date": "Mon, 30 Dec 2024 19:18:00 GMT",
   *             "server": "uvicorn",
   *             "vary": "Origin, Accept-Encoding",
   *             "x-powered-by": "Express",
   *             "x-real-url": "http://127.0.0.1:7861/knowledge_base/local_kb/SEMIR/chat/completions"
   *         },
   *         "config": {
   *             "transitional": {
   *                 "silentJSONParsing": true,
   *                 "forcedJSONParsing": true,
   *                 "clarifyTimeoutError": false
   *             },
   *             "adapter": [
   *                 "xhr",
   *                 "http",
   *                 "fetch"
   *             ],
   *             "transformRequest": [
   *                 null
   *             ],
   *             "transformResponse": [
   *                 null
   *             ],
   *             "timeout": 0,
   *             "xsrfCookieName": "XSRF-TOKEN",
   *             "xsrfHeaderName": "X-XSRF-TOKEN",
   *             "maxContentLength": -1,
   *             "maxBodyLength": -1,
   *             "env": {},
   *             "headers": {
   *                 "Accept": "application/json",
   *                 "Content-Type": "application/json"
   *             },
   *             "method": "post",
   *             "url": "http://localhost:8000/knowledge_base/local_kb/SEMIR/chat/completions",
   *             "data": "{\"messages\":[{\"content\":\"作为文档撰写员，请根据知识库回答问题\",\"role\":\"system\",\"name\":\"string\"},{\"content\":\"Ppt标题是<如何做好鱼香肉丝>，请指出[幻灯片 1 肉类的选择与处理]具体怎么做。撰写3至5个小点，每个小点给出12个字以内的概括，再给出大约20~45个字的具体描述。写出来的格式为：1. [概括]-[具体描述]。\",\"role\":\"user\",\"name\":\"string\"}],\"model\":\"glm4:9b-chat-q8_0\",\"frequency_penalty\":0,\"stream\":false,\"temperature\":0.7,\"top_logprobs\":0,\"top_p\":0}"
   *         },
   *         "request": {}
   *     }
   * }
   *
   *
   **/

  const cbFn=(key:string) => {
    // console.log("hezl"+key);
    setKey(key);
  }
  /*****************************************************************************/
  //*** 以下用于独立生成和编辑prompt****/
  const genFn=(key:string)=>{
    genDoc(key)
    // message.info("独立生成:"+key)
  }
  const cbSavePromptResult =(key:string,newPrompt :string)=>{
    console.log(`outlineGenPpt.tsx#cb4Save,prompt:${key}`);
    const paragraph =Doc.getParagraph(chapters,key);
    if(paragraph){
      Doc.setPrompt(chapters,key,newPrompt)
      setChapters(chapters)
    }else{
      message.warning(`保存出错，要保存提示词的文档段落key为${key}。`)
    }
  }

  function cb4ImportOutline(title:string,rawContent:string) {
    rawContent=clean4DocTitle(rawContent);
    const t=Doc.getTitleFromMsg(rawContent);
    let msgContent=""
    if (!t||t.length===0){
      msgContent = "# "+title+"\n "+rawContent
    }else{
      msgContent = rawContent;
    }
    Doc.addDocOutlineRecToStorage(outlineTypeDOC, msgContent, kbName);
    let newRecs=OutlineRec.listRecs(outlineTypeDOC, kbName)
    setOlRecs(newRecs)
    console.log(olRecs.length,olRecs);
  }

  /****************************************************************************/

  const extraStr = title ? `文档标题：《${title}》` : '尚未选择大纲';
  const noOutline = chapters.length === 0;
  const emptyHint = olRecs.length === 0
    ? `知识库「${kbLabel(kbName)}」下还没有大纲。请先在【大纲构思】中生成并保存。`
    : `请点击【选择大纲】，载入知识库「${kbLabel(kbName)}」下的大纲。`;

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
        <ProCard
          title={<b>写作大纲</b>}
          extra={extraStr}
          colSpan="35%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer }}
        >
          {noOutline ? (
            <Empty style={{marginTop: 48}} description={emptyHint} />
          ) : (
            <OutlinePromptDoc id="prompt-container" chapters={chapters}
                            activeKey={key} fn={cbFn} genFn={genFn} cbSaveResultFn={cbSavePromptResult}/>
          )}
        </ProCard>
        <ProCard
          title={<b>操作</b>}
          colSpan="11%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer }}
        >
          <div style={opStackStyle}>
            <Tag color="blue" style={opKbTagStyle}>
              <div>已选知识库：</div>
              <div style={{wordBreak: 'break-all', fontWeight: 600, width: '100%'}}>{kbLabel(kbName)}</div>
            </Tag>
            <div style={{marginBottom: 16}}>
              <KnowledgeBaseSelector open={kbModelOpen} kbName={kbName} cbKbSel={setKbName}/>
            </div>
            <div style={{marginBottom: 16}}>
              <Spin spinning={false}>
                <Button type="dashed" block icon={<FolderOpenTwoTone style={{fontSize:"large"}}/>}
                        onClick={beforeOutlineSelect} style={opBtnStyle}>
                  选择大纲
                </Button>
              </Spin>
            </div>
            <div style={{marginBottom: 16}}>
              <Spin spinning={loading}>
                <Button block icon={<CompassTwoTone style={{fontSize:"large"}}/>} type="dashed"
                        disabled={noOutline}
                        onClick={() =>genDoc()}  style={opBtnStyle}>
                  内容生成
                </Button>
              </Spin>
            </div>
            <div style={{marginBottom: 16}}>
              <Button type="dashed" block icon={<FileWordTwoTone style={{fontSize:"large"}}/>} disabled={!downloadable}
                      onClick={() =>saveDoc()}  style={opBtnStyle}>
                文档下载
              </Button>
            </div>
            <Flex gap="small" wrap style={{marginTop: 20}} hidden={ProgressHidden}>
              <Progress type="circle" percent={progress} />
            </Flex>
          </div>
        </ProCard>
        <ProCard
          title={<b>生成内容列表</b>}
          colSpan="57%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer }}
        >
          {noOutline ? (
            <Empty style={{marginTop: 48}} description="选择大纲后，生成的内容会显示在这里。" />
          ) : (
            <OutlineResultDoc chapters={chapters} activeKey={key} fn={cbFn} />
          )}
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"select"} open={drawerOpen} outlineRecs={olRecs} outlineType={outlineTypeDOC} kbName={kbLabel(kbName)}
                           selFn={onOutlineRecSelect} delFn={onOutlineRecDelete}
                           closeFn={drawerClose} cb4ImportOutline={cb4ImportOutline}
      />

    </PageContainer>
  );
};

export default KbOutlineGenDoc;
