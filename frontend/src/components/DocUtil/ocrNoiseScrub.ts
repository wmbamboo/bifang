/**
 * 任务 6 · OCR 噪声 scrub（十·6）：词表来自 corpusProfiles，不新建 config。
 */
import {getOcrNoiseReplacements} from "@/components/DocUtil/corpusProfile";

export type OcrNoiseScrubReport = {
  replaced_count: number;
  items: Array<{from: string; to: string; hits: number}>;
};

export function applyOcrNoiseScrub(text: string): {
  text: string;
  report: OcrNoiseScrubReport;
} {
  let out = text || "";
  const report: OcrNoiseScrubReport = {replaced_count: 0, items: []};
  for (const {from, to} of getOcrNoiseReplacements()) {
    if (!from || !out.includes(from)) continue;
    let hits = 0;
    out = out.split(from).reduce((acc, part, i) => {
      if (i === 0) return part;
      hits += 1;
      return acc + to + part;
    }, "");
    if (hits > 0) {
      report.replaced_count += hits;
      report.items.push({from, to, hits});
    }
  }
  return {text: out, report};
}
