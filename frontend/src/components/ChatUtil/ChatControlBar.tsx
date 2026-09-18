import {MessageModal, useProChat} from "@ant-design/pro-chat";
import {useState} from "react";
import {Button, Flex} from "antd";

export interface ButtonMessage{
  title: string;
  content:string;
}
interface ChatControlProps{
  messagePrefix:string;
  buttonMessages:ButtonMessage[];
}
const confirmTitle=(title:string,content:string)=>{
  const regex = /主题是【(\S+)】/;
  const match = content.match(regex);
  return (title||title.length>0)? title :match ? match[1] : "撰写大纲" ;
}

const ChatControlBar = (props:ChatControlProps) => {
  const proChat = useProChat();
  const [open, setOpen] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [buttonMessages, setButtonMessages] = useState<ButtonMessage[]>(props.buttonMessages);
  const [buttonIndex, setButtonIndex] = useState(0);
  const [value,setValue] = useState('');
  const [title,setTitle] = useState('');
  const valueChange=(text:string)=>{
    setValue(text);
  }
  const editingChange=(editing:boolean)=>{
    if (!editing) {
      buttonMessages.splice(buttonIndex,1,
        {title:confirmTitle(buttonMessages[buttonIndex].title,value),
          content:value}
      );
    }
  }
  const handleSingleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    const idx=e.currentTarget.id.split('-')[1]
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      console.log("Double click");
    } else {
      setClickTimeout(
        setTimeout(() => {
          // message.info("Single Click");
          // 在这里执行单击事件的处理逻辑
          proChat.sendMessage(buttonMessages[Number(idx)].content);
          setClickTimeout(null);
        }, 300)
      );
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    const idx=e.currentTarget.id.split('-')[1]
    setButtonIndex(Number(idx))
    clearTimeout(clickTimeout as NodeJS.Timeout);
    setClickTimeout(null);
    // message.info("Double click");
    // 在这里执行双击事件的处理逻辑
    setOpen(true)
    setValue(buttonMessages[Number(idx)].content)
  };
  return (
    <>
      <Flex style={{ padding: 24 }} gap={8} justify={'space-between'}>
        {props.buttonMessages.map((buttonMessage,idx)=>(
          <Button
            id={"msgButton-"+idx}
            key={"msgButton-"+idx}
            type={'dashed'}
            onClick={handleSingleClick}
            onDoubleClick={handleDoubleClick}
          >
            {props.messagePrefix}：{confirmTitle(buttonMessage.title,buttonMessage.content)}
          </Button>
        ))}
      </Flex>
      <MessageModal key={"msgModal"} onOpenChange={setOpen} open={open}
                    value={value} text={{title:"修改样例消息",cancel:"取消",confirm:"关闭",edit:"编辑"}}
                    onChange={valueChange}
                    onEditingChange={editingChange}
      />
    </>
  );
};

export default ChatControlBar;
