import React, { useState } from 'react';
import {Modal, Button, Tooltip} from 'antd';
import { DatabaseTwoTone } from '@ant-design/icons';
import KbListSnlComp from "@/components/KbMgt/KbListCompSnl";

/** 写作时「全库」选项对应的知识库名，不对应真实库 */
export const ALL_KB_NAME = '__all__';

export function kbLabel(name?: string) {
  if (!name) return '未选择';
  if (name === ALL_KB_NAME) return '全库';
  return name;
}

/** 操作栏统一外框宽度（标签与按钮同宽） */
export const OP_CTRL_WIDTH = 120;

/** 套在标签+按钮外面的容器 */
export const opStackStyle: React.CSSProperties = {
  width: OP_CTRL_WIDTH,
  marginLeft: -10,
  boxSizing: 'border-box',
};

/** 容器内按钮：占满容器宽度 */
export const opBtnStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 'small',
  boxSizing: 'border-box',
};

/** 容器内知识库标签：与按钮同宽 */
export const opKbTagStyle: React.CSSProperties = {
  width: '100%',
  margin: '0 0 8px 0',
  padding: '6px 8px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  whiteSpace: 'normal',
  lineHeight: 1.35,
  height: 'auto',
  maxWidth: '100%',
};

/** @deprecated 使用 opBtnStyle + opStackStyle */
export const opCtrlStyle = opBtnStyle;

interface KnowledgeBaseSelectorProps {
  open: boolean;
  kbName: string; //传入的kbName（初始化）
  cbKbSel:(kb_name:string) => void;  //设定的kbName（选择后）
  style?: React.CSSProperties;
}

const KnowledgeBaseSelector: React.FC<KnowledgeBaseSelectorProps> = (props:KnowledgeBaseSelectorProps) => {
  const [visible, setVisible] = useState(props.open);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string | undefined>();

  const showModal = () => {
    setVisible(true);
  };

  const handleOk = () => {
    if (selectedKnowledgeBase) {
      console.log('选中的知识库:', selectedKnowledgeBase);
      props.cbKbSel(selectedKnowledgeBase);

      setVisible(false);
    } else {
      Modal.warning({
        title: '提示',
        content: '请选择一个知识库名称',
      });
    }
  };

  const handleCancel = () => {
    setVisible(false);
  };

  const handleChange = (value: string) => {
    setSelectedKnowledgeBase(value);
  };

  return (
    <>
      <Tooltip title={`当前选择知识库：${props.kbName}`}>
        <Button
          type="dashed"
          block
          icon={<DatabaseTwoTone style={{fontSize: 'large'}} />}
          onClick={showModal}
          style={{ ...opBtnStyle, ...props.style }}
        >
          重选知识库
        </Button>
      </Tooltip>
      <Modal
        title="选择知识库"
        open={visible}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <KbListSnlComp includeAll onSelectionChange={handleChange} value={props.kbName} />
      </Modal>
    </>
  );
};

export default KnowledgeBaseSelector;
