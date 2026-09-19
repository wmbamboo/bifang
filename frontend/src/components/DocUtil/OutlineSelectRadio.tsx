import {Radio, Input, RadioChangeEvent, Row, Tag, Col, Divider, Tooltip, message} from 'antd';
import React, {useEffect, useState} from "react";
import OutlineRec, {outlineType} from "@/components/DocUtil/OutlineStore";
import {CloudDownloadOutlined, DeleteTwoTone} from "@ant-design/icons";

interface OutlineRadioProps {
  outlineType:outlineType;
  outlineRecs: OutlineRec[];
  outlineSelectFn: (id:string)=>void;
  outlineDeleteFn?: (id:string)=>void;
  /** 有值且在列表中时选中并滚到这一条，否则选中第一条 */
  focusId?: string;
}
function downloadTextFile(type:outlineType,outlineContent: string, outlineName: string) {
  const blob = new Blob([outlineContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outlineName+".md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const  OutlineSelectRadio:React.FC<OutlineRadioProps> =(props:OutlineRadioProps)=>{
  // const [olRecs, setOlRecs] = useState<OutlineRec[]>(props.outlineRecs);
  // 检查 outlineRecs 是否存在且不为空数组，以及第一个元素是否存在 outlineId 属性
  const initialValue = props.outlineRecs.length > 0 && props.outlineRecs[0]?.outlineId ? props.outlineRecs[0].outlineId : '';
  const [value, setValue] = useState<string>(initialValue);
  const onDelOutline=(id:string)=>{
    if (props.outlineDeleteFn){
      props.outlineDeleteFn(id);
      const tempRecs=props.outlineRecs.filter(o=>o.outlineId!==id);
      const initValue=tempRecs.length > 0 && tempRecs[0]?.outlineId ? tempRecs[0].outlineId : '';
      setValue(initValue)
    }
  }
  const onChange = (e:RadioChangeEvent) => {
    // message.info('radio checked', e.target.value);
    // message.info(e.target.value);
    setValue(e.target.value);
    props.outlineSelectFn(e.target.value);
  };

  const radioStyle = {
      display: 'block',
      height: '1.6em',
      lineHeight: '1.5em',
      verticalAlign: 'middle',
      fontSize: '1.3em',
      marginTop: '0.2em',
    };
  const showName=(name:string)=>{
    if (name.length>20){
      return name.substring(0,20)+"...";
    }else{
      return name;
    }
  }

  useEffect(() => {
    const hit = props.focusId && props.outlineRecs.some((r) => r.outlineId === props.focusId);
    const next = hit
      ? props.focusId!
      : (props.outlineRecs.length > 0 && props.outlineRecs[0]?.outlineId ? props.outlineRecs[0].outlineId : "");
    setValue(next);
    if (!next) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`outline-rec-${next}`)?.scrollIntoView({ block: 'center' });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [props.outlineRecs, props.focusId]);

    return (
      <Radio.Group onChange={onChange} value={value} style={{width:"98%"}}>
        {props.outlineRecs.map((item, i) => (
          <Row key={item.outlineId} id={`outline-rec-${item.outlineId}`} style={{ borderBottom: '1px solid #000',paddingBottom:"5px"  }}>
            <Col span={20}>
              <Radio key={item.outlineId} style={radioStyle} value={item.outlineId}>
                <Tag color="blue">{i + 1}</Tag> <Tooltip title={`${item.outlineId}`}>{showName(item.outlineName)}</Tooltip>
              </Radio>
            </Col>
            {(value===item.outlineId)&&
              <Col span={4}>
                <DeleteTwoTone style={{fontSize:"x-large"}} id={`del_+${i}`}
                               onClick={()=>{
                                 onDelOutline(item.outlineId!)
                               }}/>
                <CloudDownloadOutlined style={{marginLeft:"10px", marginTop:"10px", fontSize:"x-large", color:"#2998ff"}}
                                       id={`download_+${i}`}
                                       onClick={()=>
                                         downloadTextFile(props.outlineType,item.outlineContent,item.outlineName)
                                        }
                />
              </Col>
            }
          </Row>))}
      </Radio.Group>
    );

}

export default OutlineSelectRadio;
