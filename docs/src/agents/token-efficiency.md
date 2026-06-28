# Agent Token Efficiency

本專案使用「先定位、後讀取」策略降低 coding agent 的上下文消耗。主要輔助工具是
[jCodeMunch](https://github.com/jgravelle/jcodemunch-mcp)：它以 Tree-sitter 建立本機
symbol index，讓 agent 取得任務相關的函式、相依關係與固定 token budget context，
而不是反覆讀取完整大檔案。

## 選型結論

| 工具 | 適用情境 | 本專案決策 |
|---|---|---|
| jCodeMunch | 日常探索、symbol source、blast radius、diff review | 採用 |
| Repomix | 一次性交接、外部模型無法直接存取 repository | 備用，不常駐 MCP |
| Serena | 完整 IDE-like semantic editing | 暫不加入，避免與既有工具重疊 |
| MCP compressor / tool search | 同時掛載大量 MCP server | 客戶端支援時採用延遲載入 |

jCodeMunch 的公開 benchmark 是相對「讀取全部 source」的 retrieval-heavy 基線，
不能視為每一項任務都固定節省相同比例。專案應以實際 session 的 input/cache token
與任務成功率判斷成效，不能只看供應者宣稱。

## 安裝

```bash
cd /Users/w.rc/nvdiaOSsupport
./.venv/bin/pip install -r requirements-agent-tools.txt
./.venv/bin/jcodemunch-mcp index . --no-ai-summaries
```

Codex 使用已安裝的絕對路徑，避免 `uvx` 第一次啟動輸出干擾 MCP handshake：

```toml
[mcp_servers.jcodemunch]
command = "/Users/w.rc/nvdiaOSsupport/.venv/bin/jcodemunch-mcp"
startup_timeout_sec = 20

[mcp_servers.jcodemunch.env]
JCODEMUNCH_SHARE_SAVINGS = "0"
```

重新啟動 agent client 後才會載入新增 MCP server。索引儲存在
`~/.code-index/`，不提交 Git；程式碼不會因建立本機 index 而上傳。

## Agent 使用規約

1. 先呼叫 `plan_turn` 或 `assemble_task_context`，預設 budget 4,000 tokens。
2. 探索架構時使用 `get_repo_map`；查實作時先搜尋 symbol，再只取所需 source。
3. 修改前使用 `get_blast_radius` 或 `check_edit_safe`；review 時使用
   `get_changed_symbols`，避免掃描完整 repository。
4. retrieval confidence 低、索引過期、查非程式碼內容，或需精確逐行上下文時，
   才退回 `rg`、`sed` 與局部檔案讀取。
5. 不把整份 index、完整測試 log 或整個 repository pack 貼入 prompt。
6. 修改程式碼後更新受影響檔案 index；跨大量檔案變更後重建 repository index。
7. 最終判定仍以原始碼、測試與 Git diff 為準，index 只是 retrieval layer。

## 成效檢查

每月抽樣相同類型的探索、修正與 review 任務，比較：

- input、cache creation 與 output tokens；
- 首次找到正確 symbol 的工具呼叫次數；
- 重複讀取同一檔案的次數；
- 測試通過率與返工次數。

若 token 降低但任務成功率或理論驗證品質下降，應提高 context budget 或直接讀取
關鍵原始碼，不做破壞語意的 source minification。
