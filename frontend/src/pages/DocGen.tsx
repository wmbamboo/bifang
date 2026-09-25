import { PageContainer, ProCard } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { ProChat } from '@ant-design/pro-chat';
import { useTheme } from 'antd-style';
import { useState } from 'react';
import {Button, Collapse, Drawer, Space, TreeDataNode, TreeProps} from 'antd';
// import { Tree } from 'antd';
import * as React from "react";
import {FieldDataNode, Key} from "rc-tree/lib/interface";
import {OpenAI} from "openai";
import KbListSnlComp from "@/components/KbMgt/KbListCompSnl";
import {DEFAULT_LLM_MODEL} from '@/constants/llm';

const openai = new OpenAI({
  apiKey: 'sk-f46769dda93743ba8266506c28500d32',
  // baseURL: 'http://localhost:8000/chat/knowledge_base/local_kb/SEMIR/',
  baseURL: process.env.bf_baseUrl+'/knowledge_base/local_kb'+'/SEMIR/',
  dangerouslyAllowBrowser: true,
});

export type DataNode = FieldDataNode<{
  key: Key;
  title?: React.ReactNode | ((data: DataNode) => React.ReactNode);
}>;


const treeData: TreeDataNode[] = [
  {
    title: '公司知识库',
    key: '0-0',
    children: [
      {
        title: '合同知识库',
        key: '0-0-0',
      },
      {
        title: '投标知识库',
        key: '0-0-1',
      },
    ],
  },
  {
    title: '部门知识库',
    key: '0-1',
    children: [
      {
        title: '大数据部门',
        key: '0-1-0',
        children: [
          {
            title: '人工智能',
            key: '0-1-0-0',
          },
          {
            title: '森马选品',
            // key: '0-1-0-1',
            key: 'SEMIR',
          },
          {
            title: '西工大网络',
            key: '0-1-0-2',
          },
          {
            title: 'sportFire',
            key: '0-1-0-3',
          },
        ],
      },
      {
        title: '数链部门',
        key: '0-1-1',
        children: [
          {
            title: '数据总线',
            key: '0-1-1-0',
          },
        ],
      },
    ],
  },
  {
    title: '个人知识库',
    key: '0-2',
    children: [
      {
        title: '人工智能',
        key: '0-2-0',
      },
      {
        title: '深空项目',
        // key: '0-2-1',
        key: 'deep space exploration'
      },
      {
        title: '产品设计',
        key: '0-2-2',
      },
      {
        title: '项目管理',
        key: '0-2-3',
      },
      {
        title: 'python语言',
        key: '0-2-4',
      },
    ],
  },
];

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

  const [open, setOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([
    '0-0-0',
    '0-1-0',
    '0-1-1',
    '0-2-0',
  ]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([
    'SEMIR'
  ]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  // const [isModalOpen, setIsModalOpen] = useState(false);
  const showDrawer = () => {
    setOpen(true);
  };
  const onClose = () => {
    setOpen(false);
  };

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
//知识库选择
 const [selectKnoBase, setSelectKnoBase] = useState(null);
 const [selectKbName, setSelectKbName] = useState(null);
 const handleSelectedKbItem= (knoBase:any) => {
    console.log('选择的知识库:', knoBase);
    // 在这里处理选中项的逻辑
    setSelectKnoBase(knoBase)
    setSelectKbName(knoBase?.kb_name)
  };

  /*const tProps = {
    checkable: true,
    onExpand:{onExpand},
    expandedKeys:{expandedKeys},
    autoExpandParent:{autoExpandParent},
    onCheck:{onCheck},
    checkedKeys:{checkedKeys},
    onSelect:{onSelect},
    selectedKeys:{selectedKeys},
    treeData:{treeData}
  };*/

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
          title="知识库选择"
          colSpan="17%"
          headerBordered
          style={{ minHeight: '600px', background: theme.colorBgContainer }}
        >
          {/*<Tree*/}
          {/*  checkable*/}
          {/*  multiple={false}*/}
          {/*  onExpand={onExpand}*/}
          {/*  expandedKeys={expandedKeys}*/}
          {/*  autoExpandParent={autoExpandParent}*/}
          {/*  onCheck={onCheck}*/}
          {/*  checkedKeys={checkedKeys}*/}
          {/*  onSelect={onSelect}*/}
          {/*  selectedKeys={selectedKeys}*/}
          {/*  treeData={treeData}*/}
          {/*/>*/}
          <KbListSnlComp onSelectionChange={handleSelectedKbItem} />
        </ProCard>
        <ProCard style={{ minHeight: '600px', background: theme.colorBgContainer }}>
          <ProChat
            style={{ minHeight: '570px' }}
            helloMessage={'欢迎使用 毕方 ，我是你的专属知识管理机器人。'}
            chatItemRenderConfig={{
              actionsProps: {
                user: {
                  actions: ['regenerate', 'edit'],
                  moreActions: ['del', 'copy'],
                },
              },
              actionsRender: (props, dom, actionsProps) => {
                if (props?.editing) {
                  return null;
                }
                return (
                  <Button ghost size={"small"} style={{marginTop:"0.7em"}}
                          type="dashed"
                          onClick={() => {
                            showDrawer();  //actionsProps?.onStartEdit();
                          }}
                  >
                    文档生成
                  </Button>
                );
              },
            }}
            request={async (messages: any) => {
               let body={
                messages: messages,
                model: DEFAULT_LLM_MODEL,
                stream: true,
                // temperature: 0.8,
                // top_p: 1,
                stream_options:{
                  top_k: 4,
                  score_threshold: 0.76,
                  temperature: 0.8,
                  prompt_name:"default",
                  return_direct: false
                }
               }
              if(selectKbName !== null) {
                let extFields = { "kb_name": selectKbName };
                Object.assign(body, extFields);
              }
              //@ts-ignore
              const completion = await openai.chat.completions.create(body);
              console.log('messages', messages);

              // 获取 reader
              const reader = completion.toReadableStream().getReader();
              const decoder = new TextDecoder('utf-8');
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
                        const chunk = decoder.decode(value, { stream: true });
                        const message = chunk.replace('data: ', '');
                        const parsed = JSON.parse(message);
                        controller.enqueue(encoder.encode(parsed.choices[0].delta.content));
                        console.log(parsed);
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
              //  --------------------------
              // const stream = OpenAIStream(completion);
              // return new StreamingTextResponse(stream);
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

      <Drawer
        title={`文档生成页面`}
        placement="right"
        width='2000px'
        onClose={onClose}
        open={open}
        extra={
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={onClose}>
              OK
            </Button>
          </Space>
        }
      >
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
            title="写作大纲"
            colSpan="45%"
            headerBordered
            style={{ minHeight: '600px', background: theme.colorBgContainer }}
          >
            <Collapse
              size="small"
              items={[
                {
                  key: '1',
                  label: '幻灯片3：准备工作',
                  children: (
                    <p>
                      主题是“如何帮助初学者学习骑自行车的方法与技巧”讲稿的第三章幻灯片中：为&quot;准备工作&quot;做一个概要说明并说明必要性，生成大约40个字左右.
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '2',
                  label: '3.1 选择合适的自行车：强调选择适合自己和身高、年龄的自行车。',
                  children: (
                    <p>
                      主题是“如何帮助初学者学习骑自行车的方法与技巧”讲稿的第三章幻灯片中：为&quot;选择合适的自行车：强调选择适合自己和身高、年龄的自行车。&quot;进行详细描述，生成大约200个字左右.
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '3',
                  label: '3.2 穿着恰当：推荐合适的安全装备，比如头盔、护膝等。',
                  children: (
                    <p>
                      主题是“如何帮助初学者学习骑自行车的方法与技巧”讲稿的第三章幻灯片中：为&quot;穿着恰当：推荐合适的安全装备，比如头盔、护膝等。&quot;进行详细描述，生成大约200个字左右.
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '4',
                  label: '3.3 了解车况：检查自行车的基本状况，确保安全骑行。',
                  children: (
                    <p>
                      主题是“如何帮助初学者学习骑自行车的方法与技巧”讲稿的第三章幻灯片中：为&quot;了解车况：检查自行车的基本状况，确保安全骑行。&quot;进行详细描述，生成大约200个字左右.
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '5',
                  label: '幻灯片4：平衡训练',
                  children: (
                    <p>
                      主题是“如何帮助初学者学习骑自行车的方法与技巧”讲稿的第四章幻灯片中：为&quot;平衡训练&quot;做一个概要说明并说明必要性，生成大约50个字左右.
                    </p>
                  ),
                },
              ]}
            />
          </ProCard>
          <ProCard
            title="操作"
            colSpan="10%"
            headerBordered
            style={{ minHeight: '600px', background: theme.colorBgContainer }}
          >
            <Button type="primary" onClick={() =>showDrawer()}>
              生成
            </Button>
          </ProCard>
          <ProCard
            title="生成内容"
            colSpan="45%"
            headerBordered
            style={{ minHeight: '600px', background: theme.colorBgContainer }}
          >
            <Collapse
              size="small"
              items={[
                {
                  key: '1',
                  label: '幻灯片3：准备工作',
                  children: (
                    <p>
                      准备工作概述：首先要检查自行车是否适骑，穿戴头盔、护具等必要装备以防受伤。同时，了解路线特点，避免复杂路段，确保骑行安全。这一步骤至关重要，旨在为初学者提供安全的学习环境，减少事故风险。
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '2',
                  label: '3.1 选择合适的自行车：强调选择适合自己和身高、年龄的自行车。',
                  children: (
                    <p>
                      选择合适的自行车至关重要。首先，根据个人身高和体型挑选合适尺寸的自行车，以避免骑行时不适或操作困难。儿童和青少年应选择有辅助轮的平衡车或小型自行车开始学习，随着年龄增长再过渡到无辅助轮的单速或多速自行车。成人则需考虑自行车的类型：山地车适合复杂地形，城市车适合平坦路面，公路车追求速度等。确保自行车的舒适性和稳定性，有助于初学者建立信心，安全愉快地享受骑行乐趣。
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '3',
                  label: '3.2 穿着恰当：推荐合适的安全装备，比如头盔、护膝等。',
                  children: (
                    <p>
                      穿着恰当是安全骑行的基础。建议初学者穿戴头盔以保护头部，避免因摔倒而受伤；选择合适的护具如护膝和肘部护垫可以减少跌倒时的冲击力。此外，穿着适合运动的服装和舒适的鞋袜也很关键，它们能提供足够的支撑并防止摩擦。对于天气条件，应考虑穿戴防风、防晒或保暖衣物。通过正确着装，不仅能够保护自己，还能提高骑行时的舒适性和注意力集中度，确保学习过程中的安全与愉悦。
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '4',
                  label: '3.3 了解车况：检查自行车的基本状况，确保安全骑行。',
                  children: (
                    <p>
                      解车况：初学者在开始骑行前，应仔细检查自行车的各项基本功能。这包括确保轮胎气充足、刹车系统灵敏可靠、链条无松弛现象以及齿轮和变速器运作正常。定期清洁自行车可以预防机械故障，同时检查车架是否有裂纹或损坏也是必不可少的。此外，对于新购的自行车，初次使用时最好先试骑一段距离以测试其性能。通过这些检查，初学者能够确保自行车的良好状态，有效避免因设备问题导致的骑行风险，保障安全骑行体验。
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              size="small"
              items={[
                {
                  key: '5',
                  label: '幻灯片4：平衡训练',
                  children: (
                    <p>平衡训练概述：通过站立和移动练习增强身体平衡感。必要，为稳定骑行打下基础。</p>
                  ),
                },
              ]}
            />
          </ProCard>
        </ProCard>
      </Drawer>
    </PageContainer>
  );
};

export default Welcome;
