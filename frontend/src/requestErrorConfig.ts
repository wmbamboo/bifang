import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { message, notification } from 'antd';
import { history } from '@umijs/max';
import { stringify } from 'querystring';

enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}

interface ResponseStructure {
  success?: boolean;
  data?: any;
  errorCode?: number | string;
  errorMessage?: string;
  msg?: string;
  code?: number;
  showType?: ErrorShowType;
}

export const errorConfig: RequestConfig = {
  errorConfig: {
    errorThrower: (res) => {
      const { success, data, errorCode, errorMessage, showType } =
        res as unknown as ResponseStructure;
      // 仅明确业务失败时抛错；兼容 search_docs 直接返回数组
      if (success === false) {
        const error: any = new Error(errorMessage || '请求失败');
        error.name = 'BizError';
        error.info = { errorCode, errorMessage, showType, data };
        throw error;
      }
    },
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;
      if (error.name === 'BizError') {
        const errorInfo: ResponseStructure | undefined = error.info;
        if (errorInfo) {
          const { errorMessage, errorCode } = errorInfo;
          switch (errorInfo.showType) {
            case ErrorShowType.SILENT:
              break;
            case ErrorShowType.WARN_MESSAGE:
              message.warning(errorMessage);
              break;
            case ErrorShowType.ERROR_MESSAGE:
              message.error(errorMessage);
              break;
            case ErrorShowType.NOTIFICATION:
              notification.open({
                description: errorMessage,
                message: String(errorCode ?? ''),
              });
              break;
            case ErrorShowType.REDIRECT:
              break;
            default:
              message.error(errorMessage || '请求失败');
          }
        }
      } else if (error.response) {
        if (error.response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('loginUser');
          const { search, pathname } = window.location;
          const urlParams = new URL(window.location.href).searchParams;
          const redirect = urlParams.get('redirect');
          if (window.location.pathname !== '/user/login' && !redirect) {
            history.replace({
              pathname: '/user/login',
              search: stringify({ redirect: pathname + search }),
            });
          }
          message.error('无有效登录或登录已过期，请登录！');
        }
      } else if (error.request) {
        message.error('服务无响应，请确认后端已启动（7861）');
      } else {
        message.error('请求异常，请重试');
      }
    },
  },

  requestInterceptors: [
    (config: RequestOptions) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          token: `${token}`,
        };
      }
      return { ...config, url: config?.url };
    },
  ],

  responseInterceptors: [
    (response) => {
      const payload = (response as any)?.data;
      if (
        payload?.success === false &&
        payload?.code !== 401 &&
        Number(payload?.errorCode) !== 401
      ) {
        message.error(payload?.errorMessage || payload?.msg || '请求失败！');
      }
      return response;
    },
  ],
};
