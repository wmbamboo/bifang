import React from 'react';
import {InboxOutlined, UploadOutlined} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, message, Upload } from 'antd';
const { Dragger } = Upload;


interface OutlineUploaderProps{
  /**
   * 文件名和文件内容导入
   * @param title  文件名作为标题
   * @param content  文件内容为markdown格式文档，从标题后开始的正文
   */
  cb4ImportOutline:(title:string,content:string)=>void;
}

const OutlineUploader: React.FC<OutlineUploaderProps> = (ouProps:OutlineUploaderProps) => {

  const handleFileContent = (file_name:string,file: Blob) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // setFileContent(e.target.result);
      console.log("上传页面：e.target.result:",e.target?.result);
      ouProps.cb4ImportOutline(file_name,e.target?.result as string);
    };
    reader.readAsText(file);
  };

  const props: UploadProps = {
    name: 'file',
    multiple: false,
    action: '',
    headers: {},
    beforeUpload:(file)=>{
      handleFileContent(file.name,file);
      return false
      },
    onChange(info) {
      const { status } = info.file;
      if (status !== 'uploading') {
        console.log(info.file, info.fileList);
      }
      if (status === 'done') {
        message.success(`${info.file.name} 文件上传成功.`);
      } else if (status === 'error') {
        message.error(`${info.file.name} 文件上传失败.`);
      }
    },
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
  };

  return (
    <Dragger name={"fileUploader"} multiple={false} {...props} style={{width: "400px", height: "100px", padding: "0px"}}>
      <p className="ant-upload-drag-icon" style={{marginBottom: "0px"}}>
        <InboxOutlined/>
      </p>
      <p className="ant-upload-text">本地大纲导入</p>
      <p className="ant-upload-hint" style={{marginBottom: "0px"}}>
        <a href={"/ppt_outline_template.md"} target={"_blank"}>大纲文件模板[md格式可下载]</a>
      </p>
    </Dragger>
  );
}

export default OutlineUploader;
