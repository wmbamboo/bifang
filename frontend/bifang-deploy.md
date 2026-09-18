#### 有大量文件替换并可能增加了依赖的新第三方库
```shell
    # 先切换到bifang目录(目前在： /home/hezl/bifang)
    # 应该是先要 sudo -i hezl后执行下面语句
    # 尽量不要在195上改代码，而是195从git上获取代码：
    git reset --hard
    git pull
    
    # 20250108补充：由于上次中科思拓军方盒子演示的原因，目前195部署的仍然是military分支，因此下次使用master部署时，应该先切换分支。
    # git checkout master
  
    # 使用195证书的配置文件变为默认配置
    cp -f config/config_195.ts config/config.ts
    cp -f config/proxy_195.ts config/proxy.ts
    cp -f .env-195 .env

    # 关闭
    pm2 stop bifang
    # 当代码都改动没有增加任何第三方库依赖时，应该可以不执行下面两句。
    rm -rf node_modules 
    npm install
    #  启动
    pm2 start bifang
```
