import {useCallback, useEffect, useRef, useState} from 'react';
import { Button, message} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {addUser, deleteUser, getUserList,  updateUser} from '@/services/chatchat/kb';
import UserForm from "@/pages/User/components/UserForm";
import {ActionType, PageContainer, ProFormInstance, ProTable} from "@ant-design/pro-components";

const UserList: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const formRef = useRef<ProFormInstance>();
  const [users, setUsers] = useState<API.UserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<API.UserType | undefined>();
  const userRoleList = [{ label: '管理员', value: 'admin' },{ label: '用户', value: 'user' },];
  const beInUsers=new Set(['admin','user']);

  /** 始终从数据库接口拉列表，不用 localStorage.userList */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // 顺手清掉历史脏缓存，避免别处误读
      localStorage.removeItem('userList');
      const resData = await getUserList();
      const list = Array.isArray(resData?.data) ? resData.data : [];
      setUsers(list);
    } catch (error) {
      console.error('获取用户列表失败', error);
      message.error('获取用户列表失败');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = () => {
    setVisible(true);
    setCurrentUser({
      userid: undefined,
      username: '',
      name: '',
      signature: '',
      avatar: '',
      dept: '',
      email: '',
      password: '',
      access: '',
      user_status: true,
    } as API.UserType);
  };
  const handleEditUser = (user: API.UserType) => {
    setVisible(true);
    setCurrentUser({ ...user, password: '', user_status: user.user_status !== false });
  };
  const handleDeleteUser = async (user: API.UserType) => {
     const beInUserFlag=beInUsers.has(user.username)
     if(beInUserFlag){
      message.warning('内置预设账号，不可删除！');
      return;
     }
     try {
       await deleteUser(user.userid as string);
       message.success('删除用户成功');
       await fetchUsers();
     } catch (e) {
       console.error(e);
       message.error('删除用户失败');
     }
  };
  const handleSubmit = async (user: API.UserType) => {
    try {
      const payload: API.UserType = {
        ...user,
        user_status: user.user_status !== false,
      };
      if (!payload.password) {
        delete (payload as { password?: string }).password;
      }
      if (currentUser?.userid === undefined){
        const randomId = Math.floor(Math.random() * 90000) + 10000;
        payload.userid = 'user_' + randomId;
        await addUser(payload);
        message.success('用户添加成功');
      } else {
        payload.userid = currentUser.userid;
        await updateUser(payload);
        message.success('用户信息修改成功');
      }
      setVisible(false);
      await fetchUsers();
    } catch (e) {
      console.error(e);
      message.error('保存用户失败');
    }
  };

  const columns = [
    {
      title: '用户ID',
      dataIndex: 'userid',
      hidden:true,
    },
    {
      title: '姓名',
      dataIndex: 'name',
    },
    {
      title: '用户名',
      dataIndex: 'username',
    },
    {
      title: '签名',
      dataIndex: 'signature',
    },
    {
      title: '图标',
      dataIndex: 'avatar',
      hidden:true,
    },
    {
      title: '部门',
      dataIndex: 'dept',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
    },
    {
      title: '密码',
      dataIndex: 'password',
      hidden:true,
    },
    {
      title: '角色',
      dataIndex: 'access',
      render: (text: string) => {
        return userRoleList.find(item=>item.value===text)?.label;
      }
    },
    {
      title: '状态',
      dataIndex: 'user_status',
      render: (v: boolean | number | undefined) =>
        v === false || v === 0 ? '停用' : '启用',
    },
    {
      title: '操作',
      render: (_: unknown, record: API.UserType) => [
          <a key="edit" onClick={() => handleEditUser(record)}> 编辑</a>,
          <a key="delete" onClick={() => handleDeleteUser(record)}> 删除</a>
      ],
    },
  ];
  return (
    <PageContainer>
    <div>
       <ProTable<API.UserType>
        headerTitle="用户列表"
        actionRef={actionRef}
        formRef={formRef}
        columns={columns}
        rowKey="userid"
        search={false}
        loading={loading}
        toolBarRender={() => [
          <Button
            type="primary"
            key="create"
            onClick={() => handleAddUser()}
          >
            <PlusOutlined /> 新增用户
          </Button>,
        ]}
        dataSource={users}
        options={{
          reload: () => {
            fetchUsers();
          },
        }}
      />
      <UserForm
        visible={visible}
        onCancel={() => setVisible(false)}
        onSubmit={handleSubmit}
        userRoles={userRoleList}
        initialValues={currentUser}
      />
    </div>
    </PageContainer>
  );
};
export default UserList;
