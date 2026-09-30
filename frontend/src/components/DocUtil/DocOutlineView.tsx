import React, {useMemo} from "react";
import {Empty, Tag, theme, Tooltip} from "antd";
import {FileTextOutlined} from "@ant-design/icons";
import {
  parseDocOutlineMarkdown,
  stripDocOutlineOrdinal,
} from "@/components/DocUtil/docOutlineStructure";

/**
 * Word 大纲的结构化只读视图（大纲查询/选择抽屉右侧「大纲内容」）。
 *
 * 此前该区域是 `Typography + react-markdown` 裸渲染，章（##）/ 段（###）/ 要点（*）
 * 在视觉上几乎无差别、读不出层级（用户 2026-09-29 反馈）。现改为：
 * 章 = 左侧色条 + 「第 N 章」徽标 + 段数；段 = 编号 + 缩进；要点 = 次级列表。
 * 颜色全部取 antd token，亮/暗主题自适应。
 */

export type DocOutlineViewProps = {
  markdown: string;
  /** 大纲记录名：markdown 里没有 `# ` 标题时兜底显示 */
  fallbackTitle?: string;
};

const DocOutlineView: React.FC<DocOutlineViewProps> = ({markdown, fallbackTitle}) => {
  const {token} = theme.useToken();
  const doc = useMemo(
    () => parseDocOutlineMarkdown(markdown, fallbackTitle),
    [markdown, fallbackTitle],
  );

  if (!String(markdown || "").trim()) {
    return <Empty description="请选择左侧大纲" />;
  }
  if (!doc.chapters.length) {
    return <Empty description="大纲为空或缺少章节（章节前缀应为【## 】）" />;
  }

  return (
    <div style={{display: "flex", flexDirection: "column", gap: 12}}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          paddingBottom: 10,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <FileTextOutlined style={{color: token.colorPrimary, fontSize: 16}}/>
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: token.colorText,
            lineHeight: "22px",
          }}
        >
          {doc.title || "未命名大纲"}
        </span>
        <Tag color="blue" style={{marginInlineStart: 4}}>
          {doc.chapters.length} 章
        </Tag>
        <Tag>{doc.paraTotal} 段</Tag>
      </div>

      {doc.chapters.map((chap) => (
        <div
          key={chap.key}
          style={{
            borderRadius: token.borderRadiusLG,
            background: token.colorFillQuaternary,
            borderLeft: `3px solid ${token.colorPrimary}`,
            padding: "10px 12px 12px 12px",
          }}
        >
          <div style={{display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6}}>
            <span
              style={{
                fontSize: 12,
                lineHeight: "20px",
                color: token.colorPrimary,
                fontWeight: 500,
                minWidth: 44,
              }}
            >
              第 {chap.no} 章
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: token.colorText,
                lineHeight: "22px",
              }}
            >
              {stripDocOutlineOrdinal(chap.title) || "未命名章节"}
            </span>
            <span style={{fontSize: 12, color: token.colorTextTertiary}}>
              {chap.paras.length} 段
            </span>
          </div>

          <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            {chap.paras.map((para) => (
              <div
                key={para.key}
                style={{
                  marginLeft: 12,
                  paddingLeft: 10,
                  borderLeft: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <div style={{display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap"}}>
                  <span
                    style={{
                      fontSize: 12,
                      color: token.colorTextTertiary,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 26,
                    }}
                  >
                    {para.no}
                  </span>
                  <span style={{fontSize: 13, color: token.colorText, lineHeight: "20px"}}>
                    {stripDocOutlineOrdinal(para.title) || "未命名段落"}
                  </span>
                  {!para.heading ? (
                    <Tooltip title="该段用 * / - 兼容写法书写，建议改为【### 】">
                      <Tag color="warning" style={{marginInlineStart: 0}}>
                        非 ###
                      </Tag>
                    </Tooltip>
                  ) : null}
                  {para.hasTable ? (
                    <Tag color="geekblue" style={{marginInlineStart: 0}}>
                      表
                    </Tag>
                  ) : null}
                  {para.hasFigure ? (
                    <Tag color="purple" style={{marginInlineStart: 0}}>
                      图
                    </Tag>
                  ) : null}
                </div>
                {para.points.length ? (
                  <ul
                    style={{
                      margin: "4px 0 0 26px",
                      paddingLeft: 16,
                      color: token.colorTextSecondary,
                      listStyleType: "square",
                    }}
                  >
                    {para.points.map((pt, i) => (
                      <li key={`pt-${i}`} style={{fontSize: 12, lineHeight: "18px"}}>
                        {stripDocOutlineOrdinal(pt) || pt}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {para.bullets.length ? (
                  <ul
                    style={{
                      margin: "4px 0 0 26px",
                      paddingLeft: 16,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {para.bullets.map((b, i) => (
                      <li key={i} style={{fontSize: 12, lineHeight: "18px"}}>
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}

      {doc.loose.length ? (
        <div style={{fontSize: 12, color: token.colorTextTertiary}}>
          <div style={{marginBottom: 4}}>未归入章节的内容：</div>
          <ul style={{margin: 0, paddingLeft: 18}}>
            {doc.loose.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default DocOutlineView;
