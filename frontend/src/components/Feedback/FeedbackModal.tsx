import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Spin,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import {
  createFeedback,
  listFeedback,
  uploadFeedbackImage,
  flushFeedbackOfflineQueue,
  loadFeedbackOfflineQueue,
  saveFeedbackOfflineQueue,
  feedbackStatusLabel,
  type FeedbackItem,
  type FeedbackType,
} from '@/services/feedback';
import {
  buildFeedbackContext,
  serializeContext,
  type FeedbackContextInput,
} from '@/utils/feedbackContext';
import {
  clampModalPos,
  readModalPos,
  writeModalPos,
} from '@/components/Feedback/modalDrag';
import { useFeedbackImages } from '@/components/Feedback/useFeedbackImages';

const { TextArea } = Input;
const { Text } = Typography;

const TYPE_OPTS: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: '缺陷' },
  { value: 'suggestion', label: '建议' },
  { value: 'data', label: '数据问题' },
  { value: 'other', label: '其他' },
];

const MAX_SHOTS = 6;

type Shot = { name: string; localUrl?: string; status?: 'uploading' | 'done' };

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

const MineRow: React.FC<{ item: FeedbackItem }> = ({ item }) => {
  const names = item.images || [];
  const urls = useFeedbackImages(names);
  const st = feedbackStatusLabel(item.status);
  const thumb = names.map((n) => urls[n]).find(Boolean);
  return (
    <List.Item
      style={{ cursor: 'pointer' }}
      onClick={() => {
        history.push(`/admin/feedback?id=${encodeURIComponent(item.id)}`);
      }}
    >
      <Space align="start">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
          />
        ) : null}
        <Tag color={st.color} title={st.tip}>
          {st.text}
        </Tag>
        <Text ellipsis style={{ maxWidth: thumb ? 220 : 280 }}>
          {item.content}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {item.id?.slice(0, 8)}
        </Text>
      </Space>
    </List.Item>
  );
};

const FeedbackModal: React.FC<Props> = ({ open, onClose, contextHint }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<Shot[]>([]);
  const [attachCtx, setAttachCtx] = useState(true);
  const [mine, setMine] = useState<FeedbackItem[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const localUrlsRef = useRef<Set<string>>(new Set());

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
    if (!open) return;
    refreshMine();
    flushFeedbackOfflineQueue();
    const saved = readModalPos();
    if (saved && typeof window !== 'undefined') {
      setPos(
        clampModalPos(
          saved.x,
          saved.y,
          560,
          Math.min(480, window.innerHeight),
          window.innerWidth,
          window.innerHeight,
        ),
      );
    } else {
      setPos(null);
    }
  }, [open, refreshMine]);

  useEffect(() => {
    return () => {
      localUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      localUrlsRef.current.clear();
    };
  }, []);

  const trackLocal = (url: string) => {
    localUrlsRef.current.add(url);
  };
  const dropLocal = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    localUrlsRef.current.delete(url);
  };

  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    const modalEl = (e.currentTarget as HTMLElement).closest(
      '.ant-modal',
    ) as HTMLElement | null;
    if (!modalEl) return;
    const rect = modalEl.getBoundingClientRect();
    const start = { mx: e.clientX, my: e.clientY, x: rect.left, y: rect.top };
    e.preventDefault();
    document.body.style.userSelect = 'none';
    const move = (ev: MouseEvent) => {
      const next = clampModalPos(
        start.x + (ev.clientX - start.mx),
        start.y + (ev.clientY - start.my),
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      );
      setPos(next);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
      setPos((cur) => {
        if (cur) writeModalPos(cur);
        return cur;
      });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const uploadFile = async (file: File) => {
    if (images.length >= MAX_SHOTS) {
      message.warning(`最多 ${MAX_SHOTS} 张`);
      return false;
    }
    const localUrl = URL.createObjectURL(file);
    trackLocal(localUrl);
    const placeholder: Shot = { name: '', localUrl, status: 'uploading' };
    setImages((prev) => [...prev, placeholder]);
    try {
      const res = await uploadFeedbackImage(file, file.name);
      if (res?.code === 200 && res.data?.file_name) {
        setImages((prev) => {
          const idx = prev.findIndex(
            (s) => s.localUrl === localUrl && s.status === 'uploading',
          );
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = {
            name: res.data.file_name,
            localUrl,
            status: 'done',
          };
          return next;
        });
        message.success('截图已上传');
      } else {
        setImages((prev) => prev.filter((s) => s.localUrl !== localUrl));
        dropLocal(localUrl);
        message.error(res?.msg || '上传失败');
      }
    } catch (e: any) {
      setImages((prev) => prev.filter((s) => s.localUrl !== localUrl));
      dropLocal(localUrl);
      message.error(e?.message || '上传失败');
    }
    return false;
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        if (images.length >= MAX_SHOTS) {
          message.warning(`最多 ${MAX_SHOTS} 张`);
          break;
        }
        const blob = it.getAsFile();
        if (blob) await uploadFile(blob);
      }
    }
  };

  const removeShot = (idx: number) => {
    setImages((prev) => {
      const shot = prev[idx];
      dropLocal(shot?.localUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const onSubmit = async () => {
    if (submitting) return;
    const values = await form.validateFields();
    setSubmitting(true);
    const id = uuid();
    const loginUser = localStorage.getItem('loginUser') || '';
    const imageNames = images.filter((s) => s.name).map((s) => s.name);
    const body: Record<string, any> = {
      id,
      feedback_type: values.feedback_type,
      content: values.content,
      page: typeof window !== 'undefined' ? window.location.pathname : '',
      images: imageNames,
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
        images.forEach((s) => dropLocal(s.localUrl));
        setImages([]);
        setMine((prev) => {
          const row: FeedbackItem = {
            id: saved.id || id,
            feedback_type: saved.feedback_type || body.feedback_type,
            content: saved.content || body.content,
            status: saved.status || 'pending',
            created_at: saved.created_at,
            images: saved.images || imageNames,
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
      title={
        <div
          style={{ cursor: 'move', userSelect: 'none' }}
          onMouseDown={onDragStart}
        >
          遇到问题？告诉我们
        </div>
      }
      open={open}
      onCancel={onClose}
      width={560}
      destroyOnClose
      maskClosable={false}
      style={
        pos
          ? { position: 'fixed', top: pos.y, left: pos.x, margin: 0 }
          : undefined
      }
      styles={{
        body: { maxHeight: 'calc(100vh - 220px)', overflow: 'auto' },
        mask: { background: 'rgba(0, 0, 0, 0.06)' },
      }}
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
                {images.map((shot, i) => (
                  <div
                    key={shot.localUrl || shot.name || i}
                    style={{
                      position: 'relative',
                      width: 76,
                      height: 76,
                      border:
                        shot.status === 'uploading'
                          ? '1px dashed #1677ff'
                          : '1px solid #1677ff',
                      borderRadius: 8,
                      padding: 4,
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {shot.status === 'uploading' ? (
                      <Spin size="small" />
                    ) : shot.localUrl ? (
                      <img
                        src={shot.localUrl}
                        alt=""
                        style={{
                          width: '100%',
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: 6,
                        }}
                      />
                    ) : null}
                    <span style={{ color: '#1677ff', fontSize: 12, marginTop: 2 }}>
                      截图 {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label="删除截图"
                      onClick={() => removeShot(i)}
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#1677ff',
                        color: '#fff',
                        fontSize: 11,
                        lineHeight: '16px',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>
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
                history.push('/admin/feedback');
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
              renderItem={(item) => <MineRow key={item.id} item={item} />}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackModal;
