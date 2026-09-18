import { Request, Response } from 'express';
const USERLIST = [
    { userid: '00000001',
      username:'admin',
      password:'bifang.intronlink',
      name: '毕方',
      access:'admin',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'antdesign@alipay.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
    { userid: '00000002',
      username:'user',
      password:'bifang.intronlink',
      name: '毕方user',
      access:'user',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'antdesign@alipay.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
    { userid: '00000003',
      username:'guest',
      password:'bifang.intronlink',
      name: '毕方guest',
      access:'user',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'antdesign@alipay.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
    {
      userid: '4',
      username:'john',
      password:'bifang.intronlink',
      name: 'John Brown',
      access:'admin',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'john@@outlook.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
    {
      userid: '5',
      username:'jim',
      password:'bifang.intronlink',
      name: 'Jim Green',
      access:'user',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'jim@outlook.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
    {
      userid: '6',
      username:'john',
      password:'bifang.intronlink',
      name: 'Joe Black',
      access:'user',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'jim@outlook.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    },
  ];
const USERINFO={
      userid: '00000001',
      username:'ant.design',
      password:'bifang.intronlink',
      name: '毕 方',
      access:'admin',
      unit:'英创互联',
      dept: '英创互联－AI技术部－UED',
      email: 'antdesign@alipay.com',
      phone: '010-15021502',
      address: '财智大厦A-1502',
      signature: '毕生所学，方为一用',
      avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
  };
const waitTime = (time: number = 100) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
};
const { ANT_DESIGN_PRO_ONLY_DO_NOT_USE_IN_YOUR_PRODUCTION } = process.env;
/**
 * 当前用户的权限，如果为空代表没登录
 * current user access， if is '', user need login
 * 如果是 pro 的预览，默认是有权限的
 */
let access = ANT_DESIGN_PRO_ONLY_DO_NOT_USE_IN_YOUR_PRODUCTION === 'site' ? 'admin' : '';
const getAccess = () => {
  return access;
};
// 代码中会兼容本地 service mock 以及部署站点的静态数据
export default {
    // GET POST 可省略
  'GET /mock_api1/users': USERLIST,
    // 支持值为 Object 和 Array
  'GET /mock_api1/currentUser': (req: Request, res: Response) => {
    // 从请求对象中获取 GET 参数
    const { query } = req;
    console.log("mock_api/currentUser:",query)
    const username = query?.username;
    if (!getAccess()) {
      res.status(401).send({
        data: {
          isLogin: false,
        },
        errorCode: '401',
        errorMessage: '请先登录！',
        success: true,
      });
      return;
    }
    const loginUser=USERLIST.find(item=>item.username===username);
    res.send({
      data: loginUser,
      success: true,
    });
  },
  'POST /mock_api1/login/account': async (req: Request, res: Response) => {
    const { password, username, type } = req.body;
    await waitTime(2000);
    const loginUser=USERLIST.find(item=>item.username===username);
    if(loginUser!=null){
      if(loginUser.password===password){
       res.send({
        status: 'ok',
        type,
        currentAuthority: loginUser.access,
      });
       access = loginUser.access;
       return;
      }
    }
    res.send({
      status: 'error',
      type,
      currentAuthority: 'guest',
    });
    access = 'guest';
  },
  'POST /mock_api1/login/outLogin': (req: Request, res: Response) => {
    access = '';
    res.send({ data: {}, success: true });
  },

  'POST /mock_api1/user/add': (req: Request, res: Response) => {
    access = '';
    res.send({ data: {}, success: true });
  },
  'POST /mock_api1/user/update': (req: Request, res: Response) => {
    access = '';
    res.send({ data: {}, success: true });
  },
  'GET /mock_api1/user/delete': (req: Request, res: Response) => {
    access = '';
    res.send({ data: {}, success: true });
  },
}
