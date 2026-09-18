import {nanoid} from "nanoid";

export type outlineType='doc'|'ppt'|'aiDoc'|'aiPpt';
export const outlineTypeDOC='doc';
export const outlineTypePPT='ppt';
export const outlineTypeAiDOC='aiDoc';
export const outlineTypeAiPPT='aiPpt';
export const outlineTypes:{name:string,value:outlineType}[]=[
  { name:"智能文档",value:outlineTypeAiDOC},
  { name:"智能ppt",value:outlineTypeAiPPT},
  { name:"知识库文档",value:outlineTypeDOC},
  { name:"知识库ppt",value:outlineTypePPT},
]

/**
 * 上个版本是不带大纲ID的，通过该函数将所有大纲改成带ID的。
 * 方法是将语句：
 * updateIdOfOutlineRes();
 * 放在某个页面上即可
 */
export const updateIdOfOutlineRes=()=>{
  for(let t of outlineTypes) {
    const outlineRecs= OutlineRec.listRecs( t.value )
    console.info(`${t.name}共${outlineRecs.length}个大纲`)
    for(let r of outlineRecs){
      console.log(r.outlineId,r.outlineName,r.outline_source_kbName);
      if(r.outlineId===undefined) {
        const outline=new OutlineRec(r.outlineName,r.outlineContent,r.outline_source_kbName);
        console.info("new:"+outline.outlineId+"-"+outline.outlineName)
        OutlineRec.deleteRecByName(t.value,r.outlineName)
        OutlineRec.saveRecByID(t.value,outline);
      }
    }
  }
}
/**
 * 用于分类、存储、管理各种大纲：outlineTypeDOC、outlineTypePPT、outlineTypeAiDOC、outlineTypeAiPPT
 */
export default class OutlineRec{
  outlineId:string|undefined;
  outlineName:string;
  outlineContent:string;
  init_format_Prompt:string;
  /** 当涉及到outlineTypeDOC、outlineTypePPT时，需要存它的知识库来源。目前只考虑单选。**/
  outline_source_kbName:string;
  constructor(outlineName:string="",outlineContent:string="",outline_source_kbName:string="",init_format_Prompt:string=""){
    this.outlineId = nanoid();
    this.outlineName = outlineName;
    this.outlineContent = outlineContent;
    this.init_format_Prompt = init_format_Prompt;
    this.outline_source_kbName = outline_source_kbName;
  }

  /**
   * 整个类型数组的保存
   * @param type
   * @param outlineRecs
   */
  /*static saveRecs(type:outlineType,outlineRecs:OutlineRec[]) {
    const preOutlineStr=type+"_";
    localStorage.setItem(preOutlineStr+"outlineRecs",JSON.stringify(outlineRecs));
    console.debug("localstorage内容保存成功。")
    return true;
  }*/

  /**
   * 用于有ID与无ID的转换期，当该大纲记录含outlineId字段且不为undefine，调用的是ByID，否则ByName
   * @param type  文档类型
   * @param outline 大纲记录
   */
  static save(type:outlineType,outline:OutlineRec) {
    if(!outline["outlineId"]||outline["outlineId"]===undefined){
      this.saveRecByName(type,outline)
    }else{
      this.saveRecByID(type,outline)
    }
  }

  /**
   * @deprecated 通过名字保存某个大纲
   * @param type  文档类型
   * @param outline 大纲记录对象
   */
  static saveRecByName(type:outlineType,outline:OutlineRec) {
    const outlineRecs=this.getOutlineRecs(type);
    const preOutlineStr=type+"_";
    let index = outlineRecs.findIndex(item => item.outlineName === outline.outlineName);
    if(outlineRecs.length===0||index===-1){
      outlineRecs.push(outline);
    }else{
      outlineRecs[index]=outline;
    }
    localStorage.setItem(preOutlineStr+"outlineRecs",JSON.stringify(outlineRecs));
    console.debug("localstorage内容保存成功。")
    return true;
  }
  /**
   * 通过Id保存某个大纲
   * @param type 文档类型
   * @param outline 大纲记录对象
   */
  static saveRecByID(type:outlineType,outline:OutlineRec) {
    const outlineRecs=this.getOutlineRecs(type);
    const preOutlineStr=type+"_";
    let index = outlineRecs.findIndex(item => item.outlineId === outline.outlineId);
    if(outlineRecs.length===0||index===-1){
      outlineRecs.push(outline);
    }else{
      outlineRecs[index]=outline;
    }
    localStorage.setItem(preOutlineStr+"outlineRecs",JSON.stringify(outlineRecs));
    console.debug("localstorage内容保存成功。")
    return true;
  }

  /**
   * @deprecated
   * @param type
   * @param outlineName
   */
  static deleteRecByName(type:outlineType,outlineName:string ) {
    const outlineRecs=this.getOutlineRecs(type);
    const preOutlineStr=type+"_";
    let index = outlineRecs.findIndex(item => item.outlineName === outlineName);
    if(outlineRecs.length===0||index===-1){
      console.log("no outline recs found");
      return false;
    }else{
      outlineRecs.splice(index,1);
    }
    localStorage.setItem(preOutlineStr+"outlineRecs",JSON.stringify(outlineRecs));
    return true;
  }

  /**
   * 通过ID删除
   * @param outlineId
   * @param type
   */
  static deleteRecById(outlineId:string|undefined,type:outlineType) {
    const outlineRecs=this.getOutlineRecs(type);
    if(outlineId===undefined){
      console.log("大纲Id 没定义");
      return false
    }
    const preOutlineStr=type+"_";
    let index = outlineRecs.findIndex(item => item.outlineId === outlineId);
    if(outlineRecs.length===0||index===-1){
      console.log(`大纲Id${outlineId}没找着`);
      return false;
    }else{
      outlineRecs.splice(index,1);
    }
    localStorage.setItem(preOutlineStr+"outlineRecs",JSON.stringify(outlineRecs));
    return true;
  }

  /**
   * 通过名称或标题获取大纲
   * @param outlineRecs  给定大纲记录集
   * @param id
   */
  static getRecById(outlineRecs:OutlineRec[],id:string) {
    let index = outlineRecs.findIndex(item => item.outlineId === id);
    if(outlineRecs.length===0||index===-1){
      console.log("no outline recs found");
      return null;
    }else{
      return outlineRecs[index];
    }
  }

  /**
   * 获取某类型的大纲标题列表
   * @param type
   */
  static listNames(type:outlineType){
    const outlineRecs=this.getOutlineRecs(type);
    if(outlineRecs.length===0){
      console.log("no outline recs found");
      return [];
    }else {
      const recs: Array<string> = outlineRecs.map(item => item.outlineName);
      return recs;
    }
  }

  /**
   * 获取各类型的大纲列表，供外部使用
   * @param type
   */
  static listRecs(type:outlineType, kbName?: string){
    const outlineRecs=this.getOutlineRecs(type);
    if(outlineRecs.length===0){
      console.log("no outline recs found");
      return [];
    }
    if (!kbName) {
      return outlineRecs;
    }
    return outlineRecs.filter(
      (r) => (r.outline_source_kbName || 'samples') === kbName,
    );
  }
  private static getOutlineRecs(type: outlineType){
    // localStorage.clear();
    const preOutlineStr=type+"_";
    let outlineRecs:Array<OutlineRec>=[];
    if(localStorage.getItem(preOutlineStr+"outlineRecs")===null) {
      outlineRecs =  [] ;
    }else{
      outlineRecs = JSON.parse(<string>localStorage.getItem(preOutlineStr+"outlineRecs"));
    }
    return outlineRecs;
  }

  static isStorageReady(){
    if(typeof(Storage)!=='undefined'){
      return true;
    }else{
      console.log("localStorage not supported by browser.");
      return false;
    }
  }

  /**
   * 清除某中类型的现有所有文档，慎用。
   */
  static clear(type:outlineType){
    // localStorage.clear();
    const preOutlineStr=type+"_";
    localStorage.removeItem(preOutlineStr+"outlineRecs");
    console.log("cleared storage's content:"+localStorage.getItem(preOutlineStr+"outlineRecs"));
  }
  static clearAllStore(){
    for(let t of outlineTypes){
      OutlineRec.clear(t.value)
    }
  }


}

