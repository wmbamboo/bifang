/**
 * 占位符拆 run 修复：相邻 a:t 拼成完整 {slot} 后合并到首 run。
 * 模板入库扫描 / 灌模前均可调用。
 */

import * as cheerio from 'cheerio';

const SLOT_NAME = /^[A-Za-z_][\w.]*(?:\[[\w.]+\])?$/;

/**
 * 在 slide XML 上将被拆开的 `{` + `name` + `}` 合并为单个 a:t。
 */
export function mergeBrokenPlaceholderRunsInXml(xml: string): string {
  if (!xml || !xml.includes('{')) return xml;
  const $ = cheerio.load(xml, { xml: { xmlMode: true } });
  $('a\\:r').each((_, _el) => {
    // 按父级 a:p 处理更稳
  });
  $('a\\:p').each((_, pEl) => {
    const runs = $(pEl).find('a\\:r').toArray();
    if (runs.length < 2) return;
    const texts = runs.map((r) => $(r).find('a\\:t').first().text());
    // 滑动窗口拼 3 段：{ / name / }
    for (let i = 0; i < texts.length - 2; i++) {
      const a = texts[i];
      const b = texts[i + 1];
      const c = texts[i + 2];
      if (a === '{' && c === '}' && SLOT_NAME.test(b || '')) {
        const t0 = $(runs[i]).find('a\\:t').first();
        t0.text(`{${b}}`);
        $(runs[i + 1]).find('a\\:t').first().text('');
        $(runs[i + 2]).find('a\\:t').first().text('');
        texts[i] = `{${b}}`;
        texts[i + 1] = '';
        texts[i + 2] = '';
      }
    }
    // 两段：{name + }
    for (let i = 0; i < texts.length - 1; i++) {
      const a = texts[i];
      const b = texts[i + 1];
      if (a?.startsWith('{') && !a.endsWith('}') && b === '}') {
        const name = a.slice(1);
        if (SLOT_NAME.test(name)) {
          $(runs[i]).find('a\\:t').first().text(`{${name}}`);
          $(runs[i + 1]).find('a\\:t').first().text('');
          texts[i] = `{${name}}`;
          texts[i + 1] = '';
        }
      }
      if (a === '{' && b?.endsWith('}') && !b.startsWith('{')) {
        const name = b.slice(0, -1);
        if (SLOT_NAME.test(name)) {
          $(runs[i]).find('a\\:t').first().text(`{${name}}`);
          $(runs[i + 1]).find('a\\:t').first().text('');
          texts[i] = `{${name}}`;
          texts[i + 1] = '';
        }
      }
    }
  });
  return $.xml();
}
