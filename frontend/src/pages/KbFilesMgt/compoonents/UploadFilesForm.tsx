import React from 'react';
import { Modal, Form, Upload, message, Button, Popconfirm, Space } from 'antd';
import { DeleteOutlined, InboxOutlined, LinkOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { uploadDocsAsync } from '@/services/chatchat/kb';
import { useUploadTasks } from '@/components/UploadTask/UploadTaskContext';
import { UploadTaskManagerDrawer } from '@/components/UploadTask/UploadTaskPanel';

const { Dragger } = Upload;

interface UploadModalProps {
  visible: boolean;
  curKbName: string;
  onCancel: () => void;
  onSuccess?: () => void;
}

const UploadFilesForm: React.FC<UploadModalProps> = ({
  visible,
  curKbName,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = React.useState<UploadFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadDisabled, setUploadDisabled] = React.useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = React.useState(false);
  const { openTask, setMinimized, setPanelOpen } = useUploadTasks();

  const FILE_SIZE_LIMIT = 200 * 1024 * 1024;
  const FILE_TYPE_ALLOW_LIST = [
    'HTML', 'HTM', 'MHTML', 'MD', 'JSON', 'JSONL', 'CSV', 'PDF', 'DOCX', 'PPT', 'PPTX',
    'PNG', 'JPG', 'JPEG', 'BMP', 'EML', 'MSG', 'RST', 'RTF', 'TXT', 'XML', 'EPUB', 'ODT',
    'TSV', 'XLSX', 'XLS', 'XLSD', 'IPYNB', 'PY', 'SRT', 'TOML', 'ENEX',
  ];
  const FILE_TYPE_WHITELIST = [
    'text/html', 'text/htm', 'application/xhtml+xml', 'application/mhtml', 'text/markdown',
    'application/json', 'application/jsonl', 'text/csv', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/bmp', 'message/rfc822', 'application/vnd.ms-outlook',
    'text/x-rst', 'text/rtf', 'text/plain', 'text/xml', 'application/epub+zip',
    'application/vnd.oasis.opendocument.text', 'text/tab-separated-values',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-ipynb+json', 'text/x-python', 'text/srt', 'text/x-toml', 'application/enex+xml',
  ];

  const checkFile = (file: UploadFile, addFileListFlag: boolean) => {
    const isAllowedType = FILE_TYPE_WHITELIST.includes(file.type as string) ||
      FILE_TYPE_ALLOW_LIST.includes((file.name.split('.').pop() || '').toUpperCase());
    if (!isAllowedType) {
      message.error(
        `${file.name} 文件类型暂未支持，当前支持: ${FILE_TYPE_ALLOW_LIST.join(',')}`,
        5,
      );
      if (addFileListFlag) {
        file.status = 'error';
        file.error = '文件类型不支持' as any;
        setFileList((prevList) => [...prevList, file]);
      }
      return false;
    }
    const isAllowedSize = (file.size || 0) <= FILE_SIZE_LIMIT;
    if (!isAllowedSize) {
      message.error(`${file.name} 文件大小超过限制: ${FILE_SIZE_LIMIT / 1024 / 1024}MB`, 5);
      if (addFileListFlag) {
        file.status = 'error';
        file.error = '文件大小超过限制' as any;
        setFileList((prevList) => [...prevList, file]);
      }
      return false;
    }
    if (addFileListFlag) {
      setFileList((prevList) => [...prevList, file]);
    }
    return true;
  };

  const handleRemove = (file: UploadFile) => {
    const files = form.getFieldValue('files')?.fileList || [];
    const newFiles = files.filter((t: UploadFile) => t.uid !== file.uid);
    setFileList((prevList) => prevList.filter((f) => f.uid !== file.uid));
    form.setFieldsValue({ files: { fileList: newFiles } });
    let allValidFlag = true;
    for (const everyFile of newFiles) {
      if (!checkFile(everyFile, false)) {
        allValidFlag = false;
        break;
      }
    }
    setUploadDisabled(!allValidFlag);
  };

  const uploadProps = {
    name: 'files',
    multiple: true,
    action: '',
    beforeUpload: (file: UploadFile) => {
      checkFile(file, true);
      return false;
    },
    onChange: () => undefined,
    onRemove: handleRemove,
    itemRender: (originNode: React.ReactNode, file: UploadFile) => (
      <div className="ant-upload-list-item-container">
        <div className="ant-upload-list-item ant-upload-list-item-undefined">
          <div className="ant-upload-icon">
            <LinkOutlined />
          </div>
          <span className="ant-upload-list-item-name" title={file.name}>
            {file.name}
            {file.status === 'error' ? (
              <label style={{ color: 'red' }}>({String(file.error)})</label>
            ) : null}
          </span>
          <span className="ant-upload-list-item-actions">
            <Popconfirm
              title="确定要删除这个文件吗？"
              onConfirm={() => handleRemove(file)}
              okText="是"
              cancelText="否"
            >
              <Button title="删除文件" type="link" icon={<DeleteOutlined />} />
            </Popconfirm>
          </span>
        </div>
      </div>
    ),
    fileList,
  };

  const resetLocal = () => {
    form.resetFields();
    setUploadDisabled(false);
    setFileList([]);
  };

  const handleCancel = () => {
    resetLocal();
    onCancel();
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      for (const everyFile of fileList) {
        if (!checkFile(everyFile, false)) {
          setUploadDisabled(true);
          return;
        }
      }
      setUploading(true);
      const formData = new FormData();
      const names: string[] = [];
      (form.getFieldValue('files')?.fileList || fileList).forEach((file: any) => {
        if (file.originFileObj) {
          formData.append('files', file.originFileObj);
          names.push(file.name);
        }
      });
      if (!names.length) {
        message.warning('请选择要上传的文件');
        return;
      }
      formData.append('knowledge_base_name', curKbName);
      formData.append('override', 'true');

      const res = await uploadDocsAsync(formData);
      if (res?.code === 200 && res.data?.id) {
        message.success('文件已提交，后台正在解析并入向量库', 3);
        openTask(res.data.id);
        setPanelOpen(true);
        setMinimized(false);
        resetLocal();
        onCancel();
        onSuccess?.();
      } else {
        message.error(res?.msg || '创建上传任务失败');
      }
    } catch (error: any) {
      message.error(error?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Modal
        title={
          <Space>
            <span>上传文件</span>
            <Button
              type="link"
              size="small"
              icon={<UnorderedListOutlined />}
              onClick={() => setTaskDrawerOpen(true)}
            >
              上传任务管理
            </Button>
          </Space>
        }
        open={visible}
        onCancel={handleCancel}
        width={800}
        footer={[
          <Button key="tasks" onClick={() => setTaskDrawerOpen(true)}>
            任务管理
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={uploading}
            onClick={handleSubmit}
            disabled={uploadDisabled}
          >
            开始上传并入向量库
          </Button>,
          <Button key="back" onClick={handleCancel}>
            关闭
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="files"
            label="上传文件"
            rules={[{ required: true, message: '请选择要上传的文件' }]}
          >
            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                单文件上限 200MB。提交后立即后台解析/入向量库，可最小化、暂停、恢复与停止。
                扫描件 PDF（无可复制文字）将标记失败，可在任务中查看原因。
              </p>
            </Dragger>
          </Form.Item>
        </Form>
      </Modal>
      <UploadTaskManagerDrawer
        open={taskDrawerOpen}
        onClose={() => setTaskDrawerOpen(false)}
        kbName={curKbName}
      />
    </>
  );
};

export default UploadFilesForm;
