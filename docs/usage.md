# Yakui Studio 0.3.0

供人和 agent 共用的程序化音乐工作台。CLI 提供工程操作、MIDI 交换、合成与扒谱执行工具；浏览器提供复古可视化编辑。二者共享同一份工程，保留播放头、空格暂停续播和片段独奏编辑。

## 安装与 agent 入口

```sh
npm install -g yakui-studio
yakui-studio
```

安装技能：`yakui-studio setup --agent codex` 或 `yakui-studio setup --agent opencode`。以后直接运行 `yakui-studio` 启动。

## 本地启动

需要 Node.js 20+。工作台没有 npm 运行依赖；MIDI 编解码使用随源码提供的 MIT midi-file 小型模块，许可位于 vendor/midi-file。

```sh
yakui-studio --port 5250 --workspace ./local-project --no-open
```

打开 http://127.0.0.1:5250/ 。`--check` 检查三个 agent 的可执行状态，不代表登录有效。未安装或未登录 agent 不影响编辑、播放和导入导出。服务仅监听回环地址。

## 统一工程

网页与 agent 共用工作台服务的工程。默认存放在 `~/.local/share/yakui-studio/workbench/project-state.json`；可用 `--workspace` 指定独立目录。工程和撤销历史原子保存到磁盘，重启可继续。旧浏览器草稿可手动恢复；不会静默覆盖共享工程。

外部 agent 用相同 CLI 读取当前工程和网页选区：

```sh
yakui-studio project read --url http://127.0.0.1:5250
yakui-studio project selection --url http://127.0.0.1:5250
yakui-studio project apply --file change.json --url http://127.0.0.1:5250
yakui-studio project export output.mid --url http://127.0.0.1:5250
yakui-studio project import input.mid --url http://127.0.0.1:5250
```

修改文件包含 `projectId`、`baseRevision`、唯一 `operationId` 和 `operations`；从 read 的实际结果填入，不能猜版本。操作支持修改轨道、片段、音符和段落；选区约束防止越界写入。过期版本返回冲突，网页保留本地副本供保存，不静默覆盖别人的修改。完整格式与实例见 `skills/yakui-studio/SKILL.md` 和 `bin/cli.mjs project --help`。网页约每 1.2 秒同步外部修改，修改时停止旧音频快照。

## Agent 接入与适配状态

```sh
yakui-studio setup --agent codex
yakui-studio setup --agent claude
yakui-studio setup --agent opencode
```

也可 `--agent all`；已有同名 skill 默认不覆盖，显式 `--replace` 先备份。Skill 引导 agent 调用工程 CLI、程序化合成和扒谱流程；实际工作目录与服务 URL 应由当前启动实例提供。

界面“选区协作”当前可选 Codex、OpenCode，以及可选模型。Claude Code 仅保留接口和 skill 安装目标，列为后续功能。使用各 CLI 已有登录，不创建统一 API key。仅把选区及有限音乐上下文发给所选后端；候选先试听、再手动应用。内置生成请求禁用工具，不操作已有 coding 会话。外部 agent 则通过 skill 使用工程 CLI，自行遵守其宿主审批规则。

本机实测：Codex 0.164.0 与 OpenCode 1.18.32 均已真实返回单音符候选。模型 ID 不写进发行默认值。模型输入留空时沿用用户自己的 CLI 配置；手动选择只保存在当前浏览器本地，不修改全局 OpenCode 配置。Claude Code 按本轮范围只保留接口，未做实机适配验收。

## MIDI 与播放

“打开工程 / MIDI”接受工程 JSON、事件谱 JSON、SMF 0/1 MIDI；CLI 也可导入导出。支持多轨/多通道、重叠音符、速度与拍号变化；播放和 WAV 渲染按速度图计算，标尺显示拍号变化。

音符、轨道、tempo/meter 和 program、CC、pitch-bend 事件可保存在工程并重新导出 MIDI。当前芯片合成器不模拟完整 GM 音源，也不播放所有 CC/弯音语义；导入时会提示这些限制。Format 2、SMPTE 时间格式明确拒绝。导出 MIDI 不等于导出芯片音色，最终声音请导出 WAV。

- 空格暂停后再次播放从原位置继续，播放头一直显示。
- 选择片段定位到起点；Ctrl/Cmd+Enter 进入片段编辑与独奏，Esc 返回。
- 音符可框选、移动、改变时值及力度；轨道支持音色、音量、声像、静音和独奏。
- 修改可撤销/重做；保存工程导出可移动的 JSON 副本。

## 重依赖按需安装

启动编辑器、MIDI 和浏览器合成不安装 Python、FFmpeg、分轨模型或转谱模型。需要程序化离线合成或参考扒谱时，显式选择：

```sh
yakui-studio music setup --profile basic
yakui-studio music setup --profile transcribe
yakui-studio music --help
```

基础合成为 Python/NumPy；转谱工具提供参考分析、真实分轨、Basic Pitch/pYIN 候选和人工修订记录。模型首次使用才下载，模型候选需要听辨校订。参考录音与模型权重不随工作台分发。

## 源码

`core.mjs` 数据与操作；`project-service.mjs` 持久化、选区、修订和撤销；`project-sync.mjs` 网页同步；`providers.mjs` agent 协议；`midi.mjs` SMF 读写；`timeline.mjs` 时间映射；`audio.mjs` 浏览器合成；`app.mjs` 原生 UI；`music/` 按需音乐工具。自动化检查：`npm test`。工作台独立发布，不修改游戏、庭院或原观看器。

## 升级与快捷键

```sh
npm install -g yakui-studio@latest
```

| 按键 | 操作 |
| --- | --- |
| Space | 暂停 / 从当前播放头继续 |
| Ctrl / Cmd + Enter | 进入或退出选中片段编辑 |
| Esc | 返回编排或取消音符选择 |
| Ctrl / Cmd + Z | 撤销 |
| Ctrl / Cmd + Shift + Z | 重做 |
| Ctrl / Cmd + S | 下载工程 JSON |

## 开发与平台验证

```sh
git clone https://github.com/2409324124/yakui-studio.git
cd yakui-studio
npm start
```

无需构建步骤；`npm test` 运行针对性检查。Linux 已实机验证，原生 Windows/macOS 尚未完成同等安装验收。关闭启动工作台的进程会停止本次本地服务。

更多 CLI 参数见 `yakui-studio --help`、`yakui-studio project --help` 和 `yakui-studio music --help`；修改协议见 [工程 CLI 协议](../skills/yakui-studio/references/project-cli.md)。

代码采用 [Apache-2.0](../LICENSE)，素材和第三方组件的许可范围见 [授权说明](../ASSET-LICENSES.md)。
