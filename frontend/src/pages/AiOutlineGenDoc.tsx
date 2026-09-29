import { PageContainer, ProCard } from '@ant-design/pro-components';
import {Button, Spin, Row, Col, message, Flex, Progress} from 'antd';
import React, {useState} from "react";
import axios from "axios";
import {parseChatCompletionData, WRITING_SYSTEM_PROMPT, KB_DOC_WRITING_CONSTRAINT_PROMPT} from "@/components/DocUtil/parseChatCompletion";
import {OutlinePromptDoc} from "@/components/DocUtil/OutlinePromptDoc";
import {OutlineResultDoc} from "@/components/DocUtil/OutlineResultDoc";
import {ViewItem4Doc, Chapter, Doc, Paragraph, clean4DocTitle, buildDocParagraphFormatPrompt, DOC_OUTLINE_MARKDOWN_INIT} from "@/components/DocUtil/ViewItem4Doc";
import {
  prepareChaptersBlocks,
  resolveBlocksToPayloads,
  injectDocBlocks,
} from "@/components/DocUtil/DocBlockInjector";
import {fetchAssetBytes} from "@/services/chatchat/kb";
import {scrubConclusionChapters} from "@/components/DocUtil/conclusionGate";
import PizZipUtils from "pizzip/utils";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from 'file-saver'
import OutlineRec, {outlineTypeAiDOC, outlineTypeDOC} from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import {CompassTwoTone, FileWordTwoTone, FolderOpenTwoTone} from "@ant-design/icons";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';

// 本地无大纲时的种子样例（十一·2：### + 结论章）
const markdown_init = DOC_OUTLINE_MARKDOWN_INIT;
/**将文档存入storage**/
/*const addDocOutlineRecToStorage=(markdown:string,outlineRecs:OutlineRec[])=>{
  const rawTitle=Doc.getTitleFromMsg(markdown);
  const rawContent =Doc.getContentFromMsg(markdown);
  const outlineRec_init=new OutlineRec(rawTitle, rawContent);
  OutlineRec.save(outlineTypeAiDOC,outlineRec_init)
  outlineRecs.push(outlineRec_init);
}
const get_chapters_from_outlineRecs=(outlineRecs:OutlineRec[],idx:number,formatPrompt="")=>{
  init_title =outlineRecs[idx].outlineName;
  init_content =outlineRecs[idx].outlineContent;
  //先初始化chapters结构，再设置所有提示词(重设)。
  init_chapters =Doc.getChaptersFromContent(init_content);
  init_chapters =Doc.setAllPrompt(init_chapters,init_title,formatPrompt);
  return init_chapters;
}

const outlineRecs= OutlineRec.listRecs(outlineTypeAiDOC);
let init_title="";
let init_content:string;
let init_chapters:Chapter[]=[]
const formatPrompt="";
if (outlineRecs.length===0){
 addDocOutlineRecToStorage(markdown_init,outlineRecs)
}
init_chapters=get_chapters_from_outlineRecs(outlineRecs,0)*/

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
  let outlineRecs = OutlineRec.listRecs(outlineTypeAiDOC);
  let init_id: string;
  const formatPrompt = buildDocParagraphFormatPrompt();
  if (outlineRecs.length === 0) {
    init_id = Doc.addDocOutlineRecToStorage(/*outlineRecs,*/outlineTypeAiDOC, markdown_init)
    // 写入后重新拉取，否则 get_chapters 仍拿空列表会得到空 chapters
    outlineRecs = OutlineRec.listRecs(outlineTypeAiDOC);
  } else {
    init_id = outlineRecs[0].outlineId!;
  }
  let [init_title, _, init_kbName, init_chapters] = Doc.get_chapters_from_outlineRecs(outlineRecs, outlineTypeAiDOC, init_id, formatPrompt)
  // 本地大纲损坏/无法解析时，回退写入默认示例大纲
  if (!init_chapters?.length) {
    init_id = Doc.addDocOutlineRecToStorage(outlineTypeAiDOC, markdown_init);
    outlineRecs = OutlineRec.listRecs(outlineTypeAiDOC);
    [init_title, _, init_kbName, init_chapters] = Doc.get_chapters_from_outlineRecs(outlineRecs, outlineTypeAiDOC, init_id, formatPrompt);
  }
  return [outlineRecs,init_title,init_kbName,init_chapters,formatPrompt];
}

const AiOutlineGenDoc: React.FC = () => {
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
  const [kbName, setKbName] = useState<string>(init_kbName || "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [ParagraphTemplateDrawerOpen, setParagraphTemplateDrawerOpen] = useState(false);
  const [olRecs, setOlRecs] = useState<OutlineRec[]>(outlineRecs);

  const onOutlineRecSelect= (id:string)=>{
    const [newTitle,_,newKbName,newChapters]=Doc.get_chapters_from_outlineRecs(olRecs,outlineTypeAiDOC,id,formatPrompt)
    if(newTitle&&newChapters) {
      setChapters(newChapters);
      setTitle(newTitle);
      if (newKbName) setKbName(newKbName);
      setDownloadable(false);
      return true
    }
    message.warning(`出错了，ID为${id}的大纲中，主题、章节这两项之一无内容`);
    return false;
  }

  function onOutlineRecDelete(id:string) {
    // let outlineRec=olRecs[idx]
    const or=OutlineRec.getRecById(olRecs,id);
    if(or) {
      OutlineRec.deleteRecById(or.outlineId, outlineTypeAiDOC);
      let newRecs = OutlineRec.listRecs(outlineTypeAiDOC);
      setOlRecs(newRecs)
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
    // console.log("test....")
    if(olRecs.length===0){
      message.warning("尚无智能写作文章大纲，您可以使用【大纲构思】功能生成文章大纲。");
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
        "/docTemplate-simple.docx",
        async function (error: any, content: PizZip.LoadData) {
          if (error) {
            setLoading(false);
            throw error;
          }
          try {
            const curDate = new Date();
            const curDateStr = curDate.getFullYear()+"-"+curDate.getMonth()+"-"+curDate.getDate();
            const curSimpleDateStr = curDate.getFullYear()+""+curDate.getMonth()+""+curDate.getDate();
            const blockLists = prepareChaptersBlocks(chapters);
            const zip = new PizZip(content);
            const doc = new Docxtemplater(zip, {
              paragraphLoop: true,
              linebreaks: true,
            });
            doc.render({
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
            const payloads = await resolveBlocksToPayloads(blockLists, {
              kbName,
              fetchKbAsset: async ({kbName: kn, file_name, asset_id}) =>
                fetchAssetBytes({
                  knowledge_base_name: kn,
                  file_name,
                  asset_id,
                }),
            });
            const inj = injectDocBlocks(doc.getZip(), payloads);
            if (inj.warning) {
              console.warn(inj.warning);
              message.warning(inj.warning);
            }
            const blob = doc.getZip().generate({
              type: "blob",
              mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              compression: "DEFLATE",
            });
            saveAs(blob, title+"-Ai-v"+curSimpleDateStr+".docx");
          } catch (e) {
            console.error(e);
            message.error("生成 Word 失败");
          } finally {
            setLoading(false);
          }
        }
      );
  }

  const genDoc = async (genKey:string="") => {
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
              // 十·7 ⑦-0：Ai 无 KB 资产，勿拼空清单硬禁（此前 buildFigureAssetAppendix([])）
              promiseArr.push(axios.post(url, buildMsg(paragraph.prompt + KB_DOC_WRITING_CONSTRAINT_PROMPT), {headers: headers}));
              tArray.push({key: paragraph.key, idx: index});
              index++;
            } else {
              message.warning("提示词未填写。")
            }
            /***各段落独立生成****/
          }else{
            if(genKey===paragraph.key){
              if (paragraph.prompt.length > 0) {
                promiseArr.push(axios.post(url, buildMsg(paragraph.prompt + KB_DOC_WRITING_CONSTRAINT_PROMPT), {headers: headers}));
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
            const parsed = parseChatCompletionData(value.data);
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
          .map((r) => parseChatCompletionData(r.value?.data))
          .filter((p): p is { ok: false; error: string } => !p.ok)
          .map((p) => p.error);
        if(errMsgs&&errMsgs.length>0){
          message.warning("内容生成请求有"+errMsgs.length+"个文档段落返回错误："+errMsgs[0]+"(...)");
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
          const cg = scrubConclusionChapters(chapters);
          if (cg.report.blocked_count > 0 || cg.report.tagged_count > 0) {
            console.info("[结论闸]", cg.report);
          }
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
      message.warning(`保存出错，要保存提示词的文档key为${key}。`)
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
    Doc.addDocOutlineRecToStorage(/*outlineRecs,*/outlineTypeAiDOC,msgContent);
    let newRecs=OutlineRec.listRecs(outlineTypeAiDOC)
    setOlRecs(newRecs)
    console.log(outlineRecs.length,outlineRecs);
  }

  /****************************************************************************/

  const extraStr="文档标题：《"+title+"》"

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
          <OutlinePromptDoc id="prompt-container" chapters={chapters}
                            activeKey={key} fn={cbFn} genFn={genFn} cbSaveResultFn={cbSavePromptResult}/>
        </ProCard>
        <ProCard
          title={<b>操作</b>}
          colSpan="11%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer }}
        >
          <Col span={1}>
            <Row>
              <Spin spinning={false}>
                <Button type="dashed" icon={<FolderOpenTwoTone style={{fontSize:"large"}}/>}
                        onClick={beforeOutlineSelect} style={{marginLeft:"-10px",fontSize:"small"}}>
                  选择大纲
                </Button>
              </Spin>
            </Row>
            <Row>&nbsp;</Row>
            <Row>
            <Spin spinning={loading}>
              <Button icon={<CompassTwoTone style={{fontSize:"large"}}/>} type="dashed"
                      onClick={() =>genDoc()}  style={{marginLeft:"-10px",fontSize:"small"}}>
                内容生成
              </Button>
            </Spin>
            </Row>
            <Row>&nbsp;</Row>
            <Row>
              {/*<Spin spinning={downloading}>*/}
                <Button type="dashed" icon={<FileWordTwoTone style={{fontSize:"large"}}/>} disabled={!downloadable}
                        onClick={() =>saveDoc()}  style={{marginLeft:"-10px",fontSize:"small"}}>
                  文档下载
                </Button>
              {/*</Spin>*/}
            </Row>
            <Row>
              <Flex gap="small" wrap  style={{marginLeft:"-10px",marginTop:"20px"}} hidden={ProgressHidden}>
                <Progress type="circle" percent={progress} />
              </Flex>
            </Row>
          </Col>
        </ProCard>
        <ProCard
          title={<b>生成内容列表</b>}
          colSpan="57%"
          headerBordered
          style={{ minHeight: '80vh', background: theme.colorBgContainer }}
        >
          <OutlineResultDoc chapters={chapters} activeKey={key} fn={cbFn} />
        </ProCard>
      </ProCard>
      <OutlineSelectDrawer type={"select"} open={drawerOpen} outlineRecs={olRecs} outlineType={outlineTypeAiDOC}
                           selFn={onOutlineRecSelect} delFn={onOutlineRecDelete} closeFn={drawerClose}
                           cb4ImportOutline={cb4ImportOutline}
      />
    </PageContainer>
  );
};

export default AiOutlineGenDoc;
