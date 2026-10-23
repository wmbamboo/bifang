import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Space, Spin, Typography, message } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import {
  fetchPreviewPages,
  type PreviewPageItem,
} from '@/services/chatchat/kb';
import authAxios from '@/utils/authAxios';

const { Text, Paragraph } = Typography;

export type DocPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  knowledgeBaseName: string;
  fileName: string;
  /** 打开时定位到该页（有则优先） */
  initialPage?: number;
};

/**
 * 知识库文档预览：页图优先（authAxios blob），无图则 extracts snippet 文本降级。
 * 不再回落外部 kkFileView。
 */
const DocPreviewModal: React.FC<DocPreviewModalProps> = ({
  open,
  onClose,
  knowledgeBaseName,
  fileName,
  initialPage,
}) => {
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<PreviewPageItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [imgUrl, setImgUrl] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!knowledgeBaseName || !fileName) return;
    setLoading(true);
    setPages([]);
    setImgUrl('');
    setImgFailed(false);
    try {
      const res = await fetchPreviewPages({
        knowledge_base_name: knowledgeBaseName,
        file_name: fileName,
      });
      if (res?.code && res.code !== 200) {
        message.error((res as any)?.msg || '加载预览失败');
        setPages([]);
        return;
      }
      const list = Array.isArray(res?.data?.pages) ? res.data.pages : [];
      setPages(list);
      if (!list.length) {
        setIdx(0);
        return;
      }
      let start = 0;
      if (initialPage != null) {
        const found = list.findIndex((p) => p.page === initialPage);
        if (found >= 0) start = found;
      }
      setIdx(start);
    } catch (e: any) {
      message.error(e?.message || '加载预览失败');
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseName, fileName, initialPage]);

  useEffect(() => {
    if (open) loadMeta();
    else {
      setPages([]);
      setImgUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return '';
      });
    }
  }, [open, loadMeta]);

  const cur = pages[idx];

  useEffect(() => {
    let cancelled = false;
    let created = '';
    const run = async () => {
      setImgFailed(false);
      setImgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      if (!cur?.asset_id || !knowledgeBaseName || !fileName) return;
      setImgLoading(true);
      try {
        const res = await authAxios.get('/knowledge_base/asset_file', {
          params: {
            knowledge_base_name: knowledgeBaseName,
            file_name: fileName,
            asset_id: cur.asset_id,
          },
          responseType: 'blob',
        });
        if (cancelled) return;
        created = URL.createObjectURL(res.data);
        setImgUrl(created);
      } catch {
        if (!cancelled) {
          setImgFailed(true);
          setImgUrl('');
        }
      } finally {
        if (!cancelled) setImgLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [cur?.asset_id, cur?.page, knowledgeBaseName, fileName]);

  const title = fileName
    ? `预览 · ${fileName}${cur ? ` · 第 ${cur.page} 页` : ''}`
    : '文档预览';

  const showText =
    !cur?.asset_id || imgFailed || (!imgLoading && !imgUrl && !!cur);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      destroyOnClose
      title={title}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : !pages.length ? (
        <Paragraph type="secondary">该文档暂无可预览内容</Paragraph>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button
              icon={<LeftOutlined />}
              disabled={idx <= 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              上一页
            </Button>
            <Text type="secondary">
              {idx + 1} / {pages.length}
              {cur?.page_type ? ` · ${cur.page_type}` : ''}
              {cur?.has_image ? ' · 页图' : ' · 文本'}
            </Text>
            <Button
              disabled={idx >= pages.length - 1}
              onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
            >
              下一页 <RightOutlined />
            </Button>
          </Space>

          {imgLoading && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin tip="加载页图…" />
            </div>
          )}

          {!imgLoading && imgUrl && !imgFailed && (
            <div style={{ textAlign: 'center', maxHeight: '70vh', overflow: 'auto' }}>
              <img
                src={imgUrl}
                alt={`page-${cur?.page}`}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          )}

          {showText && !imgLoading && (
            <div
              style={{
                maxHeight: '60vh',
                overflow: 'auto',
                padding: 12,
                background: '#fafafa',
                borderRadius: 4,
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {(cur?.snippet || '').trim() ||
                (imgFailed
                  ? '页图加载失败，且该页暂无文本摘要'
                  : '该页暂无可预览内容')}
            </div>
          )}
        </Space>
      )}
    </Modal>
  );
};

export default DocPreviewModal;
