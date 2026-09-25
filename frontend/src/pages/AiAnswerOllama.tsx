import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { ProChat } from '@ant-design/pro-chat';
import { useTheme } from 'antd-style';
import { Tree } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import { useState } from 'react';
import { Ollama } from '@langchain/ollama';
import {DEFAULT_LLM_MODEL} from '@/constants/llm';

// 本页直接使用ollama服务器。
const ollama = new Ollama({
  // baseUrl: 'http://localhost:11434',  //直接使用笔记本上的服务
  baseUrl: 'http://192.168.0.202:11434', //使用服务器上的服务
  model: DEFAULT_LLM_MODEL,
});

const treeData: TreeDataNode[] = [
  {
    title: '互联网搜索',
    // value: '0-0',
    key: '0-0',
  },
  {
    title: '天气查询',
    // value: '0-1',
    key: '0-1',
  },
  {
    title: '航班查询',
    // value: '0-2',
    key: '0-2',
  },
  {
    title: '线路查询',
    // value: '0-3',
    key: '0-3',
  },
  {
    title: '美食查询',
    // value: '0-4',
    key: '0-4',
  },
];
// const zhipuai_api_key = "1c7c70ca024e69b785e00e28bebfff21.YvhDoQefPXxkYFFT"

const Welcome: React.FC = () => {
  // const { token } = theme.useToken();
  const theme = useTheme();
  const { initialState } = useModel('@@initialState');
  const chats = {
    ZGxiX2p4: {
      content: '欢迎来到毕方平台。',
      createAt: 1697862242452,
      id: 'ZGxiX2p4',
      role: 'assistant',
      updateAt: 1697862243540,
    },
  };
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['0-0', '0-1']);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>(['0-0']);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const onExpand: TreeProps['onExpand'] = (expandedKeysValue) => {
    console.log('onExpand', expandedKeysValue);
    // if not set autoExpandParent to false, if children expanded, parent can not collapse.
    // or, you can remove all expanded children keys.
    setExpandedKeys(expandedKeysValue);
    setAutoExpandParent(false);
  };
  const onCheck: TreeProps['onCheck'] = (checkedKeysValue) => {
    console.log('onCheck', checkedKeysValue);
    setCheckedKeys(checkedKeysValue as React.Key[]);
  };
  const onSelect: TreeProps['onSelect'] = (selectedKeysValue, info) => {
    console.log('onSelect', info);
    setSelectedKeys(selectedKeysValue);
  };

  return (
    <PageContainer breadcrumb={{}}>
      <ProCard
        split="vertical"
        bodyStyle={{
          backgroundImage:
            initialState?.settings?.navTheme === 'realDark'
              ? 'background-image: linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
              : 'background-image: linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
        }}
      >
        <ProCard
          title="Agent选择"
          colSpan="15%"
          headerBordered
          style={{ minHeight: '600px', background: theme.colorBgContainer }}
        >
          <Tree
            checkable
            onExpand={onExpand}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onCheck={onCheck}
            checkedKeys={checkedKeys}
            onSelect={onSelect}
            selectedKeys={selectedKeys}
            treeData={treeData}
          />
        </ProCard>
        <ProCard style={{ minHeight: '600px', background: theme.colorBgContainer }}>
          <ProChat
            style={{ minHeight: '710px' }}
            helloMessage={'欢迎使用 毕方 ，我是你的专属知识管理机器人。'}
            /*request={async (messages) => {
            const mockedData: string = `这是一段模拟的对话数据。本次会话传入了${messages.length}条消息`;
            return new Response(mockedData);
          }}*/
            request={async (messages: any) => {
              // const completion = await openai.chat.completions.create({
              //   messages: messages,
              //   model: DEFAULT_LLM_MODEL,
              //   stream: true
              // });
              const stream = await ollama.stream(messages);
              // 获取 reader
              const reader = stream.getReader();
              const encoder = new TextEncoder();
              const readableStream = new ReadableStream({
                async start(controller) {
                  function push() {
                    reader
                      .read()
                      .then(({ done, value }) => {
                        if (done) {
                          controller.close();
                          return;
                        }
                        controller.enqueue(encoder.encode(value));
                        console.log(value);
                        push();
                      })
                      .catch((err) => {
                        console.error('读取流中的数据时发生错误', err);
                        controller.error(err);
                      });
                  }
                  push();
                },
              });
              return new Response(readableStream);
            }}
            userMeta={{
              avatar: '/avart.svg',
              title: '毕方',
            }}
            assistantMeta={{
              avatar: '/robot.svg',
              title: '小毕' /*, backgroundColor: '#67dedd'*/,
            }}
            initialChats={Object.values(chats)}
          />
        </ProCard>
      </ProCard>
    </PageContainer>
  );
};

export default Welcome;
