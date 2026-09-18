import React from 'react';
import { Button, Drawer } from 'antd';
import PptTemplateList from "@/components/DocUtil/PptTemplateList";
import {SlideSelectTemplate} from "@/components/DocUtil/ViewItem4Ppt";

interface SlideTemplateDrawerProps {
  // key:string;
  slideTemplates : SlideSelectTemplate[],
  open:boolean,
  closeFn:()=>void,
  fn:(idx:number) => void
}
const SlideTemplateDrawer: React.FC<SlideTemplateDrawerProps> = (props) => {
  const onClose = () => {
    props.closeFn()
  };

  return (
    <>
      <Drawer
        title= {<b>选择幻灯片模板</b>}
        placement={"left"}
        width={420}
        closable
        maskClosable
        onClose={onClose}
        open={props.open}
        extra={
          <Button onClick={onClose}>关闭</Button>
        }
      >
        <PptTemplateList slideTemplates={props.slideTemplates} selFn={props.fn}/>
        </Drawer>
    </>
  );
};

export default SlideTemplateDrawer;
