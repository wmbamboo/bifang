import React, { useEffect, useState } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { fetchUnreadFeedbackCount } from '@/services/feedback';

/** 右上角角标：fixed 待确认 / 被指派 */
const FeedbackBadge: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => {
      fetchUnreadFeedbackCount()
        .then((res) => {
          if (res?.code === 200) setCount(Number(res.data?.count || 0));
        })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <Tooltip title="我的反馈待办">
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
