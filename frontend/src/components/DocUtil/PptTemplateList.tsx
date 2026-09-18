import {
  ProList,
} from '@ant-design/pro-components';
import {Image, Progress, Tag} from 'antd';
import { useState } from 'react';
import {SlideSelectTemplate} from "@/components/DocUtil/ViewItem4Ppt";
import type { Key } from 'react';


interface PptTemplateListProps {
  // key:string;
  slideTemplates : SlideSelectTemplate[],
  selFn:(idx:number) => void
}

const PptTemplateList=(props:PptTemplateListProps) => {
  // const [ghost, setGhost] = useState<boolean>(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => {
      // Ant Design「取消选择」会传入空数组，需真正清空
      if (!keys.length) {
        setSelectedRowKeys([]);
        return;
      }
      const key = keys[keys.length - 1];
      setSelectedRowKeys([key]);
      props.selFn(Number(key));
    },
  };

  const data = props.slideTemplates.map((slideTemplate) => ({
    id: slideTemplate.id,
    title: slideTemplate.name,
    subTitle: <>{slideTemplate.labels.map((value:string)=>{return <Tag color="#5BD8A6">{value}</Tag>})}</>,
    // actions: [<a key="run">邀请</a>, <a key="delete">删除</a>],
    avatar:
      '/xingzhuang.svg',
    content: (
      <div
        style={{
          flex: 1,
        }}
      >
        <Image
          src={`/template_ppt/${slideTemplate.pict}`}
          alt={slideTemplate.name}
          height={135}
          width={240}
          style={{ objectFit: 'cover' }}
          fallback="/logo.png"
        />

      </div>
    ),
  }));
  return (
    <div
      style={{
        backgroundColor: '#eee',
        margin: -24,
        padding: 24,
      }}
    >
      <ProList<any>
        ghost={true}
        itemCardProps={{
          ghost:false,
        }}
        pagination={{
          defaultPageSize: 8,
          showSizeChanger: false,
        }}
        showActions="hover"
        // rowSelection={{}}
        grid={{ gutter: 6, column: 1 }}
        onItem={(record: any) => {
          return {
            onMouseEnter: () => {
              console.log(record);
            },
            onClick: () => {
              console.log(record);
            },
          };
        }}
        metas={{
          title: {},
          subTitle: {},
          type: {},
          avatar: {},
          content: {},
        }}
        rowKey="id"
        rowSelection={rowSelection}
        dataSource={data}
      />
    </div>
  );
};
export default PptTemplateList
