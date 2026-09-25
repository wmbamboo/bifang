import {Radio, Input, RadioChangeEvent, Row, Tag, Col, Tooltip, message, Space} from 'antd';
import React, {useEffect, useState} from "react";
import OutlineRec, {outlineType, outlineTypeAiPPT, outlineTypePPT} from "@/components/DocUtil/OutlineStore";
import {CloudDownloadOutlined, DeleteTwoTone, EditOutlined, CheckOutlined, CloseOutlined} from "@ant-design/icons";
import {Ppt} from "@/components/DocUtil/ViewItem4Ppt";
import {Doc} from "@/components/DocUtil/ViewItem4Doc";

interface OutlineRadioProps {
  outlineType:outlineType;
  outlineRecs: OutlineRec[];
  outlineSelectFn: (id:string)=>void;
  outlineDeleteFn?: (id:string)=>void;
  /** 改名成功后回传，便于父级刷新列表 */
  outlineRenameFn?: (id: string, name: string) => void;
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
  const initialValue = props.outlineRecs.length > 0 && props.outlineRecs[0]?.outlineId ? props.outlineRecs[0].outlineId : '';
  const [value, setValue] = useState<string>(initialValue);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const onDelOutline=(id:string)=>{
    if (props.outlineDeleteFn){
      props.outlineDeleteFn(id);
      const tempRecs=props.outlineRecs.filter(o=>o.outlineId!==id);
      const initValue=tempRecs.length > 0 && tempRecs[0]?.outlineId ? tempRecs[0].outlineId : '';
      setValue(initValue)
    }
  }

  const commitRename = (id: string) => {
    const name = editName.trim();
    if (!name) {
      message.warning('名称不能为空');
      return;
    }
    if (name.length > 40) {
      message.warning('名称请不超过 40 字');
      return;
    }
    if (!OutlineRec.renameById(props.outlineType, id, name)) {
      message.error('改名失败');
      return;
    }
    props.outlineRenameFn?.(id, name);
    setEditingId(null);
    message.success('已改名');
  };

  const onChange = (e:RadioChangeEvent) => {
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

  /** 与右侧树/解析器同一条链路：去掉 H1 后按 ## 计章 */
  const outlineBody = (content: string) => {
    const raw = (content || "").trim();
    if (/^#\s+(?!#)/.test(raw)) {
      return props.outlineType === outlineTypePPT || props.outlineType === outlineTypeAiPPT
        ? Ppt.getContentFromMsg(raw)
        : Doc.getContentFromMsg(raw);
    }
    return raw;
  };

  const chapterTitles = (content: string) => {
    if (props.outlineType === outlineTypePPT || props.outlineType === outlineTypeAiPPT) {
      return Ppt.getChaptersFromContent(outlineBody(content)).map((c) => c.title || "未命名章节");
    }
    return Doc.getChaptersFromContent(outlineBody(content)).map((c) => c.title || "未命名章节");
  };

  const chapterCount = (content: string) => chapterTitles(content).length;

  const chapterHint = (content: string) => {
    const titles = chapterTitles(content).slice(0, 4);
    return titles.length ? titles.join(" / ") : "无章节";
  };

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
            <Col span={18}>
              {editingId === item.outlineId ? (
                <Space.Compact style={{width: '100%', marginTop: 4}}>
                  <Input
                    size="small"
                    value={editName}
                    maxLength={40}
                    onChange={(e) => setEditName(e.target.value)}
                    onPressEnter={() => commitRename(item.outlineId!)}
                  />
                  <CheckOutlined
                    style={{fontSize: 18, color: '#1677ff', padding: '0 6px'}}
                    onClick={() => commitRename(item.outlineId!)}
                  />
                  <CloseOutlined
                    style={{fontSize: 18, color: '#999', padding: '0 6px'}}
                    onClick={() => setEditingId(null)}
                  />
                </Space.Compact>
              ) : (
                <Radio key={item.outlineId} style={radioStyle} value={item.outlineId}>
                  <Tag color="blue">{i + 1}</Tag>
                  <Tooltip title={`${chapterHint(item.outlineContent)}\nID: ${item.outlineId}`}>
                    {showName(item.outlineName)}
                  </Tooltip>
                  <Tag style={{marginLeft: 8}}>{chapterCount(item.outlineContent)} 章</Tag>
                </Radio>
              )}
            </Col>
            {(value===item.outlineId)&&
              <Col span={6} style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8}}>
                <EditOutlined
                  style={{fontSize: 'x-large', color: '#2998ff'}}
                  title="改名"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingId(item.outlineId!);
                    setEditName(item.outlineName || '');
                  }}
                />
                <DeleteTwoTone style={{fontSize:"x-large"}} id={`del_+${i}`}
                               onClick={()=>{
                                 onDelOutline(item.outlineId!)
                               }}/>
                <CloudDownloadOutlined style={{fontSize:"x-large", color:"#2998ff"}}
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
