import * as cheerio from "cheerio";
import JSZip from "jszip";
import fs from "fs";
import { resolveTemplatePage } from "@/components/DocUtil/templateManifest";
import { mergeBrokenPlaceholderRunsInXml } from "@/components/DocUtil/pptPlaceholderRuns";
import {
  formatProductGateMessage,
  scanFilledSlides,
  type ProductGateReport,
} from "@/components/DocUtil/PptProductGate";

//**定义全局string.format
interface StringFormat {
  // @ts-ignore
  format: (...args: any[]) => string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface String extends StringFormat {}
}

String.prototype.format = function (...args: any[]) {
  let str = this.toString();
  if (args.length >= 1) {
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'object') {
        for (const [key, value] of Object.entries(args[i])) {
          if(typeof value === 'object') {
            // @ts-ignore
            for (const [key1, value1] of Object.entries(value)) {
              const objKey1=key+"."+key1;
              // @ts-ignore
              str = str.replace(new RegExp(`{${objKey1}}`, 'g'), value1.toString());
            }
          }else {
            // @ts-ignore
            str = str.replace(new RegExp(`{${key}}`, 'g'), value.toString());
          }
        }
      }
    }
  }
  return str;
};



// 定义字典
type Dictionary<T> = { [key:string]: T };
// 模板变量字典
export type SlideVarDict= Dictionary<string|number|object>;
// 文件名文件内容对应字典
class SlideFileDict{
  slideName: string="";
  fileContent: string=""; //file内容，xml格式
  constructor(slideName: string, fileContent: string) {
    this.slideName = slideName;
    this.fileContent = fileContent;
  }
}

/**
 * Ppt模板中不同类型小节的描述对象
 */
type PptSegment={
  start : number,  //起始页面
  length : number //每种页面的几个版式，例如3：（每页3项、4项、5项3种）
  count : number,  //几种类型
}
/**
 * PPT模板的总体页面结构
 */
type PptPage={
  cover: number,
  chapterCover: number,
  catalog: PptSegment,
  list: PptSegment,
  /** metric：按卡数 2～5 → 页 24～27 */
  metric: { start: number },
  /** columns：按栏数 2～5 → 页 28～31 */
  columns: { start: number },
  /**
   * metric_columns：
   * 2～5 卡 + 2 栏 → 32～35；5 卡 + 3 栏 → 36
   */
  metricColumns2: { start: number },
  metricColumns5x3: number,
  /**
   * metric_list：
   * 2～5 卡 + 2 要点 → 37～40；5 卡 + 3 要点 → 41
   */
  metricList2: { start: number },
  metricList5x3: number,
  tail:number,
  /** 模板内幻灯片最大序号（含尾页） */
  slideMax: number,
  restSlide:Array<number>  //暂时不用的页面
}
/**
 * 当前PPT模板某个实例的页面结构
 */
const pptPage:PptPage={
  cover: 1,
  chapterCover: 2,
  catalog: {start:3,length:3,count:1},
  list: {start:6,length:3,count:6},
  metric: { start: 24 },       // 24=2卡 … 27=5卡
  columns: { start: 28 },      // 28=2栏 … 31=5栏
  metricColumns2: { start: 32 }, // 32=2卡+2栏 … 35=5卡+2栏
  metricColumns5x3: 36,          // 5卡+3栏
  metricList2: { start: 37 },    // 37=2卡+2要点 … 40=5卡+2要点
  metricList5x3: 41,             // 5卡+3要点
  tail: 47,
  slideMax: 47,
  restSlide: [44, 45, 46],
}

type slideType ="cover"|"chapterCover"|"catalog"|"list"|"metric"|"columns"|"metric_columns"|"metric_list"|"table"|"image_grid"|"tail";
type fileType="localFile"|"urlFile";

/** 将卡数/栏数限制在模板支持的 2～5 */
const clampSlotCount = (n: number | undefined, fallback: number) => {
  const v = n && n > 0 ? Math.round(n) : fallback;
  return Math.max(2, Math.min(5, v));
};
export default class PptTemplate {
  fileType:fileType;
  templatePath: string="";
  newFilePath: string="";
  zip:JSZip;
  templateBuffer: Buffer;
  // newFileBuffer: Buffer;
  /**
   * 老的幻灯片目录
   */
  templateSlides:Array<string>=[];//
  templateSlideRelations:Array<string>=[];
  /**
   * 新的幻灯片目录
   */
  newSlideFileDicts: Array<SlideFileDict>;
  newSlideRelationDicts: Array<SlideFileDict>;
  /**
   * 新的幻灯片目录用到的老页面序号数组
   */
  usedSlidePages:Array<number>;
  newSlidePages:Array<number>;
  // templateSlideNames: string[];

  constructor(fileType:fileType,templateName: string, newFileName: string) {
    this.zip = new JSZip();
    this.fileType=fileType
    this.templatePath = templateName;
    this.newFilePath = newFileName;
    this.newSlideFileDicts = new Array<SlideFileDict>();
    this.newSlideRelationDicts= new Array<SlideFileDict>();
    this.templateBuffer=Buffer.alloc(0)
    this.usedSlidePages=[];
    this.newSlidePages = [];
  }

  /**
   * 根据路径，获取ppt模板文件内容。
   * @param filePath
   */
  async getBufferFromFile(filePath: string) {
    let templateData: Buffer=Buffer.alloc(0);
    const getData=new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if(err){reject(err);}
        resolve(data);
      })
    })
    await getData.then((data)=>{
      templateData=<Buffer>data;
    }).catch((err:Error)=>{
      console.log(err);
    });

      return templateData;
  }
  /**
   * 根据url，获取ppt模板文件内容。
   * @param url
   */
  async getBufferFromUrl(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}; url: ${url}`);
      }
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      console.error('获取文件失败:', url, error);
      throw error;
    }
  }

  /**
   * 根据路径，获取文件中的页面目录数组。
   */
  async getSlidesFromFile(filePath: string) {
    let slides:Array<string>=[];
    let buffer:Buffer=await this.getBufferFromFile(filePath);
    // 加载PPTX文件内容
    await this.zip.loadAsync(buffer).then((zip) => {
      // 获取"slides"目录下的文件列表
      const files= zip.files;
      slides = Object.keys(files).filter(
          (filename) => filename.startsWith("ppt/slides/slide")
      );
    });
    // console.log(`hezl-slide-nameList:${slides}`)
    return slides;
  }
  async getSlides(){
    let slides:Array<string>=[];
    // 加载PPTX文件内容
    await this.zip.loadAsync(this.templateBuffer).then((zip) => {
      // 获取"slides"目录下的文件列表
      const files= zip.files;
      slides = Object.keys(files).filter(
        (filename) => filename.startsWith("ppt/slides/slide")
      );
    });
    // console.log(`hezl-slide-nameList:${slides}`)
    return slides;
  }

  /**
   * 根据路径，获取文件中的页面关系目录数组。
   */
  async getSlidesRelationFromFile(filePath: string) {
    let slidesRelations:Array<string>=[];
    let buffer:Buffer=await this.getBufferFromFile(filePath);
    // 加载PPTX文件内容
    await this.zip.loadAsync(buffer).then((zip) => {
      // 获取"slides"目录下的文件列表
      const files= zip.files;
      slidesRelations = Object.keys(files).filter(
          (filename) => filename.startsWith("ppt/slides/_rels/slide")
      );
    });
    // console.log(`hezl-slideRelationList:${slidesRelations}`)
    return slidesRelations;
  }
  async getSlidesRelation(){
    let slidesRelations:Array<string>=[];
    // 加载PPTX文件内容
    await this.zip.loadAsync(this.templateBuffer).then((zip) => {
      // 获取"slides"目录下的文件列表
      const files= zip.files;
      slidesRelations = Object.keys(files).filter(
        (filename) => filename.startsWith("ppt/slides/_rels/slide")
      );
    });
    // console.log(`hezl-slideRelationList:${slidesRelations}`)
    return slidesRelations;
  }
  /**
   * 根据路径，获取文件中的页面layout关系目录数组。
   */
  async getSlidesLayoutRelationFromFile(filePath: string) {
    let slidesLayoutRelations:Array<string>=[];
    let buffer:Buffer=await this.getBufferFromFile(filePath);
    // 加载PPTX文件内容
    await this.zip.loadAsync(buffer).then((zip) => {
      // 获取"slides"目录下的文件列表
      const files= zip.files;
      slidesLayoutRelations = Object.keys(files).filter(
          (filename) => filename.startsWith("ppt/slideLayouts/_rels/slideLayout")
      );
    });
    // console.log(`hezl-slideLayoutRelationList:${slidesLayoutRelations}`)
    return slidesLayoutRelations;
  }
  /**
   * 初始化模板类，获取模板文件内容以及模板文件目录
   */
  async init(){
    if(this.fileType==='localFile'){
      this.templateBuffer = await this.getBufferFromFile(this.templatePath);
    }else{
      this.templateBuffer = await this.getBufferFromUrl(this.templatePath);
    }
    this.templateSlides = await this.getSlides();
    this.templateSlideRelations = await this.getSlidesRelation();
    // this.newSlideFileDicts= new Array<SlideFileDict>();
  }
  /**
   * 根据每项内容比如（每页3项，每页4项，每页5项）对应的类型来取得哪页的模板
   * @param sType
   * @param itemCounts
   */
  /**
   * 根据版式与槽位数取模板页码。
   * - list：itemCounts = 小项数 3～5
   * - metric：itemCounts = 数据卡数 2～5
   * - columns：itemCounts = 栏数 2～5
   * - metric_columns：itemCounts = 卡数 2～5；colCounts = 栏数（默认 2；仅 5 卡支持 3 栏 → 页 36）
   * - metric_list：itemCounts = 卡数 2～5；colCounts = 要点数（默认 2；仅 5 卡支持 3 要点 → 页 41）
   */
  static getTemplatePageNumber = (sType: slideType, itemCounts?: number, colCounts?: number) => {
    const { page, downgraded } = resolveTemplatePage(sType, itemCounts, colCounts);
    if (downgraded) {
      console.log(`template-manifest downgrade: ${sType}`, itemCounts, colCounts, '→', downgraded, 'page', page);
    }
    if (page > 0) return page;
    // manifest 未命中时的公式回退
    if (sType === 'cover' || sType === 'chapterCover' || sType === 'tail') {
      return pptPage[sType];
    }
    if (sType === 'metric') {
      const n = clampSlotCount(itemCounts, 3);
      return pptPage.metric.start + (n - 2);
    }
    if (sType === 'columns') {
      const n = clampSlotCount(itemCounts, 2);
      return pptPage.columns.start + (n - 2);
    }
    if (sType === 'metric_columns') {
      const m = clampSlotCount(itemCounts, 4);
      const c = colCounts && colCounts > 0 ? Math.round(colCounts) : 2;
      if (c >= 3 && m >= 5) return pptPage.metricColumns5x3;
      return pptPage.metricColumns2.start + (m - 2);
    }
    if (sType === 'metric_list') {
      const m = clampSlotCount(itemCounts, 3);
      const l = colCounts && colCounts >= 3 ? 3 : 2;
      if (l >= 3 && m >= 5) return pptPage.metricList5x3;
      return pptPage.metricList2.start + (m - 2);
    }
    if (!itemCounts) {
      console.error(`模板itemCounts设置错误：${sType},${itemCounts}。`);
      return 0;
    }
    return pptPage[sType].start + (itemCounts - 3);
  };

  /**
   * 获取模板文件的某页幻灯片内容，返回内容为xml格式。
   */
  async getTemplatePageContent (slidePageNo:number){
    let pageContent: string="";
    const slidePageName=`ppt/slides/slide${slidePageNo}.xml`
    if(!this.templateBuffer)  await this.init();
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[slidePageName].async("string").then(async (slideContent) => {
        pageContent = slideContent;
      });
    });
    return pageContent;
  };

  /**
   * 获取模板文件的某页幻灯片内容，返回内容为xml格式。
   */
  async getTemplatePageContentByNameFromFile (path:string,slidePageName:string){
    let pageContent: string="";
    const zip1=new JSZip();
    // const slidePageName=`ppt/slides/slide${slidePageNo}.xml`
    const buffer=await this.getBufferFromFile(path)
    await zip1.loadAsync(buffer).then(async (zip1) => {
      console.log("test:"+slidePageName+"\n");
      if(!zip1.files[slidePageName]){
        console.log(`${slidePageName} 不存在\n`)
        return null;
      }
      await zip1.files[slidePageName].async("string").then(async (slideContent) => {
        pageContent = slideContent;
      });
    });
    return pageContent;
  };

  async getWholeContentFromFile (filePath:string){
    await this.init();  //通过init()后，才能直接获取buffer
    for (let i=1;i<=7; i++ ){
      const result = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slideLayouts/_rels/slideLayout${i}.xml.rels`)
      console.debug(`ppt/slideLayouts/_rels/slideLayout${i}.xml.rels:--------------------\n ${result}`);
    }
    for (let i=1;i<=7; i++ ){
      const result = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slideLayouts/slideLayout${i}.xml`)
      console.debug(`ppt/slideLayouts/slideLayout${i}.xml:--------------------len:${result.length}\n`);
      // console.debug(`ppt/slideLayouts/slideLayout${i}.xml:--------------------\n ${result}`);
    }
    let result1 = await this.getTemplatePageContentByNameFromFile(filePath,`[Content_Types].xml`)
    console.debug(`[Content-Types].xml:--------------------\n ${result1}`);
    let result2 = await this.getTemplatePageContentByNameFromFile(filePath,`_rels/.rels`)
    console.debug(`_rels/.rels.xml:--------------------\n ${result2}`);
    let result3 = await this.getTemplatePageContentByNameFromFile(filePath, `ppt/presentation.xml`)
    console.debug(`ppt/presentation.xml:--------------------\n ${result3}`);
    let result4 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/_rels/presentation.xml.rels`)
    console.debug(`ppt/_rels/presentation.xml.rels:--------------------\n ${result4}`);
    let result5 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slideMasters/slideMaster1.xml`)
    console.debug(`ppt/slideMasters/slideMaster1.xml:--------------------\n ${result5}`);
    let result6 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slideMasters/_rels/slideMaster1.xml.rels`)
    console.debug(`ppt/slideMasters/_rels/slideMaster1.xml.rels:--------------------\n ${result6}`);
    let result7 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/theme/theme1.xml`)
    console.debug(`ppt/theme/theme1.xml:--------------------\n ${result7}`);
    let result8 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/presProps.xml`)
    console.debug(`ppt/_rels/presentation.xml.rels:--------------------\n ${result8}`);
    let result9 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/tableStyles.xml`)
    console.debug(`ppt/tableStyles.xml:--------------------\n ${result9}`);
    let result10 = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/viewProps.xml`)
    console.debug(`ppt/viewProps.xml:--------------------\n ${result10}`);
    for (let i=1;i<=pptPage.slideMax; i++ ){ //for (let i=1;i<=7; i++ ){
      const result = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slides/_rels/slide${i}.xml.rels`)
      console.debug(`ppt/slides/_rels/slide${i}.xml.rels:--------------------\n ${result}`);
    }
    for (let i=1;i<=7; i++ ){ //for (let i=1;i<=7; i++ ){
      const result = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slides/slide${i}.xml`)
      console.debug(`ppt/slides/slide${i}.xml:--------------------len:${result.length}\n`);
      // console.debug(`ppt/slides/slide${i}.xml:--------------------\n ${result}`);
    }
    for (let i=1;i<=7; i++ ){
      const result = await this.getTemplatePageContentByNameFromFile(filePath,`ppt/slideLayouts/slideLayout${i}.xml`)
      console.debug(`ppt/slideLayouts/slideLayout${i}.xml:--------------------len:${result.length}\n`);
      // console.debug(`ppt/slideLayouts/slideLayout${i}.xml:--------------------\n ${result}`);
    }
    return true
  }

  /**
   * 获取模板文件的某页幻灯片内容，返回内容为xml格式。
   */
  async getTemplatePageRelationContent (slidePageNo:number){
    let pageContent: string="";
    const slideRelationPageName=`ppt/slides/_rels/slide${slidePageNo}.xml.rels`
    if(!this.templateBuffer)  await this.init();
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[slideRelationPageName].async("string").then(async (slideContent) => {
        pageContent = slideContent;
      });
    });
    return pageContent;
  };

  /**
   * 在 content 中按变量替换文本，保留原有 a:rPr 字体/颜色样式。
   * 模板里占位符常被拆成「{」「slideTitle」「}」三段 run，不能整段 replaceWith。
   */
  async genNewContentByXml(content:string, slideVarDict:SlideVarDict|object){
    // 先合并被拆开的 {slot} run，再替换
    content = mergeBrokenPlaceholderRunsInXml(content);
    const $ = cheerio.load(content, {xml: true});
    const flat: Record<string, string> = {};
    if (slideVarDict && typeof slideVarDict === 'object') {
      for (const [key, value] of Object.entries(slideVarDict as object)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [k2, v2] of Object.entries(value as object)) {
            flat[`${key}.${k2}`] = v2 == null ? '' : String(v2);
          }
        } else if (value !== undefined && value !== null) {
          flat[key] = String(value);
        }
      }
    }

    $('a\\:t').each((_, el) => {
      let text = $(el).text();
      let changed = false;
      for (const [key, value] of Object.entries(flat)) {
        const braced = `{${key}}`;
        if (text.includes(braced)) {
          text = text.split(braced).join(value);
          changed = true;
        }
      }
      // 拆分占位符：当前 run 恰好是变量名
      if (Object.prototype.hasOwnProperty.call(flat, text)) {
        text = flat[text];
        changed = true;
      }
      if (changed) {
        $(el).text(text);
      }
    });

    // 清掉拆分占位符留下的孤立大括号
    $('a\\:t').each((_, el) => {
      const t = $(el).text();
      if (t === '{' || t === '}') {
        $(el).text('');
      }
    });

    // 未提供变量的 {slot} / {a.b} 一律清空；并清 progress* 伪槽
    const slotRe = /\{[A-Za-z_][\w.]*(?:\[[\w.]+\])?\}/g;
    $('a\\:t').each((_, el) => {
      let t = $(el).text();
      if (!t) return;
      let cleaned = t;
      if (t.includes('{')) {
        cleaned = cleaned.replace(slotRe, '');
      }
      if (/\bprogress\d*\b/i.test(cleaned)) {
        cleaned = cleaned.replace(/\bprogress\d*\b/gi, '');
      }
      cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
      if (cleaned !== t) {
        $(el).text(cleaned);
      }
    });

    return $.xml();
  }

  /** 成品闸：扫描已灌模页 */
  runProductGate(): ProductGateReport {
    return scanFilledSlides(
      (this.newSlideFileDicts || []).map((d) => ({
        slideName: d.slideName,
        fileContent: d.fileContent,
      })),
    );
  }

  /** 成品闸未通过时的提示文案 */
  static formatGateMessage(report: ProductGateReport): string {
    return formatProductGateMessage(report);
  }


  /**
   * 通过string template方法来形成新内容
   * @param content
   * 例如：const tpl=`hello, {testName}! I want to do {something}.you're {person.name},age is:{person.age}` ;
   * @param slideVarDict
   * 第一种,定义字典：
   *    const svd:SlideVarDict={"testName":"cat"};
   *     svd["something"]="shopping";
   *     svd["person"]=person;
   * 第二种，定义对象：
   *    const a={
   *       testName:"cat",
   *       something:"shopping",
   *       person:person,
   *     }
   * @constructor
   *
   */
  async genNewContentByTpl(content:string, slideVarDict:SlideVarDict|object){
    //字符串模板替换环节
    let msg:string=content.format(slideVarDict);
    // 增加xml替换环节
    msg=await this.genNewContentByXml(msg, slideVarDict);
    return msg
  }

  /**
   * 使用某页的内容替换为变量中的值，形成新的某页的内容。
   * @param slidePageNo
   * @param slideVarDict
   */
  async genNewSlideFromTplSlide(slidePageNo:number,slideVarDict:SlideVarDict|object){
    let slidePageContent=await this.getTemplatePageContent(slidePageNo);
    return this.genNewContentByTpl(slidePageContent,slideVarDict);
  }
  /**
   * 根据新页面内容找相应模板页面生成新内容存入对象的数组中。
   * @param slidePageNo
   * @param slideVarDict
   * @param newSlidePageNo
   */
  async genNewSlideFileDict(slidePageNo: number, slideVarDict:SlideVarDict[]|object, newSlidePageNo: number) {
    let slideFileName = `ppt/slides/slide${newSlidePageNo}.xml`
    let slideFileContent = await this.genNewSlideFromTplSlide(slidePageNo, slideVarDict);
    let slideFileDict:SlideFileDict =new SlideFileDict(slideFileName,slideFileContent);
    this.newSlideFileDicts.push(slideFileDict);
    const slideRelationPageName=`ppt/slides/_rels/slide${newSlidePageNo}.xml.rels`
    let slideRelationContent = await this.getTemplatePageRelationContent(slidePageNo);
    let slideRelationFileDict:SlideFileDict =new SlideFileDict(slideRelationPageName,slideRelationContent);
    this.newSlideRelationDicts.push(slideRelationFileDict);
    this.usedSlidePages.push(slidePageNo);
    this.newSlidePages.push(newSlidePageNo);
  }
  async genNewSlideFileDict_Random(
    pageType: slideType,
    slideVarDict: SlideVarDict[] | object,
    newSlidePageNo: number,
    counts?: number,
    colCounts?: number,
  ) {
    const slidePageNo = PptTemplate.getTemplatePageNumber(pageType, counts, colCounts);
    let slideFileName = `ppt/slides/slide${newSlidePageNo}.xml`
    let slideFileContent = await this.genNewSlideFromTplSlide(slidePageNo, slideVarDict);
    let slideFileDict:SlideFileDict =new SlideFileDict(slideFileName,slideFileContent);
    this.newSlideFileDicts.push(slideFileDict);
    const slideRelationPageName=`ppt/slides/_rels/slide${newSlidePageNo}.xml.rels`
    let slideRelationContent = await this.getTemplatePageRelationContent(slidePageNo);
    let slideRelationFileDict:SlideFileDict =new SlideFileDict(slideRelationPageName,slideRelationContent);
    this.newSlideRelationDicts.push(slideRelationFileDict);
    this.usedSlidePages.push(slidePageNo);
    this.newSlidePages.push(newSlidePageNo);
  }

  /**
   * 重建 ppt/_rels/presentation.xml.rels 中的幻灯片关系：
   * 与模板页数解耦——删光旧 slide 关系后，按 newSlidePages（生成文档页序）重新挂上。
   * @returns 按页序的 { page, rId }，供 presentation.xml 的 sldIdLst 使用
   */
  async genNewPresentationRelation(): Promise<Array<{ page: number; rId: string }>> {
    const slideRels: Array<{ page: number; rId: string }> = [];
    const filename = "ppt/_rels/presentation.xml.rels";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[filename].async("string").then(async (slideContent) => {
        const $ = cheerio.load(slideContent, { xml: true });

        // 删掉所有指向 slides/slideN.xml 的 Relationship
        $("Relationship").each((_, el) => {
          const target = ($(el).attr("Target") || "").replace(/\\/g, "/");
          if (/^slides\/slide\d+\.xml$/i.test(target)) {
            $(el).remove();
          }
        });

        let maxId = 0;
        $("Relationship").each((_, el) => {
          const m = (($(el).attr("Id") || "").match(/^rId(\d+)$/i) || [])[1];
          if (m) maxId = Math.max(maxId, parseInt(m, 10));
        });

        const slideType =
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
        for (const page of this.newSlidePages) {
          maxId += 1;
          const rId = `rId${maxId}`;
          $("Relationships").append(
            `<Relationship Id="${rId}" Type="${slideType}" Target="slides/slide${page}.xml"/>`,
          );
          slideRels.push({ page, rId });
        }

        this.newSlideFileDicts.push(new SlideFileDict(filename, $.xml()));
      });
    });
    return slideRels;
  }

  /**
   * 按生成文档页序重建 ppt/presentation.xml 的 sldIdLst（可多于或少于模板页数）。
   */
  async genNewPresentations(slideRels: Array<{ page: number; rId: string }>) {
    const filename = "ppt/presentation.xml";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[filename].async("string").then(async (slideContent) => {
        const $ = cheerio.load(slideContent, { xml: true });
        $("p\\:sldId").remove();
        let sldId = 256;
        const $lst = $("p\\:sldIdLst");
        for (const { rId } of slideRels) {
          $lst.append(`<p:sldId id="${sldId}" r:id="${rId}"/>`);
          sldId += 1;
        }
        this.newSlideRelationDicts.push(new SlideFileDict(filename, $.xml()));
      });
    });
  }

  /**
   * 重建 [Content_Types].xml 中的 slide Override，与生成页数对齐。
   */
  async genNewContentTypes() {
    const filename = "[Content_Types].xml";
    const slideCt =
      "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[filename].async("string").then(async (slideContent) => {
        const $ = cheerio.load(slideContent, { xml: true });
        $("Override").each((_, el) => {
          const part = ($(el).attr("PartName") || "").replace(/\\/g, "/");
          if (/^\/ppt\/slides\/slide\d+\.xml$/i.test(part)) {
            $(el).remove();
          }
        });
        for (const page of this.newSlidePages) {
          $("Types").append(
            `<Override PartName="/ppt/slides/slide${page}.xml" ContentType="${slideCt}"/>`,
          );
        }
        this.newSlideRelationDicts.push(new SlideFileDict(filename, $.xml()));
      });
    });
  }

  /**
   * 按照（幻灯片目录）生成幻灯片。前提是已经存在新的幻灯片目录
   */
  async genNewSlideFile (fileType:fileType) {
    if(this.newSlideFileDicts.length===0){
      return false;
    }
    console.debug("开始拷贝文档：\n")
    // 使用JSZip加载数据
    await JSZip.loadAsync(this.templateBuffer).then(async(zip) => {
      // 复制文件
      const newZip = new JSZip();
      // 按生成文档页序重建关系 / sldIdLst / Content_Types（与模板页数无关）
      const slideRels = await this.genNewPresentationRelation();
      await this.genNewPresentations(slideRels);
      await this.genNewContentTypes();
      // 将所有文件复制到新的zip实例中
      for (const filename of Object.keys(zip.files)) {
        const entry = zip.files[filename];
        // 新模板会带 ppt/、ppt/media/ 这类目录项。zip.file() 对目录返回 null。
        if (!entry || entry.dir) {
          continue;
        }
        if (!this.templateSlides.includes(filename) &&  !this.templateSlideRelations.includes(filename)
            &&filename!=="ppt/presentation.xml" && filename!=="ppt/_rels/presentation.xml.rels"
            &&filename!=="[Content_Type].xml") {
          console.debug(`${filename}\n`)
          newZip.file(filename, entry.async("nodebuffer"));
        }
      }
      /*Object.keys(zip.files).forEach((filename) => {

      });*/
      let newPageCnt=0
      //加入新slide
      this.newSlideFileDicts.forEach(slideFileDict => {
        console.debug(`${slideFileDict.slideName}\n`)
        newZip.file(slideFileDict.slideName,slideFileDict.fileContent)
        newPageCnt++;
      })
      //加入新slideRelation
      this.newSlideRelationDicts.forEach(slideFileDict => {
        console.debug(`${slideFileDict.slideName}\n`)
        newZip.file(slideFileDict.slideName,slideFileDict.fileContent)
        newPageCnt++;
      })
      console.log(`新产生的幻灯片一共有${newPageCnt}页。`)
      // 生成新的PPTX文件
      await newZip.generateAsync({type: "nodebuffer", platform: "DOS"}).then( (data) => {
        if(fileType==='localFile') {
          fs.writeFile(this.newFilePath, data, err => {
            if (err) throw err;
            console.log("PPTX文件生成成功！");
          });
        }else{
          this.downloadFile(this.newFilePath,data)
        }
      });
    });
    return true;
  }

  downloadFile(filename: string, data: Buffer) {
    // 创建一个Blob实例，类型为纯文本
    const blob = new Blob([data], { type: 'nodebuffer' });
    // 创建一个指向Blob的URL
    const url = URL.createObjectURL(blob);
    // 创建一个a标签并设置属性
    const link = document.createElement('a');
    link.style.display = 'none'; // 隐藏a标签
    link.href = url;
    link.download = filename; // 设置下载文件名
    // 将a标签添加到文档中，并模拟点击
    document.body.appendChild(link);
    link.click();
    // 清理并移除元素和对象URL
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

}
