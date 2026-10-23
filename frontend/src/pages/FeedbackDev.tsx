import React, { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Drawer,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Collapse,
  Tooltip,
} from 'antd';
import { history } from '@umijs/max';
import {
  feedbackStatusLabel,
  getFeedback,
  getFeedbackDevJob,
  listFeedbackDevJobs,
  updateFeedback,
  type FeedbackDevJob,
  type FeedbackItem,
} from '@/services/feedback';
import authAxios from '@/utils/authAxios';

const { Text, Paragraph } = Typography;

const statusTag = (st?: string) => {
  const color =
    st === 'done'
      ? 'green'
      : st === 'error'
        ? 'red'
        : st === 'running'
          ? 'blue'
          : 'default';
  return <Tag color={color}>{st || '—'}</Tag>;
};

const FeedbackDev: React.FC = () => {
  const [rows, setRows] = useState<FeedbackDevJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FeedbackDevJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const [fbDetail, setFbDetail] = useState<FeedbackItem | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFeedbackDevJobs();
      if (res?.code === 200) {
        setRows(Array.isArray(res.data) ? res.data : []);
      } else {
        message.error(res?.msg || '加载失败');
        setRows([]);
      }
    } catch (e: any) {
      message.error(e?.message || '加载失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (jobId: string) => {
    setOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getFeedbackDevJob(jobId);
      if (res?.code === 200) setDetail(res.data);
      else message.error(res?.msg || '加载详情失败');
    } catch (e: any) {
      message.error(e?.message || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadPack = async (jobId: string) => {
    try {
      const res = await authAxios.get(`/api/feedback/dev/jobs/${jobId}/pack`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_pack_${jobId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  };

  const openFeedbackDetail = async (fbId: string) => {
    if (!fbId) return;
    setFbOpen(true);
    setFbLoading(true);
    setFbDetail(null);
    try {
      const res = await getFeedback(fbId);
      if (res?.code === 200) setFbDetail(res.data);
      else message.error(res?.msg || '加载反馈详情失败');
    } catch (e: any) {
      message.error(e?.message || '加载反馈详情失败');
    } finally {
      setFbLoading(false);
    }
  };

  const markFixed = async (fbId: string) => {
    if (!fbId) return;
    setMarkingId(fbId);
    try {
      const res = await updateFeedback(fbId, { status: 'fixed' });
      if (res?.code === 200) {
        message.success('已标识为待验证');
        if (detail?.job_id) await openDetail(detail.job_id);
        load();
        if (fbDetail?.id === fbId) setFbDetail(res.data);
      } else message.error(res?.msg || '操作失败');
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setMarkingId('');
    }
  };

  const canMarkFixed = (st?: string) =>
    !!st && !['fixed', 'resolved', 'ignored'].includes(st);

  const columns = [
    {
      title: '任务',
      dataIndex: 'job_id',
      width: 110,
      render: (v: string) => v?.slice(0, 8),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => statusTag(v),
    },
    {
      title: '派发人',
      dataIndex: 'created_by',
      width: 90,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
    },
    {
      title: '反馈摘要',
      dataIndex: 'feedbacks',
      ellipsis: true,
      render: (_: any, r: FeedbackDevJob) => {
        const fbs = r.feedbacks || [];
        if (!fbs.length) return '—';
        return fbs
          .map(
            (f) =>
              `${(f.id || '').slice(0, 6)}… ${(f.content || '').slice(0, 40)}`,
          )
          .join(' | ');
      },
    },
    {
      title: 'RESULT',
      width: 90,
      render: (_: any, r: FeedbackDevJob) =>
        r.has_result ? (
          <Tag color="green">有</Tag>
        ) : r.has_error ? (
          <Tag color="red">ERROR</Tag>
        ) : (
          <Tag>—</Tag>
        ),
    },
    {
      title: '操作',
      width: 160,
      render: (_: any, r: FeedbackDevJob) => (
        <Space>
          <Button type="link" onClick={() => openDetail(r.job_id)}>
            详情
          </Button>
          {r.has_pack && (
            <Button type="link" onClick={() => downloadPack(r.job_id)}>
              包
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer breadcrumb={{}}>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={load}>刷新</Button>
        <Text type="secondary">
          仅「程序猿」角色可见；展示 Agent 任务包、关联反馈与 RESULT
        </Text>
      </Space>
      <Table
        rowKey="job_id"
        loading={loading}
        columns={columns as any}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        size="middle"
      />

      <Drawer
        title={
          detail
            ? `任务 ${detail.job_id.slice(0, 10)}…`
            : '任务详情'
        }
        width={720}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
        extra={
          detail?.has_pack ? (
            <Button onClick={() => downloadPack(detail.job_id)}>
              下载包
            </Button>
          ) : null
        }
      >
        {detailLoading && <Text type="secondary">加载中…</Text>}
        {detail && !detailLoading && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div>
              {statusTag(detail.status)}
              <Text type="secondary" style={{ marginLeft: 8 }}>
                派发人 {detail.created_by || '—'} · {detail.created_at || '—'}
              </Text>
            </div>
            {detail.instruction ? (
              <Paragraph>
                <Text strong>补充说明：</Text>
                {detail.instruction}
              </Paragraph>
            ) : null}
            {detail.error ? (
              <Paragraph type="danger">{detail.error}</Paragraph>
            ) : null}

            <div>
              <Text strong>关联反馈（前因）</Text>
              {(detail.feedbacks || []).map((f) => {
                const st = feedbackStatusLabel(f.status);
                return (
                  <div
                    key={f.id}
                    style={{
                      marginTop: 8,
                      padding: 8,
                      background: '#fafafa',
                      borderRadius: 4,
                    }}
                  >
                    <Space wrap>
                      <Tag>{f.feedback_type}</Tag>
                      <Tooltip title={st.tip}>
                        <Tag color={st.color}>{st.text}</Tag>
                      </Tooltip>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        onClick={() => openFeedbackDetail(f.id || '')}
                      >
                        {(f.id || '').slice(0, 10)}…
                      </Button>
                      {canMarkFixed(f.status) && (
                        <Button
                          size="small"
                          type="primary"
                          loading={markingId === f.id}
                          onClick={() => markFixed(f.id || '')}
                        >
                          标识为待验证
                        </Button>
                      )}
                      {f.status === 'fixed' && (
                        <Tag color="purple">已待验证</Tag>
                      )}
                    </Space>
                    <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                      {f.content || '—'}
                    </Paragraph>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {f.user_name || f.user || '—'} · {f.page || '—'} ·{' '}
                      {f.created_at || ''}
                    </Text>
                  </div>
                );
              })}
              {!detail.feedbacks?.length && (
                <Paragraph type="secondary">无关联反馈</Paragraph>
              )}
            </div>

            <Collapse
              defaultActiveKey={['result']}
              items={[
                {
                  key: 'result',
                  label: detail.has_result
                    ? 'RESULT.md（后果）'
                    : detail.has_error
                      ? 'ERROR.md'
                      : 'RESULT / ERROR（尚未生成）',
                  children: (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        maxHeight: 420,
                        overflow: 'auto',
                        margin: 0,
                      }}
                    >
                      {detail.result_md ||
                        detail.error_md ||
                        '（暂无）'}
                    </pre>
                  ),
                },
                {
                  key: 'brief',
                  label: 'BRIEF.md（打包摘要）',
                  children: (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        maxHeight: 280,
                        overflow: 'auto',
                        margin: 0,
                      }}
                    >
                      {detail.brief_md || '（无）'}
                    </pre>
                  ),
                },
                {
                  key: 'manifest',
                  label: 'manifest.json',
                  children: (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 11,
                        maxHeight: 280,
                        overflow: 'auto',
                        margin: 0,
                      }}
                    >
                      {detail.manifest
                        ? JSON.stringify(detail.manifest, null, 2)
                        : '（无）'}
                    </pre>
                  ),
                },
              ]}
            />
          </Space>
        )}
      </Drawer>

      <Drawer
        title={
          fbDetail
            ? `反馈 ${(fbDetail.id || '').slice(0, 10)}…`
            : '反馈详情'
        }
        width={480}
        open={fbOpen}
        onClose={() => setFbOpen(false)}
        destroyOnClose
        extra={
          <Space>
            {fbDetail?.id && (
              <Button
                type="link"
                onClick={() => {
                  history.push(`/admin/feedback?id=${fbDetail.id}`);
                }}
              >
                在反馈管理打开
              </Button>
            )}
            {fbDetail && canMarkFixed(fbDetail.status) && (
              <Button
                type="primary"
                size="small"
                loading={markingId === fbDetail.id}
                onClick={() => markFixed(fbDetail.id)}
              >
                标识为待验证
              </Button>
            )}
          </Space>
        }
      >
        {fbLoading && <Text type="secondary">加载中…</Text>}
        {fbDetail && !fbLoading && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Tag>{fbDetail.feedback_type}</Tag>
              {(() => {
                const s = feedbackStatusLabel(fbDetail.status);
                return <Tag color={s.color}>{s.text}</Tag>;
              })()}
            </div>
            <Paragraph>{fbDetail.content}</Paragraph>
            <Text type="secondary">
              {fbDetail.user_name || fbDetail.user || '—'} ·{' '}
              {fbDetail.page || '—'} · {fbDetail.created_at}
            </Text>
            {fbDetail.reply ? (
              <Paragraph>
                <Text strong>回复：</Text>
                {fbDetail.reply}
              </Paragraph>
            ) : null}
            {(fbDetail.comments || []).length > 0 && (
              <div>
                <Text strong>评论</Text>
                {(fbDetail.comments || []).map((c) => (
                  <Paragraph key={c.id} style={{ marginBottom: 4 }}>
                    <Text type="secondary">
                      {c.user_name || c.user || '—'}：
                    </Text>
                    {c.content}
                  </Paragraph>
                ))}
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </PageContainer>
  );
};

export default FeedbackDev;
