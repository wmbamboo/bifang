import {useEffect, useRef, useState} from 'react';
import { Button, message} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {addUser, deleteUser, getUserList,  updateUser} from '@/services/chatchat/kb';
import UserForm from "@/pages/User/components/UserForm";
import {ActionType, PageContainer, ProFormInstance, ProTable} from "@ant-design/pro-components";
const UserList: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const formRef = useRef<ProFormInstance>();
  const [users, setUsers] = useState<API.UserType[]>([]);
  const [visible, setVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<API.UserType | undefined>();
  const userRoleList = [{ label: '管理员', value: 'admin' },{ label: '用户', value: 'user' },];
  const beInUsers=new Set(['admin','user']);

   const fetchUsers = async () => {
    let userList = localStorage.getItem('userList');
    // console.log(userList)
    if(userList === null || userList.length === 0){
     try {
       const resData = await getUserList();
       console.log("fetchUsers:",resData)
       setUsers(resData.data);
       localStorage.setItem('userList',JSON.stringify(resData.data));
     }catch (error) {
       console.error("获取用户列表失败，错误信息如下：")
       console.error(error)
     }
    }else{
       setUsers(JSON.parse(userList));
   }
  };
  useEffect(() => {
    fetchUsers();
  }, []);

 const handleAddUser = () => {
   console.log("handleAddUser")
    setVisible(true);
    // setCurrentUser({userid: undefined,username:'',name: '',  signature: '',avatar: '', unit:'', dept: '', email: '', phone: '', address: '', password:'',access:''});
   setCurrentUser({userid: undefined,username:'',name: '',  signature: '',avatar: '', dept: '', email: '', password:'',access:''});
  };
 const handleEditUser = (user) => {
    setVisible(true);
    setCurrentUser(user);
  };
  const handleDeleteUser = (user) => {
     const beInUserFlag=beInUsers.has(user.username)
     if(!beInUserFlag){
       //删除用户
      deleteUser(user.userid);
      message.success('删除用户成功');
      let userList=JSON.parse(localStorage.getItem('userList'));
      let userListNew = userList.filter(item => item.userid !== user.userid);
      localStorage.setItem('userList',JSON.stringify(userListNew));
      fetchUsers();
     }else{
      message.warning('内置预设账号，不可删除！');
     }
  };
  const handleSubmit = async (user) => {
    console.log("handleSubmit:{}",currentUser)
    // if (typeof currentUser === 'undefined') {
    if (currentUser?.userid === undefined){
       // 生成一个随机的用户字符串，例如 "User_12345"
      const randomId = Math.floor(Math.random() * 90000) + 10000; // 生成一个 5 位数的随机数
      user['userid']='user_'+randomId;
      await addUser(user);
      message.success('用户添加成功');
      let userList=JSON.parse(localStorage.getItem('userList'));
      userList.push(user)
      localStorage.setItem('userList',JSON.stringify(userList));
    } else {
      user['userid']=currentUser.userid
      await updateUser(user);
      message.success('用户信息修改成功');
      let userList=JSON.parse(localStorage.getItem('userList'));
      let updateUserIndex = userList.findIndex(function(item) {
       return item.userid ===currentUser.userid ;
      });
      console.log("updateUserIndex",updateUserIndex)
      userList[updateUserIndex]=user
      localStorage.setItem('userList',JSON.stringify(userList));
    }
    setVisible(false);
    fetchUsers();
  };
  // ... 省略其他代码 ...
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
   // {
   //    title: '单位',
   //    dataIndex: 'unit',
   //  },
   //  {
   //    title: '电话',
   //    dataIndex: 'phone',
   //  },
   //  {
   //    title: '地址',
   //    dataIndex: 'address',
   // },
    {
      title: '密码',
      dataIndex: 'password',
      hidden:true,
    },
    {
      title: '角色',
      dataIndex: 'access',
      render: (text) => {
        return userRoleList.find(item=>item.value===text)?.label;
      }
    },
    {
      title: '操作',
      render: (_, record) => [
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
