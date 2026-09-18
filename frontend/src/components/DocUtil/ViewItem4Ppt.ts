import OutlineRec,{outlineType} from "@/components/DocUtil/OutlineStore";

export class PptKeys{
  chapterKey:string;
  slideKey:string;
  constructor(chapterKey:string,slideKey:string) {
    this.chapterKey = chapterKey;
    this.slideKey = slideKey;
  }
}
const charsToReplace=[
  "\_"," ","#",   //":","\*","\+",
  "＋","——","－",
  "1","2","3","4","5","6","7","8","9","0",
  "一","二","三","四","五","六","七","八","九","十",
  "I","II","III","IV","VI","VII",
  "第","部分","章","节","段","幻灯片",
  "：",
  "Chapter",
]
/**
 * 清除一些特殊字符：charsToRplaced，以及*-+。.等
 * @param charsToReplace
 * @param bigString
 */
const replaceCharsInString=(charsToReplace: string[], bigString: string)=>{
  // 遍历数组中的每个字符
  charsToReplace.forEach((char) => {
    // 使用正则表达式全局替换字符（'g' 标志表示全局匹配）
    bigString = bigString.replace(new RegExp(char, 'g'), '');
  });
  bigString= bigString.replace(/[.*+-。]/g,'')
  return bigString;
}
const cleanString=(bigString: string): string=> {
  return replaceCharsInString(charsToReplace,bigString)
}

/**
 * 去掉「第一章」「第1章」等序号前缀，仅保留章节主题（序号只用于分组）。
 */
export const stripChapterOrdinalPrefix = (title: string): string => {
  return String(title || '')
    .replace(/^第\s*[一二三四五六七八九十百零〇两\d]+\s*章\s*[：:\-—–．.、]?\s*/u, '')
    .replace(/^Chapter\s*\d+\s*[:：.\-—–]?\s*/i, '')
    .trim();
};

/**
 * 按幻灯片标题语义生成任务说明（避免一律写「怎么做」）。
 */
export const buildSlideTaskInstruction=(slideTitle: string): string => {
  const t = (slideTitle || '').trim();
  if (!t) {
    return '请围绕本页主题展开关键要点。';
  }
  if (/怎么做|如何做|步骤|流程|方法|操作|落地|实施|执行|路径/.test(t)) {
    return `请围绕「${t}」说明具体做法、关键动作与注意点。`;
  }
  if (/规模|增速|数据|指标|大盘|趋势|洞察|分析|研判|监测|统计/.test(t)) {
    return `请围绕「${t}」给出关键口径、现状判断与可支撑决策的分析结论（不是操作步骤清单）。`;
  }
  if (/对比|比较|差异|竞品|对标/.test(t)) {
    return `请围绕「${t}」从对比维度给出差异要点与结论。`;
  }
  if (/原因|为何|为什么|问题|风险|挑战/.test(t)) {
    return `请围绕「${t}」分析成因、影响与需要关注的点。`;
  }
  if (/建议|策略|选品|筛选|推荐|机会|打法/.test(t)) {
    return `请围绕「${t}」给出可执行建议与判断依据。`;
  }
  if (/总结|回顾|展望|结论/.test(t)) {
    return `请围绕「${t}」归纳核心结论与下一步方向。`;
  }
  if (/定义|概念|是什么|概述|简介|背景/.test(t)) {
    return `请围绕「${t}」清晰界定概念要点、边界与背景。`;
  }
  if (/案例|示例|样本|爆品/.test(t)) {
    return `请围绕「${t}」提炼可复用的案例要点与启示。`;
  }
  return `请围绕「${t}」展开本页应讲清的关键要点（按标题语义组织，勿机械写成操作步骤）。`;
};
/****用于清除```markdown\清除前导和结尾空行等标识```*****/
export const clean4PptTitle=(str:string)=>{
  str=str.replace(/```markdown\n|```txt\n|```\n|```/, '');
  // str=str.replace(/^\s+|\s+$/gm, '');
  return str
}
interface Dictionary<T> {
  [key: string]: T;
}
export interface SlideSelectTemplate {
  id:number;
  name:string,
  pict:string,
  file:string,
  labels:string[],
}

/** 要点标题 4～12 字，描述 20～70 字（按字符计，含中文） */
export const PPT_ITEM_TITLE_MIN = 4;
export const PPT_ITEM_TITLE_MAX = 12;
export const PPT_ITEM_DESC_MIN = 20;
export const PPT_ITEM_DESC_MAX = 70;

export function countOutlineTips(subTitle: string): number {
  return (subTitle || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
}

/** 单行格式示例。传入大纲条数时，明确禁止增删或拆条。 */
export function buildPptItemFormatPrompt(count?: number): string {
  const n = count && count > 0 ? count : 0;
  const countLine = n
    ? `本页必须且只能输出 ${n} 行，编号严格为 1 到 ${n}。禁止多写或少写。一条大纲要点只对应 1 行，即使其中列举了多个名称，也不要拆成多行。\n`
    : '条数必须与【大纲要点】一致，禁止增删，禁止把一条大纲拆成多行。\n';
  return (
    '\n\n【输出格式】\n' +
    countLine +
    '必须逐行输出，每行一条；不要用方括号，不要前言后语。下面只示范一行写法，不要照抄成多条：\n' +
    `1. 概括标题（${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX}字） - 具体描述（${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX}字）\n`
  );
}

export const PPT_ITEM_FORMAT_PROMPT = buildPptItemFormatPrompt();

export function validateSlideViewItems(items: Array<{ title: string; content: string }>): string | null {
  const rows = (items || []).map((it) => ({
    title: (it.title || '').trim(),
    content: (it.content || '').trim(),
  })).filter((it) => it.title || it.content);
  if (rows.length === 0) {
    return '请至少填写 1 条完整小项（概括标题 + 具体描述）。';
  }
  for (let i = 0; i < rows.length; i++) {
    const n = i + 1;
    const { title, content } = rows[i];
    if (!title || !content) {
      return `第 ${n} 点的标题和描述都要填写。`;
    }
    if (title.length < PPT_ITEM_TITLE_MIN || title.length > PPT_ITEM_TITLE_MAX) {
      return `第 ${n} 点标题须为 ${PPT_ITEM_TITLE_MIN}～${PPT_ITEM_TITLE_MAX} 字（当前 ${title.length} 字）。`;
    }
    if (content.length < PPT_ITEM_DESC_MIN || content.length > PPT_ITEM_DESC_MAX) {
      return `第 ${n} 点描述须为 ${PPT_ITEM_DESC_MIN}～${PPT_ITEM_DESC_MAX} 字（当前 ${content.length} 字）。`;
    }
  }
  return null;
}

export class ViewItem4Ppt {
    index:number;
    title:string;
    content:string;
    image:string="";

    constructor(index:number, title:string,content:string){
        this.index = index;
        this.title = title;
        this.content = content;
    }

    /**
     * 根据文本产生观点及其具体描述内容。
     * 兼容多种常见模型输出格式；解析失败返回 undefined。
     */
    static genViewItemByRegex(viewStr: string) {
        if (!viewStr || !String(viewStr).trim()) return undefined;
        const text = String(viewStr).replace(/\r\n/g, '\n').trim();
        const viewItems = new Array<ViewItem4Ppt>();

        const cleanPart = (s: string) =>
            s
                .replace(/\s*\[\d+\]\s*/g, '')
                .replace(/^\*+|\*+$/g, '')
                .replace(/^\[|\]$/g, '')
                .replace(/[。．]\s*$/u, '')
                .trim();

        const pushItem = (titleRaw: string, contentRaw: string) => {
            const title = cleanPart(titleRaw);
            const content = cleanPart(contentRaw);
            if (title && content) {
                viewItems.push(new ViewItem4Ppt(viewItems.length + 1, title, content));
            }
        };

        // 标题与描述之间的分隔符：- / -- / — / —— / –
        const SEP = '(?:-{1,2}|—{1,2}|–+)';
        const SEP_OR_COLON = `(?:${SEP}|[:：])`;

        const tryMatchLine = (line: string): boolean => {
            // 1. 概括 - 描述 / 1、概括 —— 描述 / 1. 概括 -- 描述
            let m =
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*(.+?)\\s*${SEP}\\s*(.+)$`, 'u')) ||
                // 1. 概括：描述 / 1. 概括: 描述
                line.match(/^\d{1,2}\s*[\.．、]\s*(.+?)\s*[:：]\s*(.+)$/u) ||
                // 1. [概括]-[描述] / 1. [概括]——[描述]
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*\\[(.+?)\\]\\s*${SEP}\\s*\\[(.+?)\\]`, 'u')) ||
                // 1. **概括** - 描述
                line.match(new RegExp(`^\\d{1,2}\\s*[\\.．、]\\s*\\*\\*(.+?)\\*\\*\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // - 概括：描述 / * 概括 —— 描述
                line.match(new RegExp(`^[-*•]\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // 第1点：概括 - 描述
                line.match(new RegExp(`^第\\s*\\d{1,2}\\s*[点项条]\\s*[:：.．、]?\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u')) ||
                // 一、概括。描述 / （1）概括：描述
                line.match(/^[一二三四五六七八九十]+[、.．]\s*(.+?)[。．:：]\s*(.+)$/u) ||
                line.match(new RegExp(`^[（(]\\s*\\d{1,2}\\s*[)）]\\s*(.+?)\\s*${SEP_OR_COLON}\\s*(.+)$`, 'u'));
            if (m) {
                pushItem(m[1], m[2]);
                return true;
            }
            return false;
        };

        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        let pendingTitle: string | null = null;
        const hasInlineSep = new RegExp(`(?:-{1,2}|—{1,2}|–+|[:：])`);

        for (const line of lines) {
            if (tryMatchLine(line)) {
                pendingTitle = null;
                continue;
            }
            // 多行：编号后仅标题，下一行是描述
            const titleOnly = line.match(
                /^(?:\d{1,2}\s*[\.．、]|第\s*\d{1,2}\s*[点项条]\s*[:：.．、]?|[-*•])\s*(.+)$/u,
            );
            if (titleOnly && !hasInlineSep.test(titleOnly[1])) {
                pendingTitle = titleOnly[1];
                continue;
            }
            if (pendingTitle && !/^\d{1,2}\s*[\.．、]/.test(line) && !/^第\s*\d/.test(line)) {
                pushItem(pendingTitle, line);
                pendingTitle = null;
            }
        }

        // 兼容旧正则（历史上部分模型输出）
        if (viewItems.length === 0) {
            try {
                const regexp =
                    /(?<=\d[.] (.*)[\n|\s]*(?=(?:-[\n|\s]*(.*)[。｜\n])))/g;
                const itemArray = [...text.matchAll(regexp)].map((x) => x.slice(1));
                itemArray.forEach((item) => {
                    if (item.length >= 2) pushItem(item[0], item[1]);
                });
            } catch {
                // ignore
            }
        }

        return viewItems.length > 0 ? viewItems : undefined;
    }
}
export class Slide{
  index:number;
  title:string;
  subTitle:string="";
  // key:number;  //used by Collapse  ,it's key==slide's index
  key:string;
  label:string; //used by Collapse ,it's label==slide's title
  prompt:string="";
  content:string="";
  viewItems:Array<ViewItem4Ppt>=new Array<ViewItem4Ppt>();

  constructor(index:number, title:string,subTitle?:string) {
    this.index = index;
    this.title = title;
    this.subTitle = subTitle?subTitle:"";
    // this.key = index-1;
    this.key = "slide"+index;
    this.label= title;
  }
  setPrompt(prompt:string){
    this.prompt = prompt;
  }

  /**
   * 单纯设置观点数组
   * @param viewItems
   */
  setResult(viewItems:Array<ViewItem4Ppt>){
    this.viewItems = viewItems;
  }

  /**
   * 将幻灯片的观点数组组合成内容返回。
   * 若数组无值，返回空子串
   * 若数组有值，返回组合内容。
   */
  getContent(){
    if(this.viewItems.length===0){
      return "";
    }else{
      let content=""
      this.viewItems.forEach((item,index)=>{
        content+=`第${index+1}点:${item.title} - ${item.content} `;
      })
      return content;
    }
  }

  /** 结构化小项导出为可再解析的文本（与提示词格式一致） */
  static itemsToContentText(items: Array<{ title: string; content: string }>) {
    return items
      .map((it, i) => `${i + 1}. ${(it.title || '').trim()} - ${(it.content || '').trim()}`)
      .filter((line) => !/^\d+\.\s*-\s*$/.test(line))
      .join('\n');
  }

  /**
   * 直接写入结构化小项（跳过正则）。校验：至少 1 条，且每条标题+描述非空。
   */
  setViewItemsStructured(items: Array<{ title: string; content: string }>) {
    const cleaned = (items || [])
      .map((it) => ({
        title: (it.title || '').trim(),
        content: (it.content || '').trim(),
      }))
      .filter((it) => it.title && it.content);
    if (cleaned.length === 0) {
      return false;
    }
    if (validateSlideViewItems(cleaned)) {
      return false;
    }
    const viewItems = cleaned.map(
      (it, i) => new ViewItem4Ppt(i + 1, it.title, it.content),
    );
    this.setResult(viewItems);
    this.content = Slide.itemsToContentText(cleaned);
    return true;
  }

  /**
   * 为幻灯片分析字符串并设置其观点列表
   * 首先是原始内容保存。
   * 若内容不合格，无法设置观点数组，返回false
   * 若内容合格，设置观点数组，返回true
   * @param content
   */
  setContent(content:string){
    this.content=content;
    const viewItems=ViewItem4Ppt.genViewItemByRegex(content);
    if(!viewItems||viewItems.length===0){
      return false
    }
    this.setResult(viewItems);
    return true
  }
}

export class Chapter {
  index: number;
  title: string;
  subTitle: string = ""; //大部分没用，预留
  // key: number;  //used by Collapse  ,it's key==slide's index
  key:string;
  label: string; //used by Collapse ,it's label==slide's title
  prompt: string = ""; //大部分没用，预留
  slides: Array<Slide> = new Array<Slide>();

  constructor(index: number, title: string) {
    this.index = index;
    this.title = title;
    // this.key = index-1;
    this.key = "chapter"+index;
    this.label = title;
  }
}

export class SlideVar{
  chapterIndex:number;
  chapterTitle:string;
  slideIndex:number;
  slideGlobalIndex:number;
  slideTitle:string;
  slideSubtitle:string;
  vItem:Dictionary<string>;

  constructor(chapterIndex:number, chapterTitle:string ,
              slideIndex:number, slideGlobalIndex:number,
              slideTitle:string,slideSubtitle:string,vItem:Dictionary<string>
   ) {
    this.chapterIndex = chapterIndex;
    this.chapterTitle = chapterTitle;
    this.slideIndex = slideIndex;
    this.slideGlobalIndex = slideGlobalIndex;
    this.slideTitle = slideTitle;
    this.slideSubtitle = slideSubtitle;
    this.vItem=vItem;
  }

}

export class Ppt{
  title:string;
  chapters:Array<Chapter>;

  constructor(title:string){
    this.title=title;
    this.chapters=new Array<Chapter>();
  }

  setChapters(chapters:Array<Chapter>){
    this.chapters=chapters;
  }

  getChapterTitles(){
    const chapterTitles=new Array<string>();
    if (this.chapters.length===0) return undefined;
    for(let chapter of this.chapters){
      chapterTitles.push(chapter.title);
    }
  }

  /**
   * 获取所有的幻灯片变量，以便于根据模板生成ppt内容。
   */
  static getSlideVars(chapters:Array<Chapter>){
    let slideVars=new Array<SlideVar>();
    let slideIndexG=1
    for(let chapter of chapters){
      if(!chapter.slides||chapter.slides.length===0) return undefined;
      for(let slide of chapter.slides){
        let vItem:Dictionary<string>={};
        for (let vi of slide.viewItems){
          const idx=slide.viewItems.indexOf(vi);
          vItem[`item${idx+1}`]=vi.title;
          vItem[`item${idx+1}_Desc`]=vi.content;
        }
        const slideVar=new SlideVar(chapter.index, stripChapterOrdinalPrefix(chapter.title),
          slide.index,slideIndexG,slide.title,slide.subTitle,vItem);
        slideIndexG++;
        slideVars.push(slideVar);
      }
    }
    return slideVars;
  }

  /**
   * 从生成的内容中获取PPT标题
   * @param msg
   */
  static getTitleFromMsg(msg:string){
    // const regTitle =/(?:^# )((.*)\n\n)/g
    const regTitle =/^# ((.*)\n{1,2})/g
    const matchTitle = msg.matchAll(regTitle);
    const rTitle=[...matchTitle].map(m=>m.slice(1));
    let title=""
    if(rTitle.length>0) {
      title = rTitle[0][0];
    }else{
      console.log("rTitle's len:"+rTitle.length);
    }
    return title.trim();
  }

  /**
   * 从生成的内容中获取PPT大纲内容。
   * @param msg
   */
  static getContentFromMsg=(msg:string)=>{
    let content=msg.replace("# "+Ppt.getTitleFromMsg(msg),"");
    return content.trim();
  }

  static getChaptersFromContent(content:string){
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;

    // 使用正则表达式匹配章节标题、幻灯片标题和副标题/要点
    const chapterRegex = /^##\s+(.+)$/;
    const slideRegex1 = /^###\s+(.+)$/;
    // 仅匹配「1. 标题」这类编号幻灯片，避免把「2024年…」误判为幻灯片
    const slideRegex2 = /^\d{1,2}[.．、]\s+(.+)$/;
    // 大纲要点：- / * / + / • / ＊，或 markdown 斜体整行 *…*
    const subtitleRegex = /^(?:[-*+•＊]\s+|＞\s*|>\s*)(.+)$/;
    const italicLineRegex = /^\*(.+)\*$/;

    const appendSlideTip = (slide: Slide, tipRaw: string) => {
      const tip = tipRaw.replace(/\s*\[\d+\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (!tip) return;
      if (!slide.subTitle) {
        slide.subTitle = tip;
      } else if (!slide.subTitle.includes(tip)) {
        slide.subTitle += '\n' + tip;
      }
    };

    // 按行分割markdown文本
    const lines = content.split('\n');
    let chapterIndex=1;
    let slideIndex=1;
    for (const line of lines) {
      const raw = line.trim();
      if (!raw) continue;

      const chapterMatch = raw.match(chapterRegex);
      const slideMatch1 = raw.match(slideRegex1);
      const slideMatch2 = raw.match(slideRegex2);
      const subtitleMatch = raw.match(subtitleRegex) || raw.match(italicLineRegex);

      if (chapterMatch) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = new Chapter(chapterIndex, stripChapterOrdinalPrefix(chapterMatch[1].trim()));
        chapterIndex++;
      } else if ((slideMatch1 || slideMatch2) && currentChapter) {
        let slideTitle = (slideMatch1?.[1] || slideMatch2?.[1] || "").trim();
        // 兼容 ### 标题：副标题 / ### 标题 - 副标题（同一行）
        let inlineSub = "";
        const inlineSplit = slideTitle.match(/^(.+?)[：:\-—–]\s*(.+)$/);
        if (inlineSplit && inlineSplit[2].length >= 8) {
          slideTitle = inlineSplit[1].trim();
          inlineSub = inlineSplit[2].trim();
        }
        const slide = new Slide(slideIndex, cleanString(slideTitle), "");
        if (inlineSub) {
          appendSlideTip(slide, inlineSub);
        }
        slideIndex++;
        currentChapter.slides.push(slide);
      } else if (currentChapter && currentChapter.slides.length > 0) {
        // 跳过一级标题残留
        if (/^#\s+/.test(raw)) continue;
        const lastSlide = currentChapter.slides[currentChapter.slides.length - 1];
        if (subtitleMatch) {
          appendSlideTip(lastSlide, subtitleMatch[1]);
        } else if (!/^#{1,6}\s/.test(raw)) {
          // 无 bullet 的普通段落也视为本页大纲描述/副标题（模型常见写法）
          appendSlideTip(lastSlide, raw);
        }
      }
    }
    // 添加最后一个章节
    if (currentChapter) {
      chapters.push(currentChapter);
    }
    return chapters;
  }
  /**
   * 用于检查格式正不正确。
   * @param chapters
   */
  static checkChapter(chapters:Array<Chapter>){
    if (!chapters || chapters.length==0) {
      return {code:-1,msg:"大纲格式不正确，没有发现任何章节，章节前缀应该为【## 】，注意空格"};
    }else{
      let slidesCnt=0
      for (let i=0;i<chapters.length;i++) {
        const slides=chapters[i].slides;
        if(!slides || slides.length===0){
          return {code:-2,msg:`大纲格式不正确，第${i+1}章没发现任何幻灯片，幻灯片标题前缀应该为【### 】，注意空格。`}
        }
        slidesCnt+=slides.length;
      }
      return {code:0, msg:`大纲格式正确，一共发现${chapters.length}章，${slidesCnt}张幻灯片。`}
    }
  }

  /**
   * 获取全局key
   * @param chapters
   * @param key
   * @return ("chapter-1","slide-2")，
   * 若chapters空或paragraph为空，返回undefined，必须前端保证第一章第一节有内容
   */
  static getKeysFromKey(chapters:Array<Chapter>,key:string){
    if (!chapters?.length || !chapters[0]?.slides?.length) {
      return undefined;
    }
    for (let chapter of chapters) {
      if(chapter.key===key){
        return new PptKeys(key,chapter.slides[0].key)
      }else{
        const slides=chapter.slides;
        if (Array.isArray(slides)) {
          for(let slide of slides) {
            if(slide.key===key){
              return new PptKeys(chapter.key,key);
            }
          }
        }
      }
    }
    // if(chapters.length==0||chapters[0].slides.length==0){
    //   return undefined;
    // }else {
      return new PptKeys(chapters[0].key, chapters[0].slides[0].key)
    // }
  }

  /**
   * 为一个文档大纲的某个段落设置提示词 //TODO-hezl 可以优化
   * @param chapters
   * @param key
   * @param prompt
   */
  static setPrompt(chapters:Chapter[],key:string,prompt:string){
    for (let chapter of chapters) {
      if(chapter.key===key){
        // chapter.setPrompt(prompt);
        return;
      }else{
        const slides = chapter.slides;
        if (Array.isArray(slides)) {
          for (let slide of slides) {
            if(slide.key===key){
              slide.setPrompt(prompt);
              return;
            }
          }
        }
      }
    }
    console.log("出错了。items里找不到key："+key);
  }
  static setAllPrompt_ppt(chapters:Chapter[],pptTitle:string,format_prompt:string=""){
    for (let chapter of chapters) {
      const slides = chapter.slides;
      if (Array.isArray(slides)) {
        for(let slide of slides) {
          const task = buildSlideTaskInstruction(slide.title);
          const outlineTips = (slide.subTitle || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          const outlineBlock = outlineTips.length
            ? [
                '【大纲要点】',
                '（请优先采信其中的事实与数据，据此展开，勿编造冲突数字）',
                ...outlineTips.map((t, i) => `${i + 1}) ${t}`),
                '',
              ].join('\n')
            : '';
          // 输出格式由生成请求侧追加 format_prompt，避免与 prompt 内重复
          void format_prompt;
          const countHint = outlineTips.length
            ? `本页大纲共 ${outlineTips.length} 条，必须且只能输出 ${outlineTips.length} 个小点。每条要点对应 1 个小点，不要增删，也不要把一条要点里的多个名称拆成多个小点。`
            : '';
          const prompt = [
            '【PPT 主题】',
            pptTitle || '（未命名）',
            '',
            '【当前章节】',
            chapter.title || '（未命名章节）',
            '',
            '【本页标题】',
            slide.title || '（未命名幻灯片）',
            '',
            outlineBlock,
            '【写作任务】',
            task,
            countHint,
          ]
            .filter((line) => line !== undefined && line !== null)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n');
          slide.setPrompt(prompt);
        }
      }
    }
    return chapters;
  }

  static setContent(chapters: Chapter[], key: string, content: string) {
    let slide=this.getSlide(chapters,key);
    if(slide!==undefined){
      slide.setContent(content);
    }else{
      console.log(`出错了。找不到${key}对应的幻灯片`)
    }
  }

  /** 对已有正文但未解析出小项的幻灯片，用当前规则重新解析 */
  static reparseAllSlideContents(chapters: Chapter[]) {
    if (!Array.isArray(chapters)) return chapters;
    for (const chapter of chapters) {
      const slides = chapter.slides;
      if (!Array.isArray(slides)) continue;
      for (const slide of slides) {
        if (slide.content && (!slide.viewItems || slide.viewItems.length === 0)) {
          slide.setContent(slide.content);
        }
      }
    }
    return chapters;
  }

  /**
   * 找出「有正文但未解析出小项」的幻灯片（不可用于 PPT 变量填充）。
   */
  static getSlidesWithBadFormat(chapters: Chapter[]): Array<{ key: string; title: string }> {
    const bad: Array<{ key: string; title: string }> = [];
    if (!Array.isArray(chapters)) return bad;
    for (const chapter of chapters) {
      const slides = chapter.slides;
      if (!Array.isArray(slides)) continue;
      for (const slide of slides) {
        const hasContent = !!(slide.content && slide.content.trim());
        const itemCount = slide.viewItems ? slide.viewItems.length : 0;
        if (hasContent && itemCount === 0) {
          bad.push({ key: slide.key, title: slide.title || slide.label || slide.key });
        }
      }
    }
    return bad;
  }

  /**
   * 为 PPT 模板补齐 item1..itemN，避免占位符 {vItem.itemN} 原样残留。
   */
  static padVItemForTemplate(vItem: Dictionary<string>, itemCounts: number) {
    const n = Math.max(3, Math.min(5, itemCounts || 3));
    for (let i = 1; i <= n; i++) {
      if (vItem[`item${i}`] === undefined) vItem[`item${i}`] = '';
      if (vItem[`item${i}_Desc`] === undefined) vItem[`item${i}_Desc`] = '';
    }
    return n;
  }
  static getSlide(chapters: Chapter[], key: string) {
    for (let chapter of chapters) {
      if (chapter.key === key) {
        // chapter.setContent(content);
        return;
      } else {
        const slides = chapter.slides;
        if (Array.isArray(slides)) {
          for (let slide of slides) {
            if (slide.key === key) {
              return slide;
            }
          }
        }
      }
    }
  }


  /**
   * * 将完整规范（经过检查的）的markdown大纲文档存入storage的分类记录集(比如AiPpt_outlineRecs)中
   * @param markdown  markdown大纲内容
   // * @param outlineRecs  已取出的大纲记录集
   * @param outlineType 可能得类型是outlineTypeDOC，outlineTypeAiDOC
   */
  static addDocOutlineRecToStorage(outlineType:outlineType, markdown:string, kbName:string = "samples"){
    const rawTitle=Ppt.getTitleFromMsg(markdown);
    const rawContent =Ppt.getContentFromMsg(markdown);
    const outlineRec_init=new OutlineRec(rawTitle, rawContent, kbName || "samples");
    OutlineRec.save(outlineType,outlineRec_init)
    return outlineRec_init.outlineId!
  }
  /**
   * 从大纲集合中获得某个记录的具体章节、主题、id等细节
   * @param outlineRecs 大纲记录集
   * @param outlineType 大纲类型
   * @param id  大纲记录ID
   * @param formatPrompt 格式化提示词
   * @Return {[title, content, kbName, chapters]}  [title, content, kbName, chapters]元组
   */
  static get_chapters_from_outlineRecs(outlineRecs:OutlineRec[],outlineType:outlineType,id:string,formatPrompt=""):[string,string,string,Chapter[]]{
    const or=OutlineRec.getRecById(outlineRecs,id);
    if(!or) {
      return ["", "", "samples", []];
    }
    /**
     * 先初始化chapters结构，再设置所有提示词(重设)。
     */
    let chapters =Ppt.getChaptersFromContent(or.outlineContent);
    chapters = Ppt.setAllPrompt_ppt(chapters, or.outlineName, formatPrompt);
    return [
      or.outlineName? or.outlineName: "",
      or.outlineContent? or.outlineContent: "",
      or.outline_source_kbName&&or.outline_source_kbName.length>0? or.outline_source_kbName: "samples",
      chapters&&chapters.length>0? chapters: []
    ];
  }
  /**
   * 将该大纲中所有生成了的content字段清空。
   * @param chapters
   */

  static clearSlide(chapters:Chapter[]) {
    for (let chapter of chapters) {
      const slides = chapter.slides;
      if (Array.isArray(slides)) {
        for (let slide of slides) {
          slide.viewItems=new Array<ViewItem4Ppt>();
          slide.content="";
        }
      }
    }
  }

}

