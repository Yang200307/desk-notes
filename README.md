# Markdown Editor

基于 Electron、Milkdown 和 Mermaid 的 Windows Markdown 编辑器。

项目采用 [MIT License](LICENSE) 开源。隐私说明见 [PRIVACY.md](PRIVACY.md)，
代码签名规则见 [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md)，第三方软件声明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 目录

- `electron/`：主进程、preload、IPC 与安全边界
- `src/`：渲染进程界面与编辑器逻辑
- `test/`：Node 单元测试和 Electron PDF 集成测试
- `scripts/`：打包、桌面更新、文件关联和诊断脚本
- `docs/`：GitHub Pages 下载页与项目笔记
- `assets/`：应用图标
- `dist-renderer/`：Vite 渲染产物
- `release/`：当前 1.0.2 安装包和解包应用
- `人工审核后删除/`：仅供人工确认后删除的旧文件，不参与构建

## 常用命令

```powershell
npm run dev
npm run check
npm run test:pdf
npm run pack
npm run update:desktop
```

`npm run pack` 生成供本机测试的未签名安装包。`npm run release` 会先检查
Windows 代码签名证书环境变量，再构建并发布到 GitHub Releases，避免误发未签名版本。

## 桌面版本

桌面快捷方式和 Markdown 文件关联应指向：

`release\win-unpacked\Markdown Editor.exe`

若重新生成本地桌面版本，运行 `npm run update:desktop`。脚本会先完整构建
`release-next`，成功后再原子替换当前 `release`，并同步快捷方式和文件关联。

## 旧构建目录

历史 `dist/` 与 `dist-local/` 带有异常 Windows 拒绝访问 ACL。请双击
`scripts\以管理员身份归档旧构建.cmd`，然后在 Windows 用户账户控制窗口中选择“是”。
启动器会自动提权并调用 `archive-locked-builds.ps1`。脚本只会重置这两个已明确列出的
目录根 ACL，并把它们移动到 `人工审核后删除/`，不会永久删除文件。
