# 事件谱与曲目文件

## 可移植曲目

`init_track.py` 将模板、合成器复制到新目录。之后修改该目录的 `arrange.py`／`track.json`，不会改变已安装 skill，也不依赖旧项目路径。

- `track.json`：编曲示例的速度、长度、主题音组、低音与和弦。
- `arrange.py`：把段落、重复与变化写成可编辑逻辑，生成 `score.json`。示例只支持 4/4；其它节拍需要调整节奏逻辑。
- `render_score.py`：独立合成器。可以直接接收自行写出的兼容 JSON。
- `build.py`：先生成谱，再渲染；透传 `--mp3` 和 `--three-pass`。

## JSON

```json
{
  "title": "Example",
  "bpm": 120,
  "meter": [4, 4],
  "bars": 4,
  "sections": [{"name":"climax", "bars":[3, 4]}],
  "voices": {"lead":{"gain":0.13,"duty":0.25}},
  "events": [
    {"voice":"lead","start":0,"duration":0.45,"midi":60,"velocity":0.9},
    {"voice":"bass","start":0,"duration":0.8,"midi":36,"velocity":1},
    {"voice":"kick","start":0,"duration":0.4,"velocity":1}
  ]
}
```

事件 `start`、`duration` 以四分音符拍为单位。总拍数为 `bars × numerator × 4 / denominator`，总秒数为 `beats × 60 / bpm`。段落的 `bars` 是从 1 开始、首尾均包含的小节范围；`name="climax"` 的第一段用于导出高潮片段。没有高潮标记时不自动臆测高潮位置。

音符：MIDI 0–127；`frequency = 440 × 2^((midi-69)/12)`。`velocity` 0–2 为相对强度，默认 1；`pan` -1 左、+1 右；`duty` 0.01–0.99 表示脉冲占空比，常用 0.125/0.25/0.5。同一时刻可以有多个事件。鼓不要求 `midi`，但通鼓用它控制基音。

可用声部：`lead`、`answer`、`bass`、`arp`、`power_l`、`power_r`、`octave`、`kick`、`snare`、`hat`、`openhat`、`crash`、`tom`。`voices` 可覆盖既有声部的增益、声像、占空比、衰减与延音等参数；新增声部需修改引擎，而不是填写不存在的名字。

旋律信号流程：MIDI → 脉冲／三角振荡器 → 起音／释音与衰减包络 → 声部增益 → 等功率声像 → 节拍延迟 → DC 去除／轻微 tanh → -1.5 dBFS 峰值留量 → 16-bit PCM。鼓使用确定性 15 位 LFSR 噪声、高通差分与短音高下滑。并非严格 FC/NES 模拟。

超出曲尾的音符与延迟环绕到开头；每个事件起点须在曲目内，单音长度不能超过全曲。循环母版不淡出。前奏若必须从绝对静音开始而循环版需要旧尾音，应分别安排，而不是强行共用同一个母版。

当前引擎固定 44100 Hz，最多渲染十分钟，长曲目／多声部会占用较多内存。曲目源码和报告都包含时间参数，保留这些信息以便重建与移植。
