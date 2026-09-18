import {
  ModalForm, ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
// 假设有一个命名空间API，提供了一些功能和数据
import API from '@/services/chatchat/typings.d.ts';
import React, {useEffect, useRef, useState} from "react";
import {Form} from "antd";

export type FormValueType = {
  knowledge_base_name?: string;
  kb_info?: string;
  vector_store_type?: string;
  embed_model?: string;
} & Partial<API.KbItem>;

export type CreateFormProps = {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onSubmit: (values: FormValueType) => Promise<void>;
  values?: API.KbItem;
};
const KbForm: React.FC<CreateFormProps> = (props) => {
  const [form] = Form.useForm();
  const { visible, onVisibleChange, onSubmit, values } = props;
  // Note: initialValues 只在 form 初始化时生效，如果你需要异步加载推荐使用 request，或者 initialValues ? <Form/> : null
  useEffect(() => {
     //每次重置表单
     form.resetFields();
    // 在新数据变化时更新表单
    form.setFieldsValue({knowledge_base_name:values?.kb_name,kb_info:values?.kb_info,vector_store_type:values?.vs_type,embed_model:values?.embed_model});
  }, [values, form]);
  return (
    <ModalForm form={form}
      title={values?.id ? '编辑知识库' : '创建知识库'}
      visible={visible}
      onVisibleChange={onVisibleChange}
      onFinish={async (value) => {
        await onSubmit(value);
      }}
      initialValues={values}
    >
      <ProFormText
        rules={[
          {
            required: true,
            message: '请输入知识库名称',
          },
        ]}
        label="知识库名称"
        name="knowledge_base_name"
        disabled={values?.id}
      />
      <ProFormTextArea
        label="知识库简介"
        name="kb_info"
        placeholder="请输入知识库简介"
      />
      <ProFormSelect
        rules={[
          {
            required: true,
            message: '请选择向量库类型',
          },
        ]}
          name="vector_store_type"
          width="md"
          label="向量库类型"
          valueEnum={{
            faiss: 'faiss（推荐）',
            chromadb: 'chromadb',
          }}
          initialValue="faiss"
          disabled={false}
        />
      <ProFormSelect
        rules={[
          {
            required: true,
            message: '请选择Embeddings模型',
          },
        ]}
          name="embed_model"
          width="md"
          label="Embeddings模型"
          valueEnum={{
            'BAAI/bge-large-zh-v1.5': 'BAAI/bge-large-zh-v1.5（推荐）',
            'BAAI/bge-m3': 'BAAI/bge-m3',
          }}
          initialValue={'BAAI/bge-large-zh-v1.5'}
          disabled={false}
        />
    </ModalForm>
  );
};

export default KbForm;
