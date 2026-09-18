import React, { useState } from 'react';
import {Button, Flex, Table, Radio, RadioChangeEvent, message, Modal} from 'antd';
import type { TableColumnsType, TableProps } from 'antd';
import OutlineRec, {
  outlineType,
  outlineTypeAiDOC,
 outlineTypes, updateIdOfOutlineRes
} from "@/components/DocUtil/OutlineStore";
import BifangDelModal from "@/components/DocUtil/BifangModal";
import {nanoid} from "nanoid";

updateIdOfOutlineRes();
type TableRowSelection<T extends object = object> = TableProps<T>['rowSelection'];
interface DataType {
  key: React.Key;
  outlineId: string;
  outlineName: string;
  outlineContent: string;
  init_format_Prompt: string;
  outline_source_kbName:string;
}
const cbDelFn=(outlineId:string,type?:outlineType)=>{
  if(outlineId==="ALL"){
    OutlineRec.clearAllStore();
    message.info("删除成功。")
  }else if(outlineId.length>0 && type) {
    // let res = OutlineRec.deleteById(outlineId, type);
    // if (res) {
    //   message.info("删除成功。")
    // } else {
    //   message.warning(`删除失败：${type},${outlineId}`)
    // }
  }
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


interface StoreTypeOptionProps{
  onTypeChange:(e: RadioChangeEvent) => void
}
const outlineType_init=outlineTypeAiDOC
const StoreTypeOption=(props:StoreTypeOptionProps)=>
  (<Radio.Group defaultValue={outlineType_init} size="large" onChange={props.onTypeChange }>
    {outlineTypes.map((t,i)=>(
            <Radio.Button key={i} value={""+t.value} >{t.name}</Radio.Button>))}
  </Radio.Group>)

const OutlineStoreManage: React.FC = () => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentOutlineType, setCurrentOutlineType] = useState<outlineType>(outlineType_init);
  const [oulineRecs, setOulineRecs] = useState<OutlineRec[]>(OutlineRec.listRecs(currentOutlineType));
  const [showConfirm, setShowConfirm] = useState(false);
  // const [outlineNameDeleted, setOutlineNameDeleted] = useState("");
  const [idWillDel, setIdWillDel] = useState<string>("");
  const [title,setTitle]=useState<string>("");
  const [description,setDescription]=useState<string>("");


  const confirmDelete = (outlineId:string,outlineName:string,type:outlineType) => {
    setTitle("删除确认");
    setDescription(`是否删除大纲：${outlineName}？`);
    setIdWillDel(outlineId);
    setShowConfirm(true);
  };
  const confirmClearStore=()=>{
    setTitle("删除确认");
    setDescription("是否清空所有类型的所有大纲？");
    setIdWillDel("ALL");
    setShowConfirm(true);
  }

  const start = () => {
    setLoading(true);
    // ajax request after empty completing
    setTimeout(() => {
      setSelectedRowKeys([]);
      setLoading(false);
    }, 1000);
  };

  const dataSource = oulineRecs.map<DataType>((_, i) => ({
    key: i,
    outlineId: _.outlineId?_.outlineId:"1",  //`${_.outlineId}`,
    outlineName: `${_.outlineName}`,
    outlineContent: _.outlineContent.length>100?`${_.outlineContent.substring(1,100)}...`:`${_.outlineContent}`,
    init_format_Prompt: `${_.init_format_Prompt}`,
    outline_source_kbName: `${_.outline_source_kbName}`,
  }));
  const columns: TableColumnsType<DataType> = [
    { title: '大纲ID', dataIndex: 'outlineId' ,width:60},
    { title: '大纲标题', dataIndex: 'outlineName',width:100 },
    { title: '大纲内容', dataIndex: 'outlineContent' },
    { title: '大纲知识库', dataIndex: 'outline_source_kbName',width:60 },
    {
      title: '删除',
      fixed: 'right',
      width: 90,
      render: (_,record) => <a key={"edit"+record.key} onClick={()=>confirmDelete(record.outlineId,record.outlineName,currentOutlineType)}>删除</a>,
    },
    {
      title: '下载',
      fixed: 'right',
      width: 90,
      render: (_,record) => <a key={"edit"+record.key} onClick={()=>downloadTextFile(currentOutlineType,record.outlineContent,record.outlineName)}>下载</a>,
    },
  ];
  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
    console.log('selectedRowKeys changed: ', newSelectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection: TableRowSelection<DataType> = {
    selectedRowKeys,
    onChange: onSelectChange,
  };
  const onTypeChange=({target:{value}}:RadioChangeEvent)=>{
    setCurrentOutlineType(value)
    setOulineRecs(OutlineRec.listRecs(value));
  };
  const hasSelected = selectedRowKeys.length > 0;

  return (
    <Flex gap="middle" vertical>
      <Flex align="center" gap="middle">
        <StoreTypeOption onTypeChange={onTypeChange}/>
        <Button type="primary" onClick={start} disabled={!hasSelected} loading={loading}>
          Reload
        </Button>
        <Button type="primary" onClick={confirmClearStore}>
          清除所有类型大纲
        </Button>
        {hasSelected ? `Selected ${selectedRowKeys.length} items` : null}
      </Flex>
      <Table<DataType> rowSelection={rowSelection} columns={columns} dataSource={dataSource} />
      {showConfirm && (
        <BifangDelModal title={title} description={description} outlineId={idWillDel}
                       cbDelFn={cbDelFn} visible={showConfirm}
        />
      )}
    </Flex>)

};

export default OutlineStoreManage;
