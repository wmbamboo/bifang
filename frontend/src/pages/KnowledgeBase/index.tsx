import React, { useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Table, Button, Upload, Input, Modal, Form, message } from 'antd';
import { PlusOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import { useRequest } from '@umijs/max';
import * as KbAPI from '@/services/chatchat/kb';

const KnowledgeBase: React.FC = () => {
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedKb, setSelectedKb] = useState<string>();
  const [form] = Form.useForm();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<API.SearchResult[]>([]);

  const { data: kbList, run: fetchKbList, loading } = useRequest(KbAPI.listKnowledgeBases, {
    manual: false,
    onError: (error) => {
      message.error('获取知识库列表失败：' + (error.message || '未知错误'));
    },
  });

  const { data: docList, run: fetchDocList } = useRequest(() => KbAPI.listDocs(selectedKb!), {
    manual: true,
    onError: (error) => {
      message.error('获取文档列表失败：' + (error.message || '未知错误'));
    },
  });

  const handleCreate = async (values: any) => {
    try {
      const response = await KbAPI.createKnowledgeBase(values);
      if (response.code === 200) {
        message.success('创建成功');
        form.resetFields();
        setCreateModalVisible(false);
        fetchKbList();
      } else {
        message.error(response.msg || '创建失败');
      }
    } catch (error: any) {
      message.error(error.message || '创建失败');
    }
  };

  const handleUpload = async (file: any) => {
    if (!selectedKb) {
      message.error('请先选择知识库');
      return false;
    }

    const formData = new FormData();
    formData.append('files[]', file.file);

    try {
      const response = await KbAPI.uploadDocs({
        knowledge_base_name: selectedKb,
        files: formData,
      });

      if (response.code === 200) {
        message.success('上传成功');
        setUploadModalVisible(false);
        fetchKbList();
        fetchDocList();
      } else {
        message.error(response.msg || '上传失败');
      }
      return false;
    } catch (error: any) {
      console.error('Upload error:', error);
      message.error(error.message || '上传失败');
      return false;
    }
  };

  const handleSearch = async () => {
    if (!selectedKb || !searchQuery) {
      message.error('请先选择知识库并输入搜索关键词');
      return;
    }

    try {
      const response = await KbAPI.searchDocs({
        knowledge_base_name: selectedKb,
        query: searchQuery,
        top_k: 5,
      });

      if (response.code === 200) {
        setSearchResults(response.data);
      } else {
        message.error(response.msg || '搜索失败');
      }
    } catch (error: any) {
      console.error('Search error:', error);
      message.error(error.message || '搜索失败');
    }
  };

  const kbColumns = [
    {
      title: '知识库名称',
      dataIndex: 'kb_name',
      key: 'kb_name',
    },
    {
      title: '知识库简介',
      dataIndex: 'kb_info',
      key: 'kb_info',
    },
    {
      title: '向量库类型',
      dataIndex: 'vs_type',
      key: 'vs_type',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: API.KnowledgeBase) => (
        <>
          <Button
            type="link"
            onClick={() => {
              setSelectedKb(record.kb_name);
              fetchDocList();
            }}
          >
            查看文档
          </Button>
          <Button
            type="link"
            onClick={() => {
              setSelectedKb(record.kb_name);
              setUploadModalVisible(true);
            }}
          >
            上传文档
          </Button>
        </>
      ),
    },
  ];

  const docColumns = [
    {
      title: '文档名称',
      dataIndex: 'file_name',
      key: 'file_name',
    },
    {
      title: '文档内容',
      dataIndex: 'page_content',
      key: 'page_content',
    },
  ];

  return (
    <PageContainer>
      <Card>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalVisible(true)}
          style={{ marginBottom: 16 }}
        >
          新建知识库
        </Button>
        <Button
          onClick={() => fetchKbList()}
          style={{ marginLeft: 8, marginBottom: 16 }}
        >
          刷新
        </Button>

        <Table
          columns={kbColumns}
          dataSource={kbList}
          rowKey="kb_name"
          loading={loading}
        />

        {selectedKb && (
          <>
            <Input.Search
              placeholder="输入搜索关键词"
              enterButton={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginBottom: 16, marginTop: 16 }}
            />
            <Table
              columns={docColumns}
              dataSource={searchResults.length > 0 ? searchResults : docList}
              rowKey="id"
              loading={loading}
            />
          </>
        )}

        <Modal
          title="新建知识库"
          open={createModalVisible}
          onOk={() => form.submit()}
          onCancel={() => {
            form.resetFields();
            setCreateModalVisible(false);
          }}
          destroyOnClose
        >
          <Form
            form={form}
            onFinish={handleCreate}
            preserve={false}
          >
            <Form.Item
              name="knowledge_base_name"
              label="知识库名称"
              rules={[{ required: true, message: '请输入知识库名称' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="kb_info"
              label="知识库简介"
            >
              <Input.TextArea />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="上传文档"
          open={uploadModalVisible}
          onCancel={() => setUploadModalVisible(false)}
          footer={null}
          destroyOnClose
        >
          <Upload.Dragger
            multiple
            customRequest={handleUpload}
            showUploadList={true}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              注意：文本文件请使用 UTF-8 编码，以确保正确处理中文内容
            </p>
          </Upload.Dragger>
        </Modal>
      </Card>
    </PageContainer>
  );
};

export default KnowledgeBase;
