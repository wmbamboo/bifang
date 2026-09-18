/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file paas ar Demo
 * @author zhangyue49
 */
import React, {useEffect, useCallback, useState, useRef, CSSProperties} from 'react';
import { DHIframeV2 } from '@bddh/starling-dhiframe';
import './DigitalMan.css';
import {Button, Switch} from "antd";

const dhIframe = new DHIframeV2('demo');

function splitArrayBuffer(arrayBuffer: ArrayBuffer, chunkSize: number) {
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < arrayBuffer.byteLength; i += chunkSize) {
    const end = Math.min(i + chunkSize, arrayBuffer.byteLength);
    chunks.push(arrayBuffer.slice(i, end));
  }
  return chunks;
}

interface DigitalManProps {
  render_text: string;
  render_imoji: string;
}

const DigitalMan = (props:DigitalManProps) => {
  const [show, setShow] = useState(false);
  const [animojis, setAnimojis] = useState<string[]>();
  const [isOn,setIsOn] = useState<boolean>(true);

  const test=(text:string)=>{
    if(!isOn) return;
    dhIframe.textRender({
        // 购买"定制服务-语音合成 交互组件-端渲染交互组件-3D数字"两个组件组件，为应用绑定组件，获取appKey, appId
        // 参见token生产文档（https://cloud.baidu.com/doc/AI_DH/s/Ulywupd35）生成token
        token: 'i-qmrr5iw8960uz/afe36082f25414229e07ee9681336ba34a5cf6fa3cce90cf0a50f6b0f1711685/2024-12-31T07:17:56.369Z',
        text: text,
        tts: {
          per: 5116,
          spd: 5,
          pit: 5
        }
      },
      ({status, data}) => {
        console.log('textRender callback:', status, data);
      });
  }

  const handleRender = useCallback((welcome?: string) => {
    if(!isOn) return;
    const text = welcome || '空文本测试';
    dhIframe?.textRender?.(
      {
        token: 'i-qmrr5iw8960uz/afe36082f25414229e07ee9681336ba34a5cf6fa3cce90cf0a50f6b0f1711685/2024-12-31T07:17:56.369Z',
        text:  text,
        // text:"欢迎使用 毕方 ，我是智能小毕",
        tts: {
          per: 5116,  //'自行填写',
          spd: 5,
          pit: 5
        }
      },
      ({ status, data }: { status: string, data: any }) => {
        console.log('textRender callback:', status, data);
      });
  }, []);

  const handleDestroy = useCallback(() => {
    if (!show) {
      setShow(true);
    }
    else {
      dhIframe.destroy();
    }
  }, [show]);

  const handleInterrupt = useCallback(() => {
    dhIframe?.sendMessage('INTERRUPT', {});
  }, []);

  const handleAudioRender = useCallback((file: File) => {
    if (!file) {
      return;
    }
    // 使用 FileReader 读取文件内容
    const reader = new FileReader();
    // 监听文件加载完成事件
    reader.onload = function (loadEvent) {
      const arrayBuffer: ArrayBuffer = loadEvent?.target?.result as ArrayBuffer;
      const chunks: ArrayBuffer[] | null = splitArrayBuffer(arrayBuffer, 1024 * 2);
      chunks.map(chunk => {
        let audioData: ArrayBuffer | null = new Int16Array(chunk);
        dhIframe.audioRender(audioData);
        audioData = null;
      });
      dhIframe?.stopAudioRender();
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleUploadAudio = useCallback(async (event: any) => {
    dhIframe?.startAudioRender(
      'i-qmrr5iw8960uz/afe36082f25414229e07ee9681336ba34a5cf6fa3cce90cf0a50f6b0f1711685/2024-12-31T07:17:56.369Z', //'自行填写token',
      ({ status, data }: { status: string, data: any }) => {
        console.log('audioRender callback', status, data);
        if (status === 'AUDIO_INIT') {
          const file = event.target.files[0];
          handleAudioRender(file);
        }
      });
  }, [handleAudioRender]);

  const handleAddAnimoji = useCallback((id: string) => {
    dhIframe.animojiRender(id);
  }, []);

  const handleCustom = useCallback(() => {
    // 做动作
    dhIframe.animojiRender('expression1', (data: object) => {
      console.log(data, 'finish')
    });
    // dhIframe.changeParts([
    //     {
    //         type: "hair",
    //         id: "coco_02_hair_out"
    //     },
    //     {
    //         type: "badge",
    //         id: "coco_02_badge_out"
    //     },
    //     {
    //         type: "shoes",
    //         id: "coco_02_shoes_out"
    //     },
    //     {
    //         type: "body",
    //         id: "coco_02_body_out"
    //     },
    // ]);
  }, []);

  useEffect(() => {
    dhIframe.registerMessageReceived((data: any) => {
      // console.log('global:', data);
      if (data.type === 'state') {
        if (data.content.status === 'INIT') {
          dhIframe.load({
            backgroundImageUrl: '',
            modelUrl: process.env.bf_baseUrl+'/webgl_case1025.zip',   //'自行填写人像包zip地址',
            cameraId: 'h_half_cam'   //'自行填写初始相机位'
          });
        }
        if (data.content.status === 'AVATAR_LOAD') {
          setAnimojis(data.content?.message?.config?.animationList.map((item: any) => item.animationName));
          // handleRender('数字人开场白');
          handleRender('你好，我是智能小毕');
        }
        if (data.content.status === 'USER_ACTIVE') {
          console.info('模型加载完成无用户交互');
        }
        if (data.content.status === 'AUTHENTICATION') {
          console.log('AUTHENTICATION callback:', data);
        }
        if (data.content.status === 'CLOSE') {
          setShow(false);
        }
      }
    });
    return () => {
      dhIframe.removeMessageReceived();
    };
  }, [handleRender]);

  useEffect(() => {
    console.log('hezl-------:render_text:', props.render_text);
    test(props.render_text)
  }, [props.render_text])
  useEffect(() => {
    console.log('hezl-------:render_imoji:', props.render_imoji);
    handleAddAnimoji(props.render_imoji)
  }, [props.render_imoji])
  useEffect(() => {
    setTimeout(() => {setShow(true)}, 3000)
  }, [])

  return (
    <div className="ar-player-wrapper"
         style={{position: "absolute", top: 40, right: -350, width: '15vw', height: '60vh',zIndex:"9999"}}>
      <Switch checkedChildren="开启播报" unCheckedChildren="关闭播报" defaultChecked={isOn} onClick={()=>setIsOn(!isOn)}
              style={{position: "absolute", top: 40, right: 100}}/>
      {/*<Button onClick={() => handleInterrupt()}>中断播报</Button>*/}
      {/*<Button onClick={() => handleDestroy()}>关闭数字人</Button>*/}
      {show && (
        <iframe
          id="demo"
          src="https://open.xiling.baidu.com/cloud/client/ar?platform=paas"
          allow="autoplay;"
          style={{width: '15vw', height: '60vh', border: '0px'}}
        >
        </iframe>
      )}
    </div>
  );
};


export default DigitalMan;
