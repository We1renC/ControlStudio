# ControlStudio — UI/UX 詳細改善規格

> 版本：2026-05-21  
> 基礎：333 exported symbols / 62 modules  
> 格式說明：每項功能包含 使用者故事 / 觸發位置 / 互動流程 / 視覺規格 / 元件組成 / 資料介面 / 狀態機 / 鍵盤支援 / 依賴模組 / 驗收標準

---

## 0｜全局設計規格

### 0.1 設計 Token（對應 theme.js）

| Token | Dark 值 | Light 值 | 用途 |
|-------|---------|---------|------|
| `--bg` | `#0d1117` | `#ffffff` | 頁面底色 |
| `--surface` | `#161b22` | `#f6f8fa` | 卡片、面板 |
| `--surface-2` | `#21262d` | `#eaeef2` | hover、次層 |
| `--border` | `#30363d` | `#d0d7de` | 邊框 |
| `--text-primary` | `#e6edf3` | `#1f2328` | 主文字 |
| `--text-muted` | `#8b949e` | `#656d76` | 次要文字 |
| `--accent` | `#3fb950` | `#1a7f37` | 成功、主要動作 |
| `--accent-blue` | `#58a6ff` | `#0969da` | 連結、資訊 |
| `--warning` | `#d29922` | `#9a6700` | 警告 |
| `--error` | `#f85149` | `#cf222e` | 錯誤 |
| `--code-bg` | `#161b22` | `#f6f8fa` | 程式碼底色 |

### 0.2 字型系統

| 層級 | 大小 | 字重 | 用途 |
|------|------|------|------|
| Display | 24px | 700 | 頁面大標題 |
| H1 | 20px | 600 | 章節標題 |
| H2 | 16px | 600 | 區塊標題 |
| H3 | 14px | 600 | 子區塊標題 |
| Body | 14px | 400 | 一般內文 |
| Small | 12px | 400 | 說明、標籤 |
| Code | 13px mono | 400 | 程式碼、數值 |

### 0.3 間距系統（4px 基準）

```
4px  — 元素內部細間距（icon 與文字）
8px  — 元件內 padding（small）
12px — 元件內 padding（medium）
16px — 元件內 padding（large）、區塊間距
24px — 區塊間距
32px — 章節間距
48px — 大區塊間距
```

### 0.4 動態規格

| 類型 | 時長 | Easing | 用途 |
|------|------|--------|------|
| Micro | 100ms | linear | hover 背景色 |
| Transition | 200ms | ease-out | 面板展開、modal 進出 |
| Animation | 300ms | cubic-bezier(.25,.8,.25,1) | wizard 步驟切換 |
| Reduced | 0ms | — | prefers-reduced-motion |

### 0.5 圓角

```
border-radius:
  sm: 4px   — badge、input
  md: 6px   — button、card
  lg: 8px   — modal、panel
  xl: 12px  — 大卡片
  pill: 9999px — tag
```

### 0.6 圖表配色（WCAG AA 對比 ≥ 4.5:1 on #0d1117）

| 序號 | 顏色 | Hex | 對比比 |
|------|------|-----|--------|
| 1 | 綠（主線） | `#3fb950` | 5.2:1 |
| 2 | 藍 | `#58a6ff` | 4.7:1 |
| 3 | 橘 | `#fb923c` | 5.1:1 |
| 4 | 紫 | `#a78bfa` | 5.3:1 |
| 5 | 青 | `#22d3ee` | 5.8:1 |
| 6 | 玫紅 | `#f472b6` | 4.9:1 |
| 7 | 黃 | `#facc15` | 8.2:1 |
| 8 | 灰綠 | `#6ee7b7` | 6.4:1 |

---

## 1｜頁面架構與導覽

### 1.1 全局佈局

```
┌────────────────────────────────────────────────────────┐
│ TopBar [高 52px]                                        │
│  [Logo 32px] [Context Bar ─ 彈性寬度]  [Theme] [Help] │
├──────────┬─────────────────────────────────────────────┤
│ SideNav  │ Workspace                                   │
│ [220px]  │                                             │
│ 固定左欄 │  ┌──────────────┬──────────────────────┐   │
│          │  │ 左窗格       │ 右窗格               │   │
│          │  │ (圖表/輸出)  │ (參數/設定)          │   │
│          │  │              │                      │   │
│          │  └──────────────┴──────────────────────┘   │
│          │ [StatusBar 高 28px]                         │
└──────────┴─────────────────────────────────────────────┘
```

### 1.2 TopBar 詳細

```
[CS Logo]  [系統名稱 ▾] [控制器類型 chip] [規格狀態 badge]  ──彈性──  [●Dark ○Light ○Print] [? Help] [⚙]
           ↑ 點擊開啟系統選擇器
```

- 系統名稱下拉：最近 5 個系統 + 「新增」選項
- 規格狀態 badge：`✓ 全部通過`（綠）/ `⚠ 3 項未達標`（黃）/ `─ 未設定規格`（灰）
- 主題三態按鈕：radio-group，切換呼叫 `applyTheme()` + 更新 `<body data-theme>`

### 1.3 SideNav 四層結構

```
SideNav [220px, position:sticky top:52px, height:calc(100vh - 52px)]
│
├─ 🔲 建模              [可折疊群組]
│   ├─ 新增系統          → 開啟系統輸入精靈
│   ├─ SysID 入口        → 分析 > 系統識別
│   └─ 範例庫            → 範例庫 modal
│
├─ 🎛 設計              [可折疊群組]
│   ├─ PID 設計
│   ├─ LQR / LQG
│   ├─ H∞ 合成
│   ├─ MPC
│   ├─ 自適應控制
│   └─ 非線性控制
│
├─ 📊 分析              [可折疊群組]
│   ├─ 時域響應
│   ├─ 頻域分析
│   ├─ 根軌跡
│   ├─ 相平面
│   └─ 模型縮減
│
└─ 📦 輸出              [可折疊群組]
    ├─ 程式碼生成
    ├─ 設計報告
    └─ 資料匯出
```

- 當前頁面：左側 3px accent bar + 背景 `--surface-2`
- 群組可折疊：`aria-expanded`，chevron 旋轉動畫 200ms
- 摺疊後群組仍顯示 active 子項的顏色提示

### 1.4 StatusBar

```
[spinner|✓|⚠|✗] [計算狀態文字]  ──彈性──  [最後計算時間]  [記憶體: 符號數 N]
```

- idle：`─` 灰色文字
- 計算中：`spinner` + 「計算中…」+ `progressBar` (若耗時 > 300ms 才顯示進度)
- 完成：`✓` 綠色 + 「完成（85ms）」，3s 後淡出回 idle
- 警告：`⚠` 黃色 + 警告摘要，常駐顯示
- 錯誤：`✗` 紅色 + 錯誤摘要 + 「詳細」連結

### 1.5 工作區分割模式

| 模式 | 觸發 | 佈局 |
|------|------|------|
| 單窗格 | 預設 | 主內容 100% |
| 左右分割 | `⊟` 按鈕 | 50%\|50%（可拖移分隔線） |
| 上下分割 | `⊠` 按鈕 | 60%\|40%（可拖移） |
| 全螢幕圖表 | `⛶` 或雙擊圖表 | 覆蓋整個 workspace，Esc 離開 |

分隔線：8px 寬，hover 顯示 `col-resize` 游標，`--border` 色，拖移中高亮

---

## 2｜A 族群 — 控制設計者

---

### A1-1｜系統輸入精靈

**使用者故事**
身為控制設計者，我想用引導式表單建立系統模型，不必記憶格式，系統自動驗證維度與穩定性。

**觸發位置**
- SideNav「建模 → 新增系統」
- TopBar 系統名稱下拉「+ 新增」
- 空白工作區的「立即建模」CTA 按鈕

**互動流程**
```
Step 1 — 選擇模型類型
  [TF 傳遞函數] [SS 狀態空間] [ZPK 零極點增益]
  ↓ 點選後下方顯示對應輸入區

Step 2 — 輸入係數
  TF：分子多項式 / 分母多項式（兩行 input，示例 placeholder）
  SS：A / B / C / D 矩陣（textarea，支援空格分隔或 [1 2; 3 4] 格式）
  ZPK：零點列表 / 極點列表 / 增益 k

  ➜ 右側即時 LaTeX preview（呼叫 tfToLatex / renderTfLatex）

Step 3 — 模型健康診斷（即時）
  ✓ 維度一致（A 是 n×n，B 是 n×m，…）
  ✓ 穩定性（呼叫 analyzeStability → routhTable）
  ✓ 可控性（controllabilityMatrix → matRank）
  ✓ 可觀性（observabilityMatrix → matRank）
  → 四項 badge 即時更新

Step 4 — 命名與確認
  [系統名稱 input] [加入工作區] [取消]
```

**視覺規格**
```
Modal：寬 540px，高自適應（max 85vh），backdrop blur 8px
Header：「新增系統模型」H2，右上 ✕
步驟 indicator：3 個圓點（Step 1/2/3），active 填滿 --accent
Step 卡片：--surface 底色，16px padding，6px border-radius
係數 input：font-family: monospace，14px，--code-bg 底色
LaTeX preview：高 56px，--surface-2，置中對齊，color:--accent-blue
診斷 badge 列：4 個 badge 水平排列，wrap，8px gap
Footer：[取消 ghost button] [加入工作區 primary button]
```

**元件組成**
- `tabs()` — TF / SS / ZPK 切換
- `formField()` — 每個係數輸入框（含 label + hint）
- `badge()` — 四項健康診斷狀態
- `alert()` — 維度錯誤時顯示 error alert
- `button()` — 確認、取消
- `renderLatex()` / `tfToLatex()` — 即時數學預覽

**資料介面**

輸入：使用者填入的係數字串
輸出：
```javascript
{
  type: 'tf' | 'ss' | 'zpk',
  name: string,
  data: TransferFunction | MIMOStateSpace | ZPK,
  health: { stable, controllable, observable, minPhase }
}
```

**狀態機**
```
idle → typing（input 變化）→ validating（防抖 150ms）→ valid | invalid
valid → confirmed（點擊「加入」）→ 關閉 modal，更新 TopBar 系統名稱
invalid → 顯示 error alert，阻止確認
```

**鍵盤支援**
- `Tab` 在欄位間移動
- `Enter` 在最後一個欄位觸發確認
- `Escape` 關閉 modal
- `Ctrl+1/2/3` 切換 TF/SS/ZPK tab

**依賴模組**
`TransferFunction`, `stateSpaceToTransferFunction`, `analyzeStability`, `routhTable`, `controllabilityMatrix`, `observabilityMatrix`, `matRank`, `tfToLatex`, `renderTfLatex`, `polyroots`, `parseMatrixInput`

**驗收標準**
- [ ] 輸入非方陣 A → error alert 阻擋確認
- [ ] 輸入不穩定系統 → warning badge（不阻擋）
- [ ] LaTeX preview 在輸入後 150ms 內更新
- [ ] 三種模式欄位正確切換，前一步驟資料清除
- [ ] 加入後 TopBar 顯示系統名稱，規格 badge 更新

---

### A1-2｜SysID 一鍵入口

**使用者故事**
我有實驗量測的步階響應 CSV 資料，想直接貼入或上傳就能得到估計的系統模型。

**觸發位置**
SideNav「建模 → SysID 入口」/ 系統輸入精靈 Step 1 的「從量測資料建模」連結

**互動流程**
```
1. 資料輸入（二擇一）
   [貼上 CSV 文字] 或 [拖放 .csv 檔案]
   格式：time, output（單輸入步階）或 time, input, output

2. 圖表預覽
   → 即時繪製量測數據（buildSVGChart，散點 + 折線）

3. 選擇識別方法
   [ARX] [ARMAX] [OE] [子空間 N4SID] → 顯示各方法說明 tooltip

4. 設定參數
   na（A 多項式階數）、nb（B 多項式階數）、nk（延遲步數）
   → 「自動選階」按鈕（呼叫 autoARXOrder / autoModelOrder）

5. 執行識別 → StatusBar 顯示進度
   → 結果：殘差圖 + 白化檢驗 badge + 擬合度 %
   → [接受此模型] → 進入系統輸入精靈 Step 3（已填入 ss/tf）
```

**視覺規格**
```
Page：右窗格參數設定，左窗格圖表
資料輸入區：高 120px textarea，虛線 border，拖放高亮（--accent border）
方法選擇：radio 卡片，4 列，每卡片含名稱 + 一行說明
殘差圖：buildSVGChart，高 160px，自相關圖
擬合度：大字 badge，90%+ 綠，75-89% 黃，<75% 紅
```

**依賴模組**
`identifyARX`, `identifyARMAX`, `identifyOE`, `identifySubspace`, `autoARXOrder`, `autoModelOrder`, `residualWhitenessTest`, `crossCorrelationTest`, `buildSVGChart`, `toCSV`

**驗收標準**
- [ ] CSV 拖放可解析時間+輸出兩欄格式
- [ ] 自動選階在 500ms 內完成（n ≤ 10）
- [ ] 白化檢驗 p-value 以顏色呈現（≥0.05 綠）
- [ ] 「接受此模型」帶著參數跳轉到精靈 Step 3

---

### A1-3｜常用範例庫

**使用者故事**
我想快速載入標準控制教科書範例，作為設計起點或測試工具的基準。

**觸發位置**
SideNav「建模 → 範例庫」

**互動流程**
```
1. 分類篩選 tabs：[全部] [經典] [工業] [學術]
2. 搜尋框：即時過濾（名稱 + 描述）
3. 範例卡片列表（每卡片）：
   - 系統名稱（如「倒單擺」）
   - 階數 badge + 是否穩定 badge
   - 一行描述
   - [載入] 按鈕
4. 點擊卡片展開：
   - 數學描述（LaTeX 或文字）
   - 預覽圖（step response 縮圖，buildSVGChart 低解析度）
   - 設計挑戰說明
   - [載入此範例] 主要按鈕
```

**內建範例清單**

| 範例 | 類型 | 階數 | 穩定 |
|------|------|------|------|
| DC Motor 位置控制 | TF | 2 | ✓ |
| 質量彈簧阻尼 | TF | 2 | ✓ |
| 倒單擺（線性化） | SS | 4 | ✗ |
| 熱交換器 | TF | 1+延遲 | ✓ |
| 雙積分器 | TF | 2 | 臨界 |
| MIMO 2×2 精餾塔 | SS | 4 | ✓ |
| 靈活機械臂 | SS | 6 | ✓ |
| 磁浮系統 | SS | 4 | ✗ |

**依賴模組**
`stepResponse`, `buildSVGChart`, `tfToLatex`, `TransferFunction`, `MIMOStateSpace`

---

### A1-4｜模型健康診斷 Badge

**使用者故事**
我想在任何頁面都能一眼看到目前系統的基本特性，不必切頁面去查。

**觸發位置**
固定顯示於 TopBar Context Bar 右側，點擊展開詳情 popover

**Popover 內容**
```
模型健康報告
├── 穩定性     ✓ 穩定（RHP 極點數：0）
├── 最小相位   ✓ 最小相位
├── 可控性     ✓ 完全可控（rank = n = 4）
├── 可觀性     ✓ 完全可觀（rank = n = 4）
├── 系統階數   4
├── 極點       [-1.2, -0.8±1.2j, -5.1]
└── 直流增益   2.35
```

**視覺規格**
```
Badge（TopBar）：
  全部 OK：綠色 ● 健康
  有警告：黃色 ⚠ N 項警告
  有錯誤：紅色 ✗ N 項錯誤

Popover：
  寬 280px，--surface，8px shadow
  每行：icon + 名稱 + 狀態（對齊）
  極點清單：code 字型，每個極點一行
```

**依賴模組**
`analyzeStability`, `routhTable`, `controllabilityMatrix`, `observabilityMatrix`, `matRank`, `dcGain`, `polyroots`

---

### A2-1｜設計規格面板

**使用者故事**
我想先填入設計規格（超越量、安定時間、相位裕度等），系統自動持續追蹤每個規格是否達成。

**觸發位置**
右窗格頂部「規格」折疊面板（預設展開）

**面板內容**
```
設計規格                                    [編輯] [清除]
┌─────────────────────────────────────────────────────┐
│ 時域規格                                              │
│  超越量 OS%    ≤ [  10  ] %    → 目前: 8.3%  ✓      │
│  安定時間 Ts   ≤ [  2.0 ] s    → 目前: 1.85s ✓      │
│  上升時間 Tr   ≤ [  0.5 ] s    → 目前: 0.42s ✓      │
│  穩態誤差 ess  ≤ [  1   ] %    → 目前: 0%    ✓      │
│                                                       │
│ 頻域規格                                              │
│  相位裕度 PM   ≥ [  45  ] °    → 目前: 52.1° ✓      │
│  增益裕度 GM   ≥ [   6  ] dB   → 目前: 4.8dB ✗ −1.2│
│  頻寬 ωbw     ≥ [  5   ] r/s  → 目前: 6.2   ✓      │
│                                                       │
│ 合規摘要：6/7 通過                    [更新規格]      │
└─────────────────────────────────────────────────────┘
```

**互動細節**
- 規格值欄位：`<input type="number">` + 單位標示
- 「目前值」即時從圖表計算結果讀取（每次重繪後自動更新）
- 未達標：數值橘色 + 差距值（`+` 表示超過、`−` 表示不足）
- 合規摘要 badge 連結到 TopBar 的規格狀態

**視覺規格**
```
面板：panel() 元件，collapsible，--surface 底色
每行：display:flex，規格名 120px + input 60px + 單位 + 分隔 + 目前值 + badge
input：寬 60px，右對齊，monospace
badge：pass=--accent/9%, fail=--warning/9%，文字各自色
差距值：font-size 12px，--text-muted
```

**依賴模組**
`stepInfo`, `stabilityMargins`, `bodeData`, `sensitivityBode`

**驗收標準**
- [ ] 每次控制器參數改變後 200ms 內更新所有「目前值」
- [ ] TopBar badge 與面板合規數字同步
- [ ] 未設定的規格顯示「─」而非 0

---

### A2-2｜規格邊界線（圖表疊加）

**使用者故事**
我在看 Bode 圖時，想直接看到相位裕度和增益裕度的目標線，不必在腦中換算。

**觸發位置**
Bode / Nyquist / 根軌跡圖表，右上角「顯示規格線」toggle

**實作細節**
```
Bode 圖：
  相位圖：水平虛線 y = −180° + PM_target（橘色，label「PM 限」）
  增益圖：水平虛線 y = −GM_target dB（橘色，label「GM 限」）
  穿越頻率：垂直虛線 x = ωc（灰色）

根軌跡圖：
  阻尼比線：從原點出發兩條射線（cos(arcsin(ζ)) 角度，橘色）
  自然頻率圓：半圓弧 r = ωn（橘色虛線）
  目標區域：陰影覆蓋（可接受極點位置，半透明 --accent）

時域響應圖：
  OS% 上限：水平虛線 y = 1 + OS_target/100（橘色）
  Ts 右限：垂直虛線 x = Ts_target（橘色）
  2% 收斂帶：水平雙虛線 y = 0.98 / 1.02（灰色）
```

**依賴模組**
`buildSVGChart`（新增 `overlayLines` 選項）, `stabilityMargins`, `stepInfo`

---

### A3-1｜參數滑桿即時重繪

**使用者故事**
我想拖動 Kp / Ki / Kd 滑桿，Bode 圖和步階響應圖立刻更新，看到調參的直觀效果。

**觸發位置**
設計頁面右窗格「參數調整」區塊

**互動流程**
```
1. 每個參數顯示：
   [Kp] ──●────────── [0.1] [min:0.01] [max:100] [步長:0.01]

2. 拖動滑桿（或輸入數值）：
   → 防抖 50ms（使用 requestAnimationFrame）
   → 重新計算：closedLoopTransferFromStateFeedback / pidToTransferFunction
   → 更新所有連結圖表（時域 + Bode + 根軌跡）
   → 更新規格面板的「目前值」
   → StatusBar 顯示「計算中…」→「完成（12ms）」

3. 對數/線性切換：每個滑桿可切換（log 刻度用於跨數量級調整）

4. 重置按鈕：回到初始值
5. 鎖定按鈕：鎖定某參數不隨聯動調整
```

**滑桿視覺規格**
```
容器：寬 100%，height 40px
軌道：高 4px，--surface-2，border-radius pill
填滿段：--accent 色（0 到目前值）
拇指：16px 圓形，--accent，border 2px white，box-shadow
數值 input：寬 72px，右側，monospace，可直接鍵入
Log/Lin toggle：小 toggle，12px，右對齊
標籤：左側 60px，--text-muted，12px
```

**效能要求**
- 拖動時每幀計算時間 < 16ms（確保 60fps）
- 若計算 > 16ms，降為每 2 幀更新一次
- 複雜計算（MPC / H∞）改為防抖 200ms + 顯示 spinner

**依賴模組**
`PIDController`, `closedLoopTransferFromStateFeedback`, `stepResponse`, `bodeData`, `rootLocusData`, `stepInfo`, `stabilityMargins`

**驗收標準**
- [ ] 滑桿拖動時圖表重繪延遲 < 50ms（PID 系統）
- [ ] 對數刻度在極值端（1e-3 至 1e3）仍可精確拖移
- [ ] 數值輸入框 Enter 後效果等同滑桿更新

---

### A3-2｜根軌跡拖曳極點

**使用者故事**
我想直接在根軌跡圖上拖曳極點到目標位置，工具自動反算對應的控制器增益。

**觸發位置**
根軌跡分析頁面，點擊「互動模式」啟用

**互動流程**
```
1. 根軌跡圖上顯示閉迴路極點（根據目前增益 K）
2. 游標靠近極點 → 極點高亮 + 游標變 crosshair
3. 按下拖曳 → 極點跟著游標移動
4. 即時顯示：
   - 目前 K 值（反算）
   - 閉迴路所有極點位置
   - 阻尼比 ζ 和自然頻率 ωn（tooltip）
5. 放開 → 固定此 K 值，更新滑桿 + 規格面板
6. 無效位置（不在根軌跡上）→ 極點變紅 + tooltip 說明
```

**視覺規格**
```
極點圖示：× 標記，8px，hover 放大到 12px
拖曳中：× 實心填滿 --accent，帶 4px 陰影圈
軌跡線：細線 1px，顏色循環（多分支）
當前極點虛線路徑：虛線從 OL 極點到目前位置
K 值浮動 badge：跟著極點移動，黑底白字，12px
```

**依賴模組**
`rootLocusData`, `sortRootLocusBranches`, `rootLocusBreakPoints`, `placeStateFeedback`, `polyroots`, `createZoomState`

---

### A3-3｜Bode 圖拖移折點

**使用者故事**
設計 Lead/Lag 補償器時，我想直接在 Bode 圖上拖移折點頻率，而不是填數字。

**觸發位置**
Bode 圖補償器設計模式（工具列「補償器」按鈕啟用）

**互動流程**
```
1. Bode 圖上顯示補償器的零點、極點頻率標記（垂直虛線）
2. 拖移垂直虛線 → 更新折點頻率
3. 對應增益圖的斜率段即時更新（+20dB/dec 等）
4. 右側即時顯示：Lead 角 / 補償量（dB）/ PM 改善量
5. 最終 Bode 為原系統 + 補償器疊加
```

**依賴模組**
`leadLagTransferFunction`, `designLeadCompensator`, `designLeadLagCompensator`, `bodeData`, `stabilityMargins`

---

### A3-4｜調參歷史 Undo/Redo

**使用者故事**
我試了一個參數組合效果不好，想回到上一步，或比較前後兩個設定的差異。

**互動細節**
```
儲存觸發：
  - 滑桿拖動結束（mouseup）
  - 數值輸入 Enter
  - 「應用設計」按鈕

歷史面板（側邊折疊）：
  每筆紀錄：
    [時間戳] [設計方法 chip] [主要參數摘要] [規格合規 badge]
    hover → 預覽 tooltip（小圖）

操作：
  - Ctrl+Z / ⌘+Z → Undo（最多 50 步）
  - Ctrl+Shift+Z / ⌘+Shift+Z → Redo
  - 點擊任意歷史紀錄 → 恢復到該狀態
  - [對比] 選兩筆 → 並排顯示圖表差異
  - [命名] → 為某個版本加星號並命名
```

**視覺規格**
```
歷史面板：右側抽屜，寬 240px，折疊時只顯示 40px tab
每筆紀錄高 40px，hover 底色 --surface-2
目前狀態：左側 3px --accent bar
星號版本：⭐ 圖示，置頂或高亮
```

**依賴模組**
無新依賴，實作為前端狀態管理（history stack，JSON 快照）

---

### A4-1｜designWizard 嵌入主流程

**使用者故事**
我描述完系統和需求，工具推薦最適合的控制策略，並說明為什麼。

**觸發位置**
設計頁面頂部「推薦策略」按鈕（首次進入設計頁自動展開）

**互動流程**
```
1. 自動讀取目前系統特性（階數、穩定性、MIMO/SISO）
2. 詢問幾個簡短問題（radio 選擇）：
   - 主要目標：[追蹤 setpoint] [干擾抑制] [兩者兼顧]
   - 是否有約束：[無] [輸入約束] [狀態約束]
   - 計算資源：[充裕（PC）] [有限（MCU）]
   - 是否需要穩健性：[否] [是（不確定模型）]
3. 顯示推薦結果：
   ┌─────────────────────────────────────────┐
   │ 推薦：LQR/LQG                     ★ 最適 │
   │ 理由：穩定 4 階系統，有 Kalman 可用       │
   │ 複雜度：中  穩健性：中  計算量：低         │
   │ [開始設計 LQR]                           │
   ├─────────────────────────────────────────┤
   │ 備選：H∞ 混合靈敏度              ○ 次選 │
   │ 備選：PID + Lead                 ○ 次選 │
   └─────────────────────────────────────────┘
4. 點「開始設計」→ 跳轉到對應設計頁，並預填入系統資訊
```

**依賴模組**
`designWizard`, `renderWizardPanel`, `buildWizardForm`, `analyzeStability`, `controllabilityMatrix`, `observabilityMatrix`

---

### A5-1｜閉迴路三窗格並排

**使用者故事**
驗證控制器時，我想同時看到時域步階響應、Bode 圖和 Nyquist 圖，不必反覆切頁。

**觸發位置**
「分析 → 綜合驗證」或主工作區右上角「3 窗格」按鈕

**佈局**
```
┌──────────────┬──────────────┬──────────────┐
│  步階響應     │  Bode 圖     │  Nyquist 圖  │
│  buildSVG    │  buildSVG    │  buildSVG    │
│              │              │              │
│  OS: 8.3%   │  PM: 52°     │  GM: 6.2dB  │
│  Ts: 1.85s  │  GM: 6.2dB  │              │
└──────────────┴──────────────┴──────────────┘
  [靈敏度 S]  [補靈敏度 T]  [KS]  三個額外圖切換 tab
```

**互動細節**
- 三圖共用同一個「當前頻率」游標（垂直線同步）
- Bode 圖 hover 某頻率 → Nyquist 游標跳到對應點
- 每個圖右上角有「展開」按鈕 → 切換到全螢幕模式

**依賴模組**
`stepResponse`, `stepInfo`, `bodeData`, `nyquistData`, `sensitivityAt`, `sensitivityBode`, `stabilityMargins`, `buildSVGChart`, `createZoomState`

---

## 3｜B 族群 — 分析研究者

---

### B1-1｜比較模式（疊加圖）

**使用者故事**
我設計了 PID 和 LQR 兩個控制器，想在同一張 Bode 圖上比較，並且看到指標差異。

**觸發位置**
圖表右上角「+ 比較」按鈕，或「分析 → 多方案比較」頁面

**互動流程**
```
1. 點「+ 比較」→ 開啟設計選取器
2. 勾選 1–4 個已存設計（checkbox 列表）
3. 所有選中設計以不同顏色疊加顯示
4. 圖例：[■ PID-v1] [■ LQR] [■ H∞] 可勾選隱藏
5. 游標懸停 → 每條線都顯示讀值（垂直游標線）
6. 指標比較表自動顯示在圖表下方（B1-2）
```

**顏色分配**
自動使用 §0.6 八色循環，第一個設計固定 --accent（綠），其餘循環

**依賴模組**
`buildSVGChart`（多系列支援）, `stepInfo`, `stabilityMargins`

---

### B1-2｜指標比較表

**表格規格**
```
┌───────────────┬──────────┬──────────┬──────────┐
│ 指標           │ PID-v1   │ LQR      │ H∞       │
├───────────────┼──────────┼──────────┼──────────┤
│ 超越量 OS%    │ 8.3%     │ 2.1% ★   │ 5.4%     │
│ 安定時間 Ts   │ 1.85s    │ 0.92s ★  │ 1.23s    │
│ 相位裕度 PM   │ 52.1°    │ 61.3° ★  │ 48.2°    │
│ 增益裕度 GM   │ 4.8dB    │ 8.1dB ★  │ 12.3dB   │
│ ‖G‖∞          │ 1.23     │ 0.98 ★   │ 0.87 ★   │
│ ‖G‖H          │ 0.41     │ 0.31 ★   │ 0.29 ★   │
└───────────────┴──────────┴──────────┴──────────┘
  ★ = 各列最佳值
```

**視覺規格**
- 最佳值：`★` 標記 + 底色 `--accent/8%`
- 次佳值：底色 `--accent-blue/6%`
- 超出規格值：底色 `--error/8%`
- 表格可排序（點擊欄位名）
- 可匯出為 CSV（呼叫 `toCSV`）

---

### B2-1｜矩陣展開面板

**使用者故事**
設計完狀態空間控制器後，我要查看 A、B、C、D 矩陣的實際數值，並複製貼到報告中。

**觸發位置**
「系統資訊」折疊面板（右窗格底部）

**面板內容**
```
系統矩陣                              [複製 JSON] [複製 LaTeX]
A (4×4)                              [摺疊 ▲]
┌                              ┐
│  -1.200   0.500   0     0   │
│  -0.500  -3.000   0     0   │
│   0       0      -5.000 0   │
│   0       0       0    -2.0 │
└                              ┘
條件數: 8.23   det: 18.00   正定: ✓

B (4×1)   C (1×4)   D (1×1)   [展開各矩陣 ▼]
```

**互動細節**
- 數值 hover → 顯示 tooltip（行列座標、精確浮點值）
- 大矩陣（> 8×8）預設摺疊，顯示「點擊展開」
- 「複製 LaTeX」→ 呼叫 `polyToLatex` 轉換後複製到剪貼簿
- 正定性以顏色 badge：正定（綠）/ 半正定（黃）/ 否（紅）

**依賴模組**
`matDet`, `matInverse`, `matIsPositiveDefinite`, `matRank`, `polyToLatex`

---

### B2-2｜Hankel 奇異值長條圖

**使用者故事**
做模型縮減時，我想直觀地看到哪些 Hankel 奇異值明顯小，幫助決定截斷點。

**觸發位置**
「分析 → 模型縮減」頁面

**圖表規格**
```
縱軸：HSV 值（對數刻度）
橫軸：模態序號 1, 2, 3, …
長條：漸層色（大→小，--accent → --text-muted）
截斷點：垂直分隔線 + 「保留 k=N 個模態」標示
能量比：長條上方顯示「佔 98.5%」等累積能量

游標 hover 長條：
  tooltip：「σ₂ = 0.0823（佔 12.3%）」
  同步高亮右側 step response 對比圖（原系統 vs 縮減系統）

截斷點滑桿：
  拖移 → 即時重新計算縮減系統 + 更新右側比較圖
```

**依賴模組**
`hankelSingularValues`, `hankelNorm`, `hankelNormApprox`, `balancedTruncation`, `buildSVGChart`, `stepResponse`

---

### B2-3｜極零點地圖（可縮放）

**視覺規格**
```
底圖：複數平面，實軸/虛軸，單位圓（離散系統）
極點：× 標記，8px，顏色對應系統（比較模式時多色）
零點：○ 標記，8px
不穩定極點（RHP）：× 標記紅色 + 陰影
游標 hover：
  tooltip：「極點: -1.20 + 1.20j | ζ=0.71 | ωn=1.70 r/s」
  同步：Bode 圖上標示對應頻率（垂直線）

縮放：滾輪縮放，拖移平移（createZoomState + windowData）
重置：雙擊回到「顯示所有極零點」的適配視角
工具列：[原始系統] [補償器] [閉迴路] 三層切換
```

**依賴模組**
`polyroots`, `rootLocusData`, `createZoomState`, `windowData`, `buildSVGChart`, `parseComplexRoot`

---

### B3-4｜SVG/PNG 匯出

**使用者故事**
我要把 Bode 圖插到論文裡，需要向量圖（SVG）或高解析度點陣圖（PNG）。

**觸發位置**
每個圖表右上角 `↓` 按鈕 → 下拉選單

**選項**
```
[↓ 匯出圖表]
  ○ SVG（向量，適合論文）
  ○ PNG 300dpi
  ○ PNG 150dpi
  ○ 資料 CSV（x,y 數值）
  ○ 資料 JSON

選項：
  □ 包含圖例
  □ 淺色背景（print-friendly）
  □ LTTB 降採樣（閾值: [1000] 點）
  [匯出]
```

**依賴模組**
`toCSV`, `toJSON`, `downsampleLTTB`, `buildSVGChart`（新增 export 選項）

---

### B4-3｜python-control 橋接面板

**使用者故事**
我的主要工作流程在 Python，想把 ControlStudio 的設計匯出到 python-control，或把 Python 的系統匯入進來。

**觸發位置**
「輸出 → python-control 橋接」

**面板佈局**
```
┌────────────────────┬────────────────────┐
│ 從 Python 匯入      │ 匯出到 Python       │
│                    │                    │
│ [貼入 JSON]        │ 目前系統 JSON:      │
│ {                  │ {                  │
│   "type": "tf",    │   "type": "ss",    │
│   "num": [...],    │   "A": [...],      │
│   "den": [...]     │   ...              │
│ }                  │ }                  │
│                    │                    │
│ [解析並載入]        │ [複製] [下載 .json] │
│                    │                    │
│ Python 程式碼示例:  │ Python 程式碼示例:  │
│ ────────────────── │ ────────────────── │
│ import control     │ import control     │
│ sys = control.tf(  │ import json        │
│   [1],[1,2,1])     │ data = json.load(  │
│                    │   open('sys.json'))│
└────────────────────┴────────────────────┘
```

**依賴模組**
`toPythonControl`, `fromPythonControl`

---

### B4-4｜LaTeX 符號生成

**使用者故事**
我要把系統矩陣貼到論文的 LaTeX 原始碼，希望自動生成正確的 pmatrix 格式。

**觸發位置**
矩陣展開面板「複製 LaTeX」按鈕 / 「工具 → LaTeX 生成器」

**生成內容**
```
傳遞函數：
  G(s) = \frac{s + 2}{s^2 + 3s + 2}

狀態空間（pmatrix）：
  A = \begin{pmatrix} -1.2 & 0.5 \\ -0.5 & -3.0 \end{pmatrix}

PID（帶參數）：
  C(s) = K_p \left(1 + \frac{1}{T_i s} + T_d s\right)
  \quad K_p=2.5,\ T_i=1.2,\ T_d=0.3
```

**依賴模組**
`tfToLatex`, `polyToLatex`, `renderLatex`, `pidToLatex`

---

## 4｜C 族群 — 學習者

---

### C2-1｜四步驟 Wizard 進度條

**使用者故事**
我第一次用這個工具，想跟著步驟完成一個完整的 PID 設計，不會迷失在功能選單裡。

**Wizard 流程**
```
Step 1 建模                Step 2 規格               Step 3 設計              Step 4 驗證
[○]──────────────[○]──────────────[○]──────────────[●]
輸入系統模型      設定效能規格      選擇並調整控制器     確認並輸出

每步內容：
Step 1：觸發 A1-1 系統輸入精靈
Step 2：觸發 A2-1 規格面板（有引導說明）
Step 3：推薦 PID，顯示 A3-1 滑桿
Step 4：顯示 A5-1 三窗格驗證 + C5-1 報告按鈕
```

**視覺規格**
```
進度條：頂部橫跨，高 8px，已完成段 --accent，未完成 --border
步驟標記：24px 圓，已完成 ✓ --accent，目前 ● --accent，未到 ○ --border
步驟名稱：12px，已完成 --accent，目前 --text-primary，未到 --text-muted
「下一步」按鈕：右下角 primary，「上一步」ghost
右上角「跳過精靈」link（小字，--text-muted）
```

**依賴模組**
`renderWizardPanel`, `renderWorkflowStep`, `buildWizardForm`

---

### C2-2｜欄位 Hint 氣泡

**實作規格**
```
觸發：input focus 或 hover ⓘ 圖示
Popover 位置：欄位右側（或下方，不超出視窗）

內容結構（Kp 示例）：
┌──────────────────────────────────────┐
│ ⓘ 比例增益 Kp                        │
│──────────────────────────────────────│
│ 控制器輸出 = Kp × 誤差               │
│                                      │
│ 常用範圍：0.1 – 100                   │
│ 太大 → 超越量↑、可能不穩定             │
│ 太小 → 響應緩慢                       │
│                                      │
│ [查看根軌跡影響]                      │
└──────────────────────────────────────┘
寬 260px，--surface，border --border，8px padding
```

**依賴模組**
`formField`（擴充 hint 參數）, `liveRegion`

---

### C3-1｜極點拖曳動畫

**使用者故事**
我在學習極點位置對時域響應的影響，想拖動極點，同時看步階響應即時變化。

**互動規格**
```
左：S 平面（複數平面），顯示 2-4 個可拖曳極點
右：步階響應圖（即時更新）

拖曳細節：
  snap-to-real-axis：按住 Shift → 極點被強制吸附到實軸
  snap-to-conjugate：複數極點自動保持共軛（拖一個，另一個鏡像移動）
  越過虛軸 → 極點變紅 + alert「系統不穩定！」
  進入 RHP → 步階響應圖顯示發散（截斷 y 軸）

教學疊加：
  ζ 等高線（固定阻尼比的拋物線，--text-muted 虛線）
  ωn 等高線（固定自然頻率的半圓，--text-muted 虛線）
  hover 等高線 → tooltip 說明「此線上：ζ = 0.707」
```

**效能要求**
極點更新 → 步階響應重繪 < 30ms（2階系統）

**依賴模組**
`polyroots`, `simulateTimeResponse`, `stepResponse`, `buildSVGChart`, `createZoomState`

---

### C3-4｜Nyquist 動畫

**使用者故事**
我看不懂靜態的 Nyquist 圖，想看頻率從低到高掃描的動畫，理解圖形怎麼畫出來的。

**動畫規格**
```
播放控制列：[▶ 播放] [⏸] [⏮ 重置] 進度條 [速度 1× ▾]
Nyquist 圖：
  已走過的路徑：實線 --accent
  未走過的路徑：虛線 --text-muted
  游標點：8px 圓，--accent，帶頻率標示「ω = 2.3 r/s」
  同步 Bode 圖游標（垂直線跟著走）

頻率標示：
  每個十倍頻放一個小標 ω=0.1, 1, 10, …
  掃描到 -1 點附近時放大 + 閃爍提示
  圍繞 -1 點的次數 → 右上角即時顯示「繞行次數：N」

速度選項：0.25× / 0.5× / 1× / 2× / 5×（對應實際 ω sweep 步數）
```

**依賴模組**
`nyquistData`, `nyquistEncirclements`, `autoFreqRange`, `buildSVGChart`

---

### C5-1｜設計報告一鍵生成

**使用者故事**
我做完控制器設計作業，想一鍵生成包含所有圖表和計算結果的 HTML 報告繳交。

**生成流程**
```
1. 點擊「生成報告」→ 設定 modal：
   [報告標題]    [學生/作者姓名]    [日期 auto]
   [包含章節] □ 系統描述 □ 規格 □ 設計過程 □ 驗證圖表 □ 程式碼
   [圖表主題] ○ Dark ○ Light（Light 較適合列印）
   [語言] ○ 繁體中文 ○ English
   [生成]

2. 呼叫 generateDesignReport(design, opts)

3. 輸出預覽（iframe 或新分頁）：
   封面：標題、作者、日期、ControlStudio 標誌
   § 1 系統描述：TF/SS、模型健康診斷
   § 2 設計規格：規格表（含通過/未過狀態）
   § 3 設計過程：designWizard 推薦說明 + 參數調整歷史
   § 4 驗證：步階響應、Bode、Nyquist 圖（SVG 內嵌）
   § 5 結論：指標摘要表
   附錄：程式碼（若勾選）

4. [下載 HTML] [列印]
```

**依賴模組**
`generateDesignReport`, `buildSVGChart`, `stepInfo`, `stabilityMargins`, `exportController`

---

## 5｜D 族群 — 實作工程師

---

### D1-1~4｜程式碼生成面板

**使用者故事**
設計完 PID 後，我要直接取得可以貼到嵌入式 C 專案的程式碼。

**面板佈局**
```
程式碼生成
┌─────────────────────────────────────────────────────────┐
│ 目標語言：[C] [Python] [MATLAB]    □ 固定點  □ 含標頭檔  │
│ 命名慣例：[camelCase ▾]   採樣時間 Ts：[0.01] s          │
├─────────────────────────────────────────────────────────┤
│  1  /* ControlStudio PID — auto-generated 2026-05-21 */ │
│  2  typedef struct {                                     │
│  3    float kp, ki, kd;                                  │
│  4    float integral, prev_err;                          │
│  5  } PID_t;                                             │
│  6                                                       │
│  7  float pid_update(PID_t *c, float err, float dt) {   │
│  8    c->integral += err * dt;                           │
│  9    float d = (err - c->prev_err) / dt;               │
│ 10    c->prev_err = err;                                 │
│ 11    return c->kp*err + c->ki*c->integral + c->kd*d;   │
│ 12  }                                                    │
├─────────────────────────────────────────────────────────┤
│ ⚠ 增益裕度 4.8dB 低於建議值 6dB，請謹慎使用             │
│ [複製全部] [下載 pid_controller.c]                       │
└─────────────────────────────────────────────────────────┘
```

**視覺規格**
```
程式碼區：--code-bg，monospace 13px，行號 --text-muted，syntax highlight
語言 tabs：[C] [Python] [MATLAB]，切換即時更新
warnings[] 區：--warning/10% 底色，⚠ 圖示，每條一行
「下載」按鈕：顯示檔案名預覽
```

**語言對應**

| 控制器類型 | C 輸出 | Python 輸出 | MATLAB 輸出 |
|------------|--------|-------------|-------------|
| PID | 結構體 + update() | class PID | ss/tf + feedback |
| SS/LQR | 矩陣定義 + step | ss() + lqr() | ss + lqr |
| H∞ | ss 矩陣 | control.ss | hinfsyn |
| MPC | 暫不支援 C | matrix define | mpc toolbox |

**依賴模組**
`exportController`, `toMatlabScript`, `toPythonScript`, `downloadScript`, `fmtNum`

---

### D2-1~4｜離散化工具

**面板佈局**
```
離散化工具
系統頻寬：3.2 r/s   → 建議取樣頻率 ≥ 32 r/s → Ts ≤ 0.196 s
使用 Ts：[0.05] s  (×10 倍頻寬，保守)

離散化方法比較：
┌──────────┬──────────┬──────────┬──────────┐
│ 方法      │ 穩定極點  │ DC 增益   │ 相位誤差  │
├──────────┼──────────┼──────────┼──────────┤
│ ZOH       │ 全在單位圓│ 精確      │ 最小 ✓   │
│ Tustin    │ 全在單位圓│ 近似      │ 中等      │
│ 向前差分   │ ⚠ 可能不穩│ 近似      │ 最大 ✗   │
│ 向後差分   │ 全在單位圓│ 近似      │ 中等      │
└──────────┴──────────┴──────────┴──────────┘
→ 推薦 ZOH

z-domain Bode：[連續 (s)] [離散 ZOH] [離散 Tustin] 疊加顯示
```

**依賴模組**
`c2dZOH`, `c2dTustin`, `c2dTustinPrewarp`, `c2dMatchedZ`, `d2cTustin`, `bodeData`, `discreteBodeData`, `buildSVGChart`

---

### D4-1｜單元測試樣板生成

**使用者故事**
我實作完 C 控制器，想快速生成 GTest 測試案例，驗證數值和 ControlStudio 計算結果一致。

**生成內容示例（GTest）**
```cpp
// AUTO-GENERATED by ControlStudio D4-1
// System: DC Motor Position | Controller: PID
// Generated: 2026-05-21

#include <gtest/gtest.h>
#include "pid_controller.h"

TEST(PIDController, StepResponse_SettlingTime) {
  PID_t pid = {.kp=2.5, .ki=1.2, .kd=0.3};
  float t = 0, err = 1.0f;
  // Simulate 200 steps at Ts=0.01s
  for (int i = 0; i < 200; i++) {
    float u = pid_update(&pid, err, 0.01f);
    // ... (plant simulation omitted)
    t += 0.01f;
  }
  // ControlStudio reference: Ts = 1.85s
  EXPECT_NEAR(settling_time, 1.85f, 0.10f);
}

TEST(PIDController, DCGain) {
  // Expected DC gain: 1.00 (unity for type-1 system)
  EXPECT_NEAR(compute_dc_gain(), 1.0f, 0.01f);
}
```

**依賴模組**
`stepInfo`, `fmtNum`, `exportController`（新增 `test` 目標選項）

---

### D5-2｜反饋迴路接線圖（SVG）

**使用者故事**
我要在文件中貼一張清楚的閉迴路方塊圖，不想手繪。

**生成示例（SVG 內嵌）**
```
r(t) ──►[+]──►[ Controller C(s) ]──►[ Plant G(s) ]──► y(t)
        [-]◄──────────────────────────────────────────┘
              （負回授）

MIMO：自動顯示多輸入輸出分支
帶干擾：在 Plant 輸入端加 d(t) 加法點
帶觀測器：在回授路徑加 [ Observer L ]
```

**依賴模組**
`buildSVGChart`（新增 block diagram 模式）/ 或直接生成 SVG 字串

---

## 6｜E 族群 — 技術決策者

---

### E1-1~3｜儀表板總覽

**頁面佈局**
```
儀表板                                          [更新] [匯出報告]
┌──────────────────────────────────────────────────────────────┐
│ 專案：DC Motor Position Controller v2.3                       │
│ 系統：2 階，穩定  |  控制器：PID  |  最後更新：今天 14:23      │
├────────────────┬────────────────┬────────────────────────────┤
│ 規格合規        │ 效能摘要        │ 版本趨勢                    │
│                │                │                            │
│  7/8 通過 ✓   │  OS%:  8.3%   │ ▁▃▅▇█ OS% 歷史（下降好）    │
│  GM 未達標 ⚠  │  Ts:   1.85s  │ ▃▅▇██ PM 歷史（上升好）      │
│               │  PM:   52.1°  │                            │
│ [規格詳情]     │  GM:   4.8dB  │ v1.0 → v2.3 改善 34%        │
│               │ [完整分析]     │ [版本比較]                   │
└────────────────┴────────────────┴────────────────────────────┘
```

**依賴模組**
`stepInfo`, `stabilityMargins`, `sensitivityAt`

---

### E2-2｜雷達圖（多維度比較）

**圖表規格**
```
五軸：效能（OS%/Ts）/ 穩健性（PM/GM）/ 帶寬 / 複雜度 / 計算量
每個設計一條多邊形，不同顏色

軸說明：
  效能：Ts=0.5s → 100，Ts=5s → 0（歸一化）
  穩健性：PM≥60° → 100，PM<30° → 0
  帶寬：相對目標帶寬的比例
  複雜度：1/控制器階數（階數越低 → 複雜度越低 → 分數越高）
  計算量：1/FLOP count 估算（越少越好）
```

**依賴模組**
`buildSVGChart`（新增 radar chart type）, `stepInfo`, `stabilityMargins`

---

### E3-1~3｜報告輸出系統

**報告元資料欄位**
```
標題：[input]          副標題：[input]
作者/設計者：[input]   審核者：[input]   日期：[auto/可改]
專案編號：[input]      版本：[input]      機密等級：[公開/內部/機密]
```

**機密等級視覺**
```
公開：無浮水印
內部：每頁對角線「INTERNAL」，--text-muted，30% 透明
機密：每頁對角線「CONFIDENTIAL」，--warning，50% 透明
```

**PDF 列印 CSS**
```css
@media print {
  nav, .side-panel, .status-bar { display: none !important; }
  .chart-container { page-break-inside: avoid; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  body { background: #fff; color: #000; }
}
```

**依賴模組**
`generateDesignReport`（擴充 opts.watermark, opts.metadata, opts.printCSS）

---

## 7｜F — 全局架構改善

---

### F1-1｜左側四層導覽列 — 詳細規格

```
SideNav 元件結構
├── Logo 區 [高 52px，border-bottom]
│     [CS icon 24px] ControlStudio
│
├── 導覽群組列表
│   NavGroup：
│     header：[group-icon 16px] [group-name 14px 600] [▶/▼ 12px]
│     子項：[16px indent] [item-icon 14px] [item-name 13px]
│
└── 底部工具 [border-top]
      [⚙ 設定] [? 說明] [API 文件 (P28-02)]
```

**CSS 規格**
```css
.nav-group-header {
  padding: 6px 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
.nav-item {
  padding: 5px 12px 5px 28px;
  font-size: 13px;
  border-radius: 4px;
  color: var(--text-muted);
  transition: background 100ms, color 100ms;
}
.nav-item:hover  { background: var(--surface-2); color: var(--text-primary); }
.nav-item.active { background: var(--surface-2); color: var(--text-primary);
                   box-shadow: inset 3px 0 0 var(--accent); }
```

---

### F2-1｜可分割工作區

**分隔線規格**
```
.workspace-divider {
  width: 8px;                     /* 水平分割則高 8px */
  background: var(--border);
  cursor: col-resize;             /* 水平：row-resize */
  flex-shrink: 0;
  transition: background 100ms;
  position: relative;
}
.workspace-divider:hover,
.workspace-divider.dragging {
  background: var(--accent);
}
/* 中心線（視覺提示） */
.workspace-divider::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 2px; height: 32px;
  background: var(--text-muted);
  border-radius: 1px;
}
```

**行為**
- 最小窗格寬度 240px（防止壓縮到無法使用）
- 拖移途中以 `requestAnimationFrame` 更新（避免抖動）
- 雙擊分隔線 → 50%/50% 重置
- 儲存比例到 localStorage（刷新後恢復）

---

### F3-1｜全域狀態列

**HTML 結構**
```html
<footer role="status" aria-live="polite" class="status-bar">
  <span class="status-indicator" data-state="idle|computing|done|warn|error"></span>
  <span class="status-text"></span>
  <span class="status-progress" hidden>
    <progress max="100" value="0"></progress>
  </span>
  <span class="status-spacer"></span>
  <span class="status-time"></span>
  <span class="status-symbols">333 符號</span>
</footer>
```

**狀態轉換**

| 狀態 | 圖示 | 文字 | 顏色 | 持續 |
|------|------|------|------|------|
| idle | `─` | 就緒 | --text-muted | 常駐 |
| computing | ⟳ spin | 計算中… | --accent-blue | 計算中 |
| progress | ⟳ + 進度條 | 計算中（45%）| --accent-blue | 計算中 |
| done | ✓ | 完成（85ms）| --accent | 3s 後→idle |
| warning | ⚠ | 增益裕度不足 | --warning | 常駐，可關閉 |
| error | ✗ | 矩陣奇異 [詳細] | --error | 常駐，可關閉 |

**依賴模組**
`spinner`（components.js）, `progressBar`, `liveRegion`（自動 aria-live）

---

### F4-1~4｜主題與視覺系統

**三主題切換**

```javascript
// 切換邏輯（對應 theme.js）
function setTheme(name) {           // 'dark' | 'light' | 'print'
  const vars = buildCSSVars(name);
  document.documentElement.style.cssText = vars;
  document.body.dataset.theme = name;
  localStorage.setItem('cs-theme', name);
}

// 初始化
const saved = localStorage.getItem('cs-theme') || detectTheme();
setTheme(saved);
```

**Print 主題額外 token**
```
--bg: #ffffff
--surface: #ffffff
--border: #cccccc
--text-primary: #000000
--text-muted: #555555
--accent: #1a7f37
// 圖表配色調整為印刷友好（深色，高對比）
```

**prefers-reduced-motion 支援**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### F5-1｜完整鍵盤導覽規格

| 快捷鍵 | 動作 |
|--------|------|
| `Tab` / `Shift+Tab` | 焦點前進/後退 |
| `Enter` / `Space` | 啟動按鈕、checkbox |
| `Escape` | 關閉 modal / popover / 全螢幕 |
| `↑↓` | 在 nav 群組內移動、下拉選項 |
| `←→` | 切換 tabs |
| `Ctrl+Z` | Undo 調參 |
| `Ctrl+Shift+Z` | Redo 調參 |
| `Ctrl+S` | 儲存目前設計 |
| `Ctrl+E` | 匯出程式碼 |
| `Ctrl+P` | 列印/生成報告 |
| `F11` | 圖表全螢幕 |
| `G` `M` `D` `A` `O` | 跳至 建模/設計/分析/輸出（按下 SideNav 群組）|

**焦點環 CSS（對應 a11y.js focusRingCSS）**
```css
:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
  border-radius: 2px;
}
```

---

## 8｜新元件需求（對應 js/ui/ 擴充）

現有元件無法直接覆蓋的 UI 模式，需要新增：

| 元件 | 用途 | 涉及功能 |
|------|------|---------|
| `slider(value, opts)` | 參數調整滑桿（log/lin，含 input sync） | A3-1 |
| `splitPane(left, right, opts)` | 可拖移分割工作區 | F2-1 |
| `codeBlock(code, lang)` | syntax highlight 程式碼區塊 | D1-2 |
| `radarChart(axes, series)` | 多維度比較雷達圖 | E2-2 |
| `timelineList(items)` | 版本歷史時間軸 | E1-3, A3-4 |
| `matrixGrid(data, opts)` | 矩陣數值表格（條件數、正定性） | B2-1 |
| `barChart(values, labels)` | Hankel 奇異值長條圖 | B2-2 |
| `complexPlane(poles, zeros, opts)` | 極零點地圖（可縮放） | B2-3 |
| `draggablePlane(opts)` | 可拖曳複數平面（極點互動） | A3-2, C3-1 |
| `animatedPath(points, opts)` | Nyquist 動畫播放器 | C3-4 |
| `notification(msg, variant)` | 浮動通知 toast（3s 自動消失） | 全局 |
| `contextMenu(items)` | 右鍵選單（圖表操作） | 圖表全局 |
| `tooltipPopover(anchor, content)` | 智慧定位 tooltip | hint 氣泡全局 |

---

## 9｜優先順序詳表（依影響力 × 工程成本）

### P1 — 立即實作（影響最廣，成本可控）

| 項目 | 涉及元件 | 估計工時 | 影響族群 |
|------|---------|---------|---------|
| F1-1 四層導覽列 | SideNav 重構 | 2d | 全部 |
| F3-1 全域狀態列 | StatusBar + liveRegion | 1d | 全部 |
| A2-1 設計規格面板 | panel + formField + badge | 2d | A、E |
| A3-1 參數滑桿（新 slider 元件） | slider + RAF 即時更新 | 3d | A、C |
| D1-1~4 程式碼生成面板 | codeBlock（已有 exportController） | 2d | D |
| F4-1 三主題切換 UI | 已有 theme.js，補 toggle UI | 1d | 全部 |

### P2 — 第二波（高 UX 價值，中等工程成本）

| 項目 | 涉及元件 | 估計工時 | 影響族群 |
|------|---------|---------|---------|
| A1-1 系統輸入精靈 | modal + tabs + formField | 3d | A、C |
| B2-2 Hankel 奇異值長條圖 | barChart + 截斷滑桿 | 2d | B |
| B2-3 極零點地圖 | complexPlane + createZoomState | 3d | A、B |
| C2-1 四步驟 Wizard | renderWizardPanel 整合 | 2d | C |
| A5-1 三窗格驗證 | splitPane × 3 + 同步游標 | 3d | A、B |
| B1-1~2 比較模式 + 指標表 | buildSVGChart 多系列 + table | 2d | B、E |
| F2-1 可分割工作區 | splitPane | 2d | 全部 |

### P3 — 第三波（專化功能，依資源排程）

| 項目 | 涉及元件 | 估計工時 | 影響族群 |
|------|---------|---------|---------|
| C3-1 極點拖曳動畫 | draggablePlane + 即時 step | 4d | C、A |
| C3-4 Nyquist 動畫 | animatedPath | 3d | C |
| A3-2 根軌跡拖曳 | draggablePlane + 反算 K | 4d | A |
| E2-2 雷達圖 | radarChart | 2d | E |
| E1-1 儀表板 | 整合多模組輸出 | 3d | E |
| D4-1 測試樣板生成 | exportController 擴充 | 2d | D |
| B4-4 LaTeX 生成器 | 已有 tfToLatex，補 UI | 1d | B |

---

## 10｜功能完整索引（69 項）

### A — 控制設計者 (17)
A1-1 系統輸入精靈 · A1-2 SysID 入口 · A1-3 範例庫 · A1-4 模型健康診斷 badge  
A2-1 設計規格面板 · A2-2 規格邊界線 · A2-3 規格合規 indicator  
A3-1 參數滑桿即時重繪 · A3-2 根軌跡拖曳極點 · A3-3 Bode 拖移折點 · A3-4 調參歷史 Undo/Redo  
A4-1 designWizard 嵌入 · A4-2 方法複雜度標籤 · A4-3 推薦說明面板  
A5-1 三窗格並排 · A5-2 靈敏度一鍵繪製 · A5-3 穩健性 badge

### B — 分析研究者 (17)
B1-1 比較模式疊加圖 · B1-2 指標比較表 · B1-3 差異 highlight  
B2-1 矩陣展開面板 · B2-2 Hankel 奇異值長條圖 · B2-3 極零點地圖 · B2-4 Gramian SVD 詳細頁  
B3-1 軸範圍手動設定 · B3-2 游標讀值 readout · B3-3 圖表主題切換 · B3-4 SVG/PNG 匯出  
B4-1 CSV 匯入 · B4-2 CSV/JSON 匯出 · B4-3 python-control 橋接 · B4-4 LaTeX 生成  
B5-1 計算步驟面板 · B5-2 中間數值 tooltip · B5-3 條件數告警

### C — 學習者 (15)
C1-1 主題索引卡片 · C1-2 「這是什麼」說明 · C1-3 「從範例開始」按鈕  
C2-1 四步驟 Wizard · C2-2 欄位 Hint 氣泡 · C2-3 常見錯誤提示  
C3-1 極點拖曳動畫 · C3-2 參數敏感度圖 · C3-3 相平面互動 · C3-4 Nyquist 動畫  
C4-1 localStorage 草稿 · C4-2 書籤/筆記 · C4-3 完成步驟 badge  
C5-1 報告一鍵生成 · C5-2 截圖工具 · C5-3 結果摘要卡

### D — 實作工程師 (15)
D1-1 語言選擇器 · D1-2 程式碼預覽面板 · D1-3 一鍵複製/下載 · D1-4 生成選項  
D2-1 取樣時間建議 · D2-2 離散化方法比較 · D2-3 離散穩定性 badge · D2-4 z-domain Bode  
D3-1 FLOP count 估算 · D3-2 記憶體估算 · D3-3 平台標籤  
D4-1 單元測試樣板 · D4-2 JS vs python diff · D4-3 HIL CSV 格式  
D5-1 初始化說明 · D5-2 接線圖生成 · D5-3 warnings 顯示面板

### E — 技術決策者 (12)
E1-1 專案摘要卡 · E1-2 規格合規總覽 · E1-3 版本時間軸  
E2-1 多方案評分矩陣 · E2-2 雷達圖 · E2-3 推薦標籤  
E3-1 HTML 設計報告 · E3-2 PDF 列印樣式 · E3-3 機密等級浮水印  
E4-1 設計決策日誌 · E4-2 規格來源標記 · E4-3 電子簽核欄位

### F — 全局架構 (16)
F1-1 四層導覽列 · F1-2 Context Bar  
F2-1 可分割工作區 · F2-2 標籤頁系統 · F2-3 全螢幕圖表  
F3-1 全域狀態列 · F3-2 Dirty 標記 · F3-3 計算進度條  
F4-1 三主題切換 · F4-2 品牌色 token · F4-3 圖表 8 色循環 · F4-4 reduced-motion  
F5-1 鍵盤導覽 · F5-2 螢幕閱讀器 · F5-3 高對比模式 · F5-4 Skip link

---

*共計 72 項功能規格（含新增元件 13 項）*  
*總估計工時：P1=11d / P2=17d / P3=18d*
