import React, { useState } from 'react';
import { Button, Input, message } from 'antd';
import {AudioOutlined, SoundOutlined} from '@ant-design/icons';

interface Props {
  cb4textFn:(text:string)=>void;
}

const SpeechToTextButton = (props:Props) => {
  const [isTalking, setIsTalking] = useState(false);
  const [recognition,setRecognition] = useState(null);
  // const [text, setText] = useState('');

  const startTalking= () => {
    try {
      if (!('SpeechRecognition' in window||'webkitSpeechRecognition' in window)) {
        message.error('您的浏览器不支持语音识别功能');
        return;
      }
      // @ts-ignore
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.continuous = true;
      recognition.interimResults = false;
      // recognition.lang = 'zh-CN';
      recognition.lang = 'cmn-Hans-CN';

      recognition.onstart = () => {
        // setIsListening(true);
        console.log('开始录音...');
      };

      recognition.onresult = (event:any) => {
        const transcript = event.results[0][0].transcript;
        // setText(transcript);
        console.log("stt:"+transcript,event.results[0]);
          props.cb4textFn(transcript);
          setRecognition(null);
      };

      recognition.onerror = (event:any) => {
        console.log('语音识别出错: ' + event.error);
      };

      recognition.onend = () => {
        message.success('录音结束');
      };
      setRecognition(recognition);
      setIsTalking(true);
      recognition.start();
    } catch (error:any) {
      message.error('启动语音识别失败: ' + error.message);
      return;
    }
  };


/*  const startTalking = () => {
    setIsTalking(true);
    message.info('开始说话');
    if(recognition) {
      recognition.start()
    }
    // 这里添加你的说话逻辑
  };*/
  const stopTalking = () => {
    setIsTalking(false);
    message.info('您已停止说话');
    if(recognition) {
      // @ts-ignore
      recognition.stop()
    }
    // 这里添加你的停止说话逻辑
  };

  return (

    <Button id="speechButton" style={{margin:"20px"}}
            type= {isTalking?"primary":"text"}
            icon={isTalking?<AudioOutlined />:<SoundOutlined />}
            onMouseDown={startTalking}
            onMouseUp={stopTalking}
            onTouchStart={startTalking}
            onTouchEnd={stopTalking}
    >
      {isTalking?"开始语音输入":"按住说话"}
    </Button>
  /*<Button style={{margin:"20px"}}
          type= {isTalking?"primary":"dashed"}
          icon={isTalking?<AudioOutlined />:<SoundOutlined />}
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
  >
    {isTalking?"开始语音输入":"按住说话"}
  </Button>*/
  );
};

export default SpeechToTextButton;

