import * as cheerio from "cheerio";
import JSZip from "jszip";
import fs from "fs";

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
  // progressList: PptSegment,
  // imageList: PptSegment,
  tail:number,
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
  // progressList: {start:12,length:3,count:2},
  // imageList: {start:18,length:3,count:2},
  tail:31,
  restSlide:[24,25,26,27,28,29,30]
}

type slideType ="cover"|"chapterCover"|"catalog"|"list"|"tail";
type fileType="localFile"|"urlFile";

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
  static getTemplatePageNumber = (sType: slideType, itemCounts?: number) => {
    if (sType === 'cover' || sType === 'chapterCover' || sType === 'tail') {
      console.log(pptPage[sType])
      return pptPage[sType]
    } else { //for PptSegment
      if(!itemCounts) {
        console.error(`模板itemCounts设置错误：${sType},${itemCounts}。`)
        return 0;
      }
      const startPage = pptPage[sType].start;
      const offset = itemCounts - 3;  //3,4,5对应0,1,2
      const rand= Math.floor(Math.random() * (pptPage[sType].count))
      const pageNum = rand*3 + offset + startPage;
      console.log(`rand:${rand},offset:${offset},startPage:${startPage},pageNum:${pageNum}`)
      return pageNum;
    }
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
    for (let i=1;i<=31; i++ ){ //for (let i=1;i<=7; i++ ){
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

    return $.xml();
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
  async genNewSlideFileDict_Random(pageType:slideType, slideVarDict:SlideVarDict[]|object, newSlidePageNo: number,counts?:number) {
    const slidePageNo=PptTemplate.getTemplatePageNumber(pageType,counts);
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
   *   ppt/_rels/presentation.xml.rels 特殊处理,
   *   //将<Relationship Id="rId13" Target="slides/slide12.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/>这样的记录去掉。
   *   //1、构造字符串数组："slides/slide${i}.xml" 2、筛掉用到的页面（this.usedSlidePages）。3、记录rid，删掉该Relation删掉。
   */
  async genNewPresentationRelation(){
    const relationIds:Array<string>=[]
    let filename="ppt/_rels/presentation.xml.rels";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
        await zip.files[filename].async("string").then(async (slideContent) => {
          const $ = cheerio.load(slideContent, {xml: true});

          /**
           * 以下循环的规则是：只要不是新页面，全删
           * TODO hezl 当页面低于模板页时成立，高于时要重新写规则
           * 1、删除所有 旧slide
           * 2、计算max rId
           * 3、插入所有 新slide
           * 4、新slide模板为：let new_rel_str=`<Relationship Id="rId${maxId++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index+1}.xml"/>`
           * 5、有问题（可能的线索是rId有其他的关联）
           */
          for(let i=1;i<=31;i++){
            if(!this.newSlidePages.includes(i)){
              const slideName=`slides/slide${i}.xml`
              let $relation=$('Relationship[Target="'+slideName+'"]');
              let relationId=$relation.attr('Id');
              if(relationId!==undefined) {
                relationIds.push(relationId);
                $relation.remove();
              }
            }
          }
          /*let rels_all=$("Relationship");
          const Ids=new Array<number>();
          for(let i=0;i<rels_all.length;i++){
            Ids.push(parseInt(rels_all[i].attribs.Id.substring(3)));
            console.log(rels_all[i].attribs.Id);
          }
          let maxId=Math.max(...Ids)
          for(let slide of this.templateSlides){
              const slideName=slide.substring(4);  // ppt/slides/slide1.xml  => slides/slide1.xml
              let $relation=$('Relationship[Target="'+slideName+'"]');
              console.log(`removed slide:${slideName}`)
              $relation.remove();
          }
          console.info(`removed ${this.templateSlides.length} pages' relationship.`)

          this.newSlidePages.forEach(slideNum=>{
            let new_rel_str=`<Relationship Id="rId${maxId++}" Target="slides/slide${slideNum}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/>`
            $('Relationships').append(new_rel_str)
            console.log(`added slide:${new_rel_str}`)
          })
          console.info(`added ${this.newSlidePages.length} pages' relationship.`)
          console.info($.xml())*/
          this.newSlideFileDicts.push(new SlideFileDict(filename,$.xml()));
        });
      });

    return relationIds;
  }

  /**
   * 根据relationIds生成新的ppt/presentation.xml
   * @param relationIds
   */
  async genNewPresentations(relationIds :Array<string>) {
    let filename="ppt/presentation.xml";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[filename].async("string").then(async (slideContent) => {
        const $ = cheerio.load(slideContent, {xml: true});
        for (let rid of relationIds) {
          let $sldId=$("p\\:sldId[r\\:id='"+rid+"']")
          $sldId.remove()
        }
        this.newSlideRelationDicts.push(new SlideFileDict(filename,$.xml()));
      })
    })
  }

  /**
   * 生成【content_Types】.xml
   */
  async genNewContentTypes() {
    let filename="[Content_Types].xml";
    await this.zip.loadAsync(this.templateBuffer).then(async (zip) => {
      await zip.files[filename].async("string").then(async (slideContent) => {
        const $ = cheerio.load(slideContent, {xml: true});
        for(let i=1;i<=31;i++){
          if(!this.newSlidePages.includes(i)){
            let $override=$('Override[PartName="/ppt/slides/slide'+i+'.xml"]');
            $override.remove();
          }
        }
        this.newSlideRelationDicts.push(new SlideFileDict(filename,$.xml()));
      })
    })
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
      // 准备两个文件：
      const relationIds=await this.genNewPresentationRelation();
      await this.genNewPresentations(relationIds);
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
