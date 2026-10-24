# 真实分轨与可校订转谱

## 路线与依赖

基础 NumPy 编曲/合成仍可独立运行。只有参考转谱按需安装重依赖；先检查现有 PyTorch/GPU，GPU 驱动不可用就用 CPU wheel，避免默认拉整套 CUDA。示例是在独立 Python 3.12 venv 中，不安装到游戏环境：

```sh
python3 -m venv .venv-music
.venv-music/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.venv-music/bin/pip install demucs==4.0.1 numpy==1.26.4 scipy==1.14.1 librosa==0.11.0 soundfile onnxruntime pretty_midi mir_eval resampy==0.4.2 typing_extensions packaging scikit-learn setuptools==80.9.0
.venv-music/bin/pip install --no-deps basic-pitch==0.4.0
```

Basic Pitch 0.4.0 自带 ONNX 模型。显式 `--no-deps` 并补齐小依赖，避免默认依赖分支拉 TensorFlow。其元数据要求 resampy<0.4.3；固定0.4.2时又需要未声明的 pkg_resources，因此显式固定 setuptools==80.9.0（<81）。typing_extensions、packaging、scikit-learn也明确列出，不依赖碰巧已装。ONNX路径故意不满足包元数据中的TensorFlow分支；导入时的“TF/CoreML/TFLite未安装”警告不等于ONNX失败，不把pip check的这项元数据警告伪装成全绿。可先验证实际导入，不通过临时shim补包：

```sh
.venv-music/bin/python -I -c "from basic_pitch.inference import Model,predict; import basic_pitch; from pathlib import Path; print(Model(Path(basic_pitch.__file__).parent / 'saved_models/icassp_2022/nmp.onnx').model_type.name)"
```

该版本组合来自历史 CPython 3.12 导入与短选段推理验证，并非所有平台的全新安装保证。安装后应检查实际导入与一个短音频选段；完整环境安装由 Yakui Studio 的 `music setup` 管理，也可按上述示例自行建立环境。

下载和缓存必须可写；`TORCH_HOME=./music-model-cache` 可显式指定。模型首次联网下载不是 NumPy 基础模式的要求。FFmpeg 用 PATH 或 `FFMPEG` 环境变量指定。

主要来源：
- [Demucs 官方代码与模型说明](https://github.com/facebookresearch/demucs)：htdemucs 四轨为 drums/bass/other/vocals；实验 htdemucs_6s 另加 guitar/piano，piano 有渗漏限制。项目已归档；当前运行兼容性须实际确认。
- [Basic Pitch 官方代码](https://github.com/spotify/basic-pitch)：多音高/音符事件/音高弯曲，适合一个乐器的复调音频，混合整曲更容易出现错误。
- [librosa pYIN](https://librosa.org/doc/latest/generated/librosa.pyin.html)：单声部 F0 与 voiced_probability，不是复调分轨。

## 先做真实分轨

```sh
TORCH_HOME=./music-model-cache python scripts/separate_stems.py reference.wav --out /absolute/song/stems --model htdemucs --device cpu --seconds 30
```

`stems.json` 保存真实模型 `sources` 标签、时段、采样率、时长、RMS。模型的器乐类别不能改名为“主旋律”和“高音回应”。EQ、带通、频段掩码也不能叫作独立分轨。先短选段确认质量，再全曲。浮点 WAV 保留头间，不为了试听直接削波。

## 复调候选 + 单声部核对

```sh
python scripts/transcribe_polyphonic.py /absolute/song/stems/other.wav --source-label other --out /absolute/song/other-notes.json
python scripts/transcribe_stem.py /absolute/song/stems/vocals.wav --source-label vocals --role lead --min-midi 48 --max-midi 84 --out /absolute/song/lead-notes.json
```

- Basic Pitch ONNX 模型音域 MIDI 21–108，超出时明确报错，改用可配置音域的 pYIN 或合适的专用模型；保留同时音符、原始起止、激活强度、弯音、NPZ 激活图与 MIDI。激活值不是校准后的概率。
- pYIN 适合分轨后的独唱、贝斯或明确单声部段落，保留逐帧 F0/voiced probability。默认覆盖 MIDI 21–108；低音会自动增大分析窗口。用户指定范围用于角色搜索，不能宣称另分出一个声部。
- `--min-note`/阈值排短伪音；同起点相差八度的复调候选标记风险，不直接删掉真实八度齐奏。短音、装饰音需要人工回看，不靠统一阈值一刀切。
- 主旋律/回应的角色分配结合声部、时间窗、音域、谱面和原音。`--roles roles.json` 是明确的人工角色窗口，不能把双声部交叠误标成准确独立声轨。
- 同时声部无法可靠分辨时保留 `unassigned`、角色候选和歧义；听感/谱面不支持的回应不得称为原谱。
- `--bpm` 仅增加拍单位，`--quantize 4` 可增加16分网格字段，**原始秒时刻、时值和弯音始终保留**。先查节拍漂移；整首速度不稳时按乐句拍点/手工起点对齐，不硬套一个 BPM。

角色窗口格式：

```json
[{"role":"answer","start_seconds":8.0,"end_seconds":12.0,"min_midi":72,"max_midi":96,"reason":"参考该乐句的高音回应；仍需核对同时奏响的主线"}]
```

人工校订用 `--edits edits.json`，如：

```json
[{"id":"n0012","action":"update","midi":67,"reason":"与谱面和同一乐句复现核对，模型误读高八度"}]
```

所有修改保存 before/理由；未编辑输出保持 candidate。不要把“程序提取到文件”写成“全曲准确扒谱”。检查代表性的主线乐句、高音回应、低音落点与重复段落，并给简洁的覆盖/限制记录；不做哈希校验和全音频逐点比对。


候选已提取后，角色窗口与人工校订可独立应用，不重复跑模型：

```sh
python scripts/review_notes.py /absolute/song/other-notes.json --roles roles.json --edits edits.json --out /absolute/song/other-reviewed.json
```

它保留输入来源和逐条 before/理由；窗口赋予 `human_window_candidate` 状态。有冲突的角色保持 unassigned。每条更新可附 `score_bar`、`score_note_index`、`alignment_source` 等证据字段。主线与回应同时存在时，不能按高低一分为二就当作准确结果。

合唱输入的能力边界见 [转谱验证记录](transcription-validation.md)。
