import {Doc} from '@/components/DocUtil/ViewItem4Doc';
import {readFileSync} from "fs";
import {message} from "antd";
const docOutlineMsg="# 如何帮助选品师筛选出抖音男装的爆品\n\n## 一、了解市场需求\n\n* 1.1 趋势分析：关注抖音上的流行趋势，研究赛博机能、末日竞赛等热门主题。\n* 1.2 用户偏好：分析用户对于衣服的审美要求与功能需求。\n* 1.3 目标受众定位：针对年轻受众的需求进行细分。\n\n## 二、考察产品特点\n\n* 2.1 设计元素：选择符合流行趋势且具个性化、创意性的设计风格，如做旧、解构、拼接等。\n* 2.2 色彩搭配：选取银色、黑色、灰色等主流颜色或者具有冲击力的撞色效果。\n* 2.3 功能性需求：关注舒适度、实用性和时尚感，满足多元化运动场景。\n* 2.4 品质把控：要求供应商提供高品质的产品，保障商品的耐用性与满意度。\n\n## 三、数据分析\n\n* 3.1 热销爆款分析：查看抖音男装销量情况，了解热销爆款的销量规律。\n* 3.2 官方数据：关注各大电商平台和抖音平台的数据报告。\n* 3.3 社交热度：跟踪抖音热点话题和相关标签的热度。\n\n## 四、供应商与合作\n\n* 4.1 优质供应商选择：寻找有品牌形象、生产实力和网络营销能力合格的供应商。\n* 4.2 考察合作店铺：调研店铺信誉好、客群广泛的销售渠道和搭配公式。\n* 4.3 平台政策：关注抖音平台相关的选品规范和优惠政策。\n\n## 五、营销策略\n\n* 5.1 视频创意：根据服装特点制作优质的宣传视频，提高用户观看兴趣。\n* 5.2 选品类目：策划与服装特点相符的产品活动、打折促销等策略吸引消费者。\n* 5.3 晒单反馈：注重用户体验，主动收集产品反馈信息。\n\n## 六、总结评估\n\n* 6.1 抒达能力测试：评价写作者对于市场需求和趋势的认识能力。\n* 6.2 产品知识掌握程度：考察选品师对各品类产品的了解与掌握程度。\n* 6.3 持续关注市场动态，优化和调整策略。\n";
describe('ViewItem Class', () => {
  test('getTitleFromMsg-1', async () => {
    const content=docOutlineMsg;
    const result=Doc.getTitleFromMsg(content)
    console.log(result)
    expect(result?.length).toBe(17);
  })
  test('getContentFromMsg-1', async () => {
    const content=docOutlineMsg;
    const result=Doc.getContentFromMsg(content)
    const title=Doc.getTitleFromMsg(content)
    console.log(result)
    expect(docOutlineMsg).toContain(result);
    expect(result).not.toContain(title);
  })
  test('getChaptersFromContent-1', async () => {
    const content=docOutlineMsg;
    const result=Doc.getChaptersFromContent(content)
    for (let chapter of result) {
      console.log(chapter)
      for(let paragraph of chapter.paragraphs) {
        console.log(paragraph)
      }
    }
    // console.dir(result)
    expect(result?.length).toBe(6);
  })
  test('getChaptersFromContent-2', async () => {
    const content=docOutlineMsg.replace(/\n\*/g,"\n###");
    const result=Doc.getChaptersFromContent(content)
    for (let chapter of result) {
      console.log(chapter)
      for(let paragraph of chapter.paragraphs) {
        console.log(paragraph)
      }
    }
    // console.dir(result)
    expect(result?.length).toBe(6);
  })
  test('getKeysFromKey-1', async () => {
    const chapters=Doc.getChaptersFromContent(docOutlineMsg)
    const result=Doc.getKeysFromKey(chapters,"paragraph-18")
    if(result) {
      console.log(result)
      expect(result.chapterKey.split("-")[1]).toBe("6");
    }else{
      console.log(result)
    }
  })
  test('setPrompt-1', async () => {
    const chapters=Doc.getChaptersFromContent(docOutlineMsg)
    Doc.setPrompt(chapters,"paragraph-18","你好")
    // const result=Doc.getKeysFromKey(chapters,"paragraph-18")
    console.log(chapters)
    expect(chapters[5].paragraphs[1].prompt).toBe("你好");
  })
  test('setAllPrompt-1', async () => {
    const chapters=Doc.getChaptersFromContent(docOutlineMsg)
    Doc.setAllPrompt(chapters,"你好2")
    // const result=Doc.getKeysFromKey(chapters,"paragraph-18")
    console.log(chapters[5].paragraphs[1].prompt)
    expect(chapters[5].paragraphs[1].prompt.length).toBeGreaterThan(1);
    expect(chapters[0].paragraphs[2].prompt.length).toBeGreaterThan(1);
  })
  test('setContent-1', async () => {
    const chapters=Doc.getChaptersFromContent(docOutlineMsg)
    Doc.setContent(chapters,"paragraph-18","你好2")
    // const result=Doc.getKeysFromKey(chapters,"paragraph-18")
    console.log(chapters[5].paragraphs[1].content)
    expect(chapters[5].paragraphs[1].content).toBe("你好2");
  })
  test('getParagraph-1', async () => {
    const chapters=Doc.getChaptersFromContent(docOutlineMsg)
    const p=Doc.getParagraph(chapters,"paragraph-18")
    // const result=Doc.getKeysFromKey(chapters,"paragraph-18")
    console.log(p)
    expect(p?.key).toBe("paragraph-18");
  })
  test("getParagraph-2",async () => {
    // const filePath = './tests/resourceFile/kbppt_wrong_noslide_2_万科怎么了.md';
    const filePath = './tests/resourceFile/kbdoc_wrong_某院应用集成系统实施方案.md';
    const fileContent = readFileSync(filePath, 'utf-8');
    const chapters=Doc.getChaptersFromContent(fileContent)
    // const p = Doc.getParagraph(chapters,"paragraph-18")
    const {code , msg} = Doc.checkChapter(chapters)
    console.log(code,msg)
    for(let c of chapters){
      for (let g of c.paragraphs){
        console.log(g)
      }
    }
  })
  test("getParagraph-byRaw",async () => {
    const filePath = './tests/resourceFile/kbdoc_wrong_byRaw_深空总结报告.md';
    const fileContent = readFileSync(filePath, 'utf-8');
    const title=Doc.getTitleFromMsg(fileContent)
    console.log(title)
    const content=Doc.getContentFromMsg(fileContent)
    const chapters=Doc.getChaptersFromContent(content)
    // const p = Doc.getParagraph(chapters,"paragraph-18")
    const {code , msg} = Doc.checkChapter(chapters)
    console.log(code,msg)
    for(let c of chapters){
      for (let g of c.paragraphs){
        console.log(g)
      }
    }
  })
})
