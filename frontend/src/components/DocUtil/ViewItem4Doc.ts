import OutlineRec, {outlineType} from "@/components/DocUtil/OutlineStore";
export type CheckMsg={
  code:number;
  msg:string;
};

export class DocKeys {
  chapterKey:string;
  paragraphKey:string;
  constructor(key1:string,key2:string) {
    this.chapterKey = key1;
    this.paragraphKey = key2;
  }
}
const charsToReplace=[
  "\_"," ","#",  //":","\*","\+",
  "＋","——","－",
  "1","2","3","4","5","6","7","8","9","0",
  "一","二","三","四","五","六","七","八","九","十",
  "I","II","III","IV","VI","VII",
  "第","部分","章","节","段",
  "：",
  "Chapter"
]
/**
 * 清除一些特殊字符：charsToReplaced，以及*-+。.等
 * @param charsToReplace
 * @param bigString
 */
const replaceCharsInString=(charsToReplace: string[], bigString: string)=>{
  // 遍历数组中的每个字符
  charsToReplace.forEach((char) => {
    // 使用正则表达式全局替换字符（'g' 标志表示全局匹配）
    bigString = bigString.replace(new RegExp(char, 'g'), '');
  });
  bigString= bigString.replace(/[.*+-。:]/g,'')
  return bigString;
}
const cleanString=(bigString: string): string=> {
  return replaceCharsInString(charsToReplace,bigString)
}
/****用于清除```markdown\清除前导和结尾空行等标识```*****/
export const clean4DocTitle=(str:string)=>{
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

export class ViewItem4Doc {
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
     * 根据文本产生观点及其具体描述内容。word文档中暂时不需要
     * @param viewStr
     * 返回undefined时说明格式有问题
     */
    // static genViewItemByRegex(viewStr:string){
    //     const regexp =/(?<=\d[.] (.*)[\n|\s]*(?=(?:-[\n|\s]*(.*)[。｜\n])))/g
    //     const result=viewStr.matchAll(regexp)
    //     const itemArray=[...result].map(m=>m.slice(1));
    //     if(itemArray.length===1){return undefined}
    //     const viewItems=new Array<ViewItem4Ppt>()
    //     itemArray.forEach((item,index)=>{
    //         if(item.length===1){return undefined}
    //         viewItems.push(new ViewItem4Ppt(index+1,item[0],item[1]))
    //     });
    //     return viewItems;
    // }
}

export class Paragraph{
  /** 段落条目在章节层级中的索引，不是总索引 **/
  index:number;
  title:string;
  subTitle:string="";
  /** 段落在章节中的索引  比如 "chapter-2"中 的“paragraph-1”  --used by Collapse  ,it's key==paragraph's index**/
  key:string;
  /** 段落标题  --used by Collapse ,it's label==slide's title**/
  label:string;
  prompt:string="";
  content:string="";
  // viewItems:Array<ViewItem4Ppt>=new Array<ViewItem4Ppt>(); //word中没用**/


  constructor(index:number, title:string,subTitle?:string) {
    this.index = index;
    this.title = title;
    this.subTitle = subTitle?subTitle:"";
    // this.key = index-1;
    this.key = "paragraph-"+index;
    this.label= title;
  }
  setPrompt(prompt:string){
    this.prompt = prompt;
  }

  /**
   * 单纯设置观点数组 word无用
   * @param viewItems
   */
  /*setResult(viewItems:Array<ViewItem4Ppt>){
    this.viewItems = viewItems;
  }*/

  /**
   * 4word，将paragrah中的内容返回。
   * 若content无值，返回空子串
   * 若content有值，返回组合内容。
   */
  getContent(){
    if(this.content.length===0){
      return "";
    }else{
      return this.content;
    }
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
    return true
  }
}

export class Chapter {
  /** 章节条目在大纲中层级中的索引，不是总索引 **/
  index: number;
  title: string;
  subTitle: string = ""; //大部分没用，预留
  /** 章节条目在大纲层级中的索引  比如大纲中 “chapter-1”  --used by Collapse **/
  key:string;
  label: string; //used by Collapse ,it's label==slide's title
  prompt: string = ""; //大部分没用，预留
  paragraphs:Array<Paragraph> = new Array<Paragraph>();

  constructor(index: number, title: string) {
    this.index = index;
    this.title = title;
    this.key = "chapter-"+index;
    this.label = title;
  }
}

/*export class SlideVar{
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

}*/

export class Doc{
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
   * 获取所有的幻灯片变量，以便于根据模板生成ppt内容。word暂不需要
   */
  /*static getSlideVars(chapters:Array<Chapter>){
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
        const slideVar=new SlideVar(chapter.index,chapter.title,
          slide.index,slideIndexG,slide.title,slide.subTitle,vItem);
        slideIndexG++;
        slideVars.push(slideVar);
      }
    }
    return slideVars;
  }*/

  /**
   * 从生成的message中获取Word大纲标题（仅一级标题 `# `，不含 `##`）
   * @param msg
   */
  static getTitleFromMsg(msg:string){
    const m = (msg || "").match(/^#\s+(?!#)(.+?)(?:\r?\n|$)/);
    return m ? m[1].trim() : "";
  }

  /**
   * 去掉文首一级标题，保留章节。禁止用 "# "+title 做全局替换（会误伤「## 章节」）。
   */
  static getContentFromMsg=(msg:string)=>{
    return (msg || "").replace(/^#\s+(?!#).*(?:\r?\n+|$)/, "").trim();
  }

  /**
   * 从大纲内容中获取DOC大纲内容。
   * @param content
   * @return Chpater[] 数组
   */
  static getChaptersFromContent(content:string):Chapter[]{
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;

    // 使用正则表达式匹配章节标题、段落标题
    const chapterRegex = /^## (.+)$/;
    const paragraphRegex1 = /^### (.+)$/;
    const paragraphRegex2 = /^[*|+-] (.+)$/;

    // 按行分割markdown文本
    const lines = content.split('\n');
    let chapterIndex=1;
    let paragraphIndex=1;
    for (const line of lines) {
      const chapterMatch = line.trim().match(chapterRegex);
      const paragraphMatch1 = line.trim().match(paragraphRegex1);
      const paragraphMatch2 = line.trim().match(paragraphRegex2);
      // const subtitleMatch = line.trim().match(subtitleRegex);

      if (chapterMatch) {
        // 如果找到新章节,保存当前章节并创建新章节
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        const chapterTitle=chapterMatch[1]
        currentChapter = new Chapter(chapterIndex,cleanString(chapterTitle));
        chapterIndex++;
      } else if ((paragraphMatch1||paragraphMatch2) && currentChapter) {
        // 在当前章节中添加新幻灯片
        let paragraphTitle
        if(paragraphMatch1){
          paragraphTitle =paragraphMatch1[1];
        }else if(paragraphMatch2){ //2者必有其一,必定是paragraphMatch2有值
          paragraphTitle =paragraphMatch2[1];
        }else{
          paragraphTitle=""
          console.log("段落title未赋值，出错了。")
        }
        const paragraph=new Paragraph(paragraphIndex,cleanString(paragraphTitle));
        paragraphIndex++;
        currentChapter.paragraphs.push(paragraph);
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
  static checkChapter(chapters:Array<Chapter>):CheckMsg{
    if (!chapters || chapters.length==0) {
      return {code:-1,msg:"大纲格式不正确，没有发现任何章节，章节前缀应该为【## 】，注意空格"};
    }else{
      let paragraphsCnt=0
      for (let i=0;i<chapters.length;i++) {
        const paragraphs=chapters[i].paragraphs;
        if(!paragraphs || paragraphs.length==0){
          return {code:-2,msg:`大纲格式不正确，第${i+1}章没发现任何段落，段落标题前缀应该为【### 】或【* 】或【+ 】或【- 】，注意空格。`}
        }
        paragraphsCnt+=paragraphs.length;
      }
      return {code:0, msg:`大纲格式正确，一共发现${chapters.length}章，共计${paragraphsCnt}个段落。`}
    }
  }
  /**
   * 通过给一个key，获取{章节key,段落key}
   * @param chapters
   * @param key
   * @return ("chapter-1","paragraph-2")
   * //TODO 该方案不行：若chapters空或paragraph为空，返回undefined，必须前端保证第一章第一节有内容
   */
  static getKeysFromKey(chapters:Array<Chapter>,key:string){
    if (!chapters?.length) {
      return undefined;
    }
    for (let chapter of chapters) {
      if(chapter.key===key){
        if (!chapter.paragraphs?.length) {
          return undefined;
        }
        return new DocKeys(key,chapter.paragraphs[0].key)
      }else{
        const paragraphs=chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for(let paragraph of paragraphs) {
            if(paragraph.key===key){
              return new DocKeys(chapter.key,key);
            }
          }
        }
      }
    }
    if(!chapters[0].paragraphs?.length){
      return undefined;
    }else {
      return new DocKeys(chapters[0].key, chapters[0].paragraphs[0].key)
    }
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
        // chapter.setPrompt(prompt); //章节本身暂时不需要设置提示词
        return;
      }else{
        const paragraphs = chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for (let paragraph of paragraphs) {
            if(paragraph.key===key){
              paragraph.setPrompt(prompt);
              return;
            }
          }
        }
      }
    }
    console.log(`给key：${key}项设置提示词时出错。找不到key值`);
  }
  /**
   * 为一个文档大纲的所有段落初始化提示词 //TODO-hezl 后续优化时，考虑要存客户的提示词
   * 文章标题是<一、引言>，请为[描述宝能系介入并逐步增持股份的过程]章节撰写大约200~400个字左右的具体内容.
   * @param chapters
   * @param pptTitle
   * @param format_prompt //暂时无用，预留
   */
  static setAllPrompt(chapters:Chapter[],pptTitle:string,format_prompt:string=""){
    for (let chapter of chapters) {
      const paragraphs = chapter.paragraphs;
      if (Array.isArray(paragraphs)) {
        for(let paragraph of paragraphs) {
          let prompt="";
          prompt = `文章标题是<${pptTitle}>，请为它的【${chapter.title}】章节中的段落： [${paragraph.title}]撰写大约200~400个字左右的具体内容。直接输出正文，不要以「根据知识库内容」等套话开头。`;
          paragraph.setPrompt(prompt);
        }
      }
    }
    return chapters;
  }

  /**
   * 为一个文档大纲的某段落设置生成内容。
   * @param chapters
   * @param key
   * @param content
   */
  static setContent(chapters: Chapter[], key: string, content: string) {
    let paragraph=this.getParagraph(chapters,key);
    if(paragraph!==undefined){
      paragraph.setContent(content);
    }else{
      console.log(`出错了。找不到${key}对应的幻灯片`)
    }
  }

  /**
   * 根据key获取某个段落的内容。
   * @param chapters
   * @param key
   * @return 如果是chapterKey，返回undefined；如果是paragraphKey，返回的是具体paragraph对象
   */
  static getParagraph(chapters: Chapter[], key: string) {
    for (let chapter of chapters) {
      if (chapter.key === key) {
        // chapter.setContent(content);
        return;
      } else {
        const paragraphs = chapter.paragraphs;
        if (Array.isArray(paragraphs)) {
          for (let paragraph of paragraphs) {
            if (paragraph.key === key) {
              return paragraph;
            }
          }
        }
      }
    }
  }

  /**
   * * 将完整规范（经过检查的）的markdown大纲文档存入storage的分类记录集(比如AiDoc_outlineRecs)中
   * @param markdown  markdown大纲内容
   // * @param outlineRecs  已取出的大纲记录集
   * @param outlineType 可能得类型是outlineTypeDOC，outlineTypeAiDOC
   */
  static addDocOutlineRecToStorage(outlineType:outlineType, markdown:string, kbName:string = "samples"){
    const rawTitle=Doc.getTitleFromMsg(markdown);
    const rawContent =Doc.getContentFromMsg(markdown);
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
    let chapters =Doc.getChaptersFromContent(or.outlineContent);
    chapters = Doc.setAllPrompt(chapters, or.outlineName, formatPrompt);
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
  static clearParagraphContent(chapters:Chapter[]) {
    for (let chapter of chapters) {
      const paragraphs = chapter.paragraphs;
      if (Array.isArray(paragraphs)) {
        for (let slide of paragraphs) {
          slide.content="";
        }
      }
    }
  }

}

