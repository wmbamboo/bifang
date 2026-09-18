import * as KbAPI from '@/services/chatchat/kb';
import { DownloadOutlined, EyeOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useRequest } from '@umijs/max';
import { Empty, Input, Pagination, Progress, Segmented, Space, Tooltip, Typography, message } from 'antd';
import React, { useMemo, useState } from 'react';
import { updateIdOfOutlineRes } from '@/components/DocUtil/OutlineStore';
import styles from './index.less';

updateIdOfOutlineRes();

type SearchMode = 'hybrid' | 'vector' | 'bm25';

interface KbMap {
  [key: string]: string;
}

const STOP_WORDS = new Set([
  '如何', '怎么', '怎样', '什么', '哪些', '是否', '可以', '一下', '请问', '相关',
  '的', '了', '吗', '呢', '啊', '吧', '是', '在', '和', '与', '及', '或', '等',
  '年', '月', '日', '为', '对', '就', '也', '都', '而', '被', '把', '从', '到',
]);

/** 从中文问句提取可高亮词（长词优先） */
const extractHighlightTerms = (query: string): string[] => {
  const cleaned = (query || '')
    .replace(/[？?！!。，,、：:；;（）()《》""''\s]+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const terms = new Set<string>();
  const matches = cleaned.match(/[0-9]{2,4}|[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,8}/g) || [];
  matches.forEach((m) => {
    if (!STOP_WORDS.has(m)) terms.add(m);
  });
  // 再切常见 2 字词，提高「男装」「趋势」命中
  cleaned.replace(/\s+/g, '').split('').reduce((prev, ch, i, arr) => {
    if (/[\u4e00-\u9fa5]/.test(ch) && i + 1 < arr.length && /[\u4e00-\u9fa5]/.test(arr[i + 1])) {
      const bi = ch + arr[i + 1];
      if (!STOP_WORDS.has(bi)) terms.add(bi);
    }
    return prev;
  }, '');
  return Array.from(terms).sort((a, b) => b.length - a.length);
};

const cleanSnippet = (text: string, query: string, max = 180) => {
  const compact = (text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const terms = extractHighlightTerms(query);
  let start = 0;
  for (const t of terms) {
    const idx = compact.toLowerCase().indexOf(t.toLowerCase());
    if (idx >= 0) {
      start = Math.max(0, idx - 24);
      break;
    }
  }
  const slice = compact.slice(start, start + max);
  const prefix = start > 0 ? '…' : '';
  const suffix = start + max < compact.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
};

const displayTitle = (fileName?: string) => {
  if (!fileName) return '未命名文档';
  return fileName.replace(/\.[^.]+$/, '') || fileName;
};

const relevancePercent = (result: any, maxScore: number) => {
  const raw =
    typeof result.vector_score === 'number' && result.vector_score > 0
      ? result.vector_score
      : typeof result.score === 'number'
        ? result.score
        : 0;
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((raw / maxScore) * 100)));
};

const DocSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKb, setSelectedKb] = useState<string | undefined>();
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [searchResults, setSearchResults] = useState<API.SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const [kbMap, setKbMap] = useState<KbMap>({});

  const fetchKbList = async () => {
    const resData = await KbAPI.listKnowledgeBases();
    if (resData.code === 200) {
      const kbMapData: KbMap = {};
      (resData.data || []).forEach((kb: any) => {
        kbMapData[kb.kb_name] = kb.kb_info || kb.kb_name;
      });
      setKbMap(kbMapData);
    }
    return resData;
  };

  const { data: kbList } = useRequest(fetchKbList, { manual: false });

  const kbOptions = useMemo(() => {
    if (Array.isArray(kbList)) return kbList;
    if (Array.isArray((kbList as any)?.data)) return (kbList as any).data;
    return Object.keys(kbMap).map((kb_name) => ({ kb_name, kb_info: kbMap[kb_name] }));
  }, [kbList, kbMap]);

  const maxScore = useMemo(() => {
    let m = 0;
    searchResults.forEach((r: any) => {
      const v =
        typeof r.vector_score === 'number' && r.vector_score > 0
          ? r.vector_score
          : typeof r.score === 'number'
            ? r.score
            : 0;
      if (v > m) m = v;
    });
    return m;
  }, [searchResults]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      message.error('请输入搜索关键词');
      return;
    }

    setLoading(true);
    setCurrentPage(1);
    setSearched(true);
    try {
      let response;
      if (selectedKb) {
        response = await KbAPI.searchDocs({
          query: searchQuery,
          knowledge_base_name: selectedKb,
          top_k: 20,
          mode: searchMode,
        });
      } else {
        const allKbNames = kbOptions.map((kb: any) => kb.kb_name).filter(Boolean);
        response = await KbAPI.searchCrossKbDocs({
          query: searchQuery,
          kb_names: allKbNames,
          top_k: 20,
          mode: searchMode,
        });
      }

      if (Array.isArray(response) && response.length > 0) {
        const uniqueResults = new Map();
        response.forEach((item: any) => {
          const fileName = item.metadata?.source;
          if (!fileName) return;
          const existingItem = uniqueResults.get(fileName);
          const itemScore = item.vector_score || item.score || 0;
          const existScore = existingItem
            ? existingItem.vector_score || existingItem.score || 0
            : -1;
          if (!existingItem || itemScore > existScore) {
            uniqueResults.set(fileName, item);
          }
        });
        const deduplicatedResults = Array.from(uniqueResults.values()).sort(
          (a: any, b: any) =>
            (b.vector_score || b.score || 0) - (a.vector_score || a.score || 0),
        );
        setSearchResults(deduplicatedResults);
        if (deduplicatedResults.length === 0) {
          message.info('未找到相关文档');
        }
      } else {
        setSearchResults([]);
        message.info('未找到相关文档');
      }
    } catch (error: any) {
      console.error('搜索错误:', error);
      message.error(error.message || '搜索失败');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const highlightText = (text: string, keyword: string) => {
    if (!keyword.trim() || !text) return text;
    const terms = extractHighlightTerms(keyword)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);
    if (!terms.length) return text;
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <mark key={index} className={styles.mark}>
          {part}
        </mark>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      ),
    );
  };

  const handleDownload = async (record: API.SearchResult) => {
    try {
      if (!record.metadata?.kb_name || !record.metadata?.source) {
        message.error('文档信息不完整');
        return;
      }
      const response = await KbAPI.downloadDoc({
        knowledge_base_name: record.metadata.kb_name,
        file_name: record.metadata.source,
      });
      if (response) {
        const url = window.URL.createObjectURL(new Blob([response]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', record.metadata.source);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      } else {
        message.error('下载失败');
      }
    } catch (error: any) {
      message.error(error.message || '下载失败');
    }
  };

  const base64Encode = (str: string) => btoa(encodeURIComponent(str));

  const handlePreview = (record: API.SearchResult) => {
    if (!record.metadata?.kb_name || !record.metadata?.source) {
      message.error('文档信息不完整');
      return;
    }
    const url = `https://poc.intronlink.com/kkfv/kbfiles/${record.metadata.kb_name}/content/${record.metadata.source}`;
    const previewUrl = `https://poc.intronlink.com/kkfv/onlinePreview?url=${encodeURIComponent(base64Encode(url))}`;
    window.open(previewUrl);
  };

  const modeLabel =
    searchMode === 'vector' ? '语义' : searchMode === 'bm25' ? '关键字' : '混合';

  const pagedResults = searchResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasResults = searchResults.length > 0;

  return (
    <PageContainer className={styles.page} breadcrumb={{}} title={false}>
      <div className={`${styles.shell} ${hasResults || searched ? styles.shellActive : ''}`}>
        <div className={styles.searchBlock}>
          <Typography.Title level={3} className={styles.heading}>
            智能搜索
          </Typography.Title>
          <Input.Search
            placeholder="输入关键词，例如：2024 男装流行趋势"
            enterButton={<SearchOutlined />}
            className={styles.searchInput}
            size="large"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onSearch={handleSearch}
            loading={loading}
            allowClear
          />

          <div className={styles.modeRow}>
            <span className={styles.kbLabel}>检索方式</span>
            <Segmented
              value={searchMode}
              onChange={(v) => setSearchMode(v as SearchMode)}
              options={[
                { label: '混合', value: 'hybrid' },
                { label: '语义', value: 'vector' },
                { label: '关键字', value: 'bm25' },
              ]}
            />
            <Typography.Text type="secondary" className={styles.hint}>
              混合=语义+关键字；语义看意思相近；关键字看词面匹配
            </Typography.Text>
          </div>

          <div className={styles.kbRow}>
            <Tooltip title="查询前指定检索范围，不是结果出来后再筛选">
              <span className={styles.kbLabel}>检索范围</span>
            </Tooltip>
            <button
              type="button"
              className={`${styles.kbChip} ${!selectedKb ? styles.kbChipActive : ''}`}
              onClick={() => setSelectedKb(undefined)}
            >
              全部知识库
            </button>
            {kbOptions.map((kb: any) => (
              <button
                type="button"
                key={kb.kb_name}
                className={`${styles.kbChip} ${selectedKb === kb.kb_name ? styles.kbChipActive : ''}`}
                onClick={() => setSelectedKb(kb.kb_name)}
              >
                {kb.kb_info || kb.kb_name}
              </button>
            ))}
          </div>
        </div>

        {hasResults ? (
          <div className={styles.resultPane}>
            <div className={styles.resultMeta}>
              在
              <strong>{selectedKb ? kbMap[selectedKb] || selectedKb : '全部知识库'}</strong>
              中以<strong>{modeLabel}</strong>检索，找到约{' '}
              <strong>{searchResults.length}</strong> 个相关文档
            </div>
            <div className={styles.resultList}>
              {pagedResults.map((result: any, idx) => {
                const kbName = result.metadata?.kb_name || '';
                const source = result.metadata?.source || '';
                const pct = relevancePercent(result, maxScore);
                const retriever =
                  result.retriever === 'vector'
                    ? '语义'
                    : result.retriever === 'bm25'
                      ? '关键字'
                      : '混合';
                return (
                  <article key={`${source}-${idx}`} className={styles.resultItem}>
                    <div className={styles.resultPath}>
                      <FileTextOutlined />
                      <span>{kbMap[kbName] || kbName || '知识库'}</span>
                      <span className={styles.sep}>›</span>
                      <span className={styles.pathFile}>
                        {highlightText(source, searchQuery)}
                      </span>
                    </div>
                    <h3 className={styles.resultTitle}>
                      <a onClick={() => handleDownload(result)}>
                        {highlightText(displayTitle(source), searchQuery)}
                      </a>
                    </h3>
                    <p className={styles.resultSnippet}>
                      {highlightText(cleanSnippet(result.page_content || '', searchQuery), searchQuery)}
                    </p>
                    <div className={styles.resultActions}>
                      <Space size="middle">
                        <a onClick={() => handlePreview(result)}>
                          <EyeOutlined /> 预览
                        </a>
                        <a onClick={() => handleDownload(result)}>
                          <DownloadOutlined /> 下载
                        </a>
                        <span className={styles.modeTag}>{retriever}</span>
                      </Space>
                      <Tooltip title="相对本页结果中最高分的归一化相关度（非绝对百分制）">
                        <div className={styles.scoreBox}>
                          <span>相关度 {pct}%</span>
                          <Progress
                            percent={pct}
                            showInfo={false}
                            size="small"
                            strokeColor="#1677ff"
                            trailColor="#f0f0f0"
                            className={styles.scoreBar}
                          />
                        </div>
                      </Tooltip>
                    </div>
                  </article>
                );
              })}
            </div>
            {searchResults.length > pageSize && (
              <Pagination
                className={styles.pager}
                current={currentPage}
                pageSize={pageSize}
                total={searchResults.length}
                onChange={setCurrentPage}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 条`}
              />
            )}
          </div>
        ) : (
          <div className={styles.emptyWrap}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searched
                  ? '未找到相关文档，可换个关键词、切换检索方式或缩小知识库范围再试'
                  : '先选择检索范围与方式，再输入关键词搜索'
              }
            />
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default DocSearch;
