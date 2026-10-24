---
name: yakui-studio
description: 在 Yakui Studio 本地音乐工作台中制作、导入和人工修整音符与片段，结合真实分轨和转谱候选完成可追溯的参考改编或程序化音乐。
---

# Yakui Studio

把实际音频分析、候选转谱、人工修整和可编辑工程连接起来。沿用用户指定参考与已认可音乐；音乐制作本身不授权修改游戏或发布包。

## 启动与资源

已安装 npm 包提供 `yakui-studio` 本地工作台；`yakui-studio --no-open` 只启动服务。`yakui-studio setup` 安装本技能及同级的 `procedural-chiptune`。技能被复制到其他目的地时，两者应仍是相邻文件夹。

- `yakui-studio music setup --profile basic`：建立分析／程序化合成所需 Python 环境。
- `yakui-studio music setup --profile transcribe`：按需安装真实分轨与转谱依赖；首次分轨可能需要模型下载。
- `music analyze/separate/transcribe/review/init/render` 调用随包 Python 工具；`music import` 将候选转成工作台工程。运行对应子命令 `--help` 确认当前参数，尤其转谱模式、输入输出路径和 BPM。

若只安装了技能，仍可直接执行 [procedural-chiptune/scripts](../procedural-chiptune/scripts) 中工具；以该技能目录解析脚本和模板路径。Python 3.10+ 与 NumPy 支持基础合成；音频解码和 MP3 需要 FFmpeg。模型依赖见 [真实分轨与转谱](../procedural-chiptune/references/stem-transcription.md)。

## 从参考到工程

1. 取得实际可解码音频后，依 [参考分析](../procedural-chiptune/references/reference-analysis.md) 检查多个乐句的速度、半速／倍速与拍点。只有曲名或链接时不能声称已经听过或扒谱。
2. 需要真实分轨时使用 Demucs，并保留模型实际 sources；drums/bass/other/vocals 不是主旋律／回应的保证。对分离后的复调乐器用 Basic Pitch ONNX，对明确单声部片段用 pYIN 对照。先验证短选段再扩展全曲。
3. 保存原始候选、来源、秒时刻、置信／激活值、弯音与人工理由。用 `music review` 或 `review_notes.py` 应用角色窗口和显式 edits，保留 before。冲突角色仍为 unassigned，量化字段作为派生数据。
4. 用 `music import` 转成工作台工程，再在界面打开 JSON。保留原始候选文件，导入会把音符映射到可编辑的拍单位；若目标格式无法承载弯音等信息，应说明限制，不能把工程导出当成全部原始证据。
5. 在轨道编排中选片段，进入钢琴卷帘，核对八度、起拍、时值、重复同音、装饰音和同时声部。用独奏、片段循环和数值属性逐段修整。保存工程 JSON 作为可继续编辑的交付。

## 手工与 AI 协作

片段起点为全曲拍数，音符起点相对片段；时间单位都是四分音符拍。注意片段边界与跨段延音。工程编辑、撤销与重做会改变 revision。

AI 修改使用明确的音符／时间选区，先生成候选、对照试听，再应用或丢弃；工程变更后重新生成过期候选。AI 编曲建议不构成参考音频的准确转谱证据。未配置 Codex 时仍可手工编辑、试听和导出。

原创程序化音乐走 [procedural-chiptune](../procedural-chiptune/SKILL.md) 的 init/render 路线；改写模板动机，避免仅改 BPM。事件谱格式见 [score-format](../procedural-chiptune/references/score-format.md)。浏览器合成与 Python 渲染不是逐采样相同的母带。

## 交付标准

“已提取候选”“已人工校订部分乐句”“已按参考验证完整范围”分别表述。模型输出、导入成功、AI 修改成功都不能单独称为准确扒谱。注明已核对范围、未分配声部与不确定音符；原创回应明确标记。

交付可编辑工程、必要的原始候选与校订记录，以及可播放试听。工程 JSON 保留轨道和片段，事件谱用于程序渲染，MIDI 用于外部编辑，WAV 用于试听。参考录音不自动混入合成音轨或 npm 包。实际听音能力不可用时如实说明，提供音频供用户试听。
