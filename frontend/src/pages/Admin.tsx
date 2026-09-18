import { HeartTwoTone, SmileTwoTone } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { Alert, Card, Typography } from 'antd';
import React from 'react';

const Admin: React.FC = () => {
  const intl = useIntl();
  return (
    <PageContainer
      content={<p><br/><br/><br/><br/></p>}
    >
    <Card>
        <Alert
          message={intl.formatMessage({
            id: 'pages.welcome.alertMessage',
            defaultMessage: 'Faster and stronger heavy-duty components have been released.',
          })}
          type="success"
          showIcon
          banner
          style={{
            margin: -12,
            marginBottom: 48,
          }}
        />
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          <SmileTwoTone /> 系统管理模块开发中...敬请期待...
        </Typography.Title>
      </Card>
      <p style={{textAlign: 'center', marginTop: 24}}>
        <br/><br/><br/><br/>
      </p>
    </PageContainer>
  );
};

export default Admin;
