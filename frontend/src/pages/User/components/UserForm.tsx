import { Form, Input, Modal, Select } from 'antd';
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

  useEffect(() => {
     //每次重置表单
     form.resetFields();
     // 在新数据变化时更新表单
     form.setFieldsValue(initialValues);
  }, [initialValues, form]);

  return (
    <Modal
      visible={visible}
      title={initialValues ? '编辑用户' : '新增用户'}
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
          <Input disabled={initialValues?.userid!==undefined} placeholder={"请输入登录用户名"} />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true }]}>
          <Input.Password  iconRender={visible => (visible ? <LockOutlined /> : <UserOutlined />)} placeholder={"请输入登录密码"} />
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
        {/* <Form.Item name="unit" label="单位" rules={[{ required: false }]}>*/}
        {/*  <Input placeholder={"请输入用户单位"}  />*/}
        {/*</Form.Item>*/}
        {/*<Form.Item name="phone" label="电话" rules={[{ required: false }]}>*/}
        {/*  <Input placeholder={"请输入用户电话"} />*/}
        {/*</Form.Item>*/}
        {/*<Form.Item name="address" label="地址" rules={[{ required: false }]}>*/}
        {/*  <Input placeholder={"请输入用户地址"} />*/}
        {/*</Form.Item>*/}
        <Form.Item name="access" label="角色" rules={[{ required: true }]}>
          <Select options={userRoles} placeholder={"请选择用户角色"} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
export default UserForm;
