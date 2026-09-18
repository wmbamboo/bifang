import { ProList } from '@ant-design/pro-components';
import { useState, useEffect } from 'react';
import { message } from 'antd';

// interface SelectableListProps {
//   // 选中项改变时的回调
//   onSelectionChange?: (selectedRows: any[]) => void;
// }
export default function KbListMplComp({ onSelectionChange}){
  // 列表数据状态
  const [dataSource, setDataSource] = useState<any[]>([]);
  // 加载状态
  const [loading, setLoading] = useState(false);

  // 获取数据的方法
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/knowledge_base/list_knowledge_bases');
      const resData = await response.json();
      setDataSource(resData.data);
    } catch (error) {
      message.error('获取数据失败');
      console.error('获取数据错误:', error);
    } finally {
      setLoading(false);
    }
  };

  // 组件加载时获取数据
  useEffect(() => {
    fetchData();
  }, []);

  return (
    <ProList<any>
      rowKey="id"
      dataSource={dataSource}
      loading={loading}
      rowSelection={{
        // 选择项发生变化时的回调
        onChange: (_, selectedRows) => {
          onSelectionChange?.(selectedRows);
        },
      }}
      metas={{
        title: {
          dataIndex: 'kb_name',
        },
        description: {},
      }}
      // 或者通过 CSS 覆盖分隔线样式
      split={false}
      itemLayout="horizontal"
      style={{ borderBottom: 'none' }}
    />
  );
};
// const ExamplePage: React.FC = () => {
//   // 处理选择变化
//   const handleSelectionChange = (selectedRows: any[]) => {
//     console.log('选中的知识库:', selectedRows);
//     // 这里可以进行其他操作
//   };
//
//   return (
//     <div>
//       <KbListMplComp
//         onSelectionChange={handleSelectionChange}
//       />
//     </div>
//   );
// };
// export default ExamplePage;
