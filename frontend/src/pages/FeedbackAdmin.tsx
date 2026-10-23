import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
  Badge,
  Button,
  Drawer,
  Input,
  List,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Image,
  Collapse,
  Tooltip,
} from 'antd';
import { useLocation, useModel } from '@umijs/max';
import {
  addFeedbackComment,
  dispatchFeedbackToCursor,
  feedbackStatusLabel,
  getCursorJob,
  getFeedback,
  listFeedback,
  markFeedbackCommentsRead,
  notifyStatusLabel,
  prepareFeedbackForWorkbuddy,
  resendFeedbackNotify,
  updateFeedback,
  type CursorJobMeta,
  type FeedbackItem,
  type FeedbackStatus,
} from '@/services/feedback';
import { useFeedbackImages } from '@/components/Feedback/useFeedbackImages';
import authAxios from '@/utils/authAxios';

const refreshUnreadBadge = () => {
  window.dispatchEvent(new Event('bf-feedback-unread-refresh'));
};

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const STATUS_OPTS: { value: FeedbackStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  ...(['pending', 'resolving', 'fixed', 'resolved', 'ignored'] as const).map(
    (s) => ({ value: s as FeedbackStatus, label: feedbackStatusLabel(s).text }),
  ),
];

const FeedbackAdmin: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const me = initialState?.currentUser as any;
  const roles: string[] =
    me?.roles?.length ? me.roles : me?.access ? [me.access] : [];
  /** 仅 admin 可改状态/指派；普通用户只读自己的提交与处理结果 */
  const isAdmin = roles.includes('admin');
  const canViewAll =
    isAdmin ||
    roles.includes('feedback_receiver') ||
    roles.includes('feedback_verifier');
  const canDispatch =
    isAdmin || roles.includes('feedback_receiver');
  const canVerifyRole =
    isAdmin || roles.includes('feedback_verifier');
  const loc = useLocation();
  const [rows, setRows] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  // 无全量权限默认「我的」；接收员/验证员/admin 默认全部
  const [mine, setMine] = useState(canViewAll ? 0 : 1);
  const [assignee, setAssignee] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FeedbackItem | null>(null);
  const [reply, setReply] = useState('');
  const [comment, setComment] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [cursorJob, setCursorJob] = useState<CursorJobMeta | null>(null);
  const [workbuddyJob, setWorkbuddyJob] = useState<{
    job_id: string;
    instruction: string;
  } | null>(null);
  const [scrollToComments, setScrollToComments] = useState(false);
  const commentsRef = useRef<HTMLDivElement | null>(null);
  const detailImgUrls = useFeedbackImages(detail?.images || []);

  useEffect(() => {
    const q = new URLSearchParams(loc.search || '');
    if (q.get('mine') === '1') setMine(1);
    else if (!canViewAll) setMine(1);
    if (q.get('assignee') === 'me') setAssignee('me');
    const id = q.get('id');
    if (id) openDetail(id);
  }, [canViewAll]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await listFeedback({
        mine: mine ? 1 : undefined,
        status: status || undefined,
        assignee: assignee || undefined,
      });
      // 兼容 {code,data} 整包 或 已解包的数组
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : [];
      if (Array.isArray(res) || res?.code === 200) {
        setRows(list);
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
  }, [mine, status, assignee]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (
    id: string,
    opts?: { focusComments?: boolean },
  ) => {
    try {
      const res = await getFeedback(id);
      if (res?.code === 200) {
        setDetail(res.data);
        setReply(res.data?.reply || '');
        setOpen(true);
        setScrollToComments(!!opts?.focusComments);
        if (opts?.focusComments) {
          await markFeedbackCommentsRead(id);
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, new_comment_count: 0 } : r,
            ),
          );
          refreshUnreadBadge();
        }
      } else message.error(res?.msg || '加载详情失败');
    } catch (e: any) {
      message.error(e?.message || '加载详情失败');
    }
  };

  useEffect(() => {
    if (!open || !scrollToComments) return;
    const t = window.setTimeout(() => {
      commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToComments(false);
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, scrollToComments, detail?.id]);

  const changeStatus = async (next: FeedbackStatus) => {
    if (!detail) return;
    try {
      const body: Record<string, any> = { status: next };
      if (next === 'pending' && detail.status === 'fixed') {
        if (!reopenReason.trim()) {
          message.warning('重开须填原因');
          return;
        }
        body.reopen_reason = reopenReason.trim();
      }
      if (isAdmin && reply !== detail.reply) body.reply = reply;
      const res = await updateFeedback(detail.id, body);
      if (res?.code === 200) {
        message.success('已更新');
        setDetail(res.data);
        load();
      } else message.error(res?.msg || '更新失败');
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    }
  };

  const assignMe = async () => {
    if (!detail || !isAdmin) return;
    const res = await updateFeedback(detail.id, {
      assignee: me?.username || me?.name || '',
      assignee_name: me?.name || me?.username || '',
    });
    if (res?.code === 200) {
      message.success('已指派给我');
      setDetail(res.data);
      load();
    } else message.error(res?.msg || '指派失败');
  };

  const sendComment = async () => {
    if (!detail || !comment.trim()) return;
    const res = await addFeedbackComment(detail.id, comment.trim());
    if (res?.code === 200) {
      message.success('已评论');
      setComment('');
      await markFeedbackCommentsRead(detail.id);
      openDetail(detail.id, { focusComments: true });
      load();
      refreshUnreadBadge();
    } else message.error(res?.msg || '评论失败');
  };

  const pollCursorJob = useCallback(async (jobId: string) => {
    try {
      const res = await getCursorJob(jobId);
      if (res?.code === 200 && res.data) {
        setCursorJob(res.data);
        const st = res.data.status || '';
        if (st === 'done' || st === 'error') return;
        window.setTimeout(() => pollCursorJob(jobId), 2000);
      }
    } catch {
      /* 轮询失败不打断 */
    }
  }, []);

  const onDispatchCursor = async () => {
    if (!selectedIds.length) {
      message.warning('请先勾选反馈');
      return;
    }
    setDispatching(true);
    try {
      const res = await dispatchFeedbackToCursor({ ids: selectedIds });
      if (res?.code === 200 && res.data?.job_id) {
        message.success('已提交 Cursor 处理');
        setCursorJob({ job_id: res.data.job_id, status: res.data.status });
        pollCursorJob(res.data.job_id);
      } else {
        message.error(res?.msg || '派发失败');
      }
    } catch (e: any) {
      message.error(e?.message || '派发失败');
    } finally {
      setDispatching(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // http 非安全上下文降级方案
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const onDispatchWorkbuddy = async () => {
    if (!selectedIds.length) {
      message.warning('请先勾选反馈');
      return;
    }
    setDispatching(true);
    try {
      const res = await prepareFeedbackForWorkbuddy({ ids: selectedIds });
      if (res?.code === 200 && res.data?.job_id) {
        setWorkbuddyJob({
          job_id: res.data.job_id,
          instruction: res.data.instruction,
        });
        const copied = await copyText(res.data.instruction);
        message.success(
          copied
            ? '已打包，分析指令已复制到剪贴板'
            : '已打包，请在弹窗中复制分析指令',
        );
        pollCursorJob(res.data.job_id);
      } else {
        message.error(res?.msg || '打包失败');
      }
    } catch (e: any) {
      message.error(e?.message || '打包失败');
    } finally {
      setDispatching(false);
    }
  };

  const downloadPack = async () => {
    const jobId = cursorJob?.job_id;
    if (!jobId) return;
    try {
      const res = await authAxios.get(
        `/api/feedback/cursor-jobs/${jobId}/pack`,
        { responseType: 'blob' },
      );
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

  const columns = [
    {
      title: '编号',
      dataIndex: 'id',
      width: 100,
      render: (v: string) => v?.slice(0, 8),
    },
    {
      title: '类型',
      dataIndex: 'feedback_type',
      width: 90,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => {
        const s = feedbackStatusLabel(v);
        const tag = <Tag color={s.color}>{s.text}</Tag>;
        return s.tip ? <Tooltip title={s.tip}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
    },
    {
      title: '评论',
      dataIndex: 'comment_count',
      width: 88,
      render: (_: any, r: FeedbackItem) => {
        const total = Number(r.comment_count || 0);
        const neu = Number(r.new_comment_count || 0);
        return (
          <Badge count={neu} size="small" offset={[6, 0]}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, minWidth: 24 }}
              onClick={() => openDetail(r.id, { focusComments: true })}
            >
              {total}
            </Button>
          </Badge>
        );
      },
    },
    {
      title: '提交人',
      dataIndex: 'user_name',
      width: 100,
      render: (_: any, r: FeedbackItem) => r.user_name || r.user || '—',
    },
    {
      title: '指派',
      dataIndex: 'assignee_name',
      width: 100,
      render: (_: any, r: FeedbackItem) => r.assignee_name || r.assignee || '—',
    },
    {
      title: '通知',
      dataIndex: 'notify_status',
      width: 160,
      render: (v: string) => {
        const n = notifyStatusLabel(v);
        const tag = <Tag color={n.color}>{n.text}</Tag>;
        return n.tip ? <Tooltip title={n.tip}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: '操作',
      width: 90,
      render: (_: any, r: FeedbackItem) => (
        <Button type="link" onClick={() => openDetail(r.id)}>
          详情
        </Button>
      ),
    },
  ];

  const loginUser =
    (typeof localStorage !== 'undefined' && localStorage.getItem('loginUser')) ||
    '';
  /** 提交人：username / loginUser / 显示名 任一命中即可（防 user_name 存成登录名导致误判） */
  const isOwner = !!(
    detail &&
    (
      (me?.username &&
        (detail.user === me.username || detail.user_name === me.username)) ||
      (loginUser &&
        (detail.user === loginUser || detail.user_name === loginUser)) ||
      (me?.name && detail.user_name === me.name)
    )
  );
  const canVerify = isOwner || canVerifyRole;

  return (
    <PageContainer breadcrumb={{}}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 140 }}
          value={status}
          options={STATUS_OPTS}
          onChange={setStatus}
        />
        <Select
          style={{ width: 140 }}
          value={mine}
          options={[
            { value: 0, label: canViewAll ? '全部' : '我的' },
            { value: 1, label: '仅我的' },
          ]}
          onChange={setMine}
        />
        {canViewAll && (
          <Select
            style={{ width: 140 }}
            value={assignee}
            options={[
              { value: '', label: '全部指派' },
              { value: 'me', label: '指派给我' },
            ]}
            onChange={setAssignee}
          />
        )}
        <Button onClick={load}>刷新</Button>
        {canDispatch && (
          <Button
            type="primary"
            loading={dispatching}
            disabled={!selectedIds.length}
            onClick={onDispatchCursor}
          >
            打包并交 Cursor 处理
          </Button>
        )}
        {canDispatch && (
          <Button
            loading={dispatching}
            disabled={!selectedIds.length}
            onClick={onDispatchWorkbuddy}
          >
            打包并交 WorkBuddy 分析
          </Button>
        )}
        {cursorJob?.job_id && (
          <Text type="secondary">
            Agent 任务 {cursorJob.job_id.slice(0, 8)}…：
            {cursorJob.status || '—'}
            {cursorJob.error ? `（${cursorJob.error}）` : ''}
          </Text>
        )}
        {cursorJob?.has_pack && (
          <Button onClick={downloadPack}>下载反馈包</Button>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns as any}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        size="middle"
        rowSelection={
          canDispatch
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
              }
            : undefined
        }
      />

      <Drawer
        title={detail ? `反馈 ${detail.id.slice(0, 8)}` : '详情'}
        width={520}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Tag>{detail.feedback_type}</Tag>
              {(() => {
                const s = feedbackStatusLabel(detail.status);
                const tag = <Tag color={s.color}>{s.text}</Tag>;
                return s.tip ? (
                  <Tooltip title={s.tip}>{tag}</Tooltip>
                ) : (
                  tag
                );
              })()}
              {(() => {
                const n = notifyStatusLabel(detail.notify_status);
                const tag = <Tag color={n.color}>通知:{n.text}</Tag>;
                return n.tip ? (
                  <Tooltip title={n.tip}>{tag}</Tooltip>
                ) : (
                  tag
                );
              })()}
            </div>
            <Paragraph>{detail.content}</Paragraph>
            <Text type="secondary">
              提交人：{detail.user_name || detail.user || '—'} · {detail.created_at}
            </Text>
            {detail.images && detail.images.length > 0 && (
              <Image.PreviewGroup>
                <Space wrap>
                  {detail.images.map((n) =>
                    detailImgUrls[n] ? (
                      <Image key={n} width={96} src={detailImgUrls[n]} />
                    ) : (
                      <div
                        key={n}
                        style={{
                          width: 96,
                          height: 96,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#f5f5f5',
                          color: '#999',
                          fontSize: 12,
                          borderRadius: 4,
                        }}
                      >
                        图片加载失败
                      </div>
                    ),
                  )}
                </Space>
              </Image.PreviewGroup>
            )}
            <Collapse
              size="small"
              items={[
                {
                  key: 'ctx',
                  label: '上下文快照',
                  children: (
                    <Text
                      code
                      style={{
                        display: 'block',
                        maxHeight: 200,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontSize: 11,
                      }}
                    >
                      {detail.context_json || '（无）'}
                    </Text>
                  ),
                },
              ]}
            />

            {isAdmin && (
              <>
                <div>
                  <Text type="secondary">内部回复</Text>
                  <TextArea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </div>
                <Space wrap>
                  <Button onClick={assignMe}>指派给我</Button>
                  <Button onClick={() => changeStatus('resolving')}>
                    处理中
                  </Button>
                  <Button type="primary" onClick={() => changeStatus('fixed')}>
                    标为待验证
                  </Button>
                  <Button onClick={() => changeStatus('ignored')}>忽略</Button>
                  <Button
                    onClick={async () => {
                      await updateFeedback(detail.id, { reply });
                      message.success('回复已保存');
                      load();
                    }}
                  >
                    保存回复
                  </Button>
                </Space>
              </>
            )}

            {(isOwner || isAdmin) &&
              ['fixed', 'resolved'].includes(detail.status) &&
              ['no_email', 'failed', 'skipped'].includes(
                detail.notify_status || '',
              ) && (
                <Button
                  onClick={async () => {
                    const res = await resendFeedbackNotify(detail.id);
                    if (res?.success !== false) {
                      message.success(res?.msg || '已触发重发');
                      openDetail(detail.id);
                      load();
                    } else {
                      message.error(res?.msg || '重发失败');
                    }
                  }}
                >
                  重发通知
                </Button>
              )}

            {canVerify && detail.status === 'fixed' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button type="primary" onClick={() => changeStatus('resolved')}>
                  验证已修复
                </Button>
                <Input
                  placeholder="重开原因"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
                <Button danger onClick={() => changeStatus('pending')}>
                  重新打开
                </Button>
              </Space>
            )}

            <div ref={commentsRef} id="feedback-comments-section">
              <Text strong>评论</Text>
              <List
                size="small"
                dataSource={detail.comments || []}
                locale={{ emptyText: '暂无评论' }}
                renderItem={(c) => (
                  <List.Item>
                    <Space direction="vertical" size={0}>
                      <Text>
                        {c.user_name || c.user || '—'}: {c.content}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {c.created_at}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
              <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="追加评论"
                />
                <Button type="primary" onClick={sendComment}>
                  发送
                </Button>
              </Space.Compact>
            </div>
          </Space>
        )}
      </Drawer>
      <Modal
        open={!!workbuddyJob}
        title={`WorkBuddy 分析任务 ${workbuddyJob?.job_id?.slice(0, 8) ?? ''}…`}
        onCancel={() => setWorkbuddyJob(null)}
        footer={null}
        width={680}
      >
        <Paragraph type="secondary">
          分析指令已复制到剪贴板（如未复制成功，请在下方手动复制）。打开
          WorkBuddy 粘贴发送即可；WorkBuddy 分析完成后会把结论写回该任务，此处状态将变为
          done，结果可在「Agent 任务」中查看。
        </Paragraph>
        <TextArea rows={8} readOnly value={workbuddyJob?.instruction} />
        <Space style={{ marginTop: 12 }}>
          <Button
            type="primary"
            onClick={async () => {
              if (await copyText(workbuddyJob?.instruction || '')) {
                message.success('已复制');
              } else {
                message.error('复制失败，请手动选择文本复制');
              }
            }}
          >
            复制分析指令
          </Button>
          {workbuddyJob && (
            <Button onClick={() => pollCursorJob(workbuddyJob.job_id)}>
              刷新任务状态
            </Button>
          )}
        </Space>
      </Modal>
    </PageContainer>
  );
};

export default FeedbackAdmin;
