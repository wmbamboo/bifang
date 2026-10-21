import { Form, Input, Modal, Select, Switch } from 'antd';
import {LockOutlined, UserOutlined} from "@ant-design/icons";
import React, {useEffect} from "react";
interface UserFormProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: API.UserType) => void;
  userRoles: {label: string; value:string}[],
  initialValues?: API.UserType;
}
const UserForm: React.FC<UserFormProps> = ({
  visible,
  onCancel,
  onSubmit,
  userRoles,
  initialValues,
}) => {
  const [form] = Form.useForm();
  const isEdit = initialValues?.userid !== undefined;

  useEffect(() => {
     form.resetFields();
     form.setFieldsValue({
       ...initialValues,
       password: '',
       user_status: initialValues?.user_status !== false,
     });
  }, [initialValues, form]);

  return (
    <Modal
      visible={visible}
      title={isEdit ? '编辑用户' : '新增用户'}
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        initialValues={initialValues}
        onFinish={onSubmit}
      >
        <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
          <Input  placeholder={"请输入姓名"}/>
        </Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
          <Input disabled={isEdit} placeholder={"请输入登录用户名"} />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={isEdit ? [] : [{ required: true, message: '请输入登录密码' }]}
          extra={isEdit ? '留空则不修改密码' : undefined}
        >
          <Input.Password
            iconRender={visible => (visible ? <LockOutlined /> : <UserOutlined />)}
            placeholder={isEdit ? '留空则不修改' : '请输入登录密码'}
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item name="signature" label="签名" rules={[{ required: false }]}>
          <Input placeholder={"请输入用户签名"} />
        </Form.Item>
        <Form.Item name="avatar" label="图标URl" rules={[{ required: false }]}>
          <Input placeholder={"请输入用户图标url"} />
        </Form.Item>
        <Form.Item name="dept" label="部门" rules={[{ required: false }]}>
          <Input placeholder={"请输入用户部门"} />
        </Form.Item>
         <Form.Item name="email" label="邮箱" rules={[{ required: false }]}>
          <Input placeholder={"请输入用户邮箱"} />
        </Form.Item>
        <Form.Item
          name="roles"
          label="角色"
          rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个角色' }]}
          extra="可多选；含「管理员」则主身份为 admin，否则为 user；「知识库管理员」可叠加"
        >
          <Select
            mode="multiple"
            options={userRoles}
            placeholder={"请选择用户角色（可多选）"}
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="user_status"
          label="状态"
          valuePropName="checked"
        >
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
export default UserForm;
