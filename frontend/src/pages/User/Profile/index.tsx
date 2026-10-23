import React, { useEffect, useState } from 'react';
import { Form, Button, Input, message, Select, Modal, Space } from 'antd';
import { changePassword, updateUser } from '@/services/chatchat/kb';
import { PageContainer } from '@ant-design/pro-components';
import { currentUser } from '@/services/ant-design-pro/api';

const Profile = () => {
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [isEditing, setIsEditing] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [user, setUser] = useState<API.UserType | null>(null);
  const userRoleList = [
    { label: '管理员', value: 'admin' },
    { label: '用户', value: 'user' },
    { label: '知识库管理员', value: 'kb_manager' },
    { label: '反馈接收员', value: 'feedback_receiver' },
    { label: '反馈验证员', value: 'feedback_verifier' },
    { label: '程序猿', value: 'coder' },
  ];

  const fetchLoginUser = async () => {
    const storeLoginUser = localStorage.getItem('loginUser');
    const username = storeLoginUser !== null ? storeLoginUser : '';
    try {
      const curUserRes = await currentUser({ username });
      const curUser = curUserRes.data as API.UserType;
      const withRoles = {
        ...curUser,
        roles:
          curUser.roles && curUser.roles.length
            ? curUser.roles
            : curUser.access
              ? [curUser.access]
              : ['user'],
      };
      setUser(withRoles);
      form.setFieldsValue(withRoles);
      localStorage.setItem('userInfo', JSON.stringify(withRoles));
    } catch (e) {
      console.error(e);
      const cached = localStorage.getItem('userInfo');
      if (cached) {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        form.setFieldsValue(parsed);
      }
    }
  };

  useEffect(() => {
    form.resetFields();
    fetchLoginUser();
  }, []);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    form
      .validateFields()
      .then(async (values) => {
        const { password: _omit, ...rest } = values as API.UserType & {
          password?: string;
        };
        const payload = {
          ...rest,
          userid: rest.userid || user?.userid,
          username: rest.username || user?.username,
        } as API.UserType;
        await updateUser(payload);
        setUser(payload);
        setIsEditing(false);
        localStorage.setItem('userInfo', JSON.stringify(payload));
        message.success('个人信息更新成功');
      })
      .catch((error) => {
        if (error?.errorFields) return;
        console.error('个人信息保存失败:', error);
        message.error('个人信息保存失败');
      });
  };

  const handlePwdOk = async () => {
    try {
      const values = await pwdForm.validateFields();
      const userId = user?.userid || user?.username;
      if (!userId) {
        message.error('无法识别当前用户');
        return;
      }
      setPwdLoading(true);
      const res = await changePassword(userId, values.oldPwd, values.newPwd);
      if ((res as { success?: boolean })?.success === false) {
        message.error(
          (res as { errorMessage?: string; msg?: string }).errorMessage ||
            (res as { msg?: string }).msg ||
            '密码修改失败',
        );
        return;
      }
      message.success('密码修改成功');
      setPwdOpen(false);
      pwdForm.resetFields();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      const err = e as {
        info?: { errorMessage?: string };
        message?: string;
        data?: { errorMessage?: string; msg?: string };
      };
      message.error(
        err.info?.errorMessage ||
          err.data?.errorMessage ||
          err.data?.msg ||
          err.message ||
          '密码修改失败',
      );
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <PageContainer>
      <div>
        <Form form={form} layout="vertical">
          <Form.Item name="userid" label="用户ID" hidden>
            <Input disabled />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input disabled />
          </Form.Item>
          <Form.Item name="signature" label="签名" rules={[{ required: false }]}>
            <Input disabled={!isEditing} />
          </Form.Item>
          <Form.Item name="avatar" label="图标URl" rules={[{ required: false }]}>
            <Input disabled={!isEditing} />
          </Form.Item>
          <Form.Item name="dept" label="部门" rules={[{ required: false }]}>
            <Input disabled={!isEditing} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: false }]}>
            <Input disabled={!isEditing} />
          </Form.Item>
          <Form.Item name="roles" label="角色">
            <Select mode="multiple" disabled options={userRoleList} />
          </Form.Item>
          <Space>
            {isEditing ? (
              <Button type="primary" onClick={handleSaveClick}>
                保存
              </Button>
            ) : (
              <Button onClick={handleEditClick}>编辑</Button>
            )}
            <Button
              onClick={() => {
                pwdForm.resetFields();
                setPwdOpen(true);
              }}
            >
              修改密码
            </Button>
          </Space>
        </Form>

        <Modal
          title="修改密码"
          open={pwdOpen}
          onCancel={() => setPwdOpen(false)}
          onOk={handlePwdOk}
          confirmLoading={pwdLoading}
          destroyOnClose
        >
          <Form form={pwdForm} layout="vertical">
            <Form.Item
              name="oldPwd"
              label="原密码"
              rules={[{ required: true, message: '请输入原密码' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPwd"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '新密码至少 6 位' },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirmPwd"
              label="确认新密码"
              dependencies={['newPwd']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPwd') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的新密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </PageContainer>
  );
};

export default Profile;
