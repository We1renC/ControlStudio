# NVIDIA Build Models 明確分類中文統整（按分類排序）

擷取時間：2026-05-10（Asia/Taipei）

來源：https://build.nvidia.com/models

總模型數：157

## 分類總覽
- LLM / Agent / 程式碼：42
- RAG 與檢索：15
- 文件理解與資料擷取：14
- 多模態理解：18
- 視覺生成與創作：7
- 語音與翻譯：20
- 媒體 AI 與影片工具：5
- 安全與治理：8
- Physical AI / 自駕 / 機器人：7
- 3D / OpenUSD / 數位分身：3
- 生醫與藥物探索：14
- 科學與工程模擬：4

## 子分類總覽

### LLM / Agent / 程式碼
- Coding Agent / 程式碼生成：28
- 通用推理 / 工具呼叫 Agent：13
- 多語/主權語言 LLM：1

### RAG 與檢索
- 文字 Embedding：7
- 多模態 Embedding：2
- 程式碼檢索 Embedding：1
- Reranker / 重排序：5

### 文件理解與資料擷取
- OCR / 文件解析：6
- 版面/表格/圖表偵測：8

### 多模態理解
- 圖像/影片問答：14
- 圖像/語音/文字理解：4

### 視覺生成與創作
- 文字生圖：4
- 圖片編輯 / In-context 編輯：3

### 語音與翻譯
- 語音轉文字 ASR：9
- 語音辨識 + 語音翻譯：3
- 文字翻譯：3
- 文字轉語音 TTS：2
- 即時語音對話：1
- 語音增強/降噪：2

### 媒體 AI 與影片工具
- AI 合成影片偵測：1
- 影片人物重打光：1
- 說話者偵測：1
- 嘴型同步/配音：1
- 視線校正：1

### 安全與治理
- 內容安全與政策審核：5
- Jailbreak / Prompt Injection 偵測：1
- 對話主題控管：1
- 個資偵測：1

### Physical AI / 自駕 / 機器人
- 物理一致影片生成：2
- 物理世界推理：1
- 未來世界狀態預測：1
- 自駕 3D 感知：2
- 自駕端到端 Stack：1

### 3D / OpenUSD / 數位分身
- 文字/圖片轉 3D：1
- OpenUSD 程式碼生成：1
- OpenUSD 資產驗證：1

### 生醫與藥物探索
- 蛋白質/分子結構預測：6
- 蛋白質設計：2
- 蛋白質嵌入向量：1
- 多序列比對：1
- 分子 Docking：1
- 小分子生成/最佳化：2
- 基因體序列建模：1

### 科學與工程模擬
- 量子校準：1
- 天氣/氣候預測：1
- 醫學影像分割：1
- 路線/組合最佳化：1

## 主要 Publisher
- nvidia：83
- meta：11
- mistralai：11
- qwen：8
- google：6
- black-forest-labs：4
- microsoft：3
- moonshotai：3
- openai：3
- deepseek-ai：2
- minimaxai：2
- z-ai：2
- deepmind：2
- mit：2
- openfold：2
- ipd：2
- abacusai：1
- sarvamai：1
- stepfun-ai：1
- bytedance：1

## 完整模型清單（按主分類/子分類排序）

| 分類序 | 原序 | 主分類 | 子分類 | 發布者 | 模型 | 具體用途 |
|---:|---:|---|---|---|---|---|
| 1 | 128 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | abacusai | [dracarys-llama-3.1-70b-instruct](https://build.nvidia.com/abacusai/dracarys-llama-3_1-70b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 2 | 6 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | deepseek-ai | [deepseek-v4-flash](https://build.nvidia.com/deepseek-ai/deepseek-v4-flash) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 3 | 7 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | deepseek-ai | [deepseek-v4-pro](https://build.nvidia.com/deepseek-ai/deepseek-v4-pro) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 4 | 137 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | google | [gemma-2-2b-it](https://build.nvidia.com/google/gemma-2-2b-it) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 5 | 17 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | google | [gemma-4-31b-it](https://build.nvidia.com/google/gemma-4-31b-it) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 6 | 140 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | meta | [llama-3.1-70b-instruct](https://build.nvidia.com/meta/llama-3_1-70b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 7 | 141 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | meta | [llama-3.1-8b-instruct](https://build.nvidia.com/meta/llama-3_1-8b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 8 | 127 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | meta | [llama-3.2-1b-instruct](https://build.nvidia.com/meta/llama-3.2-1b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 9 | 124 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | meta | [llama-3.2-3b-instruct](https://build.nvidia.com/meta/llama-3.2-3b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 10 | 118 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | meta | [llama-3.3-70b-instruct](https://build.nvidia.com/meta/llama-3_3-70b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 11 | 105 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | microsoft | [phi-4-mini-instruct](https://build.nvidia.com/microsoft/phi-4-mini-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 12 | 32 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | minimaxai | [minimax-m2.5](https://build.nvidia.com/minimaxai/minimax-m2.5) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 13 | 16 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | minimaxai | [minimax-m2.7](https://build.nvidia.com/minimaxai/minimax-m2.7) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 14 | 42 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [devstral-2-123b-instruct-2512](https://build.nvidia.com/mistralai/devstral-2-123b-instruct-2512) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 15 | 74 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [magistral-small-2506](https://build.nvidia.com/mistralai/magistral-small-2506) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 16 | 4 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [mistral-medium-3.5-128b](https://build.nvidia.com/mistralai/mistral-medium-3.5-128b) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 17 | 82 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [mistral-nemotron](https://build.nvidia.com/mistralai/mistral-nemotron) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 18 | 150 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [mixtral-8x22b-instruct-v0.1](https://build.nvidia.com/mistralai/mixtral-8x22b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 19 | 156 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | mistralai | [mixtral-8x7b-instruct-v0.1](https://build.nvidia.com/mistralai/mixtral-8x7b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 20 | 73 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | moonshotai | [kimi-k2-instruct](https://build.nvidia.com/moonshotai/kimi-k2-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 21 | 40 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | nvidia | [nemotron-3-nano-30b-a3b](https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 22 | 24 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | nvidia | [nemotron-3-super-120b-a12b](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 23 | 114 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | qwen | [qwen2.5-coder-32b-instruct](https://build.nvidia.com/qwen/qwen2_5-coder-32b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 24 | 61 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | qwen | [qwen3-coder-480b-a35b-instruct](https://build.nvidia.com/qwen/qwen3-coder-480b-a35b-instruct) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 25 | 70 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | sarvamai | [sarvam-m](https://build.nvidia.com/sarvamai/sarvam-m) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 26 | 36 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | stepfun-ai | [step-3.5-flash](https://build.nvidia.com/stepfun-ai/step-3.5-flash) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 27 | 9 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | z-ai | [glm-4.7](https://build.nvidia.com/z-ai/glm-4.7) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 28 | 8 | LLM / Agent / 程式碼 | Coding Agent / 程式碼生成 | z-ai | [glm-5.1](https://build.nvidia.com/z-ai/glm-5.1) | 生成、修改、解釋與除錯程式碼，支援長上下文 coding agent、瀏覽器操作與軟體工程自動化。 |
| 29 | 59 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | bytedance | [seed-oss-36b-instruct](https://build.nvidia.com/bytedance/seed-oss-36b-instruct) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 30 | 143 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | mistralai | [mistral-7b-instruct-v0.3](https://build.nvidia.com/mistralai/mistral-7b-instruct-v03) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 31 | 43 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | moonshotai | [kimi-k2-thinking](https://build.nvidia.com/moonshotai/kimi-k2-thinking) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 32 | 95 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | nvidia | [llama-3.1-nemotron-nano-8b-v1](https://build.nvidia.com/nvidia/llama-3_1-nemotron-nano-8b-v1) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 33 | 94 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | nvidia | [llama-3.3-nemotron-super-49b-v1](https://build.nvidia.com/nvidia/llama-3_3-nemotron-super-49b-v1) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 34 | 69 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | nvidia | [llama-3.3-nemotron-super-49b-v1.5](https://build.nvidia.com/nvidia/llama-3_3-nemotron-super-49b-v1_5) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 35 | 132 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | nvidia | [nemotron-mini-4b-instruct](https://build.nvidia.com/nvidia/nemotron-mini-4b-instruct) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 36 | 62 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | nvidia | [nvidia-nemotron-nano-9b-v2](https://build.nvidia.com/nvidia/nvidia-nemotron-nano-9b-v2) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 37 | 67 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | openai | [gpt-oss-120b](https://build.nvidia.com/openai/gpt-oss-120b) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 38 | 66 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | openai | [gpt-oss-20b](https://build.nvidia.com/openai/gpt-oss-20b) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 39 | 54 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | qwen | [qwen3-next-80b-a3b-instruct](https://build.nvidia.com/qwen/qwen3-next-80b-a3b-instruct) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 40 | 55 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | qwen | [qwen3-next-80b-a3b-thinking](https://build.nvidia.com/qwen/qwen3-next-80b-a3b-thinking) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 41 | 146 | LLM / Agent / 程式碼 | 通用推理 / 工具呼叫 Agent | upstage | [solar-10.7b-instruct](https://build.nvidia.com/upstage/solar-10_7b-instruct) | 做通用文字生成、推理、工具呼叫、長文件理解與多步驟 agent 工作流，用於客服、研究、摘要、規劃與企業助理。 |
| 42 | 53 | LLM / Agent / 程式碼 | 多語/主權語言 LLM | stockmark | [stockmark-2-100b-instruct](https://build.nvidia.com/stockmark/stockmark-2-100b-instruct) | 理解日文企業文件與複雜商務內容，適合在地化知識助理、文件分析與企業搜尋。 |
| 43 | 147 | RAG 與檢索 | 文字 Embedding | baai | [bge-m3](https://build.nvidia.com/baai/bge-m3) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 44 | 115 | RAG 與檢索 | 文字 Embedding | nvidia | [llama-3.2-nv-embedqa-1b-v2](https://build.nvidia.com/nvidia/llama-3_2-nv-embedqa-1b-v2) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 45 | 71 | RAG 與檢索 | 文字 Embedding | nvidia | [llama-3_2-nemoretriever-300m-embed-v1](https://build.nvidia.com/nvidia/llama-3_2-nemoretriever-300m-embed-v1) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 46 | 52 | RAG 與檢索 | 文字 Embedding | nvidia | [llama-3_2-nemoretriever-300m-embed-v2](https://build.nvidia.com/nvidia/llama-3_2-nemoretriever-300m-embed-v2) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 47 | 30 | RAG 與檢索 | 文字 Embedding | nvidia | [llama-nemotron-embed-1b-v2](https://build.nvidia.com/nvidia/llama-nemotron-embed-1b-v2) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 48 | 145 | RAG 與檢索 | 文字 Embedding | nvidia | [nv-embed-v1](https://build.nvidia.com/nvidia/nv-embed-v1) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 49 | 142 | RAG 與檢索 | 文字 Embedding | nvidia | [nv-embedqa-e5-v5](https://build.nvidia.com/nvidia/nv-embedqa-e5-v5) | 把文字或文件轉成向量，建立語意搜尋、RAG 知識庫、相似度比對與跨語言檢索。 |
| 50 | 35 | RAG 與檢索 | 多模態 Embedding | nvidia | [llama-nemotron-embed-vl-1b-v2](https://build.nvidia.com/nvidia/llama-nemotron-embed-vl-1b-v2) | 把圖片與文字映射到同一語意空間，支援跨模態搜尋與圖片/文字檢索。 |
| 51 | 144 | RAG 與檢索 | 多模態 Embedding | nvidia | [nvclip](https://build.nvidia.com/nvidia/nvclip) | 把圖片與文字映射到同一語意空間，支援跨模態搜尋與圖片/文字檢索。 |
| 52 | 97 | RAG 與檢索 | 程式碼檢索 Embedding | nvidia | [nv-embedcode-7b-v1](https://build.nvidia.com/nvidia/nv-embedcode-7b-v1) | 把程式碼與文字查詢轉成向量，支援 code search、相似程式片段搜尋與工程知識庫。 |
| 53 | 79 | RAG 與檢索 | Reranker / 重排序 | nvidia | [llama-3.2-nemoretriever-500m-rerank-v2](https://build.nvidia.com/nvidia/llama-3_2-nemoretriever-500m-rerank-v2) | 替 RAG 搜尋結果重新排序，判斷段落是否能回答問題，提高企業知識庫問答準確率。 |
| 54 | 116 | RAG 與檢索 | Reranker / 重排序 | nvidia | [llama-3.2-nv-rerankqa-1b-v2](https://build.nvidia.com/nvidia/llama-3_2-nv-rerankqa-1b-v2) | 替 RAG 搜尋結果重新排序，判斷段落是否能回答問題，提高企業知識庫問答準確率。 |
| 55 | 25 | RAG 與檢索 | Reranker / 重排序 | nvidia | [llama-nemotron-rerank-1b-v2](https://build.nvidia.com/nvidia/llama-nemotron-rerank-1b-v2) | 替 RAG 搜尋結果重新排序，判斷段落是否能回答問題，提高企業知識庫問答準確率。 |
| 56 | 18 | RAG 與檢索 | Reranker / 重排序 | nvidia | [llama-nemotron-rerank-vl-1b-v2](https://build.nvidia.com/nvidia/llama-nemotron-rerank-vl-1b-v2) | 替 RAG 搜尋結果重新排序，判斷段落是否能回答問題，提高企業知識庫問答準確率。 |
| 57 | 151 | RAG 與檢索 | Reranker / 重排序 | nvidia | [rerank-qa-mistral-4b](https://build.nvidia.com/nvidia/rerank-qa-mistral-4b) | 替 RAG 搜尋結果重新排序，判斷段落是否能回答問題，提高企業知識庫問答準確率。 |
| 58 | 120 | 文件理解與資料擷取 | OCR / 文件解析 | baidu | [paddleocr](https://build.nvidia.com/baidu/paddleocr) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 59 | 72 | 文件理解與資料擷取 | OCR / 文件解析 | nvidia | [nemoretriever-ocr](https://build.nvidia.com/nvidia/nemoretriever-ocr) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 60 | 65 | 文件理解與資料擷取 | OCR / 文件解析 | nvidia | [nemoretriever-ocr-v1](https://build.nvidia.com/nvidia/nemoretriever-ocr-v1) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 61 | 104 | 文件理解與資料擷取 | OCR / 文件解析 | nvidia | [nemoretriever-parse](https://build.nvidia.com/nvidia/nemoretriever-parse) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 62 | 23 | 文件理解與資料擷取 | OCR / 文件解析 | nvidia | [nemotron-ocr-v1](https://build.nvidia.com/nvidia/nemotron-ocr-v1) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 63 | 47 | 文件理解與資料擷取 | OCR / 文件解析 | nvidia | [nemotron-parse](https://build.nvidia.com/nvidia/nemotron-parse) | 從掃描文件、圖片或頁面擷取文字、表格、版面與中繼資料，適合文件理解與 RAG 前處理。 |
| 64 | 99 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemoretriever-graphic-elements-v1](https://build.nvidia.com/nvidia/nemoretriever-graphic-elements-v1) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 65 | 100 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemoretriever-page-elements-v2](https://build.nvidia.com/nvidia/nemoretriever-page-elements-v2) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 66 | 39 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemoretriever-page-elements-v3](https://build.nvidia.com/nvidia/nemoretriever-page-elements-v3) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 67 | 98 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemoretriever-table-structure-v1](https://build.nvidia.com/nvidia/nemoretriever-table-structure-v1) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 68 | 29 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemotron-graphic-elements-v1](https://build.nvidia.com/nvidia/nemotron-graphic-elements-v1) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 69 | 28 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemotron-page-elements-v3](https://build.nvidia.com/nvidia/nemotron-page-elements-v3) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 70 | 27 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nemotron-table-structure-v1](https://build.nvidia.com/nvidia/nemotron-table-structure-v1) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 71 | 119 | 文件理解與資料擷取 | 版面/表格/圖表偵測 | nvidia | [nv-yolox-page-elements-v1](https://build.nvidia.com/nvidia/nv-yolox-page-elements-v1) | 偵測文件中的表格、圖表、標題與頁面元素，將 PDF/圖片切成可檢索結構。 |
| 72 | 103 | 多模態理解 | 圖像/影片問答 | google | [gemma-3-27b-it](https://build.nvidia.com/google/gemma-3-27b-it) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 73 | 149 | 多模態理解 | 圖像/影片問答 | google | [paligemma](https://build.nvidia.com/google/google-paligemma) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 74 | 125 | 多模態理解 | 圖像/影片問答 | meta | [llama-3.2-11b-vision-instruct](https://build.nvidia.com/meta/llama-3.2-11b-vision-instruct) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 75 | 126 | 多模態理解 | 圖像/影片問答 | meta | [llama-3.2-90b-vision-instruct](https://build.nvidia.com/meta/llama-3.2-90b-vision-instruct) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 76 | 90 | 多模態理解 | 圖像/影片問答 | meta | [llama-4-maverick-17b-128e-instruct](https://build.nvidia.com/meta/llama-4-maverick-17b-128e-instruct) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 77 | 45 | 多模態理解 | 圖像/影片問答 | mistralai | [ministral-14b-instruct-2512](https://build.nvidia.com/mistralai/ministral-14b-instruct-2512) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 78 | 44 | 多模態理解 | 圖像/影片問答 | mistralai | [mistral-large-3-675b-instruct-2512](https://build.nvidia.com/mistralai/mistral-large-3-675b-instruct-2512) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 79 | 87 | 多模態理解 | 圖像/影片問答 | mistralai | [mistral-medium-3-instruct](https://build.nvidia.com/mistralai/mistral-medium-3-instruct) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 80 | 19 | 多模態理解 | 圖像/影片問答 | mistralai | [mistral-small-4-119b-2603](https://build.nvidia.com/mistralai/mistral-small-4-119b-2603) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 81 | 1 | 多模態理解 | 圖像/影片問答 | moonshotai | [kimi-k2.6](https://build.nvidia.com/moonshotai/kimi-k2.6) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 82 | 84 | 多模態理解 | 圖像/影片問答 | nvidia | [llama-3.1-nemotron-nano-vl-8b-v1](https://build.nvidia.com/nvidia/llama-3.1-nemotron-nano-vl-8b-v1) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 83 | 48 | 多模態理解 | 圖像/影片問答 | nvidia | [nemotron-nano-12b-v2-vl](https://build.nvidia.com/nvidia/nemotron-nano-12b-v2-vl) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 84 | 26 | 多模態理解 | 圖像/影片問答 | qwen | [qwen3.5-122b-a10b](https://build.nvidia.com/qwen/qwen3.5-122b-a10b) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 85 | 34 | 多模態理解 | 圖像/影片問答 | qwen | [qwen3.5-397b-a17b](https://build.nvidia.com/qwen/qwen3.5-397b-a17b) | 理解圖片或影片內容並回答問題/產生描述，適合視覺問答、圖表理解與內容分析。 |
| 86 | 78 | 多模態理解 | 圖像/語音/文字理解 | google | [gemma-3n-e2b-it](https://build.nvidia.com/google/gemma-3n-e2b-it) | 同時理解圖片、語音與文字，適合多模態聊天、圖表問答與情境分析。 |
| 87 | 77 | 多模態理解 | 圖像/語音/文字理解 | google | [gemma-3n-e4b-it](https://build.nvidia.com/google/gemma-3n-e4b-it) | 同時理解圖片、語音與文字，適合多模態聊天、圖表問答與情境分析。 |
| 88 | 106 | 多模態理解 | 圖像/語音/文字理解 | microsoft | [phi-4-multimodal-instruct](https://build.nvidia.com/microsoft/phi-4-multimodal-instruct) | 同時理解圖片、語音與文字，適合多模態聊天、圖表問答與情境分析。 |
| 89 | 5 | 多模態理解 | 圖像/語音/文字理解 | nvidia | [nemotron-3-nano-omni-30b-a3b-reasoning](https://build.nvidia.com/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning) | 同時理解圖片、語音與文字，適合多模態聊天、圖表問答與情境分析。 |
| 90 | 89 | 視覺生成與創作 | 文字生圖 | black-forest-labs | [FLUX.1-dev](https://build.nvidia.com/black-forest-labs/flux_1-dev) | 依文字提示生成圖片，適合行銷素材、設計草圖、概念圖與創意內容生產。 |
| 91 | 86 | 視覺生成與創作 | 文字生圖 | black-forest-labs | [FLUX.1-schnell](https://build.nvidia.com/black-forest-labs/flux_1-schnell) | 依文字提示生成圖片，適合行銷素材、設計草圖、概念圖與創意內容生產。 |
| 92 | 2 | 視覺生成與創作 | 文字生圖 | qwen | [qwen-image](https://build.nvidia.com/qwen/qwen-image) | 依文字提示生成圖片，適合行銷素材、設計草圖、概念圖與創意內容生產。 |
| 93 | 63 | 視覺生成與創作 | 文字生圖 | stabilityai | [stable-diffusion-3.5-large](https://build.nvidia.com/stabilityai/stable-diffusion-3_5-large) | 依文字提示生成圖片，適合行銷素材、設計草圖、概念圖與創意內容生產。 |
| 94 | 64 | 視覺生成與創作 | 圖片編輯 / In-context 編輯 | black-forest-labs | [FLUX.1-Kontext-dev](https://build.nvidia.com/black-forest-labs/flux_1-kontext-dev) | 依文字指令生成或編輯圖片，維持主體與場景一致性，適合素材修改與設計迭代。 |
| 95 | 22 | 視覺生成與創作 | 圖片編輯 / In-context 編輯 | black-forest-labs | [flux.2-klein-4b](https://build.nvidia.com/black-forest-labs/flux_2-klein-4b) | 依文字指令生成或編輯圖片，維持主體與場景一致性，適合素材修改與設計迭代。 |
| 96 | 3 | 視覺生成與創作 | 圖片編輯 / In-context 編輯 | qwen | [qwen-image-edit](https://build.nvidia.com/qwen/qwen-image-edit) | 依文字指令生成或編輯圖片，維持主體與場景一致性，適合素材修改與設計迭代。 |
| 97 | 121 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [conformer-ctc-asr](https://build.nvidia.com/nvidia/conformer-ctc-asr) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 98 | 21 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [nemotron-asr-streaming](https://build.nvidia.com/nvidia/nemotron-asr-streaming) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 99 | 88 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-1.1b-rnnt-multilingual-asr](https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 100 | 57 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-ctc-0.6b-es](https://build.nvidia.com/nvidia/parakeet-ctc-0_6b-es) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 101 | 58 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-ctc-0.6b-vi](https://build.nvidia.com/nvidia/parakeet-ctc-0_6b-vi) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 102 | 56 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-ctc-0.6b-zh-cn](https://build.nvidia.com/nvidia/parakeet-ctc-0_6b-zh-cn) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 103 | 51 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-ctc-0.6b-zh-tw](https://build.nvidia.com/nvidia/parakeet-ctc-0_6b-zh-tw) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 104 | 134 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-ctc-1.1b-asr](https://build.nvidia.com/nvidia/parakeet-ctc-1_1b-asr) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 105 | 68 | 語音與翻譯 | 語音轉文字 ASR | nvidia | [parakeet-tdt-0.6b-v2](https://build.nvidia.com/nvidia/parakeet-tdt-0_6b-v2) | 將語音即時或批次轉成文字，支援字幕、會議記錄、客服錄音分析與語音管線。 |
| 106 | 109 | 語音與翻譯 | 語音辨識 + 語音翻譯 | nvidia | [canary-1b-asr](https://build.nvidia.com/nvidia/canary-1b-asr) | 將語音轉文字並可做語音翻譯，適合多語會議、字幕與語音資料處理。 |
| 107 | 135 | 語音與翻譯 | 語音辨識 + 語音翻譯 | nvidia | [parakeet-ctc-0.6b-asr](https://build.nvidia.com/nvidia/parakeet-ctc-0_6b-asr) | 將語音轉文字並可做語音翻譯，適合多語會議、字幕與語音資料處理。 |
| 108 | 108 | 語音與翻譯 | 語音辨識 + 語音翻譯 | openai | [whisper-large-v3](https://build.nvidia.com/openai/whisper-large-v3) | 將語音轉文字並可做語音翻譯，適合多語會議、字幕與語音資料處理。 |
| 109 | 133 | 語音與翻譯 | 文字翻譯 | nvidia | [megatron-1b-nmt](https://build.nvidia.com/nvidia/megatron-1b-nmt) | 做多語文字翻譯，適合客服、文件在地化、跨國協作與即時溝通。 |
| 110 | 76 | 語音與翻譯 | 文字翻譯 | nvidia | [riva-translate-1.6b](https://build.nvidia.com/nvidia/riva-translate-1_6b) | 做多語文字翻譯，適合客服、文件在地化、跨國協作與即時溝通。 |
| 111 | 41 | 語音與翻譯 | 文字翻譯 | nvidia | [riva-translate-4b-instruct-v1_1](https://build.nvidia.com/nvidia/riva-translate-4b-instruct-v1_1) | 做多語文字翻譯，適合客服、文件在地化、跨國協作與即時溝通。 |
| 112 | 96 | 語音與翻譯 | 文字轉語音 TTS | nvidia | [magpie-tts-multilingual](https://build.nvidia.com/nvidia/magpie-tts-multilingual) | 把文字轉成自然語音，可用於語音助理、品牌聲音、旁白與多語內容。 |
| 113 | 85 | 語音與翻譯 | 文字轉語音 TTS | nvidia | [magpie-tts-zeroshot](https://build.nvidia.com/nvidia/magpie-tts-zeroshot) | 把文字轉成自然語音，可用於語音助理、品牌聲音、旁白與多語內容。 |
| 114 | 20 | 語音與翻譯 | 即時語音對話 | nvidia | [nemotron-voicechat](https://build.nvidia.com/nvidia/nemotron-voicechat) | 建立可即時聽與回應的語音助理或客服語音 agent。 |
| 115 | 81 | 語音與翻譯 | 語音增強/降噪 | nvidia | [Background Noise Removal](https://build.nvidia.com/nvidia/bnr) | 移除音訊背景噪音，提升通話、會議、Podcast 或語音辨識前處理品質。 |
| 116 | 123 | 語音與翻譯 | 語音增強/降噪 | nvidia | [studiovoice](https://build.nvidia.com/nvidia/studiovoice) | 提升錄音品質或移除背景噪音，適合會議、通話、Podcast 與 ASR 前處理。 |
| 117 | 12 | 媒體 AI 與影片工具 | AI 合成影片偵測 | nvidia | [synthetic-video-detector](https://build.nvidia.com/nvidia/synthetic-video-detector) | 判斷影片是否為 AI 生成/合成影片，適合媒體查核、版權審核與內容驗證。 |
| 118 | 10 | 媒體 AI 與影片工具 | 影片人物重打光 | nvidia | [NVIDIA AI for Media Relighting](https://build.nvidia.com/nvidia/relighting) | 把影片中的人物重新打光，讓遠端錄影、主播或訪談畫面匹配指定 HDRI/場景光源。 |
| 119 | 13 | 媒體 AI 與影片工具 | 說話者偵測 | nvidia | [Active Speaker Detection](https://build.nvidia.com/nvidia/active-speaker-detection) | 在影片中找出誰正在說話並追蹤說話者，適合會議、節目、字幕與剪輯自動化。 |
| 120 | 14 | 媒體 AI 與影片工具 | 嘴型同步/配音 | nvidia | [LipSync](https://build.nvidia.com/nvidia/lipsync) | 把影片人物嘴型同步到新音訊，適合配音、在地化、新聞/體育多語內容製作。 |
| 121 | 138 | 媒體 AI 與影片工具 | 視線校正 | nvidia | [eyecontact](https://build.nvidia.com/nvidia/eyecontact) | 校正影片人物視線，讓視線看起來面向鏡頭，適合遠距會議與虛擬人。 |
| 122 | 75 | 安全與治理 | 內容安全與政策審核 | meta | [llama-guard-4-12b](https://build.nvidia.com/meta/llama-guard-4-12b) | 分類不安全、毒性或政策違規的文字/圖像輸入輸出，作為 LLM moderation 與 guardrail。 |
| 123 | 112 | 安全與治理 | 內容安全與政策審核 | nvidia | [llama-3.1-nemoguard-8b-content-safety](https://build.nvidia.com/nvidia/llama-3_1-nemoguard-8b-content-safety) | 分類不安全、毒性或政策違規的文字/圖像輸入輸出，作為 LLM moderation 與 guardrail。 |
| 124 | 49 | 安全與治理 | 內容安全與政策審核 | nvidia | [llama-3.1-nemotron-safety-guard-8b-v3](https://build.nvidia.com/nvidia/llama-3_1-nemotron-safety-guard-8b-v3) | 分類不安全、毒性或政策違規的文字/圖像輸入輸出，作為 LLM moderation 與 guardrail。 |
| 125 | 11 | 安全與治理 | 內容安全與政策審核 | nvidia | [nemotron-3-content-safety](https://build.nvidia.com/nvidia/nemotron-3-content-safety) | 分類不安全、毒性或政策違規的文字/圖像輸入輸出，作為 LLM moderation 與 guardrail。 |
| 126 | 37 | 安全與治理 | 內容安全與政策審核 | nvidia | [nemotron-content-safety-reasoning-4b](https://build.nvidia.com/nvidia/nemotron-content-safety-reasoning-4b) | 分類不安全、毒性或政策違規的文字/圖像輸入輸出，作為 LLM moderation 與 guardrail。 |
| 127 | 111 | 安全與治理 | Jailbreak / Prompt Injection 偵測 | nvidia | [nemoguard-jailbreak-detect](https://build.nvidia.com/nvidia/nemoguard-jailbreak-detect) | 偵測 prompt injection 與 jailbreak 攻擊，保護聊天機器人、agent 與企業內部工具。 |
| 128 | 110 | 安全與治理 | 對話主題控管 | nvidia | [llama-3.1-nemoguard-8b-topic-control](https://build.nvidia.com/nvidia/llama-3_1-nemoguard-8b-topic-control) | 限制對話維持在核准主題內，避免客服或企業助理偏離業務範圍。 |
| 129 | 31 | 安全與治理 | 個資偵測 | nvidia | [gliner-pii](https://build.nvidia.com/nvidia/gliner-pii) | 偵測文字中的個資與敏感資訊，例如姓名、電話、地址、證件號，支援遮罩與稽核。 |
| 130 | 80 | Physical AI / 自駕 / 機器人 | 物理一致影片生成 | nvidia | [cosmos-transfer1-7b](https://build.nvidia.com/nvidia/cosmos-transfer1-7b) | 從文字與空間控制輸入生成物理一致的影片世界狀態，產生機器人/自駕訓練資料。 |
| 131 | 33 | Physical AI / 自駕 / 機器人 | 物理一致影片生成 | nvidia | [cosmos-transfer2.5-2b](https://build.nvidia.com/nvidia/cosmos-transfer2_5-2b) | 從文字與空間控制輸入生成物理一致的影片世界狀態，產生機器人/自駕訓練資料。 |
| 132 | 38 | Physical AI / 自駕 / 機器人 | 物理世界推理 | nvidia | [cosmos-reason2-8b](https://build.nvidia.com/nvidia/cosmos-reason2-8b) | 理解影片/圖像中的物理世界、物件互動與時序關係，支援機器人和自駕場景推理。 |
| 133 | 91 | Physical AI / 自駕 / 機器人 | 未來世界狀態預測 | nvidia | [cosmos-predict1-5b](https://build.nvidia.com/nvidia/cosmos-predict1-5b) | 根據圖片或短影片預測未來畫面/世界狀態，用於機器人與自駕模型測試。 |
| 134 | 93 | Physical AI / 自駕 / 機器人 | 自駕 3D 感知 | nvidia | [bevformer](https://build.nvidia.com/nvidia/bevformer) | 做自駕車 3D 感知、鳥瞰圖理解或物件偵測，支援自駕資料分析與模型驗證。 |
| 135 | 46 | Physical AI / 自駕 / 機器人 | 自駕 3D 感知 | nvidia | [streampetr](https://build.nvidia.com/nvidia/streampetr) | 做自駕車 3D 感知、鳥瞰圖理解或物件偵測，支援自駕資料分析與模型驗證。 |
| 136 | 92 | Physical AI / 自駕 / 機器人 | 自駕端到端 Stack | nvidia | [sparsedrive](https://build.nvidia.com/nvidia/sparsedrive) | 整合感知、預測與規劃，適合自駕研究、場景評估與策略驗證。 |
| 137 | 60 | 3D / OpenUSD / 數位分身 | 文字/圖片轉 3D | microsoft | [TRELLIS](https://build.nvidia.com/microsoft/trellis) | 從文字或圖片生成 3D 資產，支援遊戲、數位分身、模擬與創作流程。 |
| 138 | 117 | 3D / OpenUSD / 數位分身 | OpenUSD 程式碼生成 | nvidia | [usdcode](https://build.nvidia.com/nvidia/usdcode) | 回答 OpenUSD 問題並產生 USD-Python 程式碼，協助建立或修改數位分身場景。 |
| 139 | 139 | 3D / OpenUSD / 數位分身 | OpenUSD 資產驗證 | nvidia | [usdvalidate](https://build.nvidia.com/nvidia/usdvalidate) | 檢查 OpenUSD 資產是否符合 RTX 渲染與規則要求，支援數位分身資產驗證。 |
| 140 | 131 | 生醫與藥物探索 | 蛋白質/分子結構預測 | deepmind | [alphafold2](https://build.nvidia.com/deepmind/alphafold2) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 141 | 129 | 生醫與藥物探索 | 蛋白質/分子結構預測 | deepmind | [alphafold2-multimer](https://build.nvidia.com/deepmind/alphafold2-multimer) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 142 | 154 | 生醫與藥物探索 | 蛋白質/分子結構預測 | meta | [esmfold](https://build.nvidia.com/meta/esmfold) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 143 | 83 | 生醫與藥物探索 | 蛋白質/分子結構預測 | mit | [Boltz-2](https://build.nvidia.com/mit/boltz2) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 144 | 102 | 生醫與藥物探索 | 蛋白質/分子結構預測 | openfold | [openfold2](https://build.nvidia.com/openfold/openfold2) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 145 | 50 | 生醫與藥物探索 | 蛋白質/分子結構預測 | openfold | [openfold3](https://build.nvidia.com/openfold/openfold3) | 預測蛋白質、核酸、配體或生物分子複合體的 3D 結構，支援藥物探索與生物研究。 |
| 146 | 136 | 生醫與藥物探索 | 蛋白質設計 | ipd | [proteinmpnn](https://build.nvidia.com/ipd/proteinmpnn) | 設計蛋白質骨架或依骨架生成胺基酸序列，支援 protein binder 與蛋白工程。 |
| 147 | 148 | 生醫與藥物探索 | 蛋白質設計 | ipd | [rfdiffusion](https://build.nvidia.com/ipd/rfdiffusion) | 設計蛋白質骨架或依骨架生成胺基酸序列，支援 protein binder 與蛋白工程。 |
| 148 | 130 | 生醫與藥物探索 | 蛋白質嵌入向量 | meta | [esm2-650m](https://build.nvidia.com/meta/esm2-650m) | 將蛋白質序列轉成向量表示，用於蛋白質搜尋、相似度分析與下游生物模型。 |
| 149 | 101 | 生醫與藥物探索 | 多序列比對 | colabfold | [msa-search](https://build.nvidia.com/colabfold/msa-search) | 替蛋白質序列建立多序列比對，作為結構預測與演化分析前處理。 |
| 150 | 155 | 生醫與藥物探索 | 分子 Docking | mit | [diffdock](https://build.nvidia.com/mit/diffdock) | 預測小分子與蛋白質的結合姿態，用於 docking、候選分子篩選與藥物設計。 |
| 151 | 113 | 生醫與藥物探索 | 小分子生成/最佳化 | nvidia | [genmol](https://build.nvidia.com/nvidia/genmol-generate) | 生成或最佳化具有目標性質的小分子，支援早期藥物候選探索。 |
| 152 | 153 | 生醫與藥物探索 | 小分子生成/最佳化 | nvidia | [molmim](https://build.nvidia.com/nvidia/molmim-generate) | 生成或最佳化具有目標性質的小分子，支援早期藥物候選探索。 |
| 153 | 107 | 生醫與藥物探索 | 基因體序列建模 | arc | [evo2-40b](https://build.nvidia.com/arc/evo2-40b) | 分析長基因序列並捕捉單核苷酸變異影響，適合基因體研究與生物序列建模。 |
| 154 | 15 | 科學與工程模擬 | 量子校準 | nvidia | [ising-calibration-1-35b-a3b](https://build.nvidia.com/nvidia/ising-calibration-1-35b-a3b) | 理解量子電腦校準圖表與量測資料，輔助量子晶片校準與錯誤修正工作流。 |
| 155 | 122 | 科學與工程模擬 | 天氣/氣候預測 | nvidia | [fourcastnet](https://build.nvidia.com/nvidia/fourcastnet) | 快速預測全球天氣與氣候變數，用於氣象模擬、風險分析與 Earth-2 工作流。 |
| 156 | 152 | 科學與工程模擬 | 醫學影像分割 | nvidia | [vista-3d](https://build.nvidia.com/nvidia/vista-3d) | 互動式分割與標註人體解剖結構，適合醫學影像分析與輔助標註。 |
| 157 | 157 | 科學與工程模擬 | 路線/組合最佳化 | nvidia | [cuopt](https://build.nvidia.com/nvidia/nvidia-cuopt) | 求解車隊配送、路線規劃、排程與複雜組合最佳化問題。 |
