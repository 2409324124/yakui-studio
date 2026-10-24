# Yakui Studio

**Yakui Studio 是人在回路的音乐工作台，用户和 coding agent 可共同编辑音频。**

用自然语言提出修改，让 agent 通过原生 CLI 操作音符、乐器和段落，再在复古界面里试听和调整。保存下来的不仅是音频，还有可以继续编辑、重新渲染的音乐工程。

如果你已经厌倦了反复生成整首音频，只想“改这个小节，保留其他部分”，却遇到扩散引擎把整首歌都改写的情况，Yakui 提供了一条更可控的路线：让 AI 编写和修改明确的音乐数据，再用程序化合成把它变成声音。

![Yakui Studio 实录：选中小节 → Codex CLI 修改 → 网页同步试听](https://raw.githubusercontent.com/2409324124/yakui-studio/main/docs/media/yakui-codex-live-5s.gif)

*选中小节 → Codex CLI 修改 → 网页同步试听。5 秒真实操作剪辑，等待段已剪去，GIF 无声。Codex 实际修改了选区内的 4 个音高，保留节奏、力度和其他小节。*

[![npm](https://img.shields.io/npm/v/yakui-studio?color=506c7a)](https://www.npmjs.com/package/yakui-studio)
[![License](https://img.shields.io/badge/code_license-Apache--2.0-526b43)](LICENSE)
[![Runtime dependencies](https://img.shields.io/badge/npm_runtime_dependencies-0-7b658e)](package.json)

[快速开始](#快速开始) · [为什么选择-yakui](#为什么选择-yakui) · [接入-agent](#接入-agent) · [使用指南](docs/usage.md)

## 为什么做 Yakui

**生成之后，还要能修改。** 听到一段不错的旋律，下一步可能只是换一个乐器、调整一个音符，或者重写副歌。Yakui 把音符、乐器和段落保留为结构化工程，让你能指定修改范围、试听结果，并撤销不满意的操作。

**做一段配乐，不必先搭起整套制作环境。** 完整 DAW 的学习和配置成本，以及部分商业产品的价格，会提高入门门槛。Yakui 从轻量的芯片音乐编排和试听切入：先打开工程、听到声音，再按需要扩展工具。

**你已经会用 coding agent，它也应该能帮你做音乐。** Yakui 提供原生 CLI，让 agent 读取工程和当前选区、修改音乐数据、导入导出 MIDI。人使用可视化编辑器，agent 使用命令行，两边操作同一份工程。

## 快速开始

需要 **Node.js 20 或更新版本**（包含 npm）。

```sh
npm install -g yakui-studio
yakui-studio
```

默认打开 **http://127.0.0.1:5240/**。安装一次，以后输入 `yakui-studio` 即可启动。工程保存在本机，下次可以继续编辑。

编辑、播放和 MIDI 导入导出不需要模型账号。基础安装没有 npm 运行依赖，不会下载 Python、FFmpeg 或转谱模型。

## 为什么选择 Yakui

- **音乐是可以继续工作的工程。** 保存音符、音色参数和合成代码，可以重新渲染、比较和迭代；支持持久化撤销与重做。
- **人和 agent 共用选区。** 在界面里选中要改的片段，让 agent 通过 CLI 读取并修改；网页同步结果，随时试听。
- **沿用自己的 agent 和模型配置。** 已支持 Codex / OpenCode，不预设发行版模型，也不要求换一套模型账号。Claude Code 的内置适配仍为后续功能。
- **轻量启动，按需扩展。** 浏览器负责可视化编辑和试听；程序化合成、音频分析、分轨与转谱工具按需安装。
- **工程可以带走。** 导入和导出多轨 MIDI，保存 JSON 工程与事件谱，导出 WAV；可以继续放进其他音乐工具处理。

这里的“可复现”指保存工程、参数与合成代码后可重新渲染，不代表 LLM 每次生成相同内容，也不承诺不同平台的音频逐字节一致。

## 可以用它做什么

**为游戏或个人项目制作原创 8-bit 配乐。** 用程序化合成建立旋律、贝斯和鼓组，再逐段调整编排。

> 使用示例：写一段 16 小节的芯片风格战斗音乐，前 8 小节克制，后 8 小节加入回应旋律和更密的鼓点。

**把参考音乐整理为可编辑的芯片改编。** 按需安装分析、分轨和转谱工具，获得候选音符，再由人或 agent 听辨校订，保留核心旋律并重新编配。

> 使用示例：从参考音频提取主旋律候选，标出需要核对的音符，再做一版 8-bit 编配。

**按段落或乐器持续迭代。** 保留已经满意的部分，把修改集中在当前任务上。

> 使用示例：只调整选中片段的贝斯，让它更有推进感，保留主旋律和鼓点。

以上是使用场景示例；页首 GIF 展示的是已实际执行的单小节修改。转谱结果需要校订，当前专长是程序化／芯片音乐，不承诺替代完整专业 DAW。

## 接入 agent

先启动工作台，再为你的 agent 安装 skill：

```sh
# Codex
yakui-studio setup --agent codex

# OpenCode
yakui-studio setup --agent opencode
```

让 agent 阅读 [Yakui Studio skill](skills/yakui-studio/SKILL.md)，然后在网页选中要修改的音符或片段，向 agent 描述目标。CLI 同样可以由人直接调用：

```sh
yakui-studio project read
yakui-studio project selection
yakui-studio project apply --file change.json
```

`change.json` 的格式见 [工程 CLI 协议](skills/yakui-studio/references/project-cli.md)。非默认端口使用 `--url` 或 `YAKUI_STUDIO_URL` 指向当前实例。

界面内的候选生成功能支持先试听、再应用；外部 agent 通过 CLI 写入工程，遵循其宿主的审批规则。两种工作方式均使用你的 agent 配置。

## 文档与许可

- [使用指南](docs/usage.md)：启动与升级、完整命令入口、快捷键、按需安装和开发方式。
- [工程 CLI 协议](skills/yakui-studio/references/project-cli.md)：工程读取、选区、修改与 MIDI 交换。
- [程序化音乐 skill](skills/procedural-chiptune/SKILL.md)：合成、参考分析、扒谱与校订流程。
- [数据与接口](CONTRACT.md) · [验证记录](VALIDATION.md) · [设计依据](DESIGN.md)。

项目原创程序代码采用 [Apache-2.0](LICENSE)。第三方代码保留原许可；角色图与参考曲改编素材不包含在本项目的 Apache-2.0 授权内，详见 [素材与第三方说明](ASSET-LICENSES.md)。
