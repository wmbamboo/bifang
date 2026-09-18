## 前端程序拷入
```PowerShell
# windows powershell
tar -C "D:\SourceWorkspace\srcAntd2024\bifang0328" `
  --exclude=node_modules `
  --exclude=coverage `
  -cf "D:\bifang0328.tar" .
```
```bash
# wsl
mkdir -p ~/bifang/frontend
tar -xf /mnt/d/bifang0328.tar -C ~/bifang/frontend
```

## 0328版是情报知识库版,注掉
```bash
cd ~/bifang
# 备份旧前端（可选但建议）
mv frontend frontend.bak.$(date +%Y%m%d)
# 新建空目录
mkdir -p frontend
```
## 前端程序重新拷入
```PowerShell
# windows powershell
tar -C "D:\SourceWorkspace\srcAntd2024\bifang" `
  --exclude=node_modules `
  --exclude=coverage `
  -cf "D:\bifang.tar" .
```
```bash
# wsl
mkdir -p ~/bifang/frontend
tar -xf /mnt/d/bifang.tar -C ~/bifang/frontend
```