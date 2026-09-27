/**
 * 模板 manifest：layout + 槽位数 → 页码（替代硬编码公式）。
 * 真源：public/template-manifest.json
 */

import manifestJson from './template-manifest.json';

export type ManifestPage = {
  page: number;
  layout: string;
  cards?: number;
  cols?: number;
  rows?: number;
  lists?: number;
  skin?: number;
  slots?: string[];
};

export type TemplateManifest = {
  template: string;
  slideMax: number;
  pages: ManifestPage[];
  reserved?: number[];
  futureLayouts?: string[];
  downgrade?: Record<string, string>;
};

const manifest = manifestJson as TemplateManifest;

export function getTemplateManifest(): TemplateManifest {
  return manifest;
}

/**
 * table 专用：按数据行列选出页码，并回传该页真实规格。
 * 灌模前必须用回传的 rows/cols 生成 cell 变量，否则模板多出来的格子会留空。
 */
export function resolveTableGrid(
  requestRows?: number,
  requestCols?: number,
): { page: number; rows: number; cols: number; downgraded?: string } {
  const { page, downgraded } = resolveTemplatePage('table', requestRows, requestCols);
  const hit = (manifest.pages || []).find(
    (p) => p.layout === 'table' && p.page === page,
  );
  return {
    page,
    rows: hit?.rows || 5,
    cols: hit?.cols || 4,
    downgraded,
  };
}

function clamp(n: number | undefined, fallback: number, min = 2, max = 5): number {
  const v = n && n > 0 ? Math.round(n) : fallback;
  return Math.max(min, Math.min(max, v));
}

/**
 * 按 layout + 计数查 manifest。
 * metric_columns / metric_list 无精确匹配时按约定降级。
 */
export function resolveTemplatePage(
  layout: string,
  itemCounts?: number,
  colCounts?: number,
): { page: number; downgraded?: string } {
  const pages = manifest.pages || [];
  const find = (pred: (p: ManifestPage) => boolean) => pages.find(pred);

  if (layout === 'cover' || layout === 'chapterCover' || layout === 'tail') {
    const hit = find((p) => p.layout === layout);
    return { page: hit?.page || 0 };
  }

  if (layout === 'catalog') {
    const n = clamp(itemCounts, 3);
    const hit = find((p) => p.layout === 'catalog' && (p.cards || 0) === n);
    return { page: hit?.page || 3 };
  }

  if (layout === 'list') {
    const n = clamp(itemCounts, 3);
    // 整份锁定 skin0（页 6–8）
    const hit = find(
      (p) => p.layout === 'list' && (p.cards || 0) === n && !p.skin,
    );
    return { page: hit?.page || 6 + (n - 3) };
  }

  if (layout === 'metric') {
    const n = clamp(itemCounts, 3);
    const hit = find((p) => p.layout === 'metric' && (p.cards || 0) === n);
    return { page: hit?.page || 24 + (n - 2) };
  }

  if (layout === 'columns') {
    const n = clamp(itemCounts, 2);
    const hit = find((p) => p.layout === 'columns' && (p.cols || 0) === n);
    return { page: hit?.page || 28 + (n - 2) };
  }

  if (layout === 'metric_columns') {
    const m = clamp(itemCounts, 4);
    let c = colCounts && colCounts > 0 ? Math.round(colCounts) : 2;
    let hit = find(
      (p) =>
        p.layout === 'metric_columns' &&
        (p.cards || 0) === m &&
        (p.cols || 2) === c,
    );
    if (hit) return { page: hit.page };
    // 降级：3 栏但卡数不足 → 2 栏
    if (c >= 3) {
      c = 2;
      hit = find(
        (p) =>
          p.layout === 'metric_columns' &&
          (p.cards || 0) === m &&
          (p.cols || 2) === 2,
      );
      if (hit) return { page: hit.page, downgraded: 'metric_columns→2栏' };
    }
    // 再降：metric_list
    const listHit = find(
      (p) =>
        p.layout === 'metric_list' &&
        (p.cards || 0) === m &&
        (p.lists || 2) === 2,
    );
    if (listHit) {
      return { page: listHit.page, downgraded: 'metric_columns→metric_list' };
    }
    return { page: 32 + (m - 2), downgraded: 'metric_columns fallback' };
  }

  if (layout === 'metric_list') {
    const m = clamp(itemCounts, 3);
    let l = colCounts && colCounts >= 3 ? 3 : 2;
    let hit = find(
      (p) =>
        p.layout === 'metric_list' &&
        (p.cards || 0) === m &&
        (p.lists || 2) === l,
    );
    if (hit) return { page: hit.page };
    if (l >= 3) {
      l = 2;
      hit = find(
        (p) =>
          p.layout === 'metric_list' &&
          (p.cards || 0) === m &&
          (p.lists || 2) === 2,
      );
      if (hit) return { page: hit.page, downgraded: 'metric_list→2要点' };
    }
    return { page: 37 + (m - 2) };
  }

  if (layout === 'table') {
    // 表格有 5×4 / 6×4 / 6×5 / 8×5 四种规格，按数据行列取「最小够用」
    const tables = pages.filter((p) => p.layout === 'table');
    if (!tables.length) return { page: 42 };
    const spec = (p: ManifestPage) => ({ r: p.rows || 5, c: p.cols || 4 });
    const r = Math.max(2, Math.min(8, itemCounts ? Math.round(itemCounts) : 5));
    const c = Math.max(2, Math.min(5, colCounts ? Math.round(colCounts) : 4));
    const exact = tables.find((p) => {
      const s = spec(p);
      return s.r === r && s.c === c;
    });
    if (exact) return { page: exact.page };
    const fit = tables
      .filter((p) => {
        const s = spec(p);
        return s.r >= r && s.c >= c;
      })
      .sort((a, b) => {
        const x = spec(a);
        const y = spec(b);
        return x.r * x.c - y.r * y.c;
      })[0];
    if (fit) {
      const s = spec(fit);
      return { page: fit.page, downgraded: `table ${r}×${c}→${s.r}×${s.c}` };
    }
    const big = tables.slice().sort((a, b) => {
      const x = spec(a);
      const y = spec(b);
      return y.r * y.c - x.r * x.c;
    })[0];
    const s = spec(big);
    return { page: big.page, downgraded: `table 超限→${s.r}×${s.c}` };
  }

  if (layout === 'image_grid') {
    const hit = find((p) => p.layout === 'image_grid');
    return { page: hit?.page || 43 };
  }

  return { page: 0 };
}
