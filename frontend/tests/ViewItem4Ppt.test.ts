import {Ppt, Slide, ViewItem4Ppt} from "../src/components/DocUtil/ViewItem4Ppt";
import { readFileSync } from 'fs';
// import {Doc} from "@/components/DocUtil/ViewItem4DocNew";

const pptOutline="## 第一章：市场趋势分析\n" +
  "\n" +
  "### 1. 抖音平台男装流行色系\n" +
  "*   分析24SS男装抖音趋势的色系，包括灰色系、黑色、白色、森林绿、橡木棕等。\n" +
  "*  收到反馈发送\n" +
  "\n" +
  "### 2. 城市户外风格特征与穿搭推荐\n" +
  "*   阐述“citywalk”热度上涨下的户外通勤特点，并提供穿搭公式如NOTHOMME: 短袖 + 古巴领短袖衬衫 + 喷墨牛仔裤。\n" +
  "\n" +
  "## 第二章：热点风格的爆品解析\n" +
  "\n" +
  "### 1. 城市机能款产品热卖分析\n" +
  "*   从户外防晒衣、工装裤等产品的趋势及关联售卖店进行分析。\n" +
  "\n" +
  "### 2. 赛博机能风格的特点\n" +
  "*   介绍末日竞赛和先锋未来两种赛博机能风格，并附上穿搭公式如FLYERRER: 做旧连帽马甲 + 涂染阔腿牛仔裤。\n" +
  "\n" +
  "## 第三章：筛选男装爆品的技巧\n" +
  "\n" +
  "### 1. 关注色彩趋势和元素搭配\n" +
  "+   从灰色系到银色的过渡，解析色彩如何搭配呈现不同风格特点。\n" +
  "+   强调撞色设计和高级灰的搭配在赛博机能造型中的作用。\n" +
  "\n" +
  "### 2. 深挖细节与功能卖点\n" +
  "-   以外套、短裤等功能性单品为例，说明产品设计的重要性。\n" +
  "\n" +
  "### 3. 灵活运用多种搭配公式\n" +
  "-   针对这些款式提供多样化的穿搭方式及其应用场景，提升选品师灵活性。\n" +
  "\n" +
  "## 第四章：实战案例分析\n" +
  "\n" +
  "### 1. 解读户外通勤热销产品\n" +
  "*   通过分析SIMWOOD简木旗舰店的热销爆款，展示产品的实用性和受欢迎程度。\n" +
  "\n" +
  "### 2. 分析赛博机能风格案例\n" +
  "-   以小伦麦空品牌为例，讲述其如何将末日竞赛和先锋未来趋势融入产品设计，形成独特卖点。\n" +
  "\n" +
  "### 3. 整合数据分析与筛选规律\n" +
  "*   总结本次Ppt内容的重点规律，并结合实际案例分析如何运用这些技巧进行产品选品。";
describe('ViewItem Class', () => {
  test('getTitleFromMsg-1', async () => {
    const filePath = './tests/resourceFile/kbppt_wrong_noslide_1_帮助选品师筛选出抖音男装爆品.md';
    const fileContent = readFileSync(filePath, 'utf-8');
    // const content=docOutlineMsg;
    const title=Ppt.getTitleFromMsg(fileContent)
    console.log(title)
    expect(title?.length).toBeGreaterThan(1);
    const content=Ppt.getContentFromMsg(fileContent)
    console.log(content)
    expect(content?.length).toBeGreaterThan(1);
    const chapters=Ppt.getChaptersFromContent(content);
    const {code,msg}=Ppt.checkChapter(chapters);
    if(code !== 0){
      console.log(`code: ${code}, msg: ${msg}`);
      return;
    }
    console.log(chapters)
    expect(chapters?.length).toBeGreaterThan(1);
    for (const chapter of chapters) {
      let slides=chapter.slides;
      console.log(slides);
      expect(slides?.length).toBeGreaterThan(1);
      /*for (let i = 0; i < slides?.length; ++i) {
        let slide=slides[i];
        console.log(slide);
      }*/
    }

  })
  test('genViewItemByRegex-1', async () => {
    const content="1. 关注城市户外流行款式\n" +
      "   - 了解citywalk趋势下的休闲工装风格搭配特点。\n" +
      "\n" +
      "2. 保持多场景意识\n" +
      "   - 跟踪商务和户外的混搭搭配需求，适应各种场合。\n" +
      "\n" +
      "3. 密切关注流行色系变化\n" +
      "   - 注意为选品调整色彩配比，迎合抖音时尚趋势。\n" +
      "\n" +
      "4. 分析Clean Fit需求\n" +
      "   - 重点关注无印风款式和简约舒适的裁剪标准。\n" +
      "\n" +
      "5. 观察赛博机能新奇特点\n" +
      "   - 研究科幻元素的应用以及面料、工艺的创新。"
    const result=ViewItem4Ppt.genViewItemByRegex(content)
    console.log(result)
    expect(result?.length).toBe(5);
  })
  test('genSlideItem-1', async () => {
    const content="1. 关注城市户外流行款式\n" +
      "   - 了解citywalk趋势下的休闲工装风格搭配特点。\n" +
      "\n" +
      "2. 保持多场景意识\n" +
      "   - 跟踪商务和户外的混搭搭配需求，适应各种场合。\n" +
      "\n" +
      "3. 密切关注流行色系变化\n" +
      "   - 注意为选品调整色彩配比，迎合抖音时尚趋势。\n" +
      "\n" +
      "4. 分析Clean Fit需求\n" +
      "   - 重点关注无印风款式和简约舒适的裁剪标准。\n" +
      "\n" +
      "5. 观察赛博机能新奇特点\n" +
      "   - 研究科幻元素的应用以及面料、工艺的创新。"
    const result=ViewItem4Ppt.genViewItemByRegex(content)
    const slideIndex=1;
    const slideTitle="观察男装流行趋势"
    const slideItem=new Slide(slideIndex,slideTitle,'');
    console.log(slideItem)
    expect(slideItem.viewItems?.length).toBe(5);
  })
  it("getChaptersFromContent-1", () => {
    const chapters=Ppt.getChaptersFromContent(pptOutline);
    expect(chapters.length).toBe(4);
  });
})
