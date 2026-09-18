import React, { useState, useEffect } from 'react';
import { ProList } from '@ant-design/pro-components';
import {Checkbox, message} from 'antd';

/** 与 kbSelectorModal.ALL_KB_NAME 保持一致 */
const ALL_KB_NAME = '__all__';

interface KbListSnlCompProps {
   // 选中项改变时的回调
   onSelectionChange?: (kb_name:string) => void;
   /** 写作页：列表最上方增加「全库」，并作为默认选中 */
   includeAll?: boolean;
   /** 已选知识库，打开选择器时保持当前项 */
   value?: string;
 }
const  KbListSnlComp =(props: KbListSnlCompProps)=> {
  // 列表数据状态
  const [dataSource, setDataSource] = useState<any[]>([]);
  // 加载状态
  const [loading, setLoading] = useState(true);
  // 选中项状态
  const [selectedValue, setSelectedValue] = useState<string | undefined>(props.value);

  //获取取后端数据
  const getKbList = async () => {
    try {
      const response = await fetch('/knowledge_base/list_knowledge_bases');
      const res = await response.json();
      let resData = res.data || [];
      if (props.includeAll) {
        resData = [{id: ALL_KB_NAME, kb_name: ALL_KB_NAME, kb_info: '全库'}, ...resData];
      }
      setDataSource(resData);
      const preferred = props.value && resData.some((item: any) => item.kb_name === props.value)
        ? props.value
        : (props.includeAll ? ALL_KB_NAME : resData[0]?.kb_name);
      if (preferred) {
        setSelectedValue(preferred);
        if (preferred !== props.value) {
          props.onSelectionChange?.(preferred);
        }
      }
      setLoading(false)
    } catch (error) {
      message.error('加载数据失败');
    }
  };
  useEffect(() => {
     getKbList()
  }, []);

  // 处理选中事件
  const handleSelect = (checkFlag:boolean, record:any) => {
    setSelectedValue(checkFlag ? record.kb_name : undefined);
    props.onSelectionChange?.(checkFlag ? record.kb_name : '')
  };

  return (
    <ProList<any>
      loading={loading}
      rowKey="id"
      dataSource={dataSource}
      metas={{
        title: {
          dataIndex: 'kb_name',
          render: (_, record) => (
            <Checkbox
              key={record.kb_name}
              checked={selectedValue === record.kb_name}
              onChange={(e) => handleSelect(e.target.checked, record)}
            >
              {record.kb_info || record.kb_name}
            </Checkbox>
          ),
        },
        description: { },
      }}
      //去除默认的选择功能
      rowSelection={false}
     // 或者通过 CSS 覆盖分隔线样式
      split={false}
      itemLayout="horizontal"
      style={{ borderBottom: 'none' }}
    />
  );
};

export default KbListSnlComp;
