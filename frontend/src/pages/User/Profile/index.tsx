import React, {useEffect, useState} from 'react';
import {Form, Button, Input, message, Select} from 'antd';
import {updateUser} from "@/services/chatchat/kb";
import {PageContainer} from "@ant-design/pro-components";
import {LockOutlined, UserOutlined} from "@ant-design/icons";
import {currentUser} from "@/services/ant-design-pro/api";

const Profile = () => {
  const [form] = Form.useForm();
  const [isEditing, setIsEditing] = useState(false);
  const [loginUserInfo,setLoginUserInfo]=useState({})
  const userRoleList = [{ label: '管理员', value: 'admin' },{ label: '用户', value: 'user' }];

  const fetchLoginUser = async () => {
    let storeLoginUser=localStorage.getItem('loginUser')
    let username=storeLoginUser!==null?storeLoginUser:'';
    let userInfo = localStorage.getItem('userInfo');
    if(userInfo === null) {
      const curUserRes = await currentUser({username});
      const curUser=curUserRes.data
      form.setFieldsValue(curUser);
      localStorage.setItem('userInfo',JSON.stringify(curUser));
     }else{
      form.setFieldsValue(JSON.parse(userInfo));
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
    // 保存个人信息
    form.validateFields()
     .then(values => {
       // 这里应该是一个API调用，更新用户信息
       setLoginUserInfo(values);
       setIsEditing(false);
       updateUser(values);
       localStorage.setItem('userInfo',JSON.stringify(values));
       message.success('个人信息更新成功');
     })
     .catch(error => {
       console.error('个人信息校验失败:', error);
     });
  };
  return (
    <PageContainer>
    <div>
      <Form form={form} layout="vertical"  initialValues={loginUserInfo}>
         <Form.Item name="userid" label="用户ID" rules={[{ required: true }]} hidden={true}>
          <Input disabled />
        </Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
          <Input disabled={!isEditing} />
        </Form.Item>
        <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
          <Input disabled/>
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true }]}>
          <Input.Password disabled={!isEditing} iconRender={visible => (visible ? <LockOutlined /> : <UserOutlined />)} />
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
        {/*<Form.Item name="unit" label="单位" rules={[{ required: false }]}>*/}
        {/*  <Input disabled={!isEditing} />*/}
        {/*</Form.Item>*/}
        {/*<Form.Item name="phone" label="电话" rules={[{ required: false }]}>*/}
        {/*  <Input disabled={!isEditing} />*/}
        {/*</Form.Item>*/}
        {/*<Form.Item name="address" label="地址" rules={[{ required: false }]}>*/}
        {/*  <Input disabled={!isEditing} />*/}
        {/*</Form.Item>*/}
        <Form.Item name="access" label="角色" rules={[{ required: true }]}>
          <Select disabled options={userRoleList} />
        </Form.Item>
        {isEditing ? (
          <Button type="primary" onClick={handleSaveClick}>
            保存
          </Button>
        ) : (
          <Button onClick={handleEditClick}>编辑</Button>
        )}
      </Form>
    </div>
    </PageContainer>
  );
};

export default Profile;
