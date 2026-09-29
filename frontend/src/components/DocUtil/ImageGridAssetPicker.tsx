/**
 * 图鉴页手动选图：KB 元素图按品类过滤；未手选时展示自动对齐预览。
 */
import React, {useEffect, useMemo, useState} from "react";
import {
  Button,
  Empty,
  Image,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import type {SlideImageAssetRef} from "@/components/DocUtil/ViewItem4Ppt";
import {
  parseSlideImageAssets,
  setSlideImageAssets,
} from "@/components/DocUtil/ViewItem4Ppt";
import type {KbAssetItem} from "@/services/chatchat/kb";
import {listAssets} from "@/services/chatchat/kb";
import {
  filterAssetsByImageGridCategory,
  inferImageGridCategory,
  selectImageGridByCaptions,
} from "@/components/DocUtil/kbImageAssetsCore";

const {Text} = Typography;

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
  const slots = Math.max(2, Math.min(9, captions.length || 4));
  const category = useMemo(
    () => inferImageGridCategory(slideTitle, captions),
    [slideTitle, captions],
  );
  const catAssets = useMemo(
    () =>
      filterAssetsByImageGridCategory(
        assets,
        category,
      ) as KbAssetItem[],
    [assets, category],
  );

  /** 未手选时的自动预览（品类池 + 文案对齐） */
  const autoPicked = useMemo(() => {
    return selectImageGridByCaptions(assets, captions, {
      title: slideTitle,
      count: slots,
      category,
      strictCategory: true,
    }) as KbAssetItem[];
  }, [assets, captions, slideTitle, slots, category]);

  useEffect(() => {
    if (!kbName || kbName === "__all__") {
      setAssets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listAssets({knowledge_base_name: kbName, kinds: "image,chart"})
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
      ? {file_name: asset.file_name, asset_id: asset.asset_id}
      : null;
    const draft = {subTitle};
    setSlideImageAssets(draft, next);
    onChange(draft.subTitle);
    setPickSlot(null);
  };

  /** 把当前自动对齐结果写入 img: 行 */
  const applyAutoAll = () => {
    if (!autoPicked.length) {
      message.warning("当前品类下没有可对齐的元素图");
      return;
    }
    const refs: Array<SlideImageAssetRef | null> = [];
    for (let i = 0; i < slots; i++) {
      const a = autoPicked[i];
      refs[i] = a
        ? {file_name: a.file_name, asset_id: a.asset_id}
        : null;
    }
    const draft = {subTitle};
    setSlideImageAssets(draft, refs);
    onChange(draft.subTitle);
    message.success(
      `已按${category === "polo" ? "polo" : category === "shirt" ? "衬衫" : "文案"}对齐 ${autoPicked.length} 张`,
    );
  };

  if (!kbName || kbName === "__all__") {
    return (
      <Text type="secondary">
        当前为全库/未选知识库：下载时不会自动换图；指定知识库后可在此手选图鉴图。
      </Text>
    );
  }

  return (
    <div style={{marginTop: 12}}>
      <Space wrap size={8} style={{marginBottom: 4}}>
        <Text type="secondary">
          图鉴配图（可选手动；留空则下载时按「品类池 + 文案」自动对齐）
        </Text>
        {category ? (
          <Tag color={category === "polo" ? "blue" : "orange"}>
            品类池：{category === "polo" ? "polo" : "衬衫"}（已滤异品类）
          </Tag>
        ) : (
          <Tag>品类未识别（全库池）</Tag>
        )}
        {editable ? (
          <Button size="small" type="link" onClick={applyAutoAll}>
            一键按文案对齐
          </Button>
        ) : null}
      </Space>
      <Space wrap style={{marginTop: 8}} size={12}>
        {Array.from({length: slots}).map((_, i) => {
          const ref = bound[i];
          const hit = ref
            ? assets.find(
                (a) =>
                  a.asset_id === ref.asset_id &&
                  (!ref.file_name || a.file_name === ref.file_name),
              )
            : null;
          const preview = hit || (!ref ? autoPicked[i] : null);
          const isAuto = !hit && !!preview;
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
              <div style={{marginBottom: 4}}>
                <Tag color="magenta">格 {i + 1}</Tag>
                {isAuto ? <Tag>预览</Tag> : null}
              </div>
              {preview ? (
                <Image
                  src={thumbUrl(preview)}
                  width={96}
                  height={96}
                  style={{objectFit: "cover", borderRadius: 4}}
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
              <div
                style={{marginTop: 6, fontSize: 11, color: "#666"}}
                title={captions[i]}
              >
                {(captions[i] || slideTitle || "").slice(0, 12) || "图注"}
              </div>
              {editable ? (
                <Space size={4} style={{marginTop: 6}}>
                  <Button size="small" type="link" onClick={() => setPickSlot(i)}>
                    选图
                  </Button>
                  {ref ? (
                    <Button
                      size="small"
                      type="link"
                      danger
                      onClick={() => applySlot(i, null)}
                    >
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
        title={`选择第 ${(pickSlot ?? 0) + 1} 格图片${
          category
            ? `（${category === "polo" ? "polo" : "衬衫"}池 ${catAssets.length} 张）`
            : ""
        }`}
        open={pickSlot !== null}
        onCancel={() => setPickSlot(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {loading ? (
          <Spin />
        ) : catAssets.length === 0 ? (
          <Empty description="该品类下暂无元素图（请先上传/回填裁切）" />
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
            {catAssets.map((a) => (
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
                  style={{
                    objectFit: "cover",
                    borderRadius: 4,
                    display: "block",
                    width: "100%",
                  }}
                />
                <div style={{fontSize: 11, marginTop: 4, color: "#666"}}>
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
