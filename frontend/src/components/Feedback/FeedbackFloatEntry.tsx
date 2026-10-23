import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import FeedbackModal from './FeedbackModal';
import { ensureConsoleTailCapture } from '@/utils/feedbackContext';
import {
  fetchUnreadFeedbackCount,
  flushFeedbackOfflineQueue,
} from '@/services/feedback';

const FeedbackFloatEntry: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    fetchUnreadFeedbackCount('submitter')
      .then((res) => {
        if (res?.code === 200) setUnread(Number(res.data?.count || 0));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    ensureConsoleTailCapture();
    flushFeedbackOfflineQueue();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    refreshUnread();
    const t = window.setInterval(refreshUnread, 60000);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(t);
    };
  }, [refreshUnread]);

  return (
    <>
      <Tooltip
        title={
          unread > 0
            ? `反馈（${unread} 条待你验证）Ctrl+Shift+F`
            : '反馈（Ctrl+Shift+F）'
        }
      >
        <Badge count={unread} size="small" offset={[-4, 4]}>
          <Button
            type="default"
            shape="circle"
            icon={<MessageOutlined />}
            onClick={() => setOpen(true)}
          />
        </Badge>
      </Tooltip>
      <FeedbackModal
        open={open}
        onClose={() => {
          setOpen(false);
          refreshUnread();
        }}
        onTodoChange={refreshUnread}
      />
    </>
  );
};

export default FeedbackFloatEntry;
