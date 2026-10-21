import React, { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Input, Select, Space, Table, Tabs, Button } from 'antd';
import { fetchLoginLogs, fetchUserLogs } from '@/services/audit';

const AuditLogs: React.FC = () => {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [loginRows, setLoginRows] = useState<any[]>([]);
  const [loginTotal, setLoginTotal] = useState(0);
  const [opRows, setOpRows] = useState<any[]>([]);
  const [opTotal, setOpTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [event, setEvent] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await fetchLoginLogs({
          page,
          size: 20,
          user: user || undefined,
          event: event || undefined,
        });
        setLoginRows(res?.data?.list || []);
        setLoginTotal(res?.data?.total || 0);
      } else {
        const res = await fetchUserLogs({
          page,
          size: 20,
          user: user || undefined,
          action: action || undefined,
          event: event || undefined,
        });
        setOpRows(res?.data?.list || []);
        setOpTotal(res?.data?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, page, user, action, event]);

  useEffect(() => {
    load();
  }, [load]);

  const loginCols = [
    { title: '账号', dataIndex: 'username', width: 100 },
    { title: '姓名', dataIndex: 'name', width: 100 },
    { title: '事件', dataIndex: 'event', width: 110 },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: 'IP', dataIndex: 'client_ip', width: 130 },
    { title: 'UA', dataIndex: 'user_agent', ellipsis: true },
    { title: 'session', dataIndex: 'session_id', width: 100 },
    { title: '登录时', dataIndex: 'login_at', width: 170 },
    { title: '退出时', dataIndex: 'logout_at', width: 170 },
    { title: '时长(s)', dataIndex: 'duration_s', width: 80 },
  ];

  const opCols = [
    { title: '用户', dataIndex: 'user', width: 100 },
    { title: '动作', dataIndex: 'action', width: 120 },
    { title: '对象', dataIndex: 'target', width: 140, ellipsis: true },
    { title: '结果', dataIndex: 'result', width: 70 },
    { title: 'URL', dataIndex: 'url', ellipsis: true },
    { title: 'IP', dataIndex: 'client_ip', width: 120 },
    { title: '停留ms', dataIndex: 'duration_ms', width: 90 },
    { title: '时间', dataIndex: 'record_time', width: 170 },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
  ];

  return (
    <PageContainer breadcrumb={{}}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          placeholder="用户名"
          value={user}
          onChange={(e) => {
            setPage(1);
            setUser(e.target.value);
          }}
          style={{ width: 140 }}
          allowClear
        />
        {tab === 'login' ? (
          <Select
            allowClear
            placeholder="事件"
            style={{ width: 140 }}
            value={event || undefined}
            onChange={(v) => {
              setPage(1);
              setEvent(v || '');
            }}
            options={[
              { value: 'login_ok', label: '登录成功' },
              { value: 'login_fail', label: '登录失败' },
              { value: 'logout', label: '退出' },
              { value: 'timeout', label: '超时' },
            ]}
          />
        ) : (
          <Input
            placeholder="action"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            style={{ width: 140 }}
            allowClear
          />
        )}
        <Button onClick={load}>刷新</Button>
      </Space>
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
        }}
        items={[
          {
            key: 'login',
            label: '登录日志',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                columns={loginCols as any}
                dataSource={loginRows}
                pagination={{
                  current: page,
                  pageSize: 20,
                  total: loginTotal,
                  onChange: setPage,
                }}
                size="small"
              />
            ),
          },
          {
            key: 'ops',
            label: '操作日志',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                columns={opCols as any}
                dataSource={opRows}
                pagination={{
                  current: page,
                  pageSize: 20,
                  total: opTotal,
                  onChange: setPage,
                }}
                size="small"
              />
            ),
          },
        ]}
      />
    </PageContainer>
  );
};

export default AuditLogs;
