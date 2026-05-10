# NVIDIA Model Categories

Use this file as a quick routing guide before querying `inventory.csv`.

## LLM / Agent / 程式碼
- Use for chat assistants, tool-calling agents, code generation, code explanation, long-context reasoning, and workflow automation.
- Typical input: system prompt, user request, retrieved context, tool schema, code snippets.
- Typical output: text answer, code diff, plan, tool-call arguments.
- Validate with: task success rate, hallucination rate, test pass rate, latency, cost.
- Query columns: `主分類`, `子分類`, `具體用途（中文）`, `API/服務型態`.

## RAG 與檢索
- Use for enterprise search, knowledge-base Q&A, semantic search, reranking, and retrieval pipelines.
- Typical input: documents, chunks, user queries, candidate passages.
- Typical output: embeddings, relevance scores, ranked documents.
- Validate with: recall@k, MRR/NDCG, grounded-answer rate, source citation quality.
- Query columns: `子分類`, `API/服務型態`, `落地操作步驟`.

## 文件理解與資料擷取
- Use for OCR, PDF ingestion, scanned documents, reports, tables, contracts, and forms.
- Typical input: PDF pages, scanned images, screenshots, tables.
- Typical output: text, tables, layout blocks, bounding boxes, structured JSON.
- Validate with: field accuracy, table reconstruction quality, human audit samples.

## 多模態理解
- Use when text and images/video frames must be interpreted together.
- Typical input: image or video frame plus prompt.
- Typical output: captions, visual Q&A, extracted attributes, structured descriptions.
- Validate with: answer accuracy, visual grounding, false-positive rate.

## 視覺生成與創作
- Use for image generation, image editing, marketing assets, product sketches, and design exploration.
- Typical input: prompt, reference image, mask, style, seed, size.
- Typical output: generated or edited image.
- Validate with: brand compliance, safety review, copyright risk, human preference.

## 語音與翻譯
- Use for ASR, TTS, translation, audio enhancement, diarization, and voice workflows.
- Typical input: audio clips, text, target language, voice settings.
- Typical output: transcript, translated text, generated speech, enhanced audio.
- Validate with: WER/CER, speaker accuracy, translation quality, latency.

## 媒體 AI 與影片工具
- Use for video processing, active speaker detection, relighting, watermarking, and post-production automation.
- Typical input: video, audio, frame sequence, processing settings.
- Typical output: video segments, speaker intervals, processed media, metadata.
- Validate with: frame-level accuracy, sync quality, review samples.

## 安全與治理
- Use for content safety, jailbreak detection, topic control, and policy enforcement.
- Typical input: prompt, response, conversation context, policy label set.
- Typical output: safety score, label, allow/block decision, remediation.
- Validate with: precision/recall, false positives, false negatives, escalation quality.

## Physical AI / 自駕 / 機器人
- Use for robotics, autonomous driving, simulation data, control planning, and embodied AI.
- Typical input: sensor data, camera frames, routes, simulation states, robot/task prompt.
- Typical output: trajectories, actions, labels, synthetic scenes, planning results.
- Validate with: simulator metrics, safety constraints, closed-loop performance.

## 3D / OpenUSD / 數位分身
- Use for 3D scene workflows, OpenUSD assets, digital human/avatar pipelines, and virtual environments.
- Typical input: text, 3D scene description, USD assets, images.
- Typical output: 3D assets, USD scene data, avatar/media outputs.
- Validate with: asset compatibility, visual quality, pipeline integration.

## 生醫與藥物探索
- Use for protein, molecule, genomics, drug discovery, and biomedical research workflows.
- Typical input: sequence, structure, molecule graph, assay context, biomedical text.
- Typical output: embeddings, predictions, generated candidates, analysis text.
- Validate with: benchmark metrics, wet-lab relevance, domain expert review.

## 科學與工程模擬
- Use for weather, physics, engineering simulation, optimization, and numerical workflows.
- Typical input: simulation state, mesh/grid, constraints, geospatial data.
- Typical output: forecasts, optimized plan, surrogate model results.
- Validate with: numerical error, domain metrics, stability, runtime improvement.
