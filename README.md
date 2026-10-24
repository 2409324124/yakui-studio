# Yakui Studio 0.2.0

本地音乐工作台：程序化事件谱 → 手工编辑乐器片段与音符 → 选区 AI 候选 → 试听、应用、撤销。Win2000 风格的 Web 编辑区，由终端命令启动；不是纯字符 TUI。

## 一键安装 skill + 工作台

需要 Node.js 20+、npm 和 Git。工作台无 npm 运行依赖。首次让 agent 执行：

```sh
npx --yes --package=github:2409324124/yakui-studio yakui-studio setup
```

这会下载工作台，并把 `yakui-studio` 与 `procedural-chiptune` 两个 skill 安装到 `${CODEX_HOME:-~/.codex}/skills`。新开 agent 会话即可发现；已有同名 skill 不覆盖，显式 `--replace` 会先备份。其他支持 SKILL.md 的 agent 可用 `setup --skills-dir /目标/skills`。

启动工作台：

```sh
npx --yes --package=github:2409324124/yakui-studio yakui-studio
```

希望长期保留命令：

```sh
npm install -g github:2409324124/yakui-studio
yakui-studio setup
yakui-studio
```

默认打开 http://127.0.0.1:5240/ 。`--no-open` 不自动开浏览器；`--port 5241` 更换端口；`--check` 检查 Node/Codex。Ctrl+C 关闭本次服务。本地开发可直接 `node bin/cli.mjs`。

GitHub 安装入口先提供可用分发；npm registry 发布完成后可以使用 `npx yakui-studio setup`，发布前不要使用该短入口。

## Agent 扒谱与程序化音乐

安装 skill 不会自动下载模型。基础合成只需 Python/NumPy；参考转谱再安装 CPU 分轨和 ONNX 转谱环境：

```sh
yakui-studio music setup --profile basic
yakui-studio music setup --profile transcribe
yakui-studio music --help
```

工具包含参考分析、Demucs 真实分轨、Basic Pitch 复调候选、pYIN 单声部候选、带理由人工修订、候选谱导入、原创编曲模板和 WAV/循环/MP3 合成。FFmpeg 需在 PATH，或设置 `FFMPEG`；Python 环境独立于系统环境。模型首次使用需联网下载。

让 agent 读取已安装的 `yakui-studio` skill，按音频实际情况选择分轨和转谱，保留原始秒时间、置信信息和修订理由；将候选导入工作台后手工校订。模型候选不等于准确原谱，Demucs 的 `other` 不等于独立主旋律。未提供参考音频时可直接创作事件谱。参考录音与模型权重不随本包分发。

## 编辑

- 示例为既有 Yakui 95 BPM、24 小节、13 声部的事件谱，原文件不修改。
- 上方乐器轨道：选择、拖动、复制、删除片段；点击标尺定位后分割片段。可以新增乐器与片段。
- 下方钢琴卷帘：双击新增音符，拖动移动，右边缘改变时值；Shift 多选或拖动空白框选。属性可精确修改音高、起拍、时值和力度，Enter 提交。
- 调整音色、音量、声像、静音与独奏；拖动中间分隔条调整编排／卷帘面积。
- 空格播放／暂停，再按从暂停位置继续。单击片段将播放头移到片段起点；片段循环保留当前播放位置，到末尾才回到片段开头。取消循环后从播放头播放全曲。编辑会停止旧播放快照，再播放即可听到修改。
- 选中片段按 Ctrl/Cmd+Enter（或双击片段）进入二级片段编辑视图，只试听该片段；修改直接保留在工程中。Esc／返回编排退出。播放头在暂停时仍可见。
- Ctrl/Cmd+Z 撤销，Shift+Ctrl/Cmd+Z 重做；Ctrl/Cmd+S 保存工程。
- 打开旧 events JSON 或 Studio 工程 JSON。导出工程 JSON 保留片段、轨道与设置；事件谱供程序继续处理；MIDI 供其他音乐软件；WAV 使用当前浏览器合成器。
- 浏览器自动保存草稿。需要长期保存请下载工程 JSON；更换端口／浏览器不会自动带入原草稿。

## AI 协作

可选：本机安装并登录 Codex。手工编辑、试听、导出不需要模型或 token。

选中音符，或设定片段内起止拍；输入修改要求，点击“生成修改候选”。模型收到所选音符及邻近的有限音乐上下文，不收到工程文件路径。候选可对照试听，用户点击应用才写入工程，之后仍可撤销。工程修改后旧候选失效。可取消正在执行的请求。

后端使用本机 Codex 登录，忽略自定义用户配置，关闭 shell／apps／browser／computer 工具并使用只读沙箱和结构化 JSON 输出。不修改已有 coding 会话。API 仅绑定回环地址，并校验 Host 和修改请求 Origin；临时任务目录不通过网页提供。

## 合成与格式

原生浏览器 Web Audio 按需合成脉冲、三角和噪声鼓声；只在主动导出 WAV 时生成音频文件。浏览器引擎不是原 Python 母带的逐采样复现。MIDI 保留音符、速度、拍号与分轨，芯片音色以本工作台试听/WAV为准。

时间单位是四分音符拍，片段有全曲起点，音符起点相对片段。工程更改、撤销和重做均递增 revision；AI 应用校验该版本。`core.mjs` 为数据和编辑核心，`audio.mjs` 为播放／导出，`midi.mjs` 为标准 MIDI 输出，`app.mjs` 为界面，`server.mjs` 为 AI 服务。

## 已验证与限制

本机已验证模型请求返回真实四音符候选并只修改目标片段；浏览器加载、实时播放和全曲 WAV 导出已执行。核心测试覆盖原谱1209音符保留、跨片段延音、分割／移动、撤销／重做、过期和越界AI拒绝。MIDI结构解析检查通过。后端与包启动器测试使用模拟模型并明确区分于真实AI验证。用户本轮确认停止扩展QA。

npm registry 发布状态以仓库发布说明为准；没有改游戏／原庭院／已发布观看器。原生 Windows/macOS 自动开浏览器路径已实现，但未实机验收。暂不支持导入 MIDI、录音、VST 或原生 DAW 工程。当前重点是事件谱手工修整与选区 AI 协作。

设计参考：LMMS Song Editor/Piano Roll 与 Ardour Region Editor，详见 DESIGN.md。
