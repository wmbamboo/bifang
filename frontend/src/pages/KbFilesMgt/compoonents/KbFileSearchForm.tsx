import {Card, Form, Button, Space, Select, Col, Row, Input} from 'antd';
import {SearchOutlined, ReloadOutlined, RestOutlined} from '@ant-design/icons';
import React, {useEffect} from "react";
import {ProFormSelect, ProFormText} from "@ant-design/pro-components";
interface KpiFileSearchFormProps {
  selectOptions:any;
  onSelectChange: (values: API.KbFileSearchParams) => void;
  onQuerySearch: (values: API.KbFileSearchParams) => void;
}
const KbFileSearchForm: React.FC<KpiFileSearchFormProps> = ({selectOptions,onSelectChange,onQuerySearch,}) => {
  const [form] = Form.useForm();
  useEffect(() => {
    console.log("KbFileSearchForm selectOptions:",selectOptions);
    //每次重置表单
    form.resetFields();
    // 在新数据变化时更新表单
    form.setFieldsValue({kb_name:selectOptions[0]?.value,query:""});
  }, [selectOptions,form]);
  const handleChange = (value)=>{
    if(value?.kb_name !== undefined){
      form.setFieldsValue({query:""});
      onSelectChange(value);
    }
  };
  const handleReset = () => {
    form.resetFields();
    form.setFieldsValue({kb_name:selectOptions[0]?.value,query:""});
    onSelectChange({"kb_name": selectOptions[0]?.value});
  };
  const handleRefresh=()=>{
    form.setFieldsValue({query:""});
    onSelectChange({"kb_name": form.getFieldValue("kb_name")});
  }
  // const onSelect=(value:string,option:any)=>{
  //   onSearch({"kb_name":value});
  // }
  return (
    <Card style={{ marginBottom: 16 }}>
      <Form
        form={form}
        layout="inline"
        onValuesChange={handleChange}
        onFinish={onQuerySearch}
      >
        <Row gutter={24}>
         <Col span={11}>
        <Form.Item  name="kb_name" label="知识库名称">
         <Select style={{ width: 250 }}  placeholder="请选择知识库名称" options={selectOptions}/>
        </Form.Item>
         </Col>
        <Col span={11}>
          <ProFormText   style={{ width: 150 }}  name="query"  label="关键词"  placeholder="请输入搜索关键词" />
         </Col>
        <Col span={2} style={{ textAlign: 'right' }}>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              搜索
            </Button>
            <Button onClick={handleReset} icon={<RestOutlined />}>
              重置
            </Button>
            <Button onClick={handleRefresh} icon={<ReloadOutlined />}>
              刷新
            </Button>
          </Space>
        </Form.Item>
        </Col>
        </Row>
      </Form>
    </Card>
  );
};
export default KbFileSearchForm;
