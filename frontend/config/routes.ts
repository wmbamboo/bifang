/**
 * @name umi 的路由配置
 * @description 只支持 path,component,routes,redirect,wrappers,name,icon 的配置
 * @param path  path 只支持两种占位符配置，第一种是动态参数 :id 的形式，第二种是 * 通配符，通配符只能出现路由字符串的最后。
 * @param component 配置 location 和 path 匹配后用于渲染的 React 组件路径。可以是绝对路径，也可以是相对路径，如果是相对路径，会从 src/pages 开始找起。
 * @param routes 配置子路由，通常在需要为多个路径增加 layout 组件时使用。
 * @param redirect 配置路由跳转
 * @param wrappers 配置路由组件的包装组件，通过包装组件可以为当前的路由组件组合进更多的功能。 比如，可以用于路由级别的权限校验
 * @param name 配置路由的标题，默认读取国际化文件 menu.ts 中 menu.xxxx 的值，如配置 name 为 login，则读取 menu.ts 中 menu.login 的取值作为标题
 * @param icon 配置路由的图标，取值参考 https://ant.design/components/icon-cn， 注意去除风格后缀和大小写，如想要配置图标为 <StepBackwardOutlined /> 则取值应为 stepBackward 或 StepBackward，如想要配置图标为 <UserOutlined /> 则取值应为 user 或者 User
 * @doc https://umijs.org/docs/guides/routes
 */
export default [
  {
    path: '/user',
    layout: false,
    routes: [
      {
        name: 'login',
        path: '/user/login',
        component: './User/Login',
      },
    ],
  },
  /*{
    path: '/message',
    name: 'message',
    icon: 'FileWordOutlined',
    // component: './Message',
    component: './TestStt'

  },*/
  {
    path: '/welcome',
    name: 'welcome',
    icon: 'crown',
    routes: [
      {
        path: '/welcome',
        redirect: "/welcome/doc-search",  //'/welcome/aiAnswer',
      },
      {
        path: '/welcome/welcome',
        name: 'welcome1',
        icon: 'smile',
        component: './TestChatItem',
        hideInMenu: true
      },
      {
        path: '/welcome/productLabelNew',
        name: 'productLabelNew',
        icon: 'smile',
        component: './ProductLabelNew',
        hideInMenu: true
      },
      {
        path: '/welcome/testButton',
        name: 'testButton',
        icon: 'smile',
        component: './TestButtonDblClick',
        hideInMenu: true
      },
      /*{
        path: '/welcome/productLabel',
        name: 'productLabel',
        icon: 'smile',
        component: './ProductLabel',
        hideInMenu: true
      },*/
      {
        path: '/welcome/doc-search',
        name: 'doc-search',
        icon: 'search',
        component: './DocSearch',
      },
      {
        path: '/welcome/aiAnswer',
        name: 'aiAnswer',
        icon: 'CodeSandboxOutlined',
        component: './AiAnswerChatchat'
      },
      {
        path: '/welcome/aiAnswerDMan',
        name: 'aiAnswerDMan',
        icon: 'CodeSandboxOutlined',
        component: './AiAnswerChatchatDigitalMan',
        hideInMenu: true,
      },
      /*{
        path: '/aiAnswer',
        name: 'aiAnswer',
        icon: 'CodeSandboxOutlined',
        component: './AiAnswer',
      },*/   //Ollama直接访问
      {
        path: '/welcome/kbAnswer',
        name: 'kbAnswer',
        icon: 'HddOutlined',
        component: './KbAnswer',
      },
/*      {
        path: '/welcome/kbAnswer2',
        name: 'kbAnswer2',
        icon: 'HddOutlined',
        component: './KbAnswer2',
      },*/
    ]
  },
  {
    path: '/aiGen',
    name: 'aiGen',
    icon: 'crown',
    routes: [
      {
        path: '/aiGen/AiGenDocOutline',
        name: 'AiGenDocOutline',
        icon: 'FileWordOutlined',
        component: './AiGenDocOutline',
      },
      {
        path: '/aiGen/AiOutlineGenDoc',
        name: 'AiOutlineGenDoc',
        icon: 'FileWordOutlined',
        component: './AiOutlineGenDoc',
      },
      {
        path: '/aiGen/AiGenPptOutline',
        name: 'AiGenPptOutline',
        icon: 'FilePptOutlined',
        component: './AiGenPptOutline',
      },
      {
        path: '/aiGen/aiOutlineGenPpt',
        name: 'AiOutlineGenPpt',
        icon: 'FilePptOutlined',
        component: './AiOutlineGenPpt',
      },
    ]
  },


  {
    path: '/kbGen',
    name: 'kbGen',
    icon: 'crown',
    routes: [
      {
        path: '/kbGen',
        redirect: '/kbGen/KbGenDocOutline',
      },
      {
        path: '/kbGen/KbGenDocOutline',
        name: 'KbGenOutline',
        icon: 'FileWordOutlined',
        component: './KbGenDocOutline',
      },
      {
        path: '/kbGen/KbOutlineGenDoc',
        name: 'KbOutlineGenDoc',
        icon: 'FileWordOutlined',
        component: './KbOutlineGenDoc',
      },
      {
        path: '/kbGen/KbGenPptOutline',
        name: 'KbGenPptOutline',
        icon: 'FilePptOutlined',
        component: './KbGenPptOutline',
      },
      {
        path: '/kbGen/KbOutlineGenPpt',
        name: 'KbOutlineGenPpt',
        icon: 'FilePptOutlined',
        component: './KbOutlineGenPpt',
      },
    ]
  },
  {
    path: '/admin',
    name: 'admin',
    icon: 'crown',
    access: 'canAdmin',
    routes: [
      {
        path: '/admin',
        redirect: '/admin/kb-mgt',
      },

/*      {
        path: '/admin/kb-manage',
        name: 'kb-manage',
        component: './Admin',
      },*/
      {
        path: '/admin/kb-mgt',
        name: 'kb-mgt',
        icon: 'FolderOpenOutlined',
        component: './KbMgt',
      },
       {
        path: '/admin/kb-file-mgt',
        name: 'kb-file-mgt',
        icon: 'FileTextOutlined',
        component: './KbFilesMgt',
      },
      // {
      //   path: '/admin/sub-page',
      //   name: 'sub-page',
      //   component: './Admin',
      // },
      {
        path: '/admin/userList',
        name: 'user-list',
        icon: 'ProfileOutlined',
        component: './User/Mgt',
        //access: 'isAdmin', // 只有管理员可见
      },
      {
        path: '/admin/userProfile',
        name: 'user-profile',
        icon: 'UserOutlined',
        component: './User/Profile',
      },
    ],
  },
  {
    path: '/',
    redirect: '/welcome',
  },
  {
    path: '*',
    layout: false,
    component: './404',
  }
];
