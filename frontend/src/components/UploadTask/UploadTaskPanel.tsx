import React from 'react';
import {
  Badge,
  Button,
  Drawer,
  List,
  Modal,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CaretRightOutlined,
  CloseCircleOutlined,
  MinusOutlined,
  PauseOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useUploadTasks, UploadTask } from './UploadTaskContext';

const statusColor: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  paused: 'warning',
  stopped: 'default',
  completed: 'success',
  failed: 'error',
  success: 'success',
  cancelled: 'default',
};

const statusLabel: Record<string, string> = {
  pending: '等待中',
  running: '进行中',
  paused: '已暂停',
  stopped: '已停止',
  completed: '已完成',
  failed: '失败',
  success: '成功',
  cancelled: '已取消',
};

const stageLabel: Record<string, string> = {
  queued: '排队',
  upload: '上传',
  parsing: '解析',
  ocr: 'OCR识别',
  vectorizing: '入向量库',
  done: '完成',
  failed: '失败',
  stopped: '已停止',
};

function taskPercent(task: UploadTask) {
  if (task.status === 'completed') return 100;
  const items = task.items || [];
  if (items.length > 0 && task.total > 0) {
    const acc = items.reduce((sum, item) => {
      if (['success', 'failed', 'cancelled'].includes(item.status)) return sum + 100;
      return sum + Math.max(0, Math.min(99, item.progress || 0));
    }, 0);
    return Math.min(100, Math.round(acc / task.total));
  }
  return Math.max(0, Math.min(100, task.percent || 0));
}

function TaskDetail({ task }: { task: UploadTask }) {
  const { pause, resume, stop, retry, setMinimized, setPanelOpen } = useUploadTasks();
  const percent = taskPercent(task);

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Tag color={statusColor[task.status] || 'default'}>{statusLabel[task.status] || task.status}</Tag>
        <Typography.Text type="secondary">知识库：{task.kb_name}</Typography.Text>
        <Typography.Text type="secondary">
          {task.done}/{task.total} 成功 · 失败/取消 {task.failed}
        </Typography.Text>
      </Space>
      <div style={{ marginBottom: 4 }}>
        <Space wrap size={[8, 4]}>
          <Typography.Text strong>总进度</Typography.Text>
          <Typography.Text type="secondary" copyable={{ text: task.id }} style={{ fontSize: 12 }}>
            任务ID：{task.id}
          </Typography.Text>
        </Space>
      </div>
      <Progress
        percent={Math.min(100, percent)}
        status={
          task.status === 'failed' || (task.status === 'completed' && task.failed > 0)
            ? 'exception'
            : task.status === 'completed'
              ? 'success'
              : 'active'
        }
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        {task.message}
        {task.current_file ? `（当前：${task.current_file}）` : ''}
      </Typography.Paragraph>
      <Space style={{ marginBottom: 12 }} wrap>
        {(task.status === 'running' || task.status === 'pending') && (
          <Button icon={<PauseOutlined />} onClick={() => pause(task.id).then(() => message.info('已暂停'))}>
            暂停
          </Button>
        )}
        {(task.status === 'paused' || task.status === 'stopped') && (
          <Button
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={() => resume(task.id).then(() => message.success('已恢复'))}
          >
            恢复
          </Button>
        )}
        {['running', 'pending', 'paused'].includes(task.status) && (
          <Button
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => stop(task.id).then(() => message.warning('已停止，可稍后恢复'))}
          >
            停止
          </Button>
        )}
        {(task.failed > 0 || task.status === 'stopped') && (
          <Button icon={<ReloadOutlined />} onClick={() => retry(task.id).then(() => message.success('开始重试'))}>
            重试失败/未完成
          </Button>
        )}
        <Button
          icon={<MinusOutlined />}
          onClick={() => {
            setMinimized(true);
            setPanelOpen(false);
          }}
        >
          最小化到后台
        </Button>
      </Space>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        文件进度
      </Typography.Text>
      <List
        size="small"
        bordered
        dataSource={task.items || []}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space wrap>
                  <span>{item.file_name}</span>
                  <Tag color={statusColor[item.status] || 'default'}>
                    {statusLabel[item.status] || item.status}
                  </Tag>
                  <Tag>{stageLabel[item.stage] || item.stage}</Tag>
                </Space>
              }
              description={
                item.error ? (
                  <Typography.Text type="danger">{item.error}</Typography.Text>
                ) : item.docs_count ? (
                  `切片 ${item.docs_count}`
                ) : (
                  ''
                )
              }
            />
            <Progress type="circle" percent={item.progress || 0} width={36} />
          </List.Item>
        )}
      />
    </div>
  );
}

export const UploadTaskPanel: React.FC = () => {
  const {
    panelOpen,
    setPanelOpen,
    setMinimized,
    activeTask,
    tasks,
    openTask,
    minimized,
  } = useUploadTasks();

  return (
    <>
      <Modal
        title="上传任务进度"
        open={panelOpen}
        onCancel={() => {
          setPanelOpen(false);
          if (activeTask && ['running', 'pending', 'paused'].includes(activeTask.status)) {
            setMinimized(true);
            message.info('任务已在后台继续运行');
          }
        }}
        width={820}
        footer={null}
        destroyOnClose={false}
        maskClosable={false}
      >
        {activeTask ? (
          <TaskDetail task={activeTask} />
        ) : (
          <Typography.Text type="secondary">暂无选中任务</Typography.Text>
        )}
      </Modal>

      {minimized && activeTask && ['running', 'pending', 'paused'].includes(activeTask.status) && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1100,
            background: '#fff',
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            borderRadius: 8,
            padding: '10px 14px',
            maxWidth: 360,
            cursor: 'pointer',
            border: '1px solid #f0f0f0',
          }}
          onClick={() => {
            setMinimized(false);
            setPanelOpen(true);
          }}
        >
          <Space>
            <Badge status={activeTask.status === 'paused' ? 'warning' : 'processing'} />
            <CloudUploadOutlined />
            <div>
              <div>
                后台上传任务 · {statusLabel[activeTask.status]} · {activeTask.done}/{activeTask.total}
              </div>
              <Progress
                percent={taskPercent(activeTask)}
                size="small"
                style={{ width: 220, marginBottom: 0 }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                点击恢复窗口
              </Typography.Text>
            </div>
          </Space>
        </div>
      )}
    </>
  );
};

export const UploadTaskManagerDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  kbName?: string;
}> = ({ open, onClose, kbName }) => {
  const { tasks, openTask, resume, retry, refreshTasks } = useUploadTasks();
  const filtered = kbName ? tasks.filter((t) => t.kb_name === kbName) : tasks;

  React.useEffect(() => {
    if (open) refreshTasks();
  }, [open, refreshTasks]);

  return (
    <Drawer title="上传任务管理" width={560} open={open} onClose={onClose}>
      <Typography.Paragraph type="secondary">
        可查看历史上传流水线；已停止/失败的任务可恢复或重试继续入向量库。
      </Typography.Paragraph>
      <List
        dataSource={filtered}
        locale={{ emptyText: '暂无上传任务' }}
        renderItem={(task) => (
          <List.Item
            actions={[
              <a
                key="view"
                onClick={() => {
                  openTask(task.id);
                  onClose();
                }}
              >
                查看
              </a>,
              (task.status === 'paused' || task.status === 'stopped') && (
                <a key="resume" onClick={() => resume(task.id)}>
                  恢复
                </a>
              ),
              task.failed > 0 && (
                <a key="retry" onClick={() => retry(task.id)}>
                  重试
                </a>
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Tag color={statusColor[task.status]}>{statusLabel[task.status]}</Tag>
                  {task.kb_name}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {task.create_time}
                  </Typography.Text>
                </Space>
              }
              description={
                <div>
                  <Progress
                    percent={taskPercent(task)}
                    size="small"
                    status={
                      task.status === 'completed' && task.failed > 0
                        ? 'exception'
                        : task.status === 'completed'
                          ? 'success'
                          : 'active'
                    }
                  />
                  <div>
                    {task.done}/{task.total} · {task.message}
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
};

export const UploadTaskFloatEntry: React.FC = () => {
  const { runningCount, tasks, openTask, setMinimized, setPanelOpen } = useUploadTasks();
  if (runningCount <= 0) return null;
  const first = tasks.find((t) => ['pending', 'running', 'paused'].includes(t.status));
  if (!first) return null;
  return (
    <Tooltip title="有后台上传/向量化任务，点击查看">
      <Badge count={runningCount} size="small">
        <Button
          type="primary"
          shape="circle"
          icon={<CloudUploadOutlined />}
          onClick={() => {
            setMinimized(false);
            openTask(first.id);
            setPanelOpen(true);
          }}
        />
      </Badge>
    </Tooltip>
  );
};
