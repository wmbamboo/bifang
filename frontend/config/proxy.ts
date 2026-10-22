/**
 * @name 代理的配置
 * @see 在生产环境 代理是无法生效的，所以这里没有生产环境的配置
 * @doc https://umijs.org/docs/guides/proxy
 */

/** 覆盖写真实对端 IP，防客户端伪造 XFF（四十九·7） */
function setRealIp(proxyReq: any, req: any) {
  const raw = String(req.socket?.remoteAddress || '');
  const ip = raw.replace(/^::ffff:/, '');
  if (!ip) return;
  proxyReq.setHeader('x-real-ip', ip);
  proxyReq.setHeader('x-forwarded-for', ip);
}

const withIp = (cfg: Record<string, unknown>) => ({
  ...cfg,
  onProxyReq: setRealIp,
});

export default {
  test: {
    '/api/': {
      target: 'https://proapi.azurewebsites.net',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  pre: {
    '/api/': {
      target: 'your pre url',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  dev: {
    '/chat/': withIp({
      target: 'http://127.0.0.1:7861',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    }),
    '/knowledge_base/': withIp({
      target: 'http://127.0.0.1:7861',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    }),
    '/api/': withIp({
      target: 'http://127.0.0.1:7861',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    }),
    '/goods-labels-mgt/': {
      target: 'http://192.168.0.195:19912',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
    '/mock_api/': withIp({
      target: 'http://127.0.0.1:7861',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    }),
    '/kkfv/': {
      target: 'http://192.168.0.195:8012',
      changeOrigin: true,
      pathRewrite: { '^/kkfv': '' },
    },
  },
};
