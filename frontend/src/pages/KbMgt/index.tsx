import { PlusOutlined } from '@ant-design/icons';
import {ActionType, ProTable, ProFormInstance, PageContainer,} from '@ant-design/pro-components';
import {Button, message, Modal} from 'antd';
import { useRef, useState } from 'react';
import KbForm from './components/KbForm';
import {addKb, deleteKb, kb,queryKbList, recreateVectorStore, updateKb} from '@/services/chatchat/kb';

const KbTableList: React.FC = () => {
  //新增表单控制模态框显示
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  //编辑表单控制模态框显示
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  // 编辑的记录
  const [currentRow, setCurrentRow] = useState<API.KbListItem>();

  const actionRef = useRef<ActionType>();
  const formRef = useRef<ProFormInstance>();

  // 处理表单提交
  const handleSubmit = async (values: API.KbItem) => {
    try {
      if (currentRow?.id) {
        await updateKb({ ...values, id: currentRow.id });
        message.success('更新成功');
      } else {
        await addKb(values);
        message.success('添加成功');
      }
      setCreateModalVisible(false);
      actionRef.current?.reload();
    } catch (error) {
      message.error('操作失败，请重试');
    }
  };
/**
 *  Delete node
 * @zh-CN 编辑知识库
 */
const handleUpdate = async (record: API.KbListItem) => {
 console.log("handleUpdateRecord:",record)
  try {
      await updateKb({ ...record, id: currentRow.id });
      message.success('更新成功');
      setEditModalVisible(false);
      actionRef.current?.reload();
    } catch (error) {
      message.error('跟新操作失败，请重试');
    }
};

// 处理删除
const handleDelete = async (record: API.KbListItem) => {
    // const hide = message.loading('正在删除');
    //  hide();
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      onOk: async () => {
        try {
          await deleteKb(record.kb_name);
          message.success('删除成功');
          actionRef.current?.reload();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };
const handleRecreateVectorStore= async (record: API.KbListItem) => {
    Modal.confirm({
      title: '确认重建向量库吗',
      content: '该操作耗时较长，确定依据知识库源文件重建向量库吗？',
      onOk: async () => {
         try {
         let recreateVectorStoreParams={
             "knowledge_base_name": record.kb_name,
             "allow_empty_kb": true,
             "vs_type": record.vs_type,
             "embed_model": record.embed_model,
             "chunk_size": 750,
             "chunk_overlap": 150,
             "zh_title_enhance": false,
             "not_refresh_vs_cache": false
           }
         const resData= await recreateVectorStore(recreateVectorStoreParams);
         console.log(resData)
          message.success('重建向量库成功');
          actionRef.current?.reload();
        } catch (error) {
          message.error('重建向量库失败');
        }
      }
    });
};


 // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      valueType: 'text',
      // 支持搜索
      search: false,
    },
    {
      title: '知识库名称',
      dataIndex: 'kb_name',
      valueType: 'text',
      search: false,
    },
    {
      title: '知识库简介',
      dataIndex: 'kb_info',
      valueType: 'text',
      search: false,
    },
    {
      title: '向量库类型',
      dataIndex: 'vs_type',
      valueType: 'text',
      search: false,
    },
    {
      title: 'Embeddings模型',
      dataIndex: 'embed_model',
      valueType: 'text',
      search: false,
    },
    {
      title: '文件个数',
      dataIndex: 'file_count',
      valueType: 'integer',
      search: false,
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      valueType: 'text',
      search: false,
      render: (text) => {
        return text.replace("T"," ");
      }
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
         <a key="edit" onClick={() =>{
              setCurrentRow(record);
              setCreateModalVisible(true);
              // handleUpdate(record);
          }}>
          编辑知识库
        </a>,
        <a key="recreate" onClick={() => handleRecreateVectorStore(record)}>
          重建向量库
        </a>,
        <a key="delete" onClick={() => handleDelete(record)}>
          删除知识库
        </a>
      ],
    },
  ];

  return (
     <PageContainer>
      <ProTable<API.KbListItem>
        headerTitle="知识库列表"
        actionRef={actionRef}
        formRef={formRef}
        columns={columns}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button
            type="primary"
            key="create"
            onClick={() => {
              setCurrentRow(undefined);
              setCreateModalVisible(true);
            }}
          >
            <PlusOutlined /> 创建知识库
          </Button>,
        ]}
        request={async (params) => {
          const response = await queryKbList(params);
          const resData=response.data
          console.log(response)
          return {
            data: resData,
            success: response.success,
            total: response.total,
          };
        }}
      />
      <KbForm
        visible={createModalVisible}
        onVisibleChange={setCreateModalVisible}
        onSubmit={handleSubmit}
        values={currentRow}
      />
      <KbForm
        visible={editModalVisible}
        onVisibleChange={setEditModalVisible}
        onSubmit={handleUpdate}
        values={currentRow}
      />
    </PageContainer>
  );
};

export default KbTableList;
