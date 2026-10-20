import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { useTheme } from 'antd-style';
import {Button, Checkbox, Empty, Spin, message, Flex, Progress, Tag} from 'antd';
import React, {useEffect, useState} from "react";
import axios from "axios";
import {
  parseChatCompletionData,
  WRITING_SYSTEM_PROMPT,
  buildKbDocWritingConstraintPrompt,
  KB_GEN_EMPTY_ERROR,
  stripCitationsDeep,
} from "@/components/DocUtil/parseChatCompletion";

import {OutlinePromptDoc} from "@/components/DocUtil/OutlinePromptDoc";
import {OutlineResultDoc} from "@/components/DocUtil/OutlineResultDoc";
import {ViewItem4Doc, Chapter, Doc, Paragraph, clean4DocTitle, buildDocParagraphFormatPrompt, DOC_OUTLINE_MARKDOWN_INIT, paragraphsToGenerate, wordBudgetFor, DocPromptSavePatch, applyDocPromptSavePatch, flagEmptyDocParagraphs} from "@/components/DocUtil/ViewItem4Doc";
import {applyDocHeadingNumbers} from "@/components/DocUtil/docHeadingDepth";
import {
  prepareChaptersBlocks,
  resolveBlocksToPayloads,
  injectDocBlocks,
} from "@/components/DocUtil/DocBlockInjector";
import {
  applyHeadingLevels,
  buildHeadingLevelPlan,
  inferDocMaxHeadingLevel,
  patchTocOutlineLevels,
  stripHeadingAutoNumbering,
} from "@/components/DocUtil/docHeadingLevels";
import {allocateMaterialPool, fetchAssetBytes} from "@/services/chatchat/kb";
import {applyEntityGate, docsToEvidence} from "@/components/DocUtil/entityGate";
import {applyRankingGate} from "@/components/DocUtil/rankingGate";
import {normalizeCitations} from "@/components/DocUtil/citationNormalize";
import {applyOcrNoiseScrub} from "@/components/DocUtil/ocrNoiseScrub";
import {scrubConclusionChapters} from "@/components/DocUtil/conclusionGate";
import {
  applyManualFigureRef,
  buildFigureAssetAppendix,
  collectParagraphAllowedFigureRefLists,
  countBlockedFigures,
  countUnresolvedFigures,
  figureAssetsFromAssignedKeys,
  formatKbAssetRef,
  removeManualFigure,
  type DocKeyAssetRow,
} from "@/components/DocUtil/docFigureAssets";
import {readUploadAsset} from "@/components/DocUtil/docUploadAssets";
import {
  buildFactLedger,
  formatFactLedgerAppendix,
} from "@/components/DocUtil/docFactLedger";
import {isConclusionChapter} from "@/components/DocUtil/conclusionGate";
import {
  accumulateRefDocs,
  appendDocBibliography,
  bibliographyFromBag,
  type BibliographyEntry,
} from "@/components/DocUtil/docBibliography";
import PizZipUtils from "pizzip/utils";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from 'file-saver'
import OutlineRec, {outlineTypeDOC, outlineTypePPT} from "@/components/DocUtil/OutlineStore";
import OutlineSelectDrawer from "@/components/DocUtil/OutlineSelectDrawer";
import KnowledgeBaseSelector, {opStackStyle, opBtnStyle, opKbTagStyle, ALL_KB_NAME, kbLabel, getCachedKbName, setCachedKbName} from "@/components/DocUtil/kbSelectorModal";
import {CompassTwoTone, FileWordTwoTone, FolderOpenTwoTone} from "@ant-design/icons";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';


// 本地无大纲时的种子样例（十一·2：### + 结论章）
const markdown_init = DOC_OUTLINE_MARKDOWN_INIT;
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
  const formatPrompt = buildDocParagraphFormatPrompt();
  const cachedKb = getCachedKbName(ALL_KB_NAME);
  const outlineRecs = OutlineRec.listRecs(outlineTypeDOC, cachedKb);
  if (!outlineRecs.length) {
    return [[], "", cachedKb, [], formatPrompt];
  }
  const init_id = outlineRecs[0].outlineId!;
  const [init_title, _, __, init_chapters] = Doc.get_chapters_from_outlineRecs(outlineRecs, outlineTypeDOC, init_id, formatPrompt);
  return [outlineRecs, init_title, cachedKb, init_chapters, formatPrompt];
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
  const [kbName,setKbNameState]=useState(init_kbName);
  const setKbName = (name: string) => {
    setCachedKbName(name);
    setKbNameState(name);
  };
  const [kbModelOpen,setKbModelOpen]=useState(false);
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const [ParagraphTemplateDrawerOpen, setParagraphTemplateDrawerOpen] = useState(false);
  const [olRecs, setOlRecs] = useState<OutlineRec[]>(outlineRecs);
  const KEEP_CITE_KEY = "bifang.doc.keepCitations";
  const [keepCitations, setKeepCitations] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(KEEP_CITE_KEY);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const onKeepCitationsChange = (v: boolean) => {
    setKeepCitations(v);
    try {
      localStorage.setItem(KEEP_CITE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  /** 二十九·P0：生成阶段聚合的资料来源（文件名→页码） */
  const [bibliography, setBibliography] = useState<BibliographyEntry[]>([]);

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
            // 三十·④：隐去标注时深拷贝剥离，不改 state 里的 chapters
            let renderChapters = chapters;
            if (!keepCitations) {
              const cite = stripCitationsDeep(chapters);
              renderChapters = cite.chapters as Chapter[];
              console.info("[DocCite] 隐去来源标注", cite.stripped, "处");
            }
            flagEmptyDocParagraphs(renderChapters);
            const blockLists = prepareChaptersBlocks(renderChapters);
            applyDocHeadingNumbers(renderChapters);
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
              chapters: renderChapters,
            });
            const payloads = await resolveBlocksToPayloads(blockLists, {
              kbName,
              fetchKbAsset: async ({kbName: kn, file_name, asset_id}) =>
                fetchAssetBytes({
                  knowledge_base_name: kn,
                  file_name,
                  asset_id,
                }),
              // 三十五：本地上传 resolve
              resolveUpload: async (key) => readUploadAsset(key),
              // 二十三·13：段级 ref 白名单（须与 renderChapters 同源）
              allowedFigureRefsByList:
                collectParagraphAllowedFigureRefLists(renderChapters),
            });
            // 十·7 / 二十四·D：missing 与 blocked 分计分提示
            const unresolved = countUnresolvedFigures(payloads);
            const blocked = countBlockedFigures(payloads);
            console.info("[DocBlock]", {
              blockLists: blockLists.length,
              withBlocks: blockLists.filter((b) => b.length > 0).length,
              payloads: payloads.filter((p) => p && p.length).length,
              unresolvedFigures: unresolved,
              blockedFigures: blocked,
            });
            if (unresolved > 0) {
              message.error(
                `有 ${unresolved} 张插图无法解析（ref 不可 resolve），已写入「图片缺失」占位`,
              );
            }
            if (blocked > 0) {
              message.warning(
                `有 ${blocked} 处 figure ref 不在可用清单（模型改写或清单空），已占位`,
              );
            }
            const inj = injectDocBlocks(doc.getZip(), payloads);
            if (inj.warning) {
              console.warn(inj.warning);
              message.warning(inj.warning);
            }
            // 十八·P1-a：按 level 写样式 + TOC 收录级别随大纲深度
            const maxLvl = inferDocMaxHeadingLevel(renderChapters);
            patchTocOutlineLevels(doc.getZip(), maxLvl);
            const hl = applyHeadingLevels(
              doc.getZip(),
              buildHeadingLevelPlan(renderChapters, maxLvl),
            );
            if (hl.warning) console.warn(hl.warning);
            // 二十六·A：去 heading 自动编号，只留 label 手写编号
            const stripped = stripHeadingAutoNumbering(doc.getZip());
            if (stripped) console.info("[DocHeading] stripped numPr from", stripped, "heading styles");
            // 二十九·P0 / 三十·⑤：保留标注时文末附资料来源（不进 chapters）
            if (keepCitations && bibliography.length) {
              const ok = appendDocBibliography(doc.getZip(), bibliography);
              if (ok) {
                console.info("[DocCite] 资料来源", bibliography.length, "条");
              }
            }
            const blob = doc.getZip().generate({
              type: "blob",
              mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              compression: "DEFLATE",
            });
            saveAs(blob, title+"-Kb-v"+curSimpleDateStr+".docx");
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
    if (!genKey) setBibliography([]);
    // 需要使用kbName
    const url=process.env.bf_baseUrl+'/knowledge_base/local_kb'+`/${kbName}/chat/completions`;
    // 指定header
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    // 十·7 7a′：段级插图来自材料池 key_assets（不再 listAssets 全库前 12）
    let byChapterKeys: Record<string, string[]> = {};
    let keyAssets: Record<string, DocKeyAssetRow> = {};
    try {
      if (kbName && kbName !== ALL_KB_NAME && kbName !== "all" && chapters.length) {
        const allocRes = await allocateMaterialPool({
          knowledge_base_name: kbName,
          topic: title || "",
          chapters: chapters.map((ch, i) => ({
            id: ch.key || `chapter-${i}`,
            title: ch.title || "",
            points: (ch.paragraphs || []).map((p) => p.title).filter(Boolean),
          })),
        });
        const data = (allocRes as any)?.data ?? allocRes;
        byChapterKeys = (data?.by_chapter && typeof data.by_chapter === "object")
          ? data.by_chapter
          : {};
        keyAssets =
          data?.key_assets && typeof data.key_assets === "object"
            ? data.key_assets
            : {};
        if (Array.isArray(data?.unused)) {
          console.info(
            `[材料池] pool=${data.pool_size ?? "?"} unused=${data.unused.length} key_assets=${Object.keys(keyAssets).length}`,
          );
        }
      }
    } catch (e) {
      console.warn("材料池分配失败，本轮降级为逐段检索且禁 figure", e);
      byChapterKeys = {};
      keyAssets = {};
    }
    const splitKeysForParagraph = (
      chapterKeys: string[],
      paraIndex: number,
      paraCount: number,
    ): string[] | undefined => {
      if (!chapterKeys.length) return undefined;
      const n = Math.max(1, paraCount);
      const out: string[] = [];
      for (let i = paraIndex; i < chapterKeys.length; i += n) {
        out.push(chapterKeys[i]);
      }
      if (!out.length) {
        out.push(chapterKeys[paraIndex % chapterKeys.length]);
      }
      return out;
    };
    /** 任务 4 调用方：其他章/段已分配的键 → exclude（本段 assigned 除外） */
    const allAllocatedKeys = Object.values(byChapterKeys).flat();
    const excludeKeysFor = (mine: string[] | undefined): string[] | undefined => {
      if (!allAllocatedKeys.length) return undefined;
      const mineSet = new Set(mine || []);
      const excl = allAllocatedKeys.filter((k) => !mineSet.has(k));
      return excl.length ? excl : undefined;
    };
    // 生成请求的序号与每个item的key的对应
    type tIdx={
      key: string;
      idx: number;
    }
    const tArray=new Array<tIdx>();
    const getKeyFromTArray=(idx:number) => {
      for(let t of tArray){
        if(idx===t.idx){
          return t.key.toString();
        }
      }
      return "paragraph0";
    }
    //---------------------------------------------
    const buildMsg=(
      prompt:string,
      assignedKeys?: string[],
      excludeKeys?: string[],
    )=>{
      setDownloadable(false);
      const stream_options: Record<string, unknown> = {};
      if (assignedKeys) {
        stream_options.assigned_doc_keys = assignedKeys;
      }
      if (excludeKeys?.length) {
        stream_options.exclude_doc_keys = excludeKeys;
      }
      const msg: Record<string, unknown>={
        messages:[
          {content:WRITING_SYSTEM_PROMPT,role:"system",name:"string"},
          {content: prompt,role:"user",name:"string"},
        ],
        model:DEFAULT_LLM_MODEL,
        frequency_penalty:0,
        stream:false,
        temperature:0.7,
        top_logprobs:0,
        top_p:0,
      };
      if (Object.keys(stream_options).length) {
        msg.stream_options = stream_options;
      }
      return JSON.stringify(msg);
    }

    type GenJob = {
      key: string;
      chapterIndex: number;
      assigned?: string[];
      excludeKeys?: string[];
      baseBody: string;
      needsLedger: boolean;
    };
    const jobs: GenJob[] = [];
    let startTime = new Date().getTime();
    for (let ci = 0; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      if (!Array.isArray(chapter.paragraphs)) continue;
      const chId = chapter.key || "";
      const chKeys = byChapterKeys[chId] || [];
      const targets = paragraphsToGenerate(chapter);
      const paraCount = targets.length;
      let paraIndex = 0;
      for (const paragraph of targets) {
        const assigned = splitKeysForParagraph(chKeys, paraIndex, paraCount);
        const excludeKeys = excludeKeysFor(assigned);
        const figAssets = figureAssetsFromAssignedKeys(assigned, keyAssets, 6);
        const figureAppendix = buildFigureAssetAppendix(figAssets);
        // 二十一·9：清单空 → 禁 figure
        const allowFig = figAssets.length > 0;
        paragraph.allowFigure = allowFig;
        paragraph.allowedFigureRefs = figAssets.map((e) =>
          formatKbAssetRef(e.fileName, e.assetId),
        );
        paraIndex++;
        if (genKey.length > 0 && genKey !== paragraph.key) continue;
        if (!paragraph.prompt.length) {
          message.warning("提示词未填写。");
          if (genKey.length > 0) break;
          continue;
        }
        const kbC = buildKbDocWritingConstraintPrompt(wordBudgetFor(paragraph), {
          allowFigure: allowFig,
          allowCitations: keepCitations,
        });
        jobs.push({
          key: paragraph.key,
          chapterIndex: ci,
          assigned,
          excludeKeys,
          baseBody: paragraph.prompt + kbC + figureAppendix,
          needsLedger: isConclusionChapter(chapters, ci),
        });
        if (genKey.length > 0) break;
      }
      if (genKey.length > 0 && jobs.length) break;
    }
    jobs.forEach((j, i) => tArray.push({key: j.key, idx: i}));
    console.log(`hezl setkey:${JSON.stringify(tArray)}`);
    setProgress(1);
    setProgressHidden(false);
    const refBag = new Map<string, Set<number>>();

    const applyParsed = (key: string, value: any): number => {
      const parsed = parseChatCompletionData(value.data, {requireKbHits: true});
      if (!parsed.ok) {
        console.warn("段落生成失败:", parsed.error, value.data);
        return 0;
      }
      const docsRaw = (value.data as any)?.docs;
      accumulateRefDocs(refBag, docsRaw);
      const evidence = docsToEvidence(docsRaw);
      let body = parsed.content;
      if (evidence) {
        const eg = applyEntityGate(body, evidence);
        if (eg.report.blocked_count > 0) {
          console.info("[实体闸]", key, eg.report);
        }
        body = eg.text;
        const rg = applyRankingGate(body, evidence);
        if (rg.report.blocked_count > 0) {
          console.info("[排名闸]", key, rg.report);
        }
        body = rg.text;
      }
      const docCount = Array.isArray(docsRaw) ? docsRaw.length : undefined;
      const cn = normalizeCitations(body, {docCount});
      if (cn.report.mapped > 0 || cn.report.removed > 0) {
        console.info("[引用归一]", key, cn.report);
      }
      body = cn.text;
      const ns = applyOcrNoiseScrub(body);
      if (ns.report.replaced_count > 0) {
        console.info("[OCR噪声]", key, ns.report);
      }
      body = ns.text;
      Doc.setContent(chapters, key, body);
      return body.length;
    };

    try {
      let completeCnts = 0;
      let wordCnts = 0;
      const totalJobs = Math.max(1, jobs.length);

      const runPhase = async (
        phaseJobs: GenJob[],
        appendLedger: string,
      ): Promise<PromiseSettledResult<any>[]> => {
        if (!phaseJobs.length) return [];
        return Promise.allSettled(
          phaseJobs.map((job) =>
            axios
              .post(
                url,
                buildMsg(
                  job.baseBody + appendLedger,
                  job.assigned,
                  job.excludeKeys,
                ),
                {headers},
              )
              .then((value) => {
                completeCnts++;
                setProgress(
                  Math.min(
                    100,
                    parseFloat(((100 * completeCnts) / totalJobs).toFixed(1)),
                  ),
                );
                wordCnts += applyParsed(job.key, value);
                return value;
              })
              .catch(() => {
                message.warning(`Key为${job.key}的段落文本生成请求失败了。`);
                throw new Error(job.key);
              }),
          ),
        );
      };

      const finishBatch = (
        results: PromiseSettledResult<any>[],
        expected: number,
      ) => {
        const completeCount = results.filter((r) => r.status === "fulfilled")
          .length;
        console.info(
          "返回的所有结果：" + results.length + "个;results：" + JSON.stringify(results),
        );
        const errMsgs = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
          .map((r) =>
            parseChatCompletionData(r.value?.data, {requireKbHits: true}),
          )
          .filter((p): p is {ok: false; error: string} => !p.ok)
          .map((p) => p.error);
        if (errMsgs.length > 0) {
          const kbEmptyCnt = errMsgs.filter((e) => e === KB_GEN_EMPTY_ERROR)
            .length;
          if (kbEmptyCnt > 0) {
            message.error(KB_GEN_EMPTY_ERROR);
          } else {
            message.warning(
              "内容生成请求有" +
                errMsgs.length +
                "个文档段落返回错误：" +
                errMsgs[0] +
                "(...)",
            );
          }
          if (errMsgs.length === completeCount) {
            setLoading(false);
            setProgressHidden(true);
            setDownloadable(false);
            return;
          }
        }
        if (completeCount === expected) {
          console.log("共完成了：" + completeCount + "段文字写作。");
          const endTime = new Date().getTime();
          const timeDiff = ((endTime - startTime) / 1000 / 60).toFixed(1);
          const cg = scrubConclusionChapters(chapters);
          if (cg.report.blocked_count > 0 || cg.report.tagged_count > 0) {
            console.info("[结论闸]", cg.report);
          }
          const emptyKeys = flagEmptyDocParagraphs(chapters);
          if (emptyKeys.length) {
            message.warning(
              `${emptyKeys.length} 个段落生成结果为空，已写入「本段生成失败」占位`,
            );
          }
          const wordCntsStr = (wordCnts / 10000).toFixed(2);
          message.info(
            "共完成了：" +
              completeCount +
              "段" +
              wordCntsStr +
              "万字写作, 总耗时约:" +
              timeDiff +
              "分钟",
          );
          console.log(
            "!!!!docGen result::::---------------------------" +
              JSON.stringify(chapters),
          );
          let bib = bibliographyFromBag(refBag);
          if (genKey.length > 0 && bibliography.length) {
            // 单段重跑：合并进既有清单
            const bag = new Map<string, Set<number>>();
            for (const e of bibliography) {
              bag.set(e.source, new Set(e.pages));
            }
            for (const e of bib) {
              accumulateRefDocs(
                bag,
                e.pages.length
                  ? e.pages.map((p) => ({source: e.source, page: p}))
                  : [{source: e.source}],
              );
            }
            bib = bibliographyFromBag(bag);
          }
          setBibliography(bib);
          console.info("[DocCite] 聚合资料来源", bib.length, "条");
          setLoading(false);
          setProgressHidden(true);
          setChapters(chapters);
          setDownloadable(true);
        } else {
          message.warning(
            "发生了一些错，完成个数：" +
              completeCount +
              ";少于请求文档段落个数：" +
              expected,
          );
          setLoading(false);
          setProgressHidden(true);
        }
      };

      (async () => {
        if (!jobs.length) {
          setLoading(false);
          setProgressHidden(true);
          return;
        }
        // 十九·5：先写非结论 → 组账本 → 再写结论（两相）
        const bodyJobs = jobs.filter((j) => !j.needsLedger);
        const conclJobs = jobs.filter((j) => j.needsLedger);
        let allResults: PromiseSettledResult<any>[] = [];
        if (genKey.length > 0) {
          // 单段：结论章直接用现有前文账本
          const ledger = jobs[0].needsLedger
            ? formatFactLedgerAppendix(buildFactLedger(chapters))
            : "";
          allResults = await runPhase(jobs, ledger);
        } else {
          allResults = await runPhase(bodyJobs, "");
          const ledger = formatFactLedgerAppendix(buildFactLedger(chapters));
          if (ledger) console.info("[材料账本]", ledger.length, "chars");
          const r2 = await runPhase(conclJobs, ledger);
          allResults = allResults.concat(r2);
        }
        finishBatch(allResults, jobs.length);
      })().catch((error) => {
        console.error("出错了:", error?.message || error);
        setLoading(false);
        setProgressHidden(true);
      });
    } catch (error) {
      // @ts-ignore
      console.error("出错了:", error.message);
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
  };

  /** 三十三·5 / 三十五：手选或上传后写回 blocks + 白名单 */
  const onFigureChange = (
    chKey: string,
    pKey: string,
    blockIndex: number,
    nextRef: string | null,
  ) => {
    setChapters((prev) =>
      prev.map((ch) => {
        if (ch.key !== chKey) return ch;
        return {
          ...ch,
          paragraphs: (ch.paragraphs || []).map((p) => {
            if (p.key !== pKey) return p;
            if (nextRef == null) {
              const next = removeManualFigure(p, blockIndex);
              return {...p, blocks: next.blocks as typeof p.blocks, allowedFigureRefs: next.allowedFigureRefs};
            }
            const next = applyManualFigureRef(p, blockIndex, nextRef);
            return {...p, blocks: next.blocks as typeof p.blocks, allowedFigureRefs: next.allowedFigureRefs};
          }),
        };
      }),
    );
  };
  /*****************************************************************************/
  //*** 以下用于独立生成和编辑prompt****/
  const genFn=(key:string)=>{
    genDoc(key)
    // message.info("独立生成:"+key)
  }
  const cbSavePromptResult =(key:string, patch: DocPromptSavePatch | string)=>{
    console.log(`outlineGenPpt.tsx#cb4Save,prompt:${key}`);
    const paragraph =Doc.getParagraph(chapters,key);
    if(paragraph){
      applyDocPromptSavePatch(paragraph, patch);
      setChapters([...chapters])
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
            <OutlinePromptDoc id="prompt-container" chapters={chapters} docTitle={title}
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
            <div style={{marginBottom: 8}}>
              <Checkbox
                checked={keepCitations}
                onChange={(e) => onKeepCitationsChange(e.target.checked)}
              >
                保留来源标注
              </Checkbox>
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
            <OutlineResultDoc
              chapters={chapters}
              activeKey={key}
              fn={cbFn}
              kbName={kbName}
              onFigureChange={onFigureChange}
            />
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
