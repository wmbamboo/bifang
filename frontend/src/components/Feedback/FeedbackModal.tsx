import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Upload,
  Button,
  message,
  Collapse,
  Typography,
  Space,
  Tag,
  List,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import {
  createFeedback,
  listFeedback,
  uploadFeedbackImage,
  flushFeedbackOfflineQueue,
  loadFeedbackOfflineQueue,
  saveFeedbackOfflineQueue,
  type FeedbackItem,
  type FeedbackType,
} from '@/services/feedback';
import {
  buildFeedbackContext,
  serializeContext,
  type FeedbackContextInput,
} from '@/utils/feedbackContext';

const { TextArea } = Input;
const { Text } = Typography;

const TYPE_OPTS: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: '缺陷' },
  { value: 'suggestion', label: '建议' },
  { value: 'data', label: '数据问题' },
  { value: 'other', label: '其他' },
];

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contextHint?: FeedbackContextInput;
}

const FeedbackModal: React.FC<Props> = ({ open, onClose, contextHint }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [attachCtx, setAttachCtx] = useState(true);
  const [mine, setMine] = useState<FeedbackItem[]>([]);

  const ctxPreview = useMemo(() => {
    const ctx = buildFeedbackContext(contextHint || {});
    return serializeContext(ctx);
  }, [contextHint, open]);

  const refreshMine = useCallback(async () => {
    try {
      const res = await listFeedback({ mine: 1 });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setMine(res.data.slice(0, 3));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshMine();
      flushFeedbackOfflineQueue();
    }
  }, [open, refreshMine]);

  const uploadFile = async (file: File) => {
    try {
      const res = await uploadFeedbackImage(file, file.name);
      if (res?.code === 200 && res.data?.file_name) {
        setImages((prev) => [...prev, res.data.file_name]);
        message.success('截图已上传');
      } else {
        message.error(res?.msg || '上传失败');
      }
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    }
    return false;
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        if (blob) await uploadFile(blob);
      }
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    const values = await form.validateFields();
    setSubmitting(true);
    const id = uuid();
    const loginUser = localStorage.getItem('loginUser') || '';
    const body: Record<string, any> = {
      id,
      feedback_type: values.feedback_type,
      content: values.content,
      page: typeof window !== 'undefined' ? window.location.pathname : '',
      images,
      contact: values.contact || '',
      user: loginUser,
      user_name: loginUser,
      visibility: 'internal',
      env: 'dev',
      gen_id: contextHint?.gen_id || '',
      gen_type: contextHint?.gen_type || '',
      outline_id: contextHint?.outline_id || '',
      target_key: contextHint?.target_key || '',
    };
    if (attachCtx) {
      body.context_json = ctxPreview;
    }
    try {
      const res = await createFeedback(body);
      if (res?.code === 200) {
        const saved = (res.data || {}) as FeedbackItem;
        message.success(`已提交，编号 ${id.slice(0, 8)}`);
        form.resetFields();
        setImages([]);
        // 立刻显示在「我的反馈」，不依赖二次拉取
        setMine((prev) => {
          const row: FeedbackItem = {
            id: saved.id || id,
            feedback_type: saved.feedback_type || body.feedback_type,
            content: saved.content || body.content,
            status: saved.status || 'pending',
            created_at: saved.created_at,
          };
          return [row, ...prev.filter((x) => x.id !== row.id)].slice(0, 5);
        });
        refreshMine();
      } else {
        message.error(res?.msg || '提交失败');
      }
    } catch {
      const q = loadFeedbackOfflineQueue();
      q.push(body);
      saveFeedbackOfflineQueue(q);
      message.warning('网络异常，已加入本地队列，联网后自动重发');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="遇到问题？告诉我们"
      open={open}
      onCancel={onClose}
      width={560}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="ok"
          type="primary"
          loading={submitting}
          disabled={submitting}
          onClick={onSubmit}
        >
          提交
        </Button>,
      ]}
    >
      <div onPaste={onPaste}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ feedback_type: 'bug' }}
        >
          <Form.Item
            name="feedback_type"
            label="类型"
            rules={[{ required: true }]}
          >
            <Select options={TYPE_OPTS} />
          </Form.Item>
          <Form.Item
            name="content"
            label="描述"
            rules={[{ required: true, message: '请填写描述' }]}
          >
            <TextArea rows={4} placeholder="请描述问题或建议（可粘贴截图）" />
          </Form.Item>
          <Form.Item label="截图">
            <Upload.Dragger
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                uploadFile(file as File);
                return false;
              }}
              accept="image/*"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖拽或点击上传；也可 Ctrl+V 粘贴</p>
            </Upload.Dragger>
            {images.length > 0 && (
              <Space wrap style={{ marginTop: 8 }}>
                {images.map((n) => (
                  <Tag
                    key={n}
                    closable
                    onClose={() =>
                      setImages((prev) => prev.filter((x) => x !== n))
                    }
                  >
                    {n.slice(0, 10)}…
                  </Tag>
                ))}
              </Space>
            )}
          </Form.Item>
          <Form.Item name="contact" label="联系方式（可选）">
            <Input placeholder="邮箱 / 手机" />
          </Form.Item>
          <Checkbox
            checked={attachCtx}
            onChange={(e) => setAttachCtx(e.target.checked)}
          >
            自动附加：当前页面 / 生成任务 / 最近日志
          </Checkbox>
          {attachCtx && (
            <Collapse
              size="small"
              style={{ marginTop: 8 }}
              items={[
                {
                  key: 'ctx',
                  label: '预览将附加的上下文',
                  children: (
                    <Text
                      code
                      style={{
                        display: 'block',
                        maxHeight: 160,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontSize: 11,
                      }}
                    >
                      {ctxPreview.slice(0, 4000)}
                      {ctxPreview.length > 4000 ? '…' : ''}
                    </Text>
                  ),
                },
              ]}
            />
          )}
        </Form>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          提交内容仅用于产品改进。截图与运行日志会随反馈一并保存，请勿包含敏感信息。
        </Text>
        <div style={{ marginTop: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>我的反馈（最近）</Text>
            <Button
              type="link"
              size="small"
              onClick={() => {
                onClose();
                window.location.href = '/admin/feedback';
              }}
            >
              打开反馈管理
            </Button>
          </Space>
          {mine.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无记录（提交成功后会显示在这里）
            </Text>
          ) : (
            <List
              size="small"
              dataSource={mine}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    <Tag>{item.status}</Tag>
                    <Text ellipsis style={{ maxWidth: 280 }}>
                      {item.content}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.id?.slice(0, 8)}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackModal;
