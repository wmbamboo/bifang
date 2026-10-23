import React, { useEffect, useState } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { fetchUnreadFeedbackCount } from '@/services/feedback';

/** 右上角角标：与我相关反馈的新评论数 */
const FeedbackBadge: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => {
      fetchUnreadFeedbackCount('comments')
        .then((res) => {
          if (res?.code === 200) {
            setCount(
              Number(
                res.data?.new_comments ?? res.data?.count ?? 0,
              ),
            );
          }
        })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 60000);
    const onRefresh = () => load();
    window.addEventListener('bf-feedback-unread-refresh', onRefresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('bf-feedback-unread-refresh', onRefresh);
    };
  }, []);

  return (
    <Tooltip title="新评论">
      <Badge count={count} size="small">
        <Button
          type="text"
          icon={<MessageOutlined />}
          onClick={() => history.push('/admin/feedback?mine=1')}
        />
      </Badge>
    </Tooltip>
  );
};

export default FeedbackBadge;
