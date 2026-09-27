/**
 * 图鉴页手动选图：从 KB 元素图缩略图里为每格指定裁切图。
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Empty, Image, Modal, Space, Spin, Tag, Typography, message } from "antd";
import type { SlideImageAssetRef } from "@/components/DocUtil/ViewItem4Ppt";
import {
  parseSlideImageAssets,
  setSlideImageAssets,
} from "@/components/DocUtil/ViewItem4Ppt";
import type { KbAssetItem } from "@/services/chatchat/kb";
import { listAssets } from "@/services/chatchat/kb";

const { Text } = Typography;

type Props = {
  kbName?: string;
  slideTitle: string;
  captions: string[];
  subTitle: string;
  editable?: boolean;
  onChange: (nextSubTitle: string) => void;
};

function thumbUrl(a: KbAssetItem): string {
  const base = (process.env.bf_baseUrl || "").replace(/\/$/, "");
  return `${base}${a.url.startsWith("/") ? a.url : `/${a.url}`}`;
}

const ImageGridAssetPicker: React.FC<Props> = ({
  kbName,
  slideTitle,
  captions,
  subTitle,
  editable = true,
  onChange,
}) => {
  const [assets, setAssets] = useState<KbAssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickSlot, setPickSlot] = useState<number | null>(null);

  const bound = useMemo(() => parseSlideImageAssets(subTitle), [subTitle]);
  const slots = Math.max(2, Math.min(4, captions.length || 4));

  useEffect(() => {
    if (!kbName || kbName === "__all__") {
      setAssets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listAssets({ knowledge_base_name: kbName, kinds: "image,chart" })
      .then((res) => {
        if (cancelled) return;
        const list = (res as any)?.data ?? res;
        setAssets(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        console.warn(e);
        if (!cancelled) message.warning("加载图库失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbName]);

  const applySlot = (slot: number, asset: KbAssetItem | null) => {
    const next: Array<SlideImageAssetRef | null> = [];
    for (let i = 0; i < slots; i++) {
      next[i] = bound[i] || null;
    }
    next[slot] = asset
      ? { file_name: asset.file_name, asset_id: asset.asset_id }
      : null;
    const draft = { subTitle };
    setSlideImageAssets(draft, next);
    onChange(draft.subTitle);
    setPickSlot(null);
  };

  if (!kbName || kbName === "__all__") {
    return (
      <Text type="secondary">
        当前为全库/未选知识库：下载时不会自动换图；指定知识库后可在此手选图鉴图。
      </Text>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <Text type="secondary">图鉴配图（可选手动指定；留空则下载时按文案自动对齐）</Text>
      <Space wrap style={{ marginTop: 8 }} size={12}>
        {Array.from({ length: slots }).map((_, i) => {
          const ref = bound[i];
          const hit = ref
            ? assets.find(
                (a) =>
                  a.asset_id === ref.asset_id &&
                  (!ref.file_name || a.file_name === ref.file_name),
              )
            : null;
          return (
            <div
              key={`slot-${i}`}
              style={{
                width: 120,
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: 8,
                textAlign: "center",
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <Tag color="magenta">格 {i + 1}</Tag>
              </div>
              {hit ? (
                <Image
                  src={thumbUrl(hit)}
                  width={96}
                  height={96}
                  style={{ objectFit: "cover", borderRadius: 4 }}
                  preview={false}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    margin: "0 auto",
                    background: "#fafafa",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: 12,
                  }}
                >
                  自动
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11, color: "#666" }} title={captions[i]}>
                {(captions[i] || slideTitle || "").slice(0, 12) || "图注"}
              </div>
              {editable ? (
                <Space size={4} style={{ marginTop: 6 }}>
                  <Button size="small" type="link" onClick={() => setPickSlot(i)}>
                    选图
                  </Button>
                  {ref ? (
                    <Button size="small" type="link" danger onClick={() => applySlot(i, null)}>
                      清除
                    </Button>
                  ) : null}
                </Space>
              ) : null}
            </div>
          );
        })}
      </Space>

      <Modal
        title={`选择第 ${(pickSlot ?? 0) + 1} 格图片`}
        open={pickSlot !== null}
        onCancel={() => setPickSlot(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {loading ? (
          <Spin />
        ) : assets.length === 0 ? (
          <Empty description="该库暂无元素图（请先上传/回填裁切）" />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              gap: 10,
              maxHeight: 420,
              overflow: "auto",
            }}
          >
            {assets.map((a) => (
              <button
                key={`${a.file_name}|${a.asset_id}`}
                type="button"
                onClick={() => pickSlot !== null && applySlot(pickSlot, a)}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 6,
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <img
                  src={thumbUrl(a)}
                  alt=""
                  width={96}
                  height={96}
                  style={{ objectFit: "cover", borderRadius: 4, display: "block", width: "100%" }}
                />
                <div style={{ fontSize: 11, marginTop: 4, color: "#666" }}>
                  p{a.page}·{a.kind}
                  {a.idx ? `#${a.idx}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ImageGridAssetPicker;
