import {PageContainer, ProCard} from '@ant-design/pro-components';
import {useModel} from '@umijs/max';
import {useTheme} from 'antd-style';
import {Button, Flex, message, Progress, Spin} from 'antd';
import React, {useCallback, useState} from "react";
import axios from "axios";
import {parseChatCompletionData, WRITING_SYSTEM_PROMPT} from "@/components/DocUtil/parseChatCompletion";
import {Chapter, clean4PptTitle, Ppt, Slide, stripChapterOrdinalPrefix, buildPptItemFormatPrompt, countOutlineTips, validateSlideViewItems} from "@/components/DocUtil/ViewItem4Ppt";
import OutlineRec, {outlineTypeAiPPT, outlineTypePPT} from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import {PptOutlinePrompt} from "@/components/DocUtil/OutlinePromptPpt";
import {PptOutlineResult} from "@/components/DocUtil/OutlineResultPpt";
import SlideDrawer from "@/components/DocUtil/SliderDrawer";
import PptTemplate from "@/components/DocUtil/PptTemplate";
import {CompassTwoTone, FilePptTwoTone, FolderOpenTwoTone, RocketTwoTone} from "@ant-design/icons";
import SlideTemplateDrawer from "@/components/DocUtil/SlideTemplateDrawer";
import {opStackStyle, opBtnStyle} from "@/components/DocUtil/kbSelectorModal";
interface Dictionary {
  [key: string]: string;
}
/**
 * items==chapters
 */
// 定义一个markdown字串
const markdown_init = "# 如何做好鱼香肉丝\n" +
  "\n" +
  "## 章节一 食材选购与准备\n" +
  "### 幻灯片 1 肉类的选择与处理\n" +
  "- 选择上等猪肉部位及处理步骤\n" +
  "- 生姜大蒜的挑选与用途\n" +
  "\n" +
  "### 幻灯片 2 丰富的蔬菜搭配\n" +
  "- 韭菜、黑木耳的品质鉴定与泡发\n" +
  "- 青红椒等的清洗和切割技巧\n" +
  "\n" +
  "### 幻灯片 3 其他辅料准备\n" +
  "- 鱼露和酱油的品牌选择及用途\n" +
  "- 辣椒豆瓣酱与料酒的种类和使用\n" +
  "\n" +
  "## 章节二 调味与准备工作\n" +
  "### 幻灯片 4 调制鱼香汁的关键\n" +
  "- 配方解析：酱油、糖、醋的讲究\n" +
  "- 提香剂如花椒油的选用\n" +
  "\n" +
  "### 幻灯片 5 初步热菜的步骤\n" +
  "- 猪肉丝的制作技艺要求\n" +
  "- 初加热烹饪的时间控制\n" +
  "\n" +
  "## 章节三 炒制与翻锅技术\n" +
  "### 幻灯片 6 快速翻炒的要求\n" +
  "- 高温油的应用技巧与安全性\n" +
  "- 翻炒过程中火候的控制\n" +
  "\n" +
  "### 幻灯片 7 加料顺序的重要性\n" +
  "- 先后加入蔬菜的诀窍\n" +
  "- 推匀食材保持口感均匀\n" +
  "\n" +
  "### 幻灯片 8 炒至成熟的判断\n" +
  "- 视、闻、口感的多维度判断\n" +
  "- 出菜之前的小贴士\n" +
  "\n" +
  "## 章节四 鱼香肉丝的搭配与应用\n" +
  "### 幻灯片 9 不同吃法的展现\n" +
  "- 作为正菜的鱼香肉丝特点\n" +
  "- 如何和米饭或其他主食搭配\n" +
  "\n" +
  "### 幻灯片 10 打造成特色菜肴\n" +
  "- 与米饭或粉条的创意结合\n" +
  "- 适合不同食客的调整建议\n" +
  "\n" +
  "## 章节五 总结与拓展\n" +
  "### 幻灯片 11 经验分享和总结\n" +
  "- 鱼香肉丝烹饪中常遇问题的解决方法\n" +
  "- 持续提升技艺的建议和实践分享\n" +
  "\n" +
  "### 幻灯片 12 更多变体的探索\n" +
  "- 介绍鱼香系列的多样化菜品\n" +
  "- 学习烹饪的其他菜系或流派技巧";

/*const addPptOutlineRecToStorage=(markdown:string,outlineRecs:OutlineRec[])=>{
  const rawTitle=Ppt.getTitleFromMsg(markdown);
  const rawContent =Ppt.getContentFromMsg(markdown);
  const outlineRec_init=new OutlineRec(rawTitle, rawContent,formatPrompt);
  OutlineRec.save(outlineTypeAiPPT,outlineRec_init)
  outlineRecs.push(outlineRec_init);
}
const get_chapters_from_outlineRecs=(outlineRecs:OutlineRec[],idx:number,formatPrompt="")=>{
  init_title =outlineRecs[idx].outlineName;
  init_content =outlineRecs[idx].outlineContent;
  init_chapters =Ppt.getChaptersFromContent(init_content);
  init_chapters =Ppt.setAllPrompt_ppt(init_chapters,init_title,formatPrompt);
  return init_chapters;
}

const outlineRecs:OutlineRec[]= OutlineRec.listRecs(outlineTypeAiPPT);
let init_title="";
let init_content: string;
let init_chapters:Chapter[]= [];
const formatPrompt="写出来的格式必须为（每行一条，不要方括号）：1. 概括标题 - 具体描述约20到45字";
if (outlineRecs.length===0){
  addPptOutlineRecToStorage(markdown_init,outlineRecs)
}
init_chapters=get_chapters_from_outlineRecs(outlineRecs,0,formatPrompt);*/
function init():[OutlineRec[],string,string,Chapter[],string]{
  let outlineRecs = OutlineRec.listRecs(outlineTypeAiPPT);
  let init_id: string;
  const formatPrompt = buildPptItemFormatPrompt();
  if (outlineRecs.length === 0) {
    init_id = Ppt.addDocOutlineRecToStorage(/*outlineRecs,*/outlineTypeAiPPT, markdown_init)
    outlineRecs = OutlineRec.listRecs(outlineTypeAiPPT);
  } else {
    init_id = outlineRecs[0].outlineId!;
  }
  let [init_title, _, init_kbName, init_chapters] = Ppt.get_chapters_from_outlineRecs(outlineRecs, outlineTypeAiPPT, init_id)
  return [outlineRecs,init_title,init_kbName,init_chapters,formatPrompt];
}
/**
 * 设置幻灯片模板
 */
const slideTemplates=[
  {id:1,name:"市场调研分析报告",pict:"ppt_template_1.jpg",file:"template_1.pptx",labels:["商业"]},
  {id:2,name:"简约活动报告",pict:"ppt_template_2.jpg",file:"template_2.pptx",labels:["日常","简约"]},
  {id:3,name:"简约课题报告",pict:"ppt_template_4.jpg",file:"template_4.pptx",labels:["学院","科技"]},
  {id:4,name:"商务汇报",pict:"ppt_template_3.jpg",file:"template_3.pptx",labels:["商业","时尚"]},
  {id:5,name:"简约售前报告",pict:"ppt_template_5.jpg",file:"template_5.pptx",labels:["IT","科技"]},
  {id:6,name:"商业活动策划",pict:"ppt_template_6.jpg",file:"template_6.pptx",labels:["商业"]},
]

const AiOutlineGenPpt: React.FC = () => {
  const [loading, setLoading] = useState(false);
  // const [downloading, setDownloading] = useState(false);
  const [downloadable, setDownloadable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ProgressHidden, setProgressHidden] = useState(true);
  const [key,setKey] = useState<string>("slide1");
  let [outlineRecs,init_title,init_kbName,init_chapters,formatPrompt]=init();
  init_title=init_title?init_title:"";
  init_chapters=init_chapters?init_chapters:[];
  const [chapters,setChapters] = useState(init_chapters);
  const [title, setTitle] = useState<string>(init_title);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [editSlideKey, setEditSlideKey] = useState<string>("-1");
  const [editSlide, setEditSlide] = useState<Slide>(new Slide(-1,""));
  const [slideDrawerOpen, setSlideDrawerOpen] = useState(false);
  const [slideTemplateDrawerOpen, setSlideTemplateDrawerOpen] = useState(false);
  const [olRecs, setOlRecs] = useState<OutlineRec[]>(outlineRecs);

  const onOutlineRecSelect=useCallback( (id:string)=>{
    const [newTitle,_,newKbName,newChapters]=Ppt.get_chapters_from_outlineRecs(olRecs,outlineTypeAiPPT,id,formatPrompt)
    if(newTitle&&newKbName&&newChapters) {
      setChapters(newChapters);
      // setKbName(newKbName);
      setTitle(newTitle);   //(or?or.outlineName:"");
      setDownloadable(false);
      message.info(`selectOutline:ID:${id},${title},${chapters.length}`);
      return true
    }
    message.warning(`出错了，ID为${id}的大纲中，主题、章节这两项之一无内容`);
    return false;
  },[title,chapters]);

  function onOutlineRecDelete(id:string) {
    // let outlineRec=olRecs[idx]
    const or=OutlineRec.getRecById(olRecs,id);
    if(or) {
      OutlineRec.deleteRecById(or.outlineId, outlineTypeAiPPT);
      let newRecs = OutlineRec.listRecs(outlineTypeAiPPT);
      setOlRecs(newRecs)
    }else{
      message.warning(`未找到要删除ID：${id}的大纲。`)
    }
  }
  const drawerClose=()=>{
    setDrawerOpen(false);
  }
  const slideDrawerClose=()=>{
    new Slide(-1,"")
    setSlideDrawerOpen(false);
  }
  const slideTemplateDrawerClose=()=>{
    setSlideTemplateDrawerOpen(false);
  }

  const beforeOutlineSelect =()=>{
    // console.log("test....")
    if(olRecs.length===0){
      message.warning("尚无知识库PPT大纲，您可以使用【大纲构思】功能生成PPT大纲。");
      return false;
    }
    setDrawerOpen(true);
  }
  const beforeTemplateSelect =()=>{
    setSlideTemplateDrawerOpen(true);
    // warning("drawerOpenStatus:"+drawerOpen);
  }
  async function saveDoc(){
    // setLoading(true);
    Ppt.reparseAllSlideContents(chapters);
    const badFormat = Ppt.getSlidesWithBadFormat(chapters);
    if (badFormat.length > 0) {
      const names = badFormat.slice(0, 3).map((s) => s.title).join('、');
      message.error(
        `有 ${badFormat.length} 张幻灯片内容生成了，但格式不正确，需要点击右侧【内容修改】按钮或点击大纲对应项目的【重新生成】（如：${names}${badFormat.length > 3 ? '…' : ''}）。格式须为「1. 标题 - 描述」，否则无法写入 PPT 模板。`,
      );
      setDownloadable(false);
      setChapters(chapters.slice());
      return;
    }
    const slideVars=Ppt.getSlideVars(chapters);
    if(!slideVars||slideVars.length===0){
      message.warning(`生成幻灯片变量出错。`);
      return;
    }
    const emptyItems = slideVars.filter((sv) => Object.keys(sv.vItem || {}).length === 0);
    if (emptyItems.length > 0) {
      message.error(`有 ${emptyItems.length} 张幻灯片尚未解析出小项，无法生成 PPT，请先重新生成内容。`);
      setDownloadable(false);
      return;
    }
    console.log(slideVars);
    //TODO hezl 这些需要做到系统配置中去
    // const company="北京英创互联科技有限公司";
    const company= "北京AI智能联盟";
    const department="AI智能工作室"
    const author="智能小毕"
    const curDate = new Date();
    const curDateStr = curDate.getFullYear()+"-"+curDate.getMonth()+"-"+curDate.getDate();
    const curSimpleDateStr = curDate.getFullYear()+""+curDate.getMonth()+""+curDate.getDate();
    const pptTemplate = new PptTemplate("urlFile","/pptTemplate-simple.pptx", `${title}-Ai-v${curSimpleDateStr}.pptx`);
    await pptTemplate.init();
    //page1
    const slideVar_cover={
      title:title,
      subtitle:"智能报告",
      company:company,
      author:author,
      department:department,
      curDate: curDateStr,
    }
    // console.log(`新幻灯片第1页的slideVar:${JSON.stringify(slideVar_cover)}`)
    await pptTemplate.genNewSlideFileDict_Random("cover",slideVar_cover,1);
    //page2
    let slideVar_catalog:Dictionary={};
    for (let chapter of chapters){
      slideVar_catalog["chapterTitle"+(chapter.index)]=stripChapterOrdinalPrefix(chapter.title);
    }
    // console.log(`新幻灯片第2页的slideVar:${JSON.stringify(slideVar_catalog)}`)
    await pptTemplate.genNewSlideFileDict_Random("catalog",slideVar_catalog,2,chapters.length);
    let pages=3
    //page3~..
    if(slideVars.length > 0){
      for (const sv of slideVars) {
        const index = slideVars.indexOf(sv);
        let counts=Object.keys(sv.vItem).length/2;
        counts = Ppt.padVItemForTemplate(sv.vItem, counts);
        console.log(`新幻灯片第${index+3}页的slideVar:${JSON.stringify(sv)},,每页项数: ${counts}`);

        await pptTemplate.genNewSlideFileDict_Random("list",sv,index+3,counts);
        pages++
      }
    }
    // const sv_tail={}
    await pptTemplate.genNewSlideFileDict_Random("tail",slideVar_cover,pages);

    console.log(pptTemplate)
    await pptTemplate.genNewSlideFile("urlFile")
    // setLoading(false);
  }

  const genDoc = useCallback(async (genKey:string="") => {
    message.info(`genPPT:ID:${title},${chapters.length}`);
    setLoading(true);
    const url=process.env.bf_baseUrl+'/chat'+"/chat/completions";
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
      return "slide0";
    }
    //---------------------------------------------
    const buildMsg=(prompt:string )=>{
      setDownloadable(false);
      const msg={messages:[{content:WRITING_SYSTEM_PROMPT,role:"system",name:"string"},{content: prompt,role:"user",name:"string"}],model:"glm4:9b-chat-q8_0",frequency_penalty:0,stream:false,temperature:0.7,top_logprobs:0,top_p:0}
      return JSON.stringify(msg);
    }

    let startTime=new Date().getTime();
    let promiseArr= [];
    let index=0;
    for (let chapter of chapters){
      if(Array.isArray(chapter.slides)) {
        for (let slide of chapter.slides) {
          /*** 生成全部 ***/
          if (genKey.length === 0) {
            if (slide.prompt.length > 0) {
              promiseArr.push(axios.post(url, buildMsg(slide.prompt + buildPptItemFormatPrompt(countOutlineTips(slide.subTitle))), {headers: headers}));
              tArray.push({key: slide.key, idx: index});
              index++;
            } else {
              message.warning("提示词未填写。")
            }
            /***各段落独立生成****/
          }else{
            if(genKey === slide.key) {
              if (slide.prompt.length > 0) {
                promiseArr.push(axios.post(url, buildMsg(slide.prompt + buildPptItemFormatPrompt(countOutlineTips(slide.subTitle))), {headers: headers}));
                tArray.push({key: slide.key, idx: index});
                index++;
              } else {
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
            const parsed = parseChatCompletionData(value.data);
            if (parsed.ok) {
              const key = getKeyFromTArray(idx);
              Ppt.setContent(chapters, key, parsed.content);
              wordCnts += parsed.content.length;
            } else {
              Ppt.markGenError(chapters, getKeyFromTArray(idx), parsed.error);
              console.warn("幻灯片生成失败:", parsed.error, value.data);
            }
            return value
          }).catch(error=>{
            const key=getKeyFromTArray(idx);
            Ppt.markGenError(chapters, key, "内容生成请求失败");
            message.warning(`Key为${key}的幻灯片文本生成请求失败了。`)
          })
      )).then(results=>{
        const completeCount=results.filter(r=>r.status==='fulfilled').length;
        console.info("返回的所有结果："+results.length+"个;results："+JSON.stringify(results))
        const errMsgs=results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map((r) => parseChatCompletionData(r.value?.data))
          .filter((p): p is { ok: false; error: string } => !p.ok)
          .map((p) => p.error);
        if(errMsgs&&errMsgs.length>0){
          message.warning("内容生成请求有"+errMsgs.length+"个幻灯片返回错误："+errMsgs[0]+"(...)");
          if (errMsgs.length===completeCount) {
            setChapters(chapters.slice());
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
          Ppt.reparseAllSlideContents(chapters);
          const badFormat = Ppt.getSlidesWithBadFormat(chapters);
          setChapters(chapters.slice());
          if (badFormat.length > 0) {
            const names = badFormat.slice(0, 3).map((s) => s.title).join('、');
            message.error(
              `有 ${badFormat.length} 张幻灯片内容生成了，但格式不正确，需要点击右侧【内容修改】按钮或点击大纲对应项目的【重新生成】（如：${names}${badFormat.length > 3 ? '…' : ''}）。`,
            );
            setDownloadable(false);
          } else if (chapters.some((ch) => ch.slides?.some((s) => !!s.genError))) {
            setDownloadable(false);
          } else {
            setDownloadable(true);
          }
        }else{
          message.warning("发生了一些错，完成个数："+completeCount+";少于请求幻灯片个数："+promiseArr.length)
          setChapters(chapters.slice());
          setLoading(false);
          setProgressHidden(true);
        }
      });
    }catch(error){
      // @ts-ignore
      console.error('出错了:',error.message);
    }
  },[title,chapters]);
  /***
   ** 有内容的正常返回：
   **{"status":"fulfilled","value":{"data":"{\"id\": \"chat8ddcd5e7-9300-4f3e-a603-f243ef4947ae\", \"object\": \"chat.completion\", \"model\": \"glm4:9b-chat-q8_0\", \"created\": 1735585518, \"status\": null,
   * \"message_type\": 1, \"message_id\": null, \"is_ref\": false, \"choices\": [{\"message\": {\"role\": \"assistant\", \"content\": \"1. 选择新鲜猪肉 - 选用猪后腿肉，肉质鲜嫩适合做鱼香肉丝。\\n2. 切片细长 - 将猪肉切成薄片，长度约5厘米，宽度约1厘米，便于入味和炒制。\\n3. 腌制调味 - 用生抽、老抽、料酒等腌制肉片，增加风味。\\n4. 炒制技巧 - 中火快速翻炒肉片，避免肉片变硬或粘锅。\\n5. 控制火候 - 锅中油热后先爆香葱姜蒜，再下肉片炒制。\",
   * \"finish_reason\": null, \"tool_calls\": []}}]}",
   * "status":200,"statusText":"OK","headers":{"access-control-allow-credentials":"true","access-control-allow-origin":"http://localhost:8000","connection":"close","content-length":"774","content-type":"application/json","date":"Mon, 30 Dec 2024 19:04:50 GMT","server":"uvicorn","vary":"Origin, Accept-Encoding","x-powered-by":"Express","x-real-url":"http://127.0.0.1:7861/knowledge_base/local_kb/samples/chat/completions"},"config":{"transitional":{"silentJSONParsing":true,"forcedJSONParsing":true,"clarifyTimeoutError":false},"adapter":["xhr","http","fetch"],"transformRequest":[null],"transformResponse":[null],"timeout":0,"xsrfCookieName":"XSRF-TOKEN","xsrfHeaderName":"X-XSRF-TOKEN","maxContentLength":-1,"maxBodyLength":-1,"env":{},"headers":{"Accept":"application/json","Content-Type":"application/json"},"method":"post","url":"http://localhost:8000/knowledge_base/local_kb/samples/chat/completions","data":"{\"messages\":[{\"content\":\"作为文档撰写员，请根据知识库回答问题\",\"role\":\"system\",\"name\":\"string\"},{\"content\":\"Ppt标题是<如何做好鱼香肉丝>，请指出[幻灯片 1 肉类的选择与处理]具体怎么做。撰写3至5个小点，每个小点给出12个字以内的概括，再给出大约20~45个字的具体描述。写出来的格式必须为（每行一条，不要方括号）：1. 概括标题 - 具体描述约20到45字\",\"role\":\"user\",\"name\":\"string\"}],\"model\":\"glm4:9b-chat-q8_0\",\"frequency_penalty\":0,\"stream\":false,\"temperature\":0.7,\"top_logprobs\":0,\"top_p\":0}"},"request":{}}},
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
   *             "data": "{\"messages\":[{\"content\":\"作为文档撰写员，请根据知识库回答问题\",\"role\":\"system\",\"name\":\"string\"},{\"content\":\"Ppt标题是<如何做好鱼香肉丝>，请指出[幻灯片 1 肉类的选择与处理]具体怎么做。撰写3至5个小点，每个小点给出12个字以内的概括，再给出大约20~45个字的具体描述。写出来的格式必须为（每行一条，不要方括号）：1. 概括标题 - 具体描述约20到45字\",\"role\":\"user\",\"name\":\"string\"}],\"model\":\"glm4:9b-chat-q8_0\",\"frequency_penalty\":0,\"stream\":false,\"temperature\":0.7,\"top_logprobs\":0,\"top_p\":0}"
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
    const slide =Ppt.getSlide(chapters,key);
    if(slide){
      Ppt.setPrompt(chapters,key,newPrompt)
      setChapters(chapters)
    }else{
      message.warning(`保存出错，要保存提示词的幻灯片key为${key}。`)
    }
  }

  /**
   * resultCollapse中的编辑按钮消息传递函数
   * @param key
   */
  const cb4EditSlide_result=(key:string) => {
    console.log(`outlineGenPpt.tsx#cb4Edit:${key}`);
    const slide =Ppt.getSlide(chapters,key);
    if(slide){
      setEditSlideKey(slide.key)
      setEditSlide(slide)
      setSlideDrawerOpen(true)
      console.log(slide,slideDrawerOpen);
    }else{
      message.warning(`要编辑结果的幻灯片key为${key}。`)
    }
  }

  /**
   * 用于slidedrawer中resultSlide的保存按钮操作的消息传递。
   */
  const resultSlideEditDrawerSave=(items: Array<{title: string; content: string}>) => {
    const key=editSlide.key;
    const theSlide =Ppt.getSlide(chapters,key);
    if (!theSlide) {
      message.warning(`要编辑结果的幻灯片key为${key}。`);
      return false;
    }
    const ok = theSlide.setViewItemsStructured(items);
    setChapters(chapters.slice());
    if (!ok) {
      message.error(validateSlideViewItems(items) || '请至少填写 1 条完整小项（概括标题 + 具体描述）。');
      setDownloadable(false);
      return false;
    }
    message.success('小项已更新，小节状态已刷新。');
    if (Ppt.getSlidesWithBadFormat(chapters).length === 0) {
      setDownloadable(true);
    }
    return true;
  }
  const selectTemplate=(id:number)=>{
    const slideTemplate=slideTemplates.find((t)=>t.id===id);
    if(slideTemplate) {
      message.info(`已选择模板：${slideTemplate.name}`)
    }
  }



  function cb4ImportOutline(title:string,rawContent:string) {
    rawContent=clean4PptTitle(rawContent);
    const t=Ppt.getTitleFromMsg(rawContent);
    let msgContent=""
    if (!t||t.length===0){
      msgContent = "# "+title+"\n "+rawContent
    }else{
      msgContent = rawContent;
    }
    Ppt.addDocOutlineRecToStorage(/*outlineRecs,*/outlineTypeAiPPT,msgContent);
    let newRecs=OutlineRec.listRecs(outlineTypeAiPPT)
    setOlRecs(newRecs)
    console.log(olRecs.length,olRecs);
  }

  /****************************************************************************/

  const extraStr="文档标题：《"+title+"》"

/*
  function cb4ImportOutline(rawContent:string) {
    addPptOutlineRecToStorage(rawContent,outlineRecs);
    let newRecs=OutlineRec.getOutlineRecs(outlineTypeAiPPT)
    setOlRecs(newRecs)
    console.log(outlineRecs.length,outlineRecs);
  }
  const onGenDocClick= useCallback((event: React.MouseEvent<HTMLButtonElement> ) => {
    event.stopPropagation();
    genDoc()
  },[]);//确保事件只处理一次。
*/

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
          style={{ minHeight: "80vh", background: theme.colorBgContainer }}
        >
          <PptOutlinePrompt chapters={chapters} activeKey={key} fn={cbFn}
                            genFn={genFn}  cbSaveResultFn={cbSavePromptResult}/>
        </ProCard>
        <ProCard
          title={<b>操作</b>}
          colSpan="11%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer}}
        >
          <div style={opStackStyle}>
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
                        onClick={()=>genDoc()}  style={opBtnStyle}>
                  内容生成
                </Button>
              </Spin>
            </div>
            <div style={{marginBottom: 16}}>
              <Button type="dashed" block icon={<FolderOpenTwoTone style={{fontSize:"large"}}/>}
                      onClick={beforeTemplateSelect} style={opBtnStyle}>
                选择模板
              </Button>
            </div>
            <div style={{marginBottom: 16}}>
              <Button type="dashed" block icon={<FilePptTwoTone style={{fontSize:"large"}}/>} disabled={!downloadable}
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
          <PptOutlineResult chapters={chapters} activeKey={key} fn={cbFn} cb4EditSlide={cb4EditSlide_result} />
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"select"} open={drawerOpen} outlineRecs={olRecs} outlineType={outlineTypeAiPPT}
                           selFn={onOutlineRecSelect} delFn={onOutlineRecDelete}
                           closeFn={drawerClose} cb4ImportOutline={cb4ImportOutline}/>
      <SlideDrawer key={editSlideKey} slide={editSlide} open={slideDrawerOpen} closeFn={slideDrawerClose} fn={resultSlideEditDrawerSave} />
      <SlideTemplateDrawer slideTemplates={slideTemplates} open={slideTemplateDrawerOpen} closeFn={slideTemplateDrawerClose} fn={selectTemplate} />

    </PageContainer>
  );
};

export default AiOutlineGenPpt;
