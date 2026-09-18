### 支持向量库类型

```java
            'faiss': 'faiss',
            'milvus': 'milvus',
            'zilliz': 'zilliz',
            'pg': 'pg',
            'es': 'es',
            'chromadb': 'chromadb',
```

### 参数调整

```javascript
# 从0.76调整为0.1
score_threshold: 0.1
```

## PPT生成改造

- 定义版式目录（Layout Catalog）
每种对应：模板页（或 pptxgen 画法）+ JSON Schema（要哪些字段）。
  - list：要点列表（你们已有）
  - compare：左右/多列对比
  - metric：大数字 + 解读
  - image_text：左图右文 / 上文下图
  - timeline：步骤/阶段
  - quote / summary：金句或小结


