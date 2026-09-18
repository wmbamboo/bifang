import { PageContainer } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Card, theme,Image,Row,Col,Divider,Tag,Input,Button } from 'antd';
import React from 'react';
import { WordCloud } from '@ant-design/charts';
const mainLabels=["保罗","防风外套","冲锋衣","可拆卸帽","休闲时尚","百搭","情侣外套"]
const sloganLabels=[{"Keywords": "可拆", "Count": 47}, {"Keywords": "防水", "Count": 30}, {"Keywords": "好看", "Count": 29}, {"Keywords": "防雨", "Count": 28}, {"Keywords": "经典", "Count": 23}, {"Keywords": "百搭", "Count": 22}, {"Keywords": "便宜", "Count": 22}, {"Keywords": "防风", "Count": 20}, {"Keywords": "同款", "Count": 20}, {"Keywords": "运动", "Count": 19}, {"Keywords": "简约", "Count": 19}, {"Keywords": "吸汗", "Count": 17}, {"Keywords": "情侣", "Count": 17}, {"Keywords": "正品", "Count": 16}, {"Keywords": "舒适", "Count": 15}, {"Keywords": "透气", "Count": 15}, {"Keywords": "高档", "Count": 14}, {"Keywords": "易打理", "Count": 13}, {"Keywords": "防晒", "Count": 11}, {"Keywords": "户外", "Count": 11}, {"Keywords": "流行", "Count": 11}, {"Keywords": "一年四季都可以穿", "Count": 9}, {"Keywords": "防污", "Count": 9}, {"Keywords": "保温", "Count": 9}, {"Keywords": "高级", "Count": 9}, {"Keywords": "小朋友", "Count": 6}, {"Keywords": "不勾丝", "Count": 5}, {"Keywords": "不起球", "Count": 5}, {"Keywords": "挺括", "Count": 4}, {"Keywords": "自然", "Count": 2}, {"Keywords": "少女感", "Count": 1}, {"Keywords": "减龄", "Count": 1}];
const commentLabels=[{"Keywords":"值得信赖", "Count": 44},
{"Keywords":"实惠", "Count": 35},
{"Keywords":"便宜", "Count": 28},
{"Keywords":"耐看", "Count": 21},
{"Keywords":"物超所值", "Count": 13},
{"Keywords":"物美价廉", "Count": 12},
{"Keywords":"建议买", "Count": 5},
{"Keywords":"被骗", "Count": 3},
{"Keywords":"懒得换", "Count": 2}];
const propertiesLabels=[{"id": "1687", "name": "品牌", "msg": "PAULSOUPWILLY/保罗汤威羊"}, {"id": "241", "name": "厚度", "msg": "常规款"}, {"id": "784", "name": "里料材质", "msg": "聚酯纤维（涤纶）"}, {"id": "1577", "name": "适用性别", "msg": "通用"}, {"id": "1825", "name": "服饰工艺", "msg": "免烫"}, {"id": "4495", "name": "组合件数", "msg": "单件"}, {"id": "785", "name": "面料材质", "msg": "聚酯纤维100%"}, {"id": "2199", "name": "适用对象", "msg": "通用"}, {"id": "3035", "name": "袖型", "msg": "收口袖"}, {"id": "1209", "name": "基础风格", "msg": "青春流行"}, {"id": "1869", "name": "图案", "msg": "纯色"}, {"id": "1896", "name": "衣长", "msg": "常规款"}, {"id": "820", "name": "服装口袋样式", "msg": "侧缝插袋"}, {"id": "1714", "name": "适用场景", "msg": "休闲"}, {"id": "2909", "name": "下摆设计", "msg": "直下摆"}, {"id": "810", "name": "功能", "msg": "不起球"}, {"id": "714", "name": "袖长", "msg": "长袖"}, {"id": "680", "name": "上市时间", "msg": "2023"}, {"id": "2549", "name": "里料材质成分含量", "msg": "95%及以上"}, {"id": "3171", "name": "货号", "msg": "1256961"}]
const hotLabels=[{"hit":false,"count":1,"label":"户外机能"},
  {"hit":false,"count":4,"label":"外套"},
  {"hit":false,"count":6,"label":"休闲"},
  {"hit":false,"count":1,"label":"休闲宽松"},
  {"hit":false,"count":4,"label":"连帽"},
  {"hit":false,"count":1,"label":"户外情侣休闲外套夹克"},
  {"hit":false,"count":2,"label":"外套男"},
  {"hit":false,"count":1,"label":"全压胶"},
  {"hit":true,"count":1,"label":"保罗"},
  {"hit":false,"count":2,"label":"nomo"},
  {"hit":false,"count":1,"label":"商务"},
  {"hit":false,"count":4,"label":"立领"},
  {"hit":false,"count":1,"label":"五防"},
  {"hit":true,"count":1,"label":"可拆卸帽"},
  {"hit":false,"count":1,"label":"通勤"},
  {"hit":false,"count":1,"label":"落肩"},
  {"hit":false,"count":1,"label":"6868"},
  {"hit":false,"count":1,"label":"夹克衫"},
  {"hit":false,"count":1,"label":"静奢极简"},
  {"hit":false,"count":1,"label":"薄款"},
  {"hit":false,"count":1,"label":"拔印格纹"},
  {"hit":false,"count":1,"label":"行政夹克衫"},
  {"hit":false,"count":1,"label":"杉杉"},
  {"hit":false,"count":1,"label":"草莓熊2.0"},
  {"hit":false,"count":1,"label":"黄亦玫同款"},
  {"hit":false,"count":1,"label":"男士外套"},
  {"hit":false,"count":1,"label":"春秋款"},
  {"hit":false,"count":6,"label":"夹克"},
  {"hit":false,"count":1,"label":"中年男士"},
  {"hit":false,"count":1,"label":"三防"},
  {"hit":false,"count":1,"label":"连帽夹克"},
  {"hit":false,"count":1,"label":"新潮男装"},
  {"hit":false,"count":2,"label":"秋季新款"},
  {"hit":false,"count":1,"label":"小饼干专属"},
  {"hit":false,"count":2,"label":"春秋"},
  {"hit":false,"count":3,"label":"秋冬"},
  {"hit":false,"count":1,"label":"四代寒锋"},
  {"hit":false,"count":1,"label":"美式"},
  {"hit":false,"count":1,"label":"防水"},
  {"hit":true,"count":1,"label":"防风外套"},
  {"hit":false,"count":2,"label":"春秋季"},
  {"hit":false,"count":1,"label":"保暖"},{"hit":false,"count":1,"label":"轻奢"},
  {"hit":false,"count":3,"label":"商务休闲"},{"hit":false,"count":1,"label":"日常百搭"},
  {"hit":true,"count":8,"label":"百搭"},{"hit":false,"count":1,"label":"水洗牛仔衬衫"},
  {"hit":false,"count":1,"label":"FIRS"},{"hit":false,"count":1,"label":"双面穿"},
  {"hit":false,"count":1,"label":"AK192201"},{"hit":false,"count":1,"label":"双拉链"},
  {"hit":false,"count":1,"label":"衬衣"},{"hit":false,"count":1,"label":"罗蒙时尚"},
  {"hit":false,"count":1,"label":"五防牛奶丝"},{"hit":false,"count":3,"label":"宽松"},
  {"hit":false,"count":5,"label":"男女同款"},{"hit":false,"count":1,"label":"户外百搭"},
  {"hit":false,"count":2,"label":"情侣"},{"hit":false,"count":1,"label":"外贸品质"},
  {"hit":false,"count":2,"label":"软壳"},{"hit":false,"count":1,"label":"复古休闲"},
  {"hit":false,"count":1,"label":"新款"},{"hit":false,"count":2,"label":"经典"},
  {"hit":false,"count":1,"label":"弹力"},{"hit":false,"count":1,"label":"潮牌"}
  ,{"hit":true,"count":1,"label":"休闲时尚"},{"hit":false,"count":1,"label":"战术软壳"},
  {"hit":false,"count":1,"label":"高档"},{"hit":false,"count":4,"label":"男士"},
  {"hit":false,"count":1,"label":"6305"},{"hit":false,"count":2,"label":"潮流"},
  {"hit":false,"count":1,"label":"LT硬壳冲锋衣"},{"hit":false,"count":1,"label":"流行时尚设计"},
  {"hit":false,"count":1,"label":"编织牛仔"},{"hit":false,"count":1,"label":"西博"},
  {"hit":false,"count":1,"label":"纯色"},{"hit":true,"count":3,"label":"冲锋衣"},
  {"hit":false,"count":1,"label":"HS-24188"},{"hit":false,"count":3,"label":"户外"},
  {"hit":false,"count":1,"label":"牛仔外套"},{"hit":false,"count":1,"label":"春款"},
  {"hit":false,"count":1,"label":"时尚潮流"},{"hit":false,"count":1,"label":"TPL-8826"},
  {"hit":false,"count":1,"label":"男外套"},{"hit":false,"count":1,"label":"立体裁剪"},
  {"hit":false,"count":1,"label":"三防外套"},{"hit":false,"count":1,"label":"服装外套"},
  {"hit":false,"count":1,"label":"做旧"},{"hit":false,"count":1,"label":"皮尔卡丹"},
  {"hit":true,"count":2,"label":"情侣外套"},{"hit":false,"count":3,"label":"防风"},
  {"hit":false,"count":1,"label":"户外运动"},{"hit":false,"count":2,"label":"查尔斯桃心"},
  {"hit":false,"count":1,"label":"薄棉"},{"hit":false,"count":2,"label":"冲锋夹克"},
  {"hit":false,"count":1,"label":"茄克"},{"hit":false,"count":1,"label":"复古水洗"},
  {"hit":false,"count":1,"label":"HUMBLESTONE"},{"hit":false,"count":1,"label":"迷彩夹克"},
  {"hit":false,"count":2,"label":"时尚"},{"hit":false,"count":1,"label":"秋夹克"},
  {"hit":false,"count":1,"label":"三合一"},{"hit":false,"count":1,"label":"休闲商务"},
  {"hit":false,"count":1,"label":"龙牙"},{"hit":false,"count":1,"label":"透气"},
  {"hit":false,"count":2,"label":"情侣款"},{"hit":false,"count":2,"label":"秋季"},
  {"hit":false,"count":1,"label":"奥康"},{"hit":false,"count":4,"label":"翻领"},
  {"hit":false,"count":1,"label":"6618"},{"hit":false,"count":1,"label":"无缝压胶"}];
const sortedLabels=hotLabels.sort((a,b)=>b.count-a.count).map(item=>({text:item.hit?item.label+"-"+item.count:item.label,value:item.count,hit:item.hit}));
console.log("sortedLabels:",sortedLabels,hotLabels);
const MainLabels=({m})=>{
  return(<div style={{marginLeft:"5em"}}>
    {m.map((label: any, idx: string)=>(<Tag color={"black"} key={"main-"+idx} >{label}</Tag>))}
    </div>)
}
const SloganLabels=({s})=>(<>
    {sloganLabels.map((slogan,idx) => (<Tag color={"blue"} key={"slogan-"+idx}>
      <b>{slogan.Keywords}</b>&nbsp;{slogan.Count}</Tag>) )}
      </>)
const CommentLabels=({c})=>{
  return(<>
  {c.map((label,idx)=> (<Tag color={"blue"} key={"comment-"+idx} >{label.Keywords}&nbsp;{label.Count}</Tag>))}
  </>)
}
const PropertiesLabels=({p})=> {
  return (<>
    {p.map((pe,idx) => (<Tag color={"blue"} key={"prop-"+idx}><b>{pe.name}</b>:&nbsp;{pe.msg}</Tag>))}
  </>)
}
const CustomLabels=({cl,type})=> {
  return (<>
    {cl.map((cli,idx) => (<Tag closable={true} color={type===0?"purple":"success"} key={"custom"+type+"-"+idx}><b>{(type===0?"":idx+1+".")+cli}</b></Tag>))}
  </>)
}



const HotWordCloud = () => {
  const config = {
    paddingTop: 0,
    height: 310,
    data: {
      type: 'inline',
      value: sortedLabels,
    },
/*    encode:{
      color : (d: { hit: any; count: any; label: any; })=>{
        console.log(d.hit?"red":"green",d.count,d.label);
        // return d.hit?"Red":"Green"
        return d.hit?"red":"green"
      },
      text:(d)=>{
        console.log(d,d.label+"-"+d.count);
        return d.label+"-"+d.count},
      fontSize : (d: { count: number })=>d.count*5>40?40:(d.count*5+4),
      // fontsize: [5,50]
    },*/
    encode:{
      color:'text',
    },
    layout: {
      spiral: 'archimedean',
      nodeAlign: 'center',
      nodePadding: 0.001,
    },
    interaction: {
      tooltip: false,
    }
  };
  return <WordCloud {...config} style={{marginTop:"-20px",paddingTop:"0px"}} onReady={(chart)=>{
    chart.on(`wordCloud:click`,(ev: any)=>{
      console.log(ev)
    });
    // chart.wordCloud().layout({fontSize:[20,100]})
  }} />;
};
const TrendWordCloud = () => {
  const config = {
    paddingTop: 0,
    height: 310,
    data: {
      type: 'inline',
      value: sloganLabels,
    },
    encode:{
      color : (d: { hit: any; count: any; })=>{
        console.log(d.hit?"red":"green",d.count);
        return d.hit?"red":"green"},
      text:'Keywords',
      fontSize : (d: { Count: number })=>d.Count/1.1>50?50:d.Count/1.1+6,
      // fontsize: [5,50]
    },
    layout: {
      spiral: 'rectangular',
      nodeAlign: 'center',
      nodePadding: 0.01,
    },
    interaction: {
      tooltip: false,
    }
  };
  return <WordCloud {...config} onReady={(chart)=>{
    chart.on(`wordCloud:click`,(ev: any)=>{
      console.log(ev)
    });
    // chart.wordCloud().layout({fontSize:[20,100]})
  }} />;
};

/**
 * 每个单独的卡片，为了复用样式抽成了组件
 * @param param0
 * @returns
 */
/*const InfoCard: React.FC<{
  title: string;
  index: number;
  desc: string;
  href: string;
}> = ({ title, href, index, desc }) => {
  const { useToken } = theme;

  const { token } = useToken();

  return (
    <div
      style={{
        backgroundColor: token.colorBgContainer,
        boxShadow: token.boxShadow,
        borderRadius: '8px',
        fontSize: '14px',
        color: token.colorTextSecondary,
        lineHeight: '22px',
        padding: '16px 19px',
        minWidth: '220px',
        flex: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            lineHeight: '22px',
            backgroundSize: '100%',
            textAlign: 'center',
            padding: '8px 16px 16px 12px',
            color: '#FFF',
            fontWeight: 'bold',
            backgroundImage:
              "url('https://gw.alipayobjects.com/zos/bmw-prod/daaf8d50-8e6d-4251-905d-676a24ddfa12.svg')",
          }}
        >
          {index}
        </div>
        <div
          style={{
            fontSize: '16px',
            color: token.colorText,
            paddingBottom: 8,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          fontSize: '14px',
          color: token.colorTextSecondary,
          textAlign: 'justify',
          lineHeight: '22px',
          marginBottom: 8,
        }}
      >
        {desc}
      </div>
      <a href={href} target="_blank" rel="noreferrer">
        了解更多 {'>'}
      </a>
    </div>
  );
};*/

const Welcome: React.FC = () => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');
  const [customLabels,setCustomLabels]=React.useState(["夏季潮流延续","猫耳设计"]);
  const [inputValue, setInputValue] = React.useState('');
  const [customAdvices,setCustomAdvices]=React.useState(["达人直播销售占比很大","销量主要来自：巴图&博古带货直播","直播标题体现买一送一"]);
  const [inputAdviceValue, setInputAdviceValue] = React.useState('');
  /*const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const handleChange = (tag: string, checked: boolean) => {
    const nextSelectedTags = checked ? [...selectedTags, tag] : selectedTags.filter(t => t !== tag);
    console.log('You are interested in: ', nextSelectedTags);
    setSelectedTags(nextSelectedTags);
  };*/

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleButtonClick = () => {
    // alert('Input value: ' + inputValue);
    setCustomLabels([
      inputValue,
      ...customLabels
    ])
    setInputValue("")
  };
  const handleInputAdviceChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
    setInputAdviceValue(e.target.value);
  };

  const handleAdviceButtonClick = () => {
    // alert('Input value: ' + inputAdviceValue);
    setCustomAdvices([
      ...customAdvices,
      inputAdviceValue
    ]);
    setInputAdviceValue("");
  };


  // @ts-ignore
  // @ts-ignore
  return (
    <PageContainer breadcrumb={{}}>
      <Card
        style={{
          marginTop: "-10px",
          borderRadius: 8,
          minHeight: "1000px"
        }}
        bodyStyle={{
          backgroundImage:
            initialState?.settings?.navTheme === 'realDark'
              ? 'background-image: linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
              : 'background-image: linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
        }}
      >
        <div
          style={{
            marginTop: '-1em',
            marginBottom: '10px',
            fontFamily: '微软雅黑',
            fontSize: '24px',
            fontWeight: 'bold',
            color: token.colorTextHeading,
          }}
        >
          2024保罗防风外套冲锋衣可拆卸帽休闲时尚百搭情侣外套1256
        </div>
        <div
          style={{
            minHeight: "1200px",
            backgroundPosition: '100% -30%',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '274px auto',
            /*backgroundImage:
              "url('https://gw.alipayobjects.com/mdn/rms_a9745b/afts/img/A*BuFmQqsB2iAAAAAAAAAAAAAAARQnAQ')",*/
          }
          }
        >
          <Row>
            <Col span={10} style={{paddingRight:"10px"}}>
              <Row justify="center" align="middle">
                <Col>
                  <Image
                    style={{display: 'block', margin: '0 auto'}}
                    width={300}
                    src="https://p3-item.ecombdimg.com/img/ecom-shop-material/NelQbiMc_m_2cde361a7ea4ab34afa361ee60a75263_sx_262248_www800-800~tplv-5mmsx3fupr-resize_q:1080:1080:q90.webp"
                  />
                </Col>
              </Row>
              <Row>
                <Divider orientation="left" style={{fontWeight: "bolder",fontSize:"1.1em"}}>主标签</Divider>
                <div>
                  <MainLabels m={mainLabels}  />
                </div>
                <Card title="商品辅助标签" style={{width: "100%", marginTop: "15px",fontSize:"0.9em"}}>
                  <Divider orientation="left">宣传卖点标签</Divider>
                  <div>
                   <SloganLabels s={sloganLabels} />
                   {/*sloganLabels.map((slogan, idx)=>
                      (<CheckableTag color={"blue"} key={"slogan-"+idx}
                                     checked={selectedTags.indexOf(slogan) > -1}
                                     onChange={(checked: boolean) => handleChange(slogan, checked)}>
                        <b>{slogan.Keywords}</b>&nbsp;{slogan.Count}
                      </CheckableTag>) )
                    }*/}
                  </div>
                  <Divider orientation="left">商品评价标签</Divider>
                  <div>
                    <CommentLabels c={commentLabels}/>
                  </div>
                  <Divider orientation="left">商品属性标签</Divider>
                  <div>
                    <PropertiesLabels p={propertiesLabels}/>
                  </div>
                </Card>
              </Row>
            </Col>
            <Col span={14} style={{paddingRight:"0px",paddingLeft:"15px",marginTop:"-15px"}}>
              <Row>
              <Col span={7}>
                <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Brown"}}>
                  品类热点标签
                </Divider>
              </Col>
              <Col span={9}>
                <div style={{marginLeft:"1em",marginTop:"1.5em",fontWeight:"bolder",color:"black"}}>
                  周：2024W35 服装-男装-夹克 品类 TOP3
                </div>
              </Col>
              </Row>
              <Row><HotWordCloud /></Row>
              <Row>
                <Col span={7}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Green"}}>
                    环比高增趋势标签
                  </Divider>
                </Col>
                <Col span={9}>
                  <div style={{marginLeft:"1em",marginTop:"1.5em",fontWeight:"bolder",color:"black"}}>
                    周：2024W35 服装-男装-夹克 品类 趋势TOP 5
                  </div>
                </Col>
              </Row>
              <Row><TrendWordCloud/></Row>
              <Row>
                <Col span={8}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Black"}}>
                    选品师自荐标签
                  </Divider>
                </Col>
                <Col span={6}>
                  <Input.Group compact style={{marginTop:"1em",marginLeft:"2em"}}>
                    <Input key="ip1" style={{ width: 'calc(100% - 100px)'}}
                           value={inputValue} onChange={handleInputChange}/>
                    <Button type="dashed" onClick={handleButtonClick}>提交</Button>
                  </Input.Group>
                </Col>
              </Row>
              <Row >
                {/*<Tag closable color="purple" style={{marginTop:"1em",marginLeft:"4em"}}>
                  夏季潮流延续
                </Tag>*/}
                <CustomLabels cl={customLabels} type={0} key={"cl1"}/>
              </Row>
              <Row>
                <Col span={8}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Black"}}>
                    选品师运营建议
                  </Divider>
                </Col>
                <Col span={15}>
                  <Input.Group compact style={{marginTop:"1em",marginLeft:"2em"}}>
                    <Input key="ip2" style={{ width: 'calc(100% - 100px)'}}
                           value={inputAdviceValue} onChange={handleInputAdviceChange}/>
                    <Button type="dashed" onClick={handleAdviceButtonClick}>运营建议</Button>
                  </Input.Group>
                </Col>
              </Row>
              <Row >
                {/*<Tag closable color="purple" style={{marginTop:"1em",marginLeft:"4em"}}>
                  夏季潮流延续
                </Tag>*/}
                <CustomLabels cl={customAdvices} type={1} key={"cl1"}/>
              </Row>
            </Col>
          </Row>


        </div>
      </Card>
    </PageContainer>
  );
};

export default Welcome;
