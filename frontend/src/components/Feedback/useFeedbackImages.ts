import { useEffect, useMemo, useState } from 'react';
import authAxios from '@/utils/authAxios';

/**
 * 带 token 拉取反馈截图 blob（img/Image 原生 GET 带不了 header，enforce 下会 401）。
 * 失败条目不进映射，渲染侧自行降级。
 */
export function useFeedbackImages(names: string[]): Record<string, string> {
  const key = (names || []).filter(Boolean).join(',');
  const list = useMemo(
    () => (key ? key.split(',').filter(Boolean) : []),
    [key],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    if (list.length === 0) {
      setUrls({});
      return () => undefined;
    }

    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (name) => {
          try {
            const res = await authAxios.get(`/api/feedback/image/${name}`, {
              responseType: 'blob',
            });
            const blobUrl = URL.createObjectURL(res.data as Blob);
            if (cancelled) {
              URL.revokeObjectURL(blobUrl);
              return;
            }
            created.push(blobUrl);
            next[name] = blobUrl;
          } catch {
            /* 单张失败不拖垮整组 */
          }
        }),
      );
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [key]);

  return urls;
}
