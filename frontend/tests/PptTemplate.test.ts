import PptTemplate,{SlideVarDict} from "../src/components/DocUtil/PptTemplate"



describe('PptTemplate Class', () => {
    const pptTemplate = new PptTemplate("localFile","./public/pptTemplate-simple.pptx", "./public/output-test.pptx");
    class Person{
        name: string;
        age: number;
        constructor(name: string, age: number) {
            this.name = name;
            this.age = age;
        }
    }
    const person=new Person("hezl",23);
    class Item{
        title:string;
        desc:string;
        subTitle:string;
        constructor(title:string, desc:string,subTitle:string) {
            this.title = title;
            this.desc = desc;
            this.subTitle = subTitle;
        }
    }
    const item=new Item("hezl1","hezeling1 desc...","hezeling subtitle");
    //************************
    //以上为初始化,以下为测试用例
    //************************
    test('getBufferFromFile-1', async () => {
        const result = await pptTemplate.getBufferFromFile(pptTemplate.templatePath);
        expect(result).toBeInstanceOf(Buffer);
    });
    test('getBufferFromUrl-1', async () => {
      const result = await pptTemplate.getBufferFromUrl("https://localhost:8000/pptTemplate-simple.pptx");
      expect(result).toBeInstanceOf(Buffer);
    });
  test('getBufferFromUrl-2', async () => {
    const result1 = await pptTemplate.getBufferFromFile(pptTemplate.templatePath);
    const result2 = await pptTemplate.getBufferFromUrl("https://localhost:8000/pptTemplate-simple.pptx");
    const result3=result1.subarray(result1.length-100)
    const result4=result2.subarray(result2.length-100)
    // expect(result4).toBe(result3);
    expect(result4).toStrictEqual(result3);
  });
    test('getSlidesFromFile-1', async () => {
        const result = await pptTemplate.getSlidesFromFile("./public/pptTemplate-simple.pptx");
        expect(result[0]).toContain("ppt/slides/slide");
    });
    test('getSlidesFromFile-2', async () => {
        const result = await pptTemplate.getSlidesFromFile("./public/output-test.pptx");
        expect(result[0]).toContain("ppt/slides/slide");
        /*const r1=await pptTemplate.getSlidesFromFile(pptTemplate.newFilePath);
        const r2=await pptTemplate.getSlidesRelationFromFile(pptTemplate.newFilePath);*/
    });
    test('getSlides-1', async () => {
      const pptTemplate1 = new PptTemplate("urlFile","https://127.0.0.1:8000/pptTemplate-simple.pptx", "https://127.0.0.1:8000/output-test.pptx");
      await pptTemplate1.init()
      const result = await pptTemplate1.getSlides();
      console.log(result);
      expect(result[0]).toContain("ppt/slides/slide");
    });
    test('getSlidesRelationFromFile-1', async () => {
        const result = await pptTemplate.getSlidesRelationFromFile("./public/pptTemplate-simple.pptx");
        expect(result[0]).toContain("ppt/slides/_rels/slide");
    });
/*    test('getSlidesRelationFromFile-2', async () => {
        const result = await pptTemplate.getSlidesRelationFromFile("./public/output-test.pptx");
        expect(result[0]).toContain("ppt/slides/_rels/slide");
    });*/
  test('getSlidesRelation', async () => {
    const pptTemplate1 = new PptTemplate("urlFile","https://127.0.0.1:8000/pptTemplate-simple.pptx", "https://127.0.0.1:8000/output-test.pptx");
    await pptTemplate1.init()
    const result = await pptTemplate1.getSlidesRelation();
    console.log(result);
    expect(result[0]).toContain("ppt/slides/_rels/slide");
  });
    test('getSlidesLayoutRelationFromFile-1', async () => {
        const result = await pptTemplate.getSlidesLayoutRelationFromFile("./public/pptTemplate-simple.pptx");
        console.log(result)
        expect(result[0]).toContain("ppt/slideLayouts/_rels/slideLayout");
    });
    test('getSlidesLayoutRelationFromFile-2', async () => {
        const result = await pptTemplate.getSlidesLayoutRelationFromFile("./public/output-test.pptx");
        console.log(result)
        expect(result[0]).toContain("ppt/slideLayouts/_rels/slideLayout");
    });
    test('init-1', async () => {
        await pptTemplate.init();
        const result = pptTemplate.templateBuffer;
        expect(result).toBeInstanceOf(Buffer);
    });
    test('init-2', async () => {
        await pptTemplate.init();
        const result = pptTemplate.templateSlides;
        expect(result[0]).toContain("ppt/slides/slide");
    });
    test('getTemplatePageNum-1', () => {
        expect(PptTemplate.getTemplatePageNumber('cover')).toBe(1);
    });
    test('getTemplatePageNum-2', () => {
        const result=[6,9,12,15,18,21]
        for (let i = 0; i < 30; i++) {
          expect(result).toContain(PptTemplate.getTemplatePageNumber('list', 3))
        }
    });
    test('getTemplatePageNum-3', () => {
      for (let i = 0; i < 30; i++) {
        expect(PptTemplate.getTemplatePageNumber('catalog', 5)).toBe(5);
      }
    });
    test('getSlidePageContent-1', async () => {
        await pptTemplate.init();  //通过init()后，才能直接获取buffer
        const result1 = await pptTemplate.getTemplatePageContent(2)
        console.debug("第2页:--------------------\n"+result1);
        expect(result1).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
        const result2 = await pptTemplate.getTemplatePageContent(6)
        console.debug("第6页:--------------------\n"+result2);
        expect(result2).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
    });
    test('getSlidePageContentByNameFromFile-1-output-test.pptx', async () => {
        let result=await pptTemplate.getWholeContentFromFile("./public/output-test.pptx");
        expect(result).toBe(true);
    });
    test('getSlidePageContentByNameFromFile-2-pptTemplate-simple', async () => {
        let result=await pptTemplate.getWholeContentFromFile("./public/pptTemplate-simple.pptx");
        expect(result).toBe(true);
    });
    test('genNewContentByTpl-1', async () => {
        const tpl=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p>Hello,{chapterTitle} World!<h1>{subTitle}</h1></p>hello, {testName}! I want to do {something}.u are {person.name},age is:{person.age}` ;
        const aclass={
            testName:"cat",
            something:"shopping",
            person:person,
            chapterTitle:"如何选爆品",
            subTitle:"选爆品的意义"
        }
        let svd:SlideVarDict={"testName":"cat"};
        svd["something"]="shopping";
        svd["person"]=person;
        svd["chapterTitle"]="如何选爆品";
        svd["subTitle"]="选爆品的意义"
        const result1 = pptTemplate.genNewContentByTpl(tpl,aclass);
        expect(result1).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p>Hello,如何选爆品 World!<h1>选爆品的意义</h1></p>hello, cat! I want to do shopping.u are hezl,age is:23");
        const result2 = pptTemplate.genNewContentByTpl(tpl,svd);
        expect(result2).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p>Hello,如何选爆品 World!<h1>选爆品的意义</h1></p>hello, cat! I want to do shopping.u are hezl,age is:23");
    });
    test('genNewSlideFromTplSlide-1', async () => {
        await pptTemplate.init();  //通过init()后，才能直接获取buffer
        const aclass={
            testName:"cat",
            something:"shopping",
            person:person,
            chapterTitle:"如何选爆品",
            subTitle:"选爆品的意义",
            item1:item
        }
        const result1 = await pptTemplate.genNewSlideFromTplSlide(6,aclass);
        console.debug("第6页:--------------------\n"+result1);
        expect(result1).toContain('<a:r><a:rPr lang="en-US" altLang="zh-CN" sz="1200" dirty="0"/><a:t>hezeling1 desc...</a:t></a:r>');
    });
    //genNewSlideFileDict
    test('genNewSlideFileDict-1', async () => {
        await pptTemplate.init();  //通过init()后，才能直接获取buffer
        const aclass={
            testName:"cat",
            something:"shopping",
            person:person,
            chapterTitle:"如何选爆品",
            subTitle:"选爆品的意义",
            item1:item
        }
        await pptTemplate.genNewSlideFileDict(6,aclass,1);
        await pptTemplate.genNewSlideFileDict(9,aclass,2);
        await pptTemplate.genNewSlideFileDict(13,aclass,3);
        console.log(pptTemplate.newSlideFileDicts);
        expect(pptTemplate.newSlideFileDicts.length).toBe(3);
    });
    test('genNewSlideFileDict_Random-1', async () => {
      await pptTemplate.init();  //通过init()后，才能直接获取buffer
      const aclass={
        testName:"cat",
        something:"shopping",
        person:person,
        chapterTitle:"如何选爆品",
        subTitle:"选爆品的意义",
        item1:item
      }
      await pptTemplate.genNewSlideFileDict_Random("cover", aclass,1);
      await pptTemplate.genNewSlideFileDict_Random("list",aclass,2,3);
      console.log(pptTemplate.newSlideFileDicts);
      expect(pptTemplate.newSlideFileDicts.length).toBe(2);
    });
    test('genNewSlideFile-1', async () => {
        await pptTemplate.init();  //通过init()后，才能直接获取buffer
        const aclass={
            testName:"cat",
            something:"shopping",
            person:person,
            chapterTitle:"如何选爆品",
            subTitle:"选爆品的意义",
            item1:item
        }
        const tplArray=[6,9,13]
        for (const p of tplArray) {
            const idx = tplArray.indexOf(p);
            // await pptTemplate.genNewSlideFileDict(p,aclass,idx+1);
            await pptTemplate.genNewSlideFileDict_Random("list",aclass,idx+1,idx+3);
            // console.log(`hezl: relationFile----${idx+1}`);
            // console.log(await pptTemplate.getTemplatePageRelationContent(idx+1));
        }
        // console.log(`hezl: relationFile----4`);
        // console.log(await pptTemplate.getTemplatePageRelationContent(4));
        const result2 = await pptTemplate.genNewSlideFile('localFile');
        expect(result2).toBe(true);
    });
  test('genNewSlideFile-2', async () => {
    const pptTemplate = new PptTemplate("urlFile","http://127.0.0.1:8000/pptTemplate-simple.pptx", "../../public/output-test.pptx")
    await pptTemplate.init();  //通过init()后，才能直接获取buffer
    const aclass={
      testName:"cat",
      something:"shopping",
      person:person,
      chapterTitle:"如何选爆品",
      subTitle:"选爆品的意义",
      item1:item
    }
    const tplArray=[6,9,13]
    for (const p of tplArray) {
      const idx = tplArray.indexOf(p);
      await pptTemplate.genNewSlideFileDict(p,aclass,idx+1);
      // console.log(`hezl: relationFile----${idx+1}`);
      // console.log(await pptTemplate.getTemplatePageRelationContent(idx+1));
    }
    // console.log(`hezl: relationFile----4`);
    // console.log(await pptTemplate.getTemplatePageRelationContent(4));
    const result2 = await pptTemplate.genNewSlideFile('urlFile');
    expect(result2).toBe(true);
  });
});
