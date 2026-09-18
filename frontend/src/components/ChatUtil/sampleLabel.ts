/** 从样例 title / content 中提取短展示文案（主题是【…】） */
export const sampleLabel = (title: string, content: string): string => {
  if (title && title.trim().length > 0) return title.trim();
  const match = content.match(/主题是【(\S+)】/);
  return match ? match[1] : '撰写大纲';
};
