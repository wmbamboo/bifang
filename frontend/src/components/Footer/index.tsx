import { GithubOutlined } from '@ant-design/icons';
import { DefaultFooter } from '@ant-design/pro-components';
import React from 'react';

const Footer: React.FC = () => {
  return (
    </*DefaultFooter
      style={{
        background: 'none',
        /!*margin:'0 auto',
        marginBlockStart:"0px",
        marginBlockEnd:"0px"*!/
      }}
      links={[
        {
          key: 'intronlink',
          title: '英创互联',
          href: 'https://intronlink.cn',
          blankTarget: true,
        },
        {
          key: 'github',
          title: <GithubOutlined />,
          href: 'https://github.com/ant-design/ant-design-pro',
          blankTarget: true,
        },
        {
          key: 'introns',
          title: 'AI智能工作室',
          href: 'https://introns.cn',
          blankTarget: true,
        },
      ]}
    /*/></>
  );
};

export default Footer;
