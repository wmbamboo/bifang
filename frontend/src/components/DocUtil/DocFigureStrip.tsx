/**
 * 三十三 / 三十五：段内插图卡片 + 换图宫格（含本地上传）。
 */
import React, {useEffect, useMemo, useState} from "react";
import {Button, Modal, Space, Tag, Typography, Upload, message} from "antd";
import type {Paragraph} from "@/components/DocUtil/ViewItem4Doc";
import {countResidualFenceMedia} from "@/components/DocUtil/ViewItem4Doc";
import {
  formatUploadAssetRef,
  isUploadAssetRef,
  isWholePageAssetId,
  kbAssetFileUrl,
  normalizeKbAssetRef,
  parseKbAssetRef,
  previewFigureStatus,
} from "@/components/DocUtil/docFigureAssets";
import {
  isUploadMemoryFallback,
  saveUploadAsset,
  uploadAssetPreviewUrl,
} from "@/components/DocUtil/docUploadAssets";

const {Text} = Typography;

export type DocFigureStripProps = {
  paragraph: Paragraph;
  kbName?: string;
  editable?: boolean;
  /** nextRef 为 null 表示移除该 figure 块 */
  onPick?: (
    blockIndex: number,
    nextRef: string | null,
    nextCaption?: string,
  ) => void;
};

type CardRisk = "whole" | "portrait" | "loadfail" | "blocked" | "unparsed";

function FigureThumb(props: {
  src?: string;
  alt: string;
  onRisk?: (r: CardRisk) => void;
  onPortrait?: () => void;
}) {
  const {src, alt, onRisk, onPortrait} = props;
  if (!src) {
    return (
      <div
        style={{
          height: 120,
          background: "#f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 12,
        }}
      >
        无预览
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{
        maxHeight: 160,
        maxWidth: "100%",
        objectFit: "contain",
        display: "block",
        margin: "0 auto",
        background: "#f5f5f5",
      }}
      onError={() => onRisk?.("loadfail")}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalHeight / Math.max(1, img.naturalWidth) > 1.6) {
          onPortrait?.();
        }
      }}
    />
  );
}

const DocFigureStrip: React.FC<DocFigureStripProps> = ({
  paragraph,
  kbName,
  editable = false,
  onPick,
}) => {
  const [pickIndex, setPickIndex] = useState<number | null>(null);
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>>(
    {},
  );
  const [risks, setRisks] = useState<Record<number, CardRisk[]>>({});
  const [portrait, setPortrait] = useState<Record<number, boolean>>({});

  const statuses = useMemo(
    () => previewFigureStatus(paragraph),
    [paragraph.blocks, paragraph.allowedFigureRefs],
  );
  const statusByIndex = useMemo(() => {
    const m = new Map<number, {ok: boolean; reason?: string}>();
    for (const s of statuses) m.set(s.index, s);
    return m;
  }, [statuses]);

  const figures = useMemo(() => {
    return (paragraph.blocks || [])
      .map((b, i) => ({b, i}))
      .filter(({b}) => b.kind === "figure");
  }, [paragraph.blocks]);

  // 三十九·4：未解析只看正文残留围栏，勿用含图 Tag 掩盖
  const residual = countResidualFenceMedia(paragraph.content || "");
  const unparsed = figures.length === 0 && residual.figures > 0;

  // 本地上传预览 URL
  useEffect(() => {
    let cancelled = false;
    const keys: string[] = [];
    for (const {b} of figures) {
      if (b.kind !== "figure") continue;
      const ref = normalizeKbAssetRef(b.assetRef || "");
      if (isUploadAssetRef(ref)) {
        keys.push(ref.slice("upload:".length).trim());
      }
    }
    for (const r of paragraph.allowedFigureRefs || []) {
      const ref = normalizeKbAssetRef(r);
      if (isUploadAssetRef(ref)) {
        keys.push(ref.slice("upload:".length).trim());
      }
    }
    const uniq = [...new Set(keys.filter(Boolean))];
    (async () => {
      const next: Record<string, string> = {};
      for (const k of uniq) {
        const url = await uploadAssetPreviewUrl(k);
        if (url) next[k] = url;
      }
      if (!cancelled) setUploadPreview((prev) => ({...prev, ...next}));
    })();
    return () => {
      cancelled = true;
    };
  }, [figures, paragraph.allowedFigureRefs]);

  const resolveSrc = (ref: string): string | undefined => {
    const n = normalizeKbAssetRef(ref);
    if (isUploadAssetRef(n)) {
      const key = n.slice("upload:".length).trim();
      return uploadPreview[key];
    }
    const parsed = parseKbAssetRef(n);
    if (!parsed || !kbName) return undefined;
    return kbAssetFileUrl(kbName, parsed.fileName, parsed.assetId);
  };

  const addRisk = (i: number, r: CardRisk) => {
    setRisks((prev) => {
      const cur = prev[i] || [];
      if (cur.includes(r)) return prev;
      return {...prev, [i]: [...cur, r]};
    });
  };

  const candidateRefs = useMemo(() => {
    const raw = paragraph.allowedFigureRefs || [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of raw) {
      const n = normalizeKbAssetRef(r);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(r);
    }
    return out;
  }, [paragraph.allowedFigureRefs]);

  const handleUpload = async (file: File) => {
    const meta = await saveUploadAsset(file);
    if (!meta) {
      message.error(
        "仅支持 PNG / JPEG / GIF；单文件 ≤10MB，且须能压到 ≤1.5MB",
      );
      return Upload.LIST_IGNORE;
    }
    if (isUploadMemoryFallback()) {
      message.warning("本次会话有效，刷新后需重新上传");
    }
    const ref = formatUploadAssetRef(meta.key);
    const url = await uploadAssetPreviewUrl(meta.key);
    if (url) setUploadPreview((p) => ({...p, [meta.key]: url}));
    if (pickIndex != null) {
      onPick?.(pickIndex, ref);
      setPickIndex(null);
    } else if (figures[0]) {
      onPick?.(figures[0].i, ref);
    } else {
      message.success("已上传；请在有插图块的段落中换图选用");
    }
    return Upload.LIST_IGNORE;
  };

  if (unparsed) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: 12,
          background: "#fafafa",
          border: "1px dashed #d9d9d9",
          borderRadius: 4,
          color: "#8c8c8c",
          fontSize: 12,
        }}
      >
        图未解析（围栏仍在正文中）— 请重新生成该段
      </div>
    );
  }

  if (!figures.length) return null;

  return (
    <div style={{marginTop: 8}}>
      <Space direction="vertical" style={{width: "100%"}} size={8}>
        {figures.map(({b, i}) => {
          if (b.kind !== "figure") return null;
          const ref = b.assetRef || "";
          const parsed = parseKbAssetRef(ref);
          const st = statusByIndex.get(i);
          const blocked = st && !st.ok;
          const src = resolveSrc(ref);
          const upload = isUploadAssetRef(ref);
          const whole =
            parsed && isWholePageAssetId(parsed.assetId)
              ? true
              : risks[i]?.includes("whole");
          const tags: React.ReactNode[] = [];
          if (blocked) {
            tags.push(
              <Tag color="error" key="b">
                导出将缺失
              </Tag>,
            );
          }
          if (whole) {
            tags.push(
              <Tag color="gold" key="w">
                整页图·将降采样
              </Tag>,
            );
          }
          if (portrait[i]) {
            tags.push(
              <Tag color="purple" key="p">
                竖版单品图
              </Tag>,
            );
          }
          if (risks[i]?.includes("loadfail")) {
            tags.push(
              <Tag color="default" key="e">
                加载失败
              </Tag>,
            );
          }
          const pageM = parsed?.assetId.match(/_p(\d+)/i);
          const sourceLine = upload
            ? "本地上传"
            : parsed
              ? `${parsed.fileName}${
                  pageM
                    ? ` · p${pageM[1]}`
                    : parsed.assetId.startsWith("whole/")
                      ? " · 整页"
                      : ""
                }`
              : ref || "（无 ref）";

          return (
            <div
              key={`fig-${i}`}
              style={{
                position: "relative",
                border: blocked ? "1px solid #ff4d4f" : "1px solid #e8e8e8",
                borderRadius: 4,
                padding: 8,
                background: "#fff",
              }}
            >
              {blocked ? (
                <Tag
                  color="error"
                  style={{position: "absolute", top: 4, left: 4, zIndex: 1}}
                >
                  导出将缺失
                </Tag>
              ) : null}
              <FigureThumb
                src={src}
                alt={b.caption || "插图"}
                onRisk={(r) => addRisk(i, r)}
                onPortrait={() => setPortrait((p) => ({...p, [i]: true}))}
              />
              <div style={{marginTop: 6}}>
                <Text strong style={{fontSize: 13}}>
                  {b.caption || "（无图题）"}
                </Text>
                <div>
                  <Text type="secondary" style={{fontSize: 11}}>
                    {sourceLine}
                  </Text>
                </div>
                <Space size={4} wrap style={{marginTop: 4}}>
                  {tags}
                </Space>
              </div>
              {editable && onPick ? (
                <Space style={{marginTop: 6}}>
                  <Button size="small" type="link" onClick={() => setPickIndex(i)}>
                    {blocked ? "选一张" : "换图"}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    onClick={() => onPick(i, null)}
                  >
                    移除
                  </Button>
                </Space>
              ) : null}
            </div>
          );
        })}
      </Space>

      <Modal
        title="选择插图"
        open={pickIndex != null}
        onCancel={() => setPickIndex(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
          }}
        >
          {candidateRefs.map((r) => {
            const n = normalizeKbAssetRef(r);
            const src = resolveSrc(r);
            const parsed = parseKbAssetRef(r);
            const label = isUploadAssetRef(n)
              ? "本地上传"
              : parsed?.fileName || n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (pickIndex == null) return;
                  onPick?.(pickIndex, r);
                  setPickIndex(null);
                }}
                style={{
                  border: "1px solid #d9d9d9",
                  borderRadius: 4,
                  padding: 6,
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <FigureThumb src={src} alt={label} />
                <Text
                  ellipsis
                  style={{fontSize: 11, display: "block", marginTop: 4}}
                >
                  {label}
                </Text>
              </button>
            );
          })}
          <Upload
            accept="image/png,image/jpeg,image/gif"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file);
              return false;
            }}
          >
            <button
              type="button"
              style={{
                width: "100%",
                minHeight: 140,
                border: "1px dashed #1677ff",
                borderRadius: 4,
                background: "#f0f5ff",
                cursor: "pointer",
                color: "#1677ff",
                fontSize: 13,
              }}
            >
              ＋ 本地上传
            </button>
          </Upload>
        </div>
        {!candidateRefs.length ? (
          <Text type="secondary" style={{display: "block", marginTop: 8}}>
            本段暂无 KB 候选，可上传本地图片
          </Text>
        ) : null}
      </Modal>
    </div>
  );
};

export default DocFigureStrip;
