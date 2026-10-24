<div align="center">

# Yakui Studio

**复古音乐工作台 · 程序化 8-bit 编曲 · 人与 AI 共用工程**

[![npm](https://img.shields.io/npm/v/yakui-studio?color=506c7a)](https://www.npmjs.com/package/yakui-studio)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-526b43)](https://nodejs.org/)
[![Runtime dependencies](https://img.shields.io/badge/npm_runtime_dependencies-0-7b658e)](package.json)

[安装](#安装) · [操作演示](#操作演示) · [接入-agent](#接入-agent) · [使用指南](docs/usage.md) · [CLI 协议](skills/yakui-studio/references/project-cli.md)

</div>

在熟悉的复古界面里编排、试听和修改音乐，让 coding agent 通过 CLI 分析音频、生成音符、修改选区。界面与 CLI 共享同一份工程，修改可见、可试听、可撤销。

![Yakui Studio 实录：选中小节 → Codex CLI 修改 → 网页同步试听](https://raw.githubusercontent.com/2409324124/yakui-studio/main/docs/media/yakui-codex-live-5s.gif)

## 安装

需要 **Node.js 20 或更新版本**（包含 npm）。在 PowerShell、Terminal 或你的终端中执行：

```sh
npm install -g yakui-studio
```

安装一次，以后直接启动：

```sh
yakui-studio
```

默认打开 **http://127.0.0.1:5240/**。关闭启动它的进程会停止本次本地服务；工程保存在本机，下次可继续编辑。

升级：

```sh
npm install -g yakui-studio@latest
```

编辑、播放和 MIDI 不需要模型账号。工作台没有 npm 运行依赖，安装时不会下载 Python、FFmpeg 或转谱模型。

## 操作演示

上方是 **5 秒真实操作剪辑**：在网页选中第一小节 → 在 Codex CLI 输入“帮我修改一下这个小节，让旋律更有跳跃感，其他地方不动。” → 网页自动同步并试听结果。

Codex 实际通过工程 CLI 修改了选区内的 4 个音高，保留节奏、力度和其他小节。等待段已剪掉；GIF 无声。

| 功能 | 可以做什么 |
| --- | --- |
| 编排与钢琴卷帘 | 编辑乐器、片段、音高、时值和力度，静音或独奏 |
| 播放控制 | 播放头常驻、空格暂停续播、片段循环与独立编辑 |
| MIDI 与导出 | 导入/导出多轨 MIDI，保存 JSON 工程、事件谱与 WAV |
| 共享工程 | 网页和 CLI 操作同一工程，修订冲突保护与持久化撤销 |
| AI 选区协作 | Codex / OpenCode 生成候选，先试听再应用 |
| 按需音乐工具 | 程序化合成、音频分析、分轨、转谱候选与校订记录 |

## 接入 agent

先启动 `yakui-studio`，再为使用的 agent 安装技能：

```sh
# Codex
yakui-studio setup --agent codex

# OpenCode
yakui-studio setup --agent opencode
```

让 agent 阅读 [Yakui Studio skill](skills/yakui-studio/SKILL.md)，即可使用工程操作和音乐工具。CLI 既供 agent 调用，也供人直接执行：

```sh
yakui-studio project read
yakui-studio project selection
yakui-studio project apply --file change.json
yakui-studio project import song.mid
yakui-studio project export edited.mid
```

`change.json` 的完整格式见 [工程 CLI 协议](skills/yakui-studio/references/project-cli.md)。使用非默认端口时，以 `--url` 或 `YAKUI_STUDIO_URL` 指向当前实例。

界面内的候选生成使用各 agent 自己的登录与模型配置；不预设某个付费或免费模型。模型输入留空时沿用 CLI 配置，手动填写只记在当前浏览器。**Claude Code 的内置候选接口仍为后续功能**；其 skill 安装目标已经预留。

## 程序化合成与扒谱

仅在需要这些能力时安装对应环境：

```sh
# 基础分析和程序化合成
yakui-studio music setup --profile basic

# 分轨与转谱候选
yakui-studio music setup --profile transcribe

yakui-studio music --help
```

参考音频 → 分轨 / 转谱候选 → 人工或 agent 校订 → 可编辑工程 → 芯片风格试听与导出。转谱候选需要听辨和修整，不代表自动精确还原。Python 环境、FFmpeg 与模型要求见 [使用指南](docs/usage.md)。

## 快捷键

| 按键 | 操作 |
| --- | --- |
| Space | 暂停 / 从当前播放头继续 |
| Ctrl / Cmd + Enter | 进入或退出选中片段编辑 |
| Esc | 返回编排或取消音符选择 |
| Ctrl / Cmd + Z | 撤销 |
| Ctrl / Cmd + Shift + Z | 重做 |
| Ctrl / Cmd + S | 下载工程 JSON |

## 边界与开发

MIDI 支持 SMF 0/1、变速和变拍号；芯片合成器不模拟完整 General MIDI 音源，保留的控制器事件也不全部参与试听。Linux 已实机验证，原生 Windows/macOS 尚未完成同等安装验收。

从源码运行：

```sh
git clone https://github.com/2409324124/yakui-studio.git
cd yakui-studio
npm start
```

无构建步骤；`npm test` 运行针对性检查。更多信息：[使用指南](docs/usage.md) · [数据与接口](CONTRACT.md) · [验证记录](VALIDATION.md) · [设计依据](DESIGN.md)。

仓库当前许可证声明为 `UNLICENSED`；第三方 MIDI codec 的 MIT 许可保留在 [vendor/midi-file](vendor/midi-file/LICENSE.md)。
