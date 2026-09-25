import { PlusOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {PageContainer, ProTable} from '@ant-design/pro-components';
import { Button, message, Modal } from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  batDeleteKbFile,
  downloadDoc,
  queryKbFile,
  queryKbList, searchDocs,
  revectorizeUploadTask,
} from "@/services/chatchat/kb";
import KbFileSearchForm from "@/pages/KbFilesMgt/compoonents/KbFileSearchForm";
import UploadFilesForm from "@/pages/KbFilesMgt/compoonents/UploadFilesForm";
import moment from "moment";
import { useUploadTasks } from '@/components/UploadTask/UploadTaskContext';
import { UploadTaskManagerDrawer } from '@/components/UploadTask/UploadTaskPanel';
const KnowledgeBaseFile: React.FC = () => {
  const actionRef = useRef<ActionType>();
  const [proTableLoading, setProTableLoading] = useState<boolean>(false);
  const [kbFileListData, setKbFileListData] = useState( []);
  const [kbFileProListData, setKbFileProListData] = useState( []);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const { openTask, setPanelOpen, setMinimized, tasks } = useUploadTasks();
  /** 记录各任务上次状态，仅在「进行中 → 结束」时刷新列表 */
  const prevTaskStatusRef = useRef<Record<string, string>>({});

  const [curSelectKbName, setCurSelectedKbName] = useState<string>("");
  const [selectOptions, setSelectOptions] = useState<API.KbFileSearchParams>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
   const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => {
      setSelectedRowKeys(keys);
    },
  };

  //获取知识库文件列表
   const fetchKbFileListData = useCallback(async (params: API.KbFileSearchParams) => {
    try {
       const response = await queryKbFile(params);
       console.log("fetchKbFileListData Res:",response)
       if(response.code === 200){
         setKbFileListData(response.data)
         setKbFileProListData(response.data)
       }
     } catch (error) {
      message.error('获取知识库文件列表失败');
      console.error('错误信息为:', error);
    } finally {
    }
  }, []);
  //处理上传文件表单
 //控制上传模态框显示
  const [uploadModalVisible, setUploadModalVisible] = useState<boolean>(false);
  const showUploadModal = () => {
    setUploadModalVisible(true);
  };
  const handleUploadCancel = () => {
    setUploadModalVisible(false);
  };
  const handleUploadSuccess = () => {
    // 上传成功后的回调，例如刷新列表等
    fetchKbFileListData({"kb_name":curSelectKbName});
  };

  // 向量化/OCR 任务从进行中变为完成时，刷新列表（更新向量库✔️/❌）
  useEffect(() => {
    if (!curSelectKbName) return;
    let shouldRefresh = false;
    for (const t of tasks) {
      if (t.kb_name !== curSelectKbName) continue;
      const prev = prevTaskStatusRef.current[t.id];
      prevTaskStatusRef.current[t.id] = t.status;
      if (
        prev &&
        ['pending', 'running', 'paused'].includes(prev) &&
        (t.status === 'completed' || t.status === 'stopped')
      ) {
        shouldRefresh = true;
      }
    }
    if (shouldRefresh) {
      fetchKbFileListData({ kb_name: curSelectKbName });
    }
  }, [tasks, curSelectKbName, fetchKbFileListData]);

  //搜索知识库文件
  const searchKbDocFileListData=async (params: API.KbFileSearchParams) => {
    //使用Set根据文件名去重
    let searchKbDocFiles=new Set<string>();
    setProTableLoading(true);
    try {
      const queryCond={query: params?.query,knowledge_base_name: params?.kb_name,
         top_k: 20, // score_threshold: 0.5,
         }
      const resData = await searchDocs(queryCond);
       //console.log("searchKbDocFileListDataRes:",resData);
       //检查返回的数据是否为数组并进行去重处理
      if (Array.isArray(resData) && resData.length > 0) {
        resData.forEach(item => {
          const fileName = item.metadata?.source;
          searchKbDocFiles.add(fileName);
        });
        console.log("searchKbDocFileListDataResFiles:",searchKbDocFiles)
      }
     } catch (error) {
      message.error('获取搜索知识库文档失败');
      console.error('错误信息为:', error);
    } finally {
      setProTableLoading(false);
    }
    return searchKbDocFiles
  };
  //获取知识库列表
  const fetchKbListData = async () => {
    try {
      const response = await queryKbList();
      const resData = response.data;
      // 假设后端返回的数据格式是 [{ id: 1, name: 'Option 1' }, ...]
      const options = resData.map(kb => ({
          value: kb.kb_name,
          label: kb.kb_info,
       }));
      setSelectOptions(options)
     if(resData.length >0){
        //setSearchParams({"kb_name":resData[0].kb_name,"query":""});
        setCurSelectedKbName(resData[0].kb_name)
        fetchKbFileListData({"kb_name":resData[0].kb_name})
     }
    } catch (error) {
      message.error('获取知识库列表数据失败');
      console.error('错误信息为:', error);
    } finally {
    }
  };

  useEffect(() => {
    fetchKbListData()
  }, []);

  //处理知识库选项变化时搜索知识库文件
  const handleSelectChange = (value: API.KbFileSearchParams) => {
    if(value?.kb_name !== undefined){
      // if(value?.kb_name !== curSelectKbName){
       console.log("handleSelectChange：",value)
       //setSearchParams(value);
       setCurSelectedKbName(value?.kb_name)
       fetchKbFileListData({"kb_name":value?.kb_name})
      // }
    }
    // else{
    //    console.log("handleSearchElse：")
    //   setSearchParams( {"kb_name":"","query":""})
    // }
    //actionRef.current?.reload();
  };
   //处理关键词变化时搜索知识库文档
  const handleQuerySearch = (value: API.KbFileSearchParams) => {
    console.log("handleQuerySearch：",value)
    let query=value?.query
    if(query !== undefined && query !== ''){
     // handleSelectChange(value);
     searchKbDocFileListData(value).then(searchKbDocFiles=> {
      if (searchKbDocFiles.size > 0) {
        let kbFileProListNvData=kbFileListData.filter((file) => searchKbDocFiles.has(file?.file_name))
        setKbFileProListData(kbFileProListNvData)
      } else {
        setKbFileProListData([])
      }
    })
    }else{
        // setKbFileProListData(kbFileListData)
        handleSelectChange(value)
    }
  };

  //处理批删除
 const handleBatDelete = async () => {
    // 这里应该是一个异步请求，比如调用API删除数据
    //示例代码，实际操作需要替换为你的删除逻辑
    console.log('批量删除:', selectedRowKeys);
   try {
     let batDelKbFileParams={
       "knowledge_base_name": curSelectKbName,
       "file_names": selectedRowKeys,
       "delete_content": true,
       "not_refresh_vs_cache": false
      }
     let batDelRes=await batDeleteKbFile(batDelKbFileParams)
     console.log('handleBatDeleteRes:',batDelRes)
     message.success('文件批量删除成功');
     //删除后，清除选中状态
     setSelectedRowKeys([]);
     //重新加载数据或进行其他操作
     // actionRef.current?.reload();
     fetchKbFileListData({"kb_name":curSelectKbName});
    } catch (error) {
     message.error('文件批量删除失败');
    }

  };
  // 处理删除
  const handleDelete = async (record: API.KnowledgeBaseFile) => {
    try {
     let delKbFileParams={
      "knowledge_base_name": curSelectKbName,
      "file_names": [record.file_name],
      "delete_content": true,
      "not_refresh_vs_cache": false
     }
     let delRes=await batDeleteKbFile(delKbFileParams)
     console.log("handleDeleteRes:",delRes)
     message.success('文件删除成功');
     //重新加载数据或进行其他操作
     // actionRef.current?.reload();
     fetchKbFileListData({"kb_name":curSelectKbName});
    } catch (error) {
     message.error('文件删除失败');
     return false;
    }
  };
 //处理下载
 const handleDownLoad = async (record: API.KnowledgeBaseFile) => {
    try {
      let downParams={
      "knowledge_base_name": curSelectKbName,
      "file_name": record.file_name
     }
     let delRes=await downloadDoc(downParams)
     if (delRes) {
        const url = window.URL.createObjectURL(new Blob([delRes]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', record.file_name);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      } else {
        message.error('下载失败');
      }
      return true;
    } catch (error) {
      message.error('下载失败');
      return false;
    }
  };
  //处理更新（异步任务，可后台继续）
  const handleUpdate = async (record: API.KnowledgeBaseFile) => {
    try {
      const res = await revectorizeUploadTask({
        knowledge_base_name: curSelectKbName,
        file_names: [record.file_name],
      });
      if (res?.code === 200 && res.data?.id) {
        message.success(`${record.file_name} 已加入向量化任务`);
        openTask(res.data.id);
        setMinimized(false);
        setPanelOpen(true);
        return true;
      }
      message.error(res?.msg || `${record.file_name} 创建任务失败`);
      return false;
    } catch {
      message.error(`${record.file_name} 文件重新向量化更新失败！`);
      return false;
    }
  };

  /** 批量向量化更新（勾选多文件 → 一个异步任务） */
  const handleBatRevectorize = () => {
    if (!curSelectKbName) {
      message.warning('请先选择知识库');
      return;
    }
    if (!selectedRowKeys.length) {
      message.warning('请先勾选要更新的文件');
      return;
    }
    const names = selectedRowKeys.map(String);
    Modal.confirm({
      title: '批量向量化更新',
      content: `确认将已选 ${names.length} 个文件重新解析/OCR 并写入向量库吗？任务可在「上传任务管理」中查看进度。`,
      okText: '开始更新',
      onOk: async () => {
        try {
          const res = await revectorizeUploadTask({
            knowledge_base_name: curSelectKbName,
            file_names: names,
          });
          if (res?.code === 200 && res.data?.id) {
            message.success(`已创建批量向量化任务（${names.length} 个文件）`);
            openTask(res.data.id);
            setMinimized(false);
            setPanelOpen(true);
            setSelectedRowKeys([]);
            return;
          }
          message.error(res?.msg || '创建批量向量化任务失败');
        } catch {
          message.error('批量向量化更新失败');
        }
      },
    });
  };

 // 表格列定义
 const columns: ProColumns<API.KnowledgeBaseFile>[] = [
    {
      title: '序号',
      dataIndex: 'No',
      width: 60,
      // 支持搜索
      search: false,
    },
    {
      title: '知识库名称',
      dataIndex: 'kb_name',
      ellipsis: true,
      // 支持搜索
      search: false,
      hidden:true
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      ellipsis: true,
      // 支持搜索
      search: false,
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      width: 100,
      // 支持搜索
      search: false,
    },
    {
      title: '文档加载器',
      dataIndex: 'document_loader',
      width: 120,
      // 支持搜索
      search: false,
    },
    {
      title: '文档分词器',
      dataIndex: 'text_splitter',
      width: 120,
      // 支持搜索
      search: false,
    },
    {
      title: '索引文档数量',
      dataIndex: 'docs_count',
      width: 100,
      // 支持搜索
      search: false,
    },
    {
      title: '源文件',
      dataIndex: 'in_folder',
      width: 100,
      // 支持搜索
      search: false,
      render: (text) => {
      let resText=text ? "✔️" : "❌";
      return resText;
      },
    },
    {
      title: '向量库',
      dataIndex: 'in_db',
      width: 100,
      // 支持搜索
      search: false,
      render: (text) => {
      let resText=text ? "✔️" : "❌";
      return resText;
      },
    },
    {
      title: '索引生成时间',
      dataIndex: 'file_mtime',
      width: 160,
      // 支持搜索
      search: false,
      render: (text) => {
      // 将时间戳转换为毫秒，然后转换为可读的日期时间字符串
      // const date = new Date(text * 1000);
      // return date.toLocaleString(); // 或者使用任何你喜欢的日期格式
      // 使用moment.js来格式化时间戳
      let forText=text!=='-'? moment(text * 1000).format('YYYY-MM-DD HH:mm:ss'):"";
      return forText;
      },
    },

    // {
    //   title: '自定义文件',
    //   dataIndex: 'custom_docs',
    //   width: 100,
    // },
    // {
    //   title: '文件扩展名',
    //   dataIndex: 'file_ext',
    //   width: 100,
    // },
    // {
    //   title: '文件版本',
    //   dataIndex: 'file_version',
    //   width: 100,
    // },
    // {
    //   title: '生成时间',
    //   dataIndex: 'create_time',
    //   valueType: 'dateTime',
    //   width: 160,
    // },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      render: (_, record) => [
        <a
          key="edit"
          onClick={() => {
            Modal.confirm({
              title: '确认更新',
              content: '确认将所选文件重新向量化添加至向量库吗？',
              onOk: async () => {
                await handleUpdate(record);
                // 列表状态在任务 completed 后由 useEffect 自动刷新
              },
            });
          }}
        >
          向量化更新
        </a>,
        <a
          key="delete"
          onClick={() => {
            Modal.confirm({
              title: '确认删除',
              content: '确定要删除这条记录吗？',
              onOk: async () => {
                await handleDelete(record);
              },
            });
          }}
        >
          删除
        </a>,
        <a
          key="download"
          onClick={() => {
            handleDownLoad(record);
          }}
        >
          下载
        </a>,
      ],
    },
  ];

  return (
    <PageContainer>
      <KbFileSearchForm selectOptions={selectOptions} onSelectChange={handleSelectChange} onQuerySearch={handleQuerySearch} />
      <ProTable<API.KnowledgeBaseFile>
        headerTitle="知识库文件列表"
        loading={proTableLoading}
        dataSource={kbFileProListData}
        actionRef={actionRef}
        rowKey="file_name"
        // request={async (params) => {
        //   const response = await queryKbFile(params);
        //   return {
        //     data: response.data,
        //     success: response.success,
        //     total: response.total,
        //   };
        // }}
        rowSelection={rowSelection}
        search={false} // 设置为false隐藏搜索区域
        toolBarRender={() => [
           <Button
            type="primary"
            key="upload"
            onClick={() => {
              setUploadModalVisible(true);
            }}
           disabled={curSelectKbName === ""}
          >
           <PlusOutlined />上传文件到知识库
          </Button>,
          <Button
            key="tasks"
            icon={<UnorderedListOutlined />}
            onClick={() => setTaskDrawerOpen(true)}
          >
            上传任务管理
          </Button>,
          <Button
            type="primary"
            key="batRevectorize"
            onClick={handleBatRevectorize}
            disabled={!selectedRowKeys.length || !curSelectKbName}
          >
            批量向量化更新
          </Button>,
          <Button
          type="primary"
          danger
          key="batDel"
          onClick={handleBatDelete}
          disabled={!selectedRowKeys.length}
        >
          批量删除
        </Button>,
        ]}
        // params={searchParams} // 将搜索参数传递给ProTable
        columns={columns}
      />
      <UploadFilesForm
        visible={uploadModalVisible}
        curKbName={curSelectKbName}
        onCancel={handleUploadCancel}
        onSuccess={handleUploadSuccess}
      />
      <UploadTaskManagerDrawer
        open={taskDrawerOpen}
        onClose={() => setTaskDrawerOpen(false)}
        kbName={curSelectKbName || undefined}
      />
    </PageContainer>
  );
};

export default KnowledgeBaseFile;
