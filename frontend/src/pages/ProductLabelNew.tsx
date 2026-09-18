import {PageContainer} from '@ant-design/pro-components';
import {useModel} from '@umijs/max';
import {Button, Card, Col, Divider, Image, Input, message, Row, Tag, theme, Typography} from 'antd';
import React, {useEffect} from 'react';
import {WordCloud} from '@ant-design/charts';
// import { RotateCwOutlined } from '@ant-design/icons';
import {useSearchParams} from 'react-router-dom';
// import {Label} from "@antv/g6";
const { Text } = Typography;
const { TextArea } = Input;

function isJSON(value: any): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch (e) {
    return false;
  }
}
function replaceEscapeQuotes(str: string): string {
  // 使用正则表达式匹配所有的 \" 并替换为 "
  return str.replace(/\\\"/g, "'");
}
type MyLabel=string;
const mainLabels:MyLabel[]=["Gap","男女装","2024秋季","新款","碳素磨毛","字母logo","连帽","抓绒","卫衣"]
interface SloganLabel{
  Keywords: string;
  Count: number;
}
const mainLabelsConverter=(result:string)=>{
  const mainLabels:MyLabel[]=result.split(",")
  return mainLabels;
}
const sloganLabels:SloganLabel[]=[{"Keywords": "撞色字母", "Count": 47}, {"Keywords": "耐穿耐洗", "Count": 30}, {"Keywords": "透气不闷", "Count": 29}, {"Keywords": "细腻顺滑", "Count": 28}, {"Keywords": "棉柔表层", "Count": 23}, {"Keywords": "抓绒内里", "Count": 22}, {"Keywords": "美式", "Count": 22}, {"Keywords": "经典卫衣", "Count": 20}, {"Keywords": "重磅", "Count": 20}, {"Keywords": "质感", "Count": 19}, {"Keywords": "松弛感", "Count": 19}, {"Keywords": "自在无束", "Count": 17}];
interface CommentLabel{
  Keywords: string;
  Count: number;
}
const sloganLabelsConverter = (result:SloganLabel[])=>{
  return result;
}
const commentLabels:CommentLabel[]=[{"Keywords":"回购", "Count": 8},
{"Keywords":"实惠", "Count": 6},
{"Keywords":"推荐", "Count": 5},
{"Keywords":"划算", "Count": 4},
{"Keywords":"值得信赖", "Count": 3},
{"Keywords":"下次再来", "Count": 2},
{"Keywords":"掉色", "Count": 1},
{"Keywords":"精美", "Count": 1},
{"Keywords":"送货快", "Count": 1}];
interface CommentLabelResult{
  text:string, //有用
  typeCount:number,
}
const commentLabelsConverter=(result: string )=>{
  if (result.length<1)  return []
  const resultArray=JSON.parse(result);
  let res:CommentLabel[];
  console.log(result);
  res=resultArray.map((r: { text: any; typeCount: any; })=>({
    Keywords:r.text,
    Count:r.typeCount,
  }))
  return res;
}
interface PropertyLabel{
  id: string;
  name: string;
  msg: string;
}
const propertyLabels:PropertyLabel[]=[{"id": "1687", "name": "品牌", "msg": "Gap"}, {"id": "241", "name": "厚度", "msg": "常规款"}, {"id": "1766", "name": "流行元素", "msg": "印花"}, {"id": "3059", "name": "服装版型", "msg": "宽松型"}, {"id": "2592", "name": "风格", "msg": "青春流行"}, {"id": "1869", "name": "图案", "msg": "字母"}, {"id": "785", "name": "面料材质", "msg": "聚酯纤维52%，棉48%"}, {"id": "1343", "name": "适用季节", "msg": "秋季"}, {"id": "1714", "name": "适用场景", "msg": "休闲"}, {"id": "1825", "name": "服饰工艺", "msg": "印花"}, {"id": "2199", "name": "适用对象", "msg": "青年"}, {"id": "1829", "name": "领型", "msg": "连帽"}, {"id": "2903", "name": "款式", "msg": "开衫款"}, {"id": "3171", "name": "货号", "msg": "609115"}, {"id": "714", "name": "袖长", "msg": "长袖"}]
interface PropertyLabelResult{
  typeId:string,
  text:string,   //印花
  type:string,  //流行元素
  typeCount:number,
  hit:number,
}
const propertyLabelsConverter=(result:string)=>{
  if (result.length<1)  return []
  const resultArray=JSON.parse(result);
  let res:PropertyLabel[];
  res=resultArray.map((r: { type: any; text: any; })=>({
    id:"",
    name:r.type,
    msg:r.text
  }))
  return res;
}

interface FakeHotLabel{
  hit:boolean;
  count:number;
  label:string;
}
const hotLabels:FakeHotLabel[]=[{"hit":false,"count":1,"label":"口袋"},{"hit":false,"count":1,"label":"TandFirst"},{"hit":false,"count":2,"label":"外套"},{"hit":false,"count":5,"label":"休闲"},{"hit":true,"count":5,"label":"连帽"},{"hit":false,"count":1,"label":"早秋"},{"hit":false,"count":1,"label":"高品质"},{"hit":false,"count":1,"label":"重工刺绣"},{"hit":false,"count":2,"label":"男女"},{"hit":false,"count":1,"label":"609115"},{"hit":false,"count":1,"label":"立领"},{"hit":false,"count":1,"label":"重磅花卉藤蔓刺绣"},{"hit":false,"count":1,"label":"简约"},{"hit":false,"count":1,"label":"薄款"},{"hit":false,"count":1,"label":"秋季上衣"},{"hit":false,"count":1,"label":"皮绣工艺"},{"hit":false,"count":3,"label":"加绒"},{"hit":false,"count":1,"label":"夹克"},{"hit":false,"count":1,"label":"抓绒立领"},{"hit":false,"count":1,"label":"内搭"},{"hit":true,"count":1,"label":"碳素磨毛"},{"hit":false,"count":3,"label":"秋季新款"},{"hit":false,"count":1,"label":"轻奢柔"},{"hit":false,"count":2,"label":"春秋"},{"hit":false,"count":9,"label":"圆领"},{"hit":false,"count":1,"label":"男士卫衣"},{"hit":false,"count":2,"label":"美式"},{"hit":false,"count":1,"label":"秋冬"},{"hit":false,"count":1,"label":"万物崛起"},{"hit":false,"count":1,"label":"蓝白"},{"hit":true,"count":10,"label":"卫衣"},{"hit":false,"count":3,"label":"春秋季"},{"hit":false,"count":1,"label":"服装"},{"hit":false,"count":2,"label":"秋装"},{"hit":false,"count":1,"label":"轻奢"},{"hit":false,"count":1,"label":"半拉链"},{"hit":false,"count":1,"label":"保罗银都"},{"hit":false,"count":4,"label":"百搭"},{"hit":false,"count":7,"label":"宽松"},{"hit":false,"count":1,"label":"Achock官方店"},{"hit":false,"count":1,"label":"男女同款"},{"hit":false,"count":1,"label":"高街"},{"hit":false,"count":1,"label":"青年"},{"hit":false,"count":2,"label":"买一送一"},{"hit":false,"count":1,"label":"情侣"},{"hit":false,"count":5,"label":"打底衫"},{"hit":false,"count":1,"label":"轻薄"},{"hit":false,"count":1,"label":"男薄款"},{"hit":false,"count":1,"label":"运动休闲"},{"hit":false,"count":1,"label":"打底小衫"},{"hit":true,"count":7,"label":"新款"},{"hit":false,"count":1,"label":"重磅"},{"hit":false,"count":1,"label":"拼色款"},{"hit":false,"count":4,"label":"T恤"},{"hit":false,"count":3,"label":"上衣"},{"hit":false,"count":5,"label":"潮牌"},{"hit":true,"count":1,"label":"抓绒"},{"hit":false,"count":1,"label":"不简单"},{"hit":false,"count":1,"label":"开衫外套"},{"hit":false,"count":1,"label":"高档"},{"hit":false,"count":6,"label":"男士"},{"hit":false,"count":1,"label":"两件装"},{"hit":false,"count":2,"label":"潮流"},{"hit":false,"count":1,"label":"休闲情侣装"},{"hit":false,"count":1,"label":"纯色"},{"hit":false,"count":1,"label":"休闲运动"},{"hit":false,"count":1,"label":"卫衣外套"},{"hit":false,"count":1,"label":"大码"},{"hit":false,"count":1,"label":"薄荷曼波"},{"hit":false,"count":1,"label":"连帽外套"},{"hit":false,"count":1,"label":"长绒棉"},{"hit":false,"count":3,"label":"套头"},{"hit":true,"count":1,"label":"Gap"},{"hit":false,"count":1,"label":"男女生款"},{"hit":false,"count":2,"label":"鲨鱼嘴"},{"hit":true,"count":2,"label":"字母logo"},{"hit":false,"count":1,"label":"皮尔卡丹"},{"hit":false,"count":1,"label":"抱抱绒"},{"hit":false,"count":1,"label":"美式街头"},{"hit":false,"count":1,"label":"男上衣"},{"hit":false,"count":1,"label":"修身体恤"},{"hit":false,"count":1,"label":"新设计"},{"hit":false,"count":1,"label":"秋款"},{"hit":false,"count":1,"label":"印花卫衣外套"},{"hit":false,"count":8,"label":"长袖"},{"hit":true,"count":1,"label":"2024秋季"},{"hit":false,"count":4,"label":"时尚"},{"hit":false,"count":1,"label":"德文猫杜宾犬"},{"hit":false,"count":1,"label":"男款"},{"hit":true,"count":3,"label":"男女装"},{"hit":false,"count":1,"label":"品牌上新"},{"hit":false,"count":1,"label":"第3代"},{"hit":false,"count":2,"label":"透气"},{"hit":false,"count":1,"label":"纯棉"},{"hit":false,"count":1,"label":"抗皱"},{"hit":false,"count":5,"label":"秋季"},{"hit":false,"count":1,"label":"时尚宽松"}];
interface HotLabel{
  label:string;
  count:number;
  hit:boolean;
}
interface OutputLabel{
  text:string;
  value:number;
  hit:boolean;
}
// const sortedLabels:OutputLabel[]=hotLabels.sort((a,b)=>b.count-a.count).map(item=>({text:item.hit?item.label+"-"+item.count:item.label,value:item.count,hit:item.hit}));

interface HotLabelResult{
  typeId:string,
  type:string,   //印花
  typeCount:string,  //流行元素
  text:string,
  value:number,
  hit:boolean,
}
const hotLabelsConverter=(result:HotLabelResult[])=>{
  if (result.length<1)  return []
  let res:HotLabel[];
  res=result.map(r=>({
    label:r.text,
    count:r.value,
    hit:r.hit
  }))
  return res.sort((a,b)=>b.count-a.count).map(item=>({text:item.hit?item.label+"-"+item.count:item.label,value:item.count,hit:item.hit}));
}

interface TrendLabel{
  label:string,
  count:number,
  hit:boolean
}
const trendLabels:TrendLabel[]=[{"hit":false,"count":1,"label":"炒洗空气层"},{"hit":false,"count":1,"label":"秋装新款"},{"hit":false,"count":1,"label":"TandFirst"},{"hit":false,"count":3,"label":"外套"},{"hit":false,"count":1,"label":"儿童连帽衫"},{"hit":false,"count":4,"label":"休闲"},{"hit":false,"count":1,"label":"春秋季新款"},{"hit":true,"count":5,"label":"连帽"},{"hit":false,"count":1,"label":"男女"},{"hit":false,"count":1,"label":"立领"},{"hit":false,"count":1,"label":"洗标图案印花"},{"hit":false,"count":1,"label":"粉丝价"},{"hit":false,"count":1,"label":"简约"},{"hit":false,"count":3,"label":"薄款"},{"hit":false,"count":1,"label":"棒球服"},{"hit":false,"count":1,"label":"陈伟霆"},{"hit":false,"count":1,"label":"男"},{"hit":false,"count":1,"label":"休闲卫衣"},{"hit":false,"count":1,"label":"Romon"},{"hit":false,"count":1,"label":"加绒"},{"hit":false,"count":1,"label":"夹克"},{"hit":false,"count":1,"label":"抓绒立领"},{"hit":true,"count":2,"label":"碳素磨毛"},{"hit":false,"count":1,"label":"内搭"},{"hit":false,"count":1,"label":"卫T"},{"hit":false,"count":1,"label":"碳素软磨抓绒"},{"hit":false,"count":2,"label":"秋季新款"},{"hit":false,"count":1,"label":"雅鹿"},{"hit":false,"count":7,"label":"圆领"},{"hit":false,"count":1,"label":"印花"},{"hit":false,"count":1,"label":"男士卫衣"},{"hit":false,"count":1,"label":"印花设计"},{"hit":false,"count":1,"label":"美式"},{"hit":false,"count":3,"label":"秋冬"},{"hit":true,"count":13,"label":"卫衣"},{"hit":false,"count":2,"label":"春秋季"},{"hit":false,"count":1,"label":"法兰绒"},{"hit":false,"count":1,"label":"半拉链"},{"hit":false,"count":1,"label":"菠萝格"},{"hit":false,"count":6,"label":"百搭"},{"hit":false,"count":1,"label":"连帽卫衣"},{"hit":false,"count":1,"label":"夹克帽衫裤子"},{"hit":false,"count":1,"label":"美式休闲"},{"hit":false,"count":1,"label":"勇不可挡"},{"hit":false,"count":5,"label":"宽松"},{"hit":false,"count":1,"label":"高街"},{"hit":false,"count":1,"label":"青年"},{"hit":false,"count":1,"label":"买一送一"},{"hit":false,"count":2,"label":"情侣"},{"hit":false,"count":2,"label":"打底衫"},{"hit":false,"count":1,"label":"tshirt"},{"hit":false,"count":1,"label":"打底小衫"},{"hit":false,"count":1,"label":"毛圈"},{"hit":true,"count":5,"label":"新款"},{"hit":false,"count":1,"label":"龙年限定"},{"hit":false,"count":1,"label":"保罗悦洋"},{"hit":false,"count":1,"label":"总裁定制"},{"hit":false,"count":1,"label":"弹力"},{"hit":false,"count":1,"label":"609272"},{"hit":false,"count":1,"label":"男女童"},{"hit":false,"count":1,"label":"重磅"},{"hit":false,"count":1,"label":"拼色款"},{"hit":false,"count":1,"label":"基础"},{"hit":false,"count":2,"label":"T恤"},{"hit":false,"count":3,"label":"上衣"},{"hit":false,"count":5,"label":"2024秋季新款"},{"hit":true,"count":3,"label":"抓绒"},{"hit":false,"count":2,"label":"潮牌"},{"hit":false,"count":1,"label":"2024新款"},{"hit":false,"count":3,"label":"logo"},{"hit":false,"count":1,"label":"随机"},{"hit":false,"count":5,"label":"男士"},{"hit":false,"count":4,"label":"潮流"},{"hit":false,"count":1,"label":"F字母印花"},{"hit":false,"count":1,"label":"显瘦"},{"hit":false,"count":1,"label":"仿羊羔毛"},{"hit":false,"count":1,"label":"上衣宽松休闲薄款"},{"hit":false,"count":1,"label":"打底"},{"hit":false,"count":3,"label":"卫衣外套"},{"hit":false,"count":1,"label":"时尚经典"},{"hit":false,"count":1,"label":"大码"},{"hit":true,"count":7,"label":"Gap"},{"hit":false,"count":1,"label":"龙腾四海"},{"hit":false,"count":1,"label":"毛毡布logo"},{"hit":false,"count":1,"label":"贴皮绣工艺拼接口袋"},{"hit":false,"count":1,"label":"仿羊羔绒"},{"hit":true,"count":5,"label":"字母logo"},{"hit":false,"count":1,"label":"加绒外套"},{"hit":false,"count":1,"label":"皮尔卡丹"},{"hit":false,"count":1,"label":"联名款"},{"hit":false,"count":1,"label":"秋季新品"},{"hit":false,"count":1,"label":"遮肉"},{"hit":false,"count":1,"label":"抱抱绒"},{"hit":false,"count":1,"label":"男上衣"},{"hit":false,"count":1,"label":"福袋"},{"hit":false,"count":1,"label":"修身体恤"},{"hit":false,"count":1,"label":"刺绣"},{"hit":false,"count":6,"label":"长袖"},{"hit":true,"count":2,"label":"2024秋季"},{"hit":false,"count":2,"label":"时尚"},{"hit":false,"count":1,"label":"圆领长袖"},{"hit":false,"count":1,"label":"646082"},{"hit":true,"count":7,"label":"男女装"},{"hit":false,"count":3,"label":"秋季"},{"hit":false,"count":1,"label":"潮流时尚"},{"hit":false,"count":1,"label":"舒适弹力"},{"hit":false,"count":1,"label":"翻领"}];
const sortedTrendLabels=trendLabels.sort((a,b)=>b.count-a.count).map(item=>({text:item.hit?item.label+"-"+item.count:item.label,value:item.count,hit:item.hit}));
// console.log("sortedLabels:",sortedLabels,hotLabels);
console.log("sortedTrendLabels:",sortedTrendLabels,trendLabels);
interface TrendLabelResult{
  typeId:string,
  type:string,   //印花
  typeCount:string,  //流行元素
  text:string,
  value:number,
  hit:boolean,
}
const trendLabelsConverter=(result:TrendLabelResult[])=>{
  if (result.length<1)  return []
  let res:TrendLabel[]=new Array<TrendLabel>(result.length);
  res=result.map((r)=>({
    label:r.text,
    count:r.value,
    hit:r.hit
  }))
/*  for(let r of result){
    res.push({label:r.text,count:r.value,hit:r.hit})
  }*/
  return res.sort((a,b)=>b.count-a.count).map(item=>({text:item.hit?item.label+"-"+item.count:item.label,value:item.count,hit:item.hit}));
}


interface mainLabelsProps {
  m:MyLabel[];
}

const MainLabels=(props:mainLabelsProps)=>{
  return(<div style={{marginLeft:"5em"}}>
    {props.m.map((label: string, idx: number)=>(<Tag color={"black"} key={"main-"+idx} >{label}</Tag>))}
    </div>)
}
interface sloganLabelsProps{
  s:SloganLabel[];
}
const SloganLabels=(props:sloganLabelsProps)=>(<>
  {sloganLabels.map((slogan,idx) => (<Tag color={"blue"} key={"slogan-"+idx}>
    <b>{slogan.Keywords}</b>&nbsp;{slogan.Count}</Tag>) )}
</>)
interface commentLabelsProps{
  c:CommentLabel[];
}
const CommentLabels=(props:commentLabelsProps)=>{
  return(<>
  {props.c.map((label,idx)=> (<Tag color={"blue"} key={"comment-"+idx} >{label.Keywords}&nbsp;{label.Count}</Tag>))}
  </>)

}
interface PropetiesLabelsProps{
  p:PropertyLabel[],
}
const PropertiesLabels=(props:PropetiesLabelsProps)=> {
  return (<>
    {props.p.map((pe,idx) => (<Tag color={"blue"} key={"prop-"+idx}><b>{pe.name}</b>:&nbsp;{pe.msg}</Tag>))}
  </>)
}
const presetCustomLabels_init=["碳素亳毛",  "Gap",  "男女装",  "新款",]
interface CustomLabelsProps{
  cl:MyLabel[],
  type:number,
  presetCustomLabels:MyLabel[]
}
const CustomLabels=(props:CustomLabelsProps)=> {
  const {cl,type,presetCustomLabels}=props;
  return (<>
    {cl.map((clLabel,idx) => (<Tag closable={true} color={type===0?"purple":"success"} key={"custom"+type+"-"+idx}><b>{(type===0?"":idx+1+".")+clLabel}</b></Tag>))}
    {presetCustomLabels.map(r=>(
      <Tag color="cyan">{r}</Tag>
    ))}
  </>)
}
interface GoodsInfo{
  goodsTitle:string;
  imageUrl:string;
  periodType:string;
  period:string;
  cateFull:string;
}
const goodsInfo_init:GoodsInfo={
  imageUrl:"https://p3-item.ecombdimg.com/img/ecom-shop-material/VJnghxMc_m_42260fa765083faa1459bfde22c11818_sx_1752569_www1279-1279~tplv-5mmsx3fupr-resize_q:1080:1080:q90.webp",
  goodsTitle:"Gap男女装2024秋季新款碳素磨毛字母logo连帽抓绒卫衣609115",
  periodType:"周",
  period:"2024W38",
  cateFull:"服装-男装-卫衣",
}
const goodsInfoConverter=(GoodsInfo:GoodsInfo)=>{
  return {...GoodsInfo}
}

interface HotWordCloudProps {
  sortedLabels:OutputLabel[]
}
const HotWordCloud = (props:HotWordCloudProps) => {
  const config = {
    paddingTop: 0,
    height: 300,
    data: {
      type: 'inline',
      value: props.sortedLabels,
    },
    encode:{
      color: (d:OutputLabel)=>d.hit?'red':'blue',
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
      // console.log(ev)
    });
    // chart.wordCloud().layout({fontSize:[20,100]})
  }} />;
};
interface TrendWordCloudProps{
  sortedLabels:OutputLabel[]
}
const TrendWordCloud = (props:TrendWordCloudProps) => {
  const config = {
    paddingTop: 0,
    height: 300,
    data: {
      type: 'inline',
      value: props.sortedLabels,   //sloganLabels,
    },
    encode:{
      color:'text',
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
      // console.log(ev)
    });
    // chart.wordCloud().layout({fontSize:[20,100]})
  }} />;
};


const Welcome: React.FC = (props) => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');
  const [customLabels,setCustomLabels]=React.useState<MyLabel[]>([]);
  const [presetCustomLabels,setPresetCustomLabels]=React.useState<MyLabel[]>(presetCustomLabels_init);
  const [inputValue, setInputValue] = React.useState<string>("");
  const [goodsInfo,setGoodsInfo]=React.useState<GoodsInfo>(goodsInfo_init);
  const [mainLabels,setMainLabels]=React.useState<MyLabel[]>([]);
  const [sloganLabels,setSloganLabels]=React.useState<SloganLabel[]>([]);
  const [commentLabels,setCommentLabels]=React.useState<CommentLabel[]>([]);
  const [propertyLabels,setPropertyLabels]=React.useState<PropertyLabel[]>([]);
  const [hotLabels,setHotLabels]=React.useState<OutputLabel[]>([]);
  const [trendLabels,setTrendLabels]=React.useState<OutputLabel[]>([]);
/*  const [customAdvices,setCustomAdvices]=React.useState([]);
  const [inputAdviceValue, setInputAdviceValue] = React.useState('');*/
  const [sealHidden,setSealHidden]=React.useState(false);
  const [searchParams] = useSearchParams();
  // const requestParam = searchParams.get('goodsNo');
  const plat_chan:string = searchParams.get('plat_chan') ?? "抖音";
  const period_type:string = searchParams.get('period_type')?? "周";
  const period:string = searchParams.get('period')?? "2024W38";
  const cate_id:string  = searchParams.get('cate_id')?? "20189";
  const goods_id:string  = searchParams.get('goods_id')?? "3700111437239287948";
  // https://localhost:8000/welcome/productLabelNew?plat_chan=抖音&period_type=周&period=2024W38&cate_id=20189&goods_id=3700111437239287948
  // https://localhost:8000/welcome/productLabelNew?plat_chan=%E6%8A%96%E9%9F%B3&period_type=%E5%91%A8&period=2024W38&cate_id=20189&goods_id=3603810445200380635

  const fetchData=async (url:string,plat_chan:string="抖音",period_type="周",
                         period="2024W38",cate_id="20189",goods_id:string,dataKey:string,cb:(jsonData: string)=>void)=>{
    const baseUrl=process.env.bf_baseUrl+"/goods-labels-mgt/dyGooods/";
    let urlParam="?plat_chan="+plat_chan;
    urlParam+="&period_type="+period_type;
    urlParam+="&period="+period;
    urlParam+="&cate_id="+cate_id;
    urlParam+="&goods_id="+goods_id;
    const theUrl=baseUrl+url+urlParam;
    // console.log("hezl:--theUrl:"+theUrl);
    const response=await fetch(theUrl);
    // console.log("hezl:--response:"+response);
    const jsonRes=await response.json();
    // console.log("hezl:--jsonRes:"+jsonRes,JSON.stringify(jsonRes));
    if(!isJSON(jsonRes)){
      return
    }
    let dataRes;
    if(dataKey==="data"){
      dataRes=jsonRes.data;
    }else{
      dataRes=jsonRes.data[dataKey];
      dataRes=replaceEscapeQuotes(dataRes);
    }
    // console.log("hezl:----dataRes:"+dataRes)
    cb(dataRes)
    return dataRes
  }
  const cb4Labels=(type:string,data:any)=>{
    switch (type){
      case "goodsInfo":
        console.log("hezl:---goodsInfo:"+data);
        setGoodsInfo(goodsInfoConverter(data))
        break;
      case "mainLabel":
        const res=mainLabelsConverter(data)
        setMainLabels(res)
        if(res&&res.length>=6){
          setPresetCustomLabels(res.filter((value,index)=>{return index>=4&&index<=Math.min(6,res.length-1)}))
        }
        break;
      case "sloganLabel":
        const sloganLabels:SloganLabel[]=sloganLabelsConverter(data)
        setSloganLabels(sloganLabels)
      case "commentLabel":
        setCommentLabels(commentLabelsConverter(data).filter((value,index)=> {return index<=Math.min(70,data.length)}))
        break;
      case "propertyLabel":
        setPropertyLabels(propertyLabelsConverter(data))
        break;
      case "hotLabel":
        setHotLabels(hotLabelsConverter(data))
        break;
      case "trendLabel":
        setTrendLabels(trendLabelsConverter(data));
        break
      default:
        return;
    }
  }
  //获取取后端数据
  const getKbList = async () => {
    try {
      //主标签 mainLabel
      fetchData("getGoodsInfoDy",plat_chan,period_type,period,cate_id,goods_id,"data",
        // (d:string)=>cb4Labels("goodsTitle,imageUrl",d))
        (d:string)=>cb4Labels("goodsInfo",d))

      //主标签 mainLabel
      fetchData("queryGoodsLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"titleLabels",
        (d:string)=>cb4Labels("mainLabel",d))
      //卖点标签 sloganLabel
      fetchData("queryGoodsLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"sellLabelsFull",
        (d:string)=>cb4Labels("sloganLabel",d))
      //评价标签 commentLabel
      fetchData("queryGoodsLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"goodsCmtLabelsFull",
        (d:string)=>cb4Labels("commentLabel",d))
      //属性标签 propertyLabel
      fetchData("queryGoodsLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"prodArgs",
        (d:string)=>cb4Labels("propertyLabel",d))

      //热点标签 hotLabel
      fetchData("hotGoodsCateLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"data",
        (d:string)=>cb4Labels("hotLabel",d))
      //爆点趋势标签 trendLabel
      fetchData("desGoodsCateLabelsDy",plat_chan,period_type,period,cate_id,goods_id,"data",
        (d:string)=>cb4Labels("trendLabel",d))

    } catch (error) {
      message.error('加载数据失败');
    }
  };
  //模拟从后端获取数据
  useEffect(() => {
    // getKbList().then(r => );
    getKbList()
  }, []);

  // const initText="1、达人直播销售占比很大。\r\n2、销量主要来自：巴图&博古带货直播。\r\n3、直播标题体现买一送一。"
  const initText="";

  const handleInputChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
    if(e.target.value&& e.target.value.length>0){
      setInputValue(e.target.value);
    }
  };
  const handleButtonClick = () => {
    // alert('Input value: ' + inputValue);
    setCustomLabels([
      inputValue as MyLabel,
      ...customLabels
    ]);
    setInputValue("");
    // console.log(requestParam)
  };
  // const num=props.location.query.goodNo;
  /*const handleInputAdviceChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
    setInputAdviceValue(e.target.value);
  };
  const handleAdviceButtonClick = () => {
    // alert('Input value: ' + inputAdviceValue);
    setCustomAdvices([
      ...customAdvices,
      inputAdviceValue
    ]);
    setInputAdviceValue("");
  };*/
  const handleBloomButtonClick = () => {
    // alert('Input value: ' + inputAdviceValue);
    setSealHidden(false);
    // setInputAdviceValue("");
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
          {goodsInfo?.goodsTitle} <a href={`https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${goods_id}&origin_type=604`} target={"_blank"} style={{fontSize:"small"}}>原详情页</a>
        </div>
        <div
          style={{
            minHeight: "1200px",
            backgroundPosition: '100% -30%',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '274px auto',
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

                    src={goodsInfo?.imageUrl}
                  />
                  <Text hidden={sealHidden} style={{whiteSpace: 'nowrap',color:"red",fontSize:"xx-large",fontWeight:"bolder",transform:"rotate(-45deg)",transformOrigin: 'left',display: 'block',marginTop:'-20px',marginLeft: '250px', }}  keyboard>已选爆品</Text>
                </Col>
              </Row>
              <Row>
                <Col span={6} style={{marginLeft:"5em"}}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Black"}}>
                    推荐卖点
                  </Divider>
                </Col>
                <Col span={8} style={{marginLeft:"4em"}}>
                  <Input.Group compact style={{marginTop:"1em",marginLeft:"2em"}}>
                    <Input key="ip1" style={{ width: 'calc(100% - 100px)'}}
                           value={inputValue} onChange={handleInputChange}/>
                    <Button type="dashed" onClick={handleButtonClick}>荐标</Button>
                  </Input.Group>
                </Col>
                <Col span={4}>
                  <Input.Group compact style={{marginTop:"1em",marginLeft:"1em"}}>
                    <Button type="primary" onClick={handleBloomButtonClick} >选为爆品</Button>
                  </Input.Group>
                </Col>
              </Row>
              <Row >
                <Col span={15} style={{marginLeft:"6em"}}>
                  <CustomLabels cl={customLabels} type={0} key={"cl1"} presetCustomLabels={presetCustomLabels}/>
                </Col>
              </Row>
              <Row>
                <Divider orientation="left" style={{fontWeight: "bolder",fontSize:"1.1em"}}>主标签</Divider>
                <div>
                  <MainLabels m={mainLabels}  />
                </div>
                <Card title="商品辅助标签" style={{width: "100%", marginTop: "15px",fontSize:"0.9em"}}>
                  {/*<Divider orientation="left">宣传卖点标签</Divider>
                  <div>
                    <SloganLabels s={sloganLabels} />
                  </div>*/}
                  <Divider orientation="left">商品评价标签</Divider>
                  <div>
                    <CommentLabels c={commentLabels}/>
                  </div>
                  <Divider orientation="left">商品属性标签</Divider>
                  <div>
                    <PropertiesLabels p={propertyLabels}/>
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
                  {goodsInfo.periodType}：{goodsInfo.period} {goodsInfo.cateFull} 品类 TOP1
                </div>
              </Col>
              </Row>
              <Row><HotWordCloud sortedLabels={hotLabels} /></Row>
              <Row>
                <Col span={7}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Green"}}>
                    环比高增趋势标签
                  </Divider>
                </Col>
                <Col span={9}>
                  <div style={{marginLeft:"1em",marginTop:"1.5em",fontWeight:"bolder",color:"black"}}>
                    {goodsInfo.periodType}：{goodsInfo.period} {goodsInfo.cateFull} 品类趋势 TOP1
                  </div>
                </Col>
              </Row>
              <Row><TrendWordCloud sortedLabels={trendLabels}/></Row>

              <Row>
                <Col span={7}>
                  <Divider orientation="left" style={{width: "90%",margin:"0,0,0,0",fontWeight:"bolder",color:"Black"}}>
                    运营建议
                  </Divider>
                </Col>
              </Row>
              <Row >
                <TextArea rows={4}>{initText}</TextArea>
                <Input.Group compact style={{marginTop:"1em",marginLeft:"1em"}}>
                  <Button type="dashed">保存运营建议</Button>
                </Input.Group>
              </Row>
            </Col>
          </Row>


        </div>
      </Card>
    </PageContainer>
  );
};

export default Welcome;
