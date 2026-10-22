import axios from 'axios';

/** 统一带 session token 的 axios 实例（绕过 umi-request 的直连请求必须用它） */
const authAxios = axios.create();

authAxios.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token') || '';
  if (token) {
    cfg.headers = { ...(cfg.headers || {}), token };
  }
  return cfg;
});

authAxios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      err.message = '登录已过期，请重新登录';
    }
    return Promise.reject(err);
  },
);

export default authAxios;
