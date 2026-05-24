# ControlStudio — Round 2 UI/UX 詳細設計規格

> 版本：2026-05-24　延續 Round 1（P35–P59，74/74 verify pass）  
> 格式：使用者故事 / 觸發位置 / 互動流程 / 視覺規格 / 元件組成 / 資料介面 / 狀態機 / 鍵盤支援 / 依賴模組 / 驗收標準  
> Phases：P60（側欄重組）P61（圖表標注）P62（流程狀態機）P63（量測工具）P64（參數掃描）P65（分享輸出）

---

## P60 — 側欄工作流重組（Sidebar Workflow Redesign）

### 設計動機

> 目前側欄將 Plant Definition、SysID、Discretization、Controller Tuning、Stability Snapshot、Routh Table、矩陣展開、程式碼生成……全部垂直堆疊，工程師需滾動 2000px+ 才能瀏覽完整內容。  
> 解法：以「工程師的任務」為軸，改為五個工作流 Tab，每個 Tab 內容可獨立捲動，不互相干擾。

### 整體佈局

```
┌──────────────────────────────────────────────────────┐
│ TopBar (60px)                                         │
├────────┬─────────────────────────────────────────────┤
│        │                                             │
│  Side  │  Main Chart Area                            │
│  Nav   │                                             │
│  240px │                                             │
│        │                                             │
│  ┌─────┤                                             │
│  │Tab  │                                             │
│  │Bar  │                                             │
│  │48px │                                             │
│  ├─────┤                                             │
│  │Tab  │                                             │
│  │Con- │                                             │
│  │tent │                                             │
│  │scroll│                                            │
│  └─────┤                                             │
└────────┴─────────────────────────────────────────────┘
```

---

### H1-1｜側欄 Tab Bar

**使用者故事**  
身為控制設計者，我想透過五個工作流 Tab 快速切換操作情境，不需要在長長的側欄中尋找目標面板。

**觸發位置**  
側欄頂部固定 Tab Bar（取代現有無結構的垂直滾動區）

**互動流程**

```
┌─────────────────────────────────────┐
│ 🔍    ⚙    📊    💾    📖           │  ← Tab Bar（48px 高，固定不捲動）
│ 識別  設計  分析  實作  學習          │
└─────────────────────────────────────┘
│ ← 對應 Tab Content（可捲動） →      │

點擊流程：
  使用者點擊「⚙ 設計」
    → activeTab = 'design'
    → Tab Bar 對應項底部出現 3px accent 底線
    → Tab Content 區切換至設計面板群組
    → 捲動位置 reset to top
    → URL hash 更新（#tab=design，不影響 routing）

鍵盤流程：
  側欄有焦點時，數字鍵 1–5 快速跳轉各 Tab
  Tab/Shift-Tab 在 Tab Bar 各項間移動
  Enter/Space 啟用聚焦的 Tab
```

**各 Tab 收納面板**

```
🔍 識別（Identify）
  ├─ PLANT STRUCTURE（SISO/MIMO）
  ├─ PLANT DEFINITION（TF/SS/ZPK/Discrete TF）
  ├─ SYSTEM IDENTIFICATION（ARX/ARMAX/SysID）
  ├─ EXAMPLE LIBRARY（快速範例）
  └─ SYSTEM HEALTH BADGE（健康狀態摘要）

⚙ 設計（Design）
  ├─ DESIGN SPECS（規格設定）
  ├─ DESIGN WIZARD（四步驟）
  ├─ CONTROLLER TUNING（Kp/Ki/Kd 滑桿）
  ├─ ADVANCED METHODS（LQR / H∞ / GA / IMC）
  ├─ COMPENSATOR（Lead/Lag/PD filter）
  └─ COMPARE SNAPSHOTS（比較模式）

📊 分析（Analyse）
  ├─ STABILITY SNAPSHOT（GM/PM/DM/DSKM）
  ├─ ROUTH-HURWITZ TABLE
  ├─ ROBUSTNESS BADGES（PM/GM/Ms/Dm）
  ├─ SPEC COMPLIANCE BAR
  ├─ STABILITY ANALYSIS（主導極點/阻尼比）
  └─ MATRIX EXPAND（MIMO A/B/C/D）

💾 實作（Implement）
  ├─ SIMULATION SETTINGS（波形/時長/取樣）
  ├─ DISCRETIZATION（ZOH/Tustin/比較表）
  ├─ CODE GENERATION（Python/MATLAB/C99）
  ├─ EXPORT（CSV/JSON/LaTeX）
  └─ PYTHON BRIDGE（cross-tool 驗證）

📖 學習（Learn）
  ├─ TOPIC CARDS（主題索引）
  ├─ DESIGN NOTES（草稿/筆記）
  ├─ CALC STEPS（計算步驟詳情）
  └─ HELP & SHORTCUTS（快捷鍵說明）
```

**視覺規格**

```
Tab Bar 容器：
  高度: 48px, 寬度: 100% sidebar
  background: var(--bg-tertiary)
  border-bottom: 1px solid var(--border-primary)
  position: sticky, top: 0, z-index: 10

每個 Tab 項：
  flex: 1（五等分）
  display: flex, flex-direction: column
  align-items: center, justify-content: center
  gap: 2px
  font-size: 10px, color: var(--text-muted)
  cursor: pointer
  transition: background 150ms

  Icon：16×16px emoji 或 SVG，opacity: 0.7
  Label：10px, font-weight: 500, 最長 2 個中文字

Active 狀態：
  color: var(--color-accent)
  background: rgba(var(--accent-rgb), 0.08)
  border-bottom: 3px solid var(--color-accent)（內嵌底線）
  Icon opacity: 1

Hover 狀態：
  background: var(--bg-secondary)
  color: var(--text-primary)

Badge（H1-3）：
  右上角 8px 圓，background: #ef4444, color: #fff
  font-size: 8px, font-weight: 700
  transform: translate(50%, -50%)
```

**元件組成**
- `initSidebarTabs()` — 初始化 Tab 切換邏輯，綁定 click + keyboard
- `switchSidebarTab(tabId)` — 切換 Tab，更新 DOM，persist to localStorage
- `updateTabBadges()` — 計算並更新各 Tab 的警告 badge 數
- CSS class `.sidebar-tab`, `.sidebar-tab.active`, `.sidebar-tab-badge`

**資料介面**

```javascript
// state 擴充
state.sidebarTab = 'identify' | 'design' | 'analyse' | 'implement' | 'learn'

// localStorage key
'cs-sidebar-tab'  // 記住上次使用的 Tab

// Badge 計算來源
{
  identify: 0,          // plant 健康警告數
  design:   0,          // 規格未設定 / 控制器未套用
  analyse:  warningCount, // GM/PM 不足 / 不穩定
  implement: 0,
  learn:    0
}
```

**狀態機**

```
INIT
  │ DOMContentLoaded
  ▼
RESTORE_TAB ← localStorage 'cs-sidebar-tab'
  │
  ▼
IDLE（顯示當前 Tab 內容）
  │
  ├─ [click Tab] ──────────→ SWITCH_TAB
  │                             │ 更新 activeTab
  ├─ [keydown 1-5] ────────→   │ 隱藏舊內容
  │                             │ 顯示新內容
  └─ [Tab/Enter] ──────────→   │ persist localStorage
                                ▼
                             IDLE
```

**鍵盤支援**

| 快速鍵 | 動作 |
|--------|------|
| `1` | 切換「識別」Tab（側欄有焦點時） |
| `2` | 切換「設計」Tab |
| `3` | 切換「分析」Tab |
| `4` | 切換「實作」Tab |
| `5` | 切換「學習」Tab |
| `←` `→` | Tab Bar 左右移動焦點 |
| `Enter` / `Space` | 啟用當前 Tab |

**依賴模組**
- 純前端 CSS/JS，無 control/ 依賴
- 依賴：`localStorage`, `state.sidebarTab`

**驗收標準**
- [ ] 五個 Tab 點擊後內容切換，無跳動
- [ ] Active Tab 有 3px accent 底線
- [ ] 鍵盤數字 1–5 正確切換（側欄 focus 時）
- [ ] Tab 狀態 persist localStorage，重整後恢復
- [ ] 所有現有功能面板都被分配到某個 Tab，無遺漏
- [ ] Badge 在有警告時正確顯示數字

---

### H1-2｜Tab 內 Accordion 折疊記憶

**使用者故事**  
身為分析研究者，我想折疊當前不需要的面板（如 Routh Table），讓頁面更聚焦，且下次開啟時記住我的折疊偏好。

**觸發位置**  
各 Tab 內的每個 section-panel 標題列（`▼ PLANT DEFINITION`）

**互動流程**

```
點擊 section 標題列：
  [▼ PLANT DEFINITION] ← 點擊 chevron 或整個標題列
      │
      ├─ 若展開 → 折疊（height: 0, overflow: hidden, chevron 旋轉 -90°）
      └─ 若折疊 → 展開（height: auto, chevron 旋轉 0°）

  動畫：max-height transition 250ms ease-out
  狀態存入：localStorage key 'cs-accordion-{tab}-{sectionId}'
```

**視覺規格**

```
Section Header（可點擊區域）：
  高度: 36px
  display: flex, align-items: center, gap: 8px
  cursor: pointer
  padding: 0 12px
  background: transparent
  border-radius: var(--radius-sm)
  
  Hover: background: rgba(255,255,255,0.04)
  
  Chevron icon（▼）：
    font-size: 10px, color: var(--text-muted)
    transition: transform 250ms ease
    折疊時: transform: rotate(-90deg)
  
  標題文字：
    font-size: 11px, font-weight: 700
    text-transform: uppercase, letter-spacing: 0.5px
    color: var(--text-muted)
  
  右側 badge（可選）：
    section 有未完成項時顯示 ●（8px, warning 色）

Section Content：
  max-height: 2000px（展開）
  max-height: 0（折疊）
  overflow: hidden
  transition: max-height 250ms ease-out, opacity 200ms
  opacity: 0/1 對應折疊/展開
```

**驗收標準**
- [ ] 折疊/展開動畫流暢，無閃爍
- [ ] 每個 section 狀態獨立記憶
- [ ] 重整後恢復正確折疊狀態
- [ ] 折疊時不影響 Tab 間切換
- [ ] `aria-expanded` 屬性正確更新（無障礙）

---

### H1-3｜智慧 Badge 提示數

**使用者故事**  
身為技術決策者，我想在不切換 Tab 的情況下，一眼看出哪個工作流區域有需要處理的警告。

**Badge 計算規則**

```javascript
function computeTabBadges() {
  return {
    identify:   countPlantWarnings(),     // RHP poles, non-minimum phase, poor conditioning
    design:     countDesignWarnings(),    // no specs set, controller not applied, GM<6dB
    analyse:    countAnalysisWarnings(),  // UNSTABLE, GM<6, PM<30, spec failures
    implement:  0,                        // 暫無自動警告
    learn:      0,
  };
}

function countAnalysisWarnings() {
  let n = 0;
  if (state._lastStability?.status === 'unstable') n++;
  const gm = state._lastStability?.gainMarginDb;
  if (gm !== undefined && isFinite(gm) && gm < 6) n++;
  const pm = state._lastStability?.phaseMargin;
  if (pm !== undefined && isFinite(pm) && pm < 30) n++;
  const badges = document.querySelectorAll('#spec-compliance-bar .spec-badge.fail');
  n += badges.length;
  return n;
}
```

**觸發時機**：`refreshAllCharts()` 呼叫後執行，節流 200ms

**驗收標準**
- [ ] 分析 Tab badge 在系統不穩定時顯示 ≥1
- [ ] GM < 6 dB 時 badge 更新
- [ ] badge 在問題解決後自動歸零
- [ ] badge 不超過 9（超過顯示「9+」）

---

### H1-4｜快速收藏 Pin

**使用者故事**  
身為控制設計者，我最常使用「Controller Tuning」和「Stability Snapshot」，我想把它們固定在任何 Tab 的頂部，不需切換即可存取。

**互動流程**

```
長按（500ms）任意 section 標題列：
  → 顯示浮動選單：[📌 固定到頂部] [取消]
  
點擊「固定到頂部」：
  → 在所有 Tab 的頂部顯示「已固定」區域
  → 固定面板以淡藍色左邊框標示
  → 最多固定 3 個 section
  
已固定 section 的標題右側顯示 📌 圖示：
  → 點擊 📌 → 取消固定
  → 固定面板從頂部區域移除

固定狀態存入 localStorage:
  key: 'cs-pinned-sections'
  value: ['controller-tuning', 'stability-snapshot']
```

**視覺規格**

```
固定區域（Pin Zone）：
  位於 Tab Bar 下方，Tab Content 最頂部
  background: rgba(59,130,246,0.05)
  border-bottom: 1px solid rgba(59,130,246,0.2)
  padding: 4px 0
  label: 「📌 已固定」（10px, text-muted）

固定 Section：
  left border: 3px solid rgba(59,130,246,0.5)
  稍微縮排：padding-left: 8px
```

**驗收標準**
- [ ] 長按 500ms 觸發選單（含觸控支援）
- [ ] 固定面板在所有 Tab 頂部可見
- [ ] 最多 3 個，第 4 個提示「已達上限」
- [ ] 取消固定後立即從頂部移除
- [ ] persist localStorage

---

### H1-5｜側欄搜尋

**使用者故事**  
身為分析研究者，我想輸入「gram」立刻找到「Gramian SVD 詳細頁」，不需記住它在哪個 Tab。

**觸發位置**
- 側欄頂部搜尋圖示（🔍）點擊展開搜尋框
- 快速鍵：`Ctrl+F`（游標在側欄時）

**互動流程**

```
按下 Ctrl+F 或點搜尋圖示：
  → Tab Bar 下方展開搜尋框（slide-down 150ms）
  → 輸入框自動聚焦

輸入關鍵字（例如 "gram"）：
  → 即時 filter（debounce 150ms）
  → 所有 Tab 的 section 標題 + 說明文字搜尋
  → 命中的 section 高亮顯示（黃色背景標記關鍵字）
  → 未命中的 section 降低 opacity: 0.3

搜尋結果顯示模式：
  → 臨時打破 Tab 邊界，顯示所有命中項
  → 每個命中項顯示所屬 Tab 的小標籤（如「分析 Tab」）

按 Escape 或清空：
  → 搜尋框收起，恢復原 Tab 視圖

無結果：
  → 顯示「找不到 "xxx"」空狀態
```

**視覺規格**

```
搜尋框：
  height: 36px, border-radius: var(--radius-md)
  background: var(--bg-tertiary)
  border: 1px solid var(--border-primary)
  padding: 0 32px（左側搜尋圖示，右側清除按鈕）
  font-size: 13px
  transition: box-shadow 150ms
  focus: border-color: var(--color-accent), box-shadow: 0 0 0 2px accent/20%

命中高亮：
  background: rgba(250,204,21,0.2)（黃色）
  border-radius: 2px
  font-weight: 600

Tab 所屬標籤：
  font-size: 9px, padding: 1px 5px
  background: var(--bg-tertiary), border-radius: 10px
  color: var(--text-muted)
```

**依賴模組**：純前端，無 control/ 依賴

**驗收標準**
- [ ] Ctrl+F 觸發搜尋框（游標在側欄時）
- [ ] 搜尋跨 Tab 顯示命中結果
- [ ] 命中文字高亮（含中英文）
- [ ] 無結果顯示空狀態
- [ ] Escape 關閉並恢復原 Tab 視圖
- [ ] 搜尋期間 Tab Badge 不受干擾

---

## P61 — 圖表工程標注（In-Chart Engineering Annotations）

### 設計動機

> 工程師看 Step Response 時，腦中會自動換算「峰值在 1.25，所以 OS=25%」——這個心算步驟應該由圖表代勞。  
> 標注方向：**只標注高頻使用的工程量**，不追求「把所有數字都畫在圖上」。  
> 標注可切換關閉，避免圖面過度複雜。

---

### J1-1｜Step Response 指標標注

**使用者故事**  
身為控制設計者，我想在 Step Response 圖上直接看到 Rise Time、Overshoot、Settling Time 的位置，不需要對照左側數字。

**觸發位置**  
Time Response 圖表（主圖 `chart-active` + 三窗格 `chart-triple-step`）

**標注內容與視覺設計**

```
── ① Rise Time（↔ 箭頭）──────────────────────────
  位置：y = 50% 穩態值的水平線（10%–90% 定義）
  顯示：雙向水平箭頭，兩端垂直短刻度
  標籤：「Tr = 0.45s」，顯示在箭頭中間上方
  顏色：var(--color-accent)（藍色）

── ② Overshoot（↑ 垂直箭頭）─────────────────────
  位置：響應峰值點（ymax）到穩態值（yss）
  顯示：垂直雙向箭頭（yss → ymax）
  標籤：「OS = 18.3%」，顯示在箭頭右側
  顏色：#f59e0b（琥珀色，表示需要注意）
  若 OS < 2% 則不顯示（視為無 OS）

── ③ Settling Band（水平虛線帶）──────────────────
  位置：±2%（或使用者設定值）圍繞 yss
  顯示：兩條水平虛線（dash: [4,4]）
  標籤：「±2% 安定帶」顯示在右側
  顏色：rgba(34,197,94,0.4)（淡綠）
  同時標注 Settling Time 垂直虛線

── ④ Settling Time（垂直線）──────────────────────
  位置：響應最後一次離開安定帶的時間點
  顯示：垂直虛線
  標籤：「Ts = 2.1s」，顯示在線頂上方
  顏色：#22c55e（綠色）

── ⑤ Steady-State Error（右側 ↕）────────────────
  位置：x 軸末端右側
  顯示：垂直雙箭頭（目標值 1.0 → 實際 yss）
  標籤：「ess = 0.05」
  顏色：若 ess > 0.05 → #ef4444，否則 #22c55e
  若 ess < 0.005 則不顯示
```

**實作方式**  
使用 Plotly Annotations + Shapes（而非 SVG overlay），確保縮放/平移時標注跟隨：

```javascript
function buildStepAnnotations(resp, info) {
  const annotations = [];
  const shapes = [];
  const { riseTime, overshoot, settlingTime, steadyState } = info;
  const yss = steadyState ?? resp.y[resp.y.length - 1];

  // ① Rise Time arrow（使用兩個 annotation 模擬雙向箭頭）
  if (isFinite(riseTime)) {
    const t10 = resp.t.find((t, i) => resp.y[i] >= yss * 0.1) ?? 0;
    const t90 = resp.t.find((t, i) => resp.y[i] >= yss * 0.9) ?? riseTime;
    annotations.push({
      x: (t10 + t90) / 2, y: yss * 0.5,
      text: `Tr=${fmtTime(riseTime)}`,
      showarrow: false, font: { size: 10, color: 'var(--color-accent)' },
      bgcolor: 'rgba(0,0,0,0.6)', borderpad: 3,
    });
    shapes.push({
      type: 'line', x0: t10, x1: t90, y0: yss * 0.5, y1: yss * 0.5,
      line: { color: 'var(--color-accent)', width: 1.5 },
    });
  }

  // ② Overshoot...（類似）
  // ③ Settling Band shapes...
  // ④ Settling Time line...
  // ⑤ Steady-State Error...

  return { annotations, shapes };
}
```

**元件組成**
- `buildStepAnnotations(resp, stepInfo)` → `{ annotations[], shapes[] }`
- `renderStepResponseAnnotated(sys, targetId)` — 整合標注的 step render
- 整合進現有 `renderStepResponse()` 函式

**狀態機**

```
標注開關（J1-5）: state.chartAnnotationsEnabled = true/false
  true  → buildStepAnnotations() 結果加入 layout
  false → annotations = [], shapes = []
```

**鍵盤支援**：無（標注由圖表引擎渲染）

**依賴模組**
- `stepResponse(sys, config)` → 時域數據
- `stepInfo(t, y)` → `{ riseTime, overshoot, settlingTime, steadyState }`
- `Plotly.react()` with `layout.annotations` + `layout.shapes`

**驗收標準**
- [ ] Rise Time 箭頭正確跨越 10%–90% 區間
- [ ] Overshoot 箭頭從 yss 指向 ymax，百分比正確
- [ ] ±2% 安定帶虛線隨 yss 正確定位
- [ ] Settling Time 垂直線在正確時間點
- [ ] 標注開關切換後圖表立即重繪
- [ ] 縮放/平移後標注跟隨（不偏移）
- [ ] OS < 2% 時不顯示 OS 箭頭
- [ ] ess < 0.005 時不顯示 SS Error 標注

---

### J1-2｜Bode Plot PM/GM 圖形標注

**使用者故事**  
身為控制設計者，我想在 Bode 圖上直接看到 PM 和 GM 的視覺標示，不需要對照側欄的數字。

**標注內容**

```
── Phase Margin（PM）標注 ──────────────────────────
  位置：增益穿越頻率 ωgc（Magnitude = 0 dB）處
  顯示：
    ① 在 Phase 子圖：垂直虛線從 -180° 延伸到 Phase(ωgc)
    ② 雙向箭頭：從 Phase(ωgc) 到 -180°（PM 的視覺量）
    ③ 弧形標注（角度弧）：在 -180° 處畫弧，標示 PM 角度
    ④ 標籤：「PM = 45.3°」顯示在箭頭中間右側

── Gain Margin（GM）標注 ──────────────────────────
  位置：相位穿越頻率 ωpc（Phase = -180°）處
  顯示：
    ① 在 Magnitude 子圖：垂直虛線從 Mag(ωpc) 到 0 dB
    ② 雙向箭頭：Mag(ωpc) ↔ 0 dB（GM 的視覺量）
    ③ 標籤：「GM = 12.4 dB」

── 穿越頻率標記 ──────────────────────────────────
  ωgc 標記（在頻率軸）：
    倒三角 ▽（10px），顏色 var(--color-accent)
    標籤：「ωgc = 0.27」（hover 顯示，常態顯示若空間夠）
  ωpc 標記：
    倒三角 ▽，顏色 #f59e0b
    標籤：「ωpc = 2.1」
```

**實作方式**

```javascript
function buildBodeAnnotations(margins, bodeData) {
  const { gainMarginDb, phaseMargin, gainCrossover, phaseCrossover } = margins;
  const annotations = [];
  const shapes = [];

  // PM annotation（在 Phase 子圖，y 軸為 y2）
  if (isFinite(phaseMargin) && isFinite(gainCrossover)) {
    const wgc = gainCrossover;
    const phaseAtWgc = interpolateBode(bodeData.w, bodeData.phase, wgc);
    // 垂直線
    shapes.push({
      type: 'line', xref: 'x', yref: 'y2',
      x0: Math.log10(wgc), x1: Math.log10(wgc),
      y0: -180, y1: phaseAtWgc,
      line: { color: '#22c55e', width: 1, dash: 'dot' },
    });
    // 雙向箭頭（使用兩個 annotation）
    annotations.push({
      xref: 'x', yref: 'y2',
      x: Math.log10(wgc), y: (-180 + phaseAtWgc) / 2,
      text: `PM=${phaseMargin.toFixed(1)}°`,
      showarrow: false, font: { size: 10, color: '#22c55e' },
      xshift: 8, bgcolor: 'rgba(0,0,0,0.6)', borderpad: 3,
    });
  }

  // GM annotation（在 Magnitude 子圖）
  if (isFinite(gainMarginDb) && isFinite(phaseCrossover)) {
    // ...類似邏輯
  }

  return { annotations, shapes };
}
```

**驗收標準**
- [ ] PM 箭頭正確從 Phase(ωgc) 延伸到 -180°，數值正確
- [ ] GM 箭頭正確從 Mag(ωpc) 延伸到 0 dB，dB 值正確
- [ ] 開迴路不穩定（GM=∞）時，GM 標注不出現
- [ ] PM < 0 時，標注用紅色（不穩定警示）
- [ ] 穿越頻率標記在頻率軸上可見

---

### J1-3｜Root Locus 幾何標注

**使用者故事**  
身為控制設計者，我想在 Root Locus 圖上看到漸近線和質心，幫助我預測高增益時極點的走向。

**標注內容**

```
── 漸近線（Asymptotes）──────────────────────────────
  計算：n-m 條漸近線（n=poles, m=zeros）
  角度：(2k+1)·180° / (n-m)，k = 0,1,...,n-m-1
  質心：σ_a = (Σ poles_re - Σ zeros_re) / (n-m)
  顯示：從質心出發，以計算角度延伸的虛線
        延伸至圖表邊界，顏色 rgba(148,163,184,0.4)（淡灰）

── 質心（Centroid）────────────────────────────────
  位置：(σ_a, 0)
  顯示：× 標記（10px），顏色 var(--text-muted)
  標籤：「σ_a = -1.5」hover 顯示

── 分離點/到達點（Breakaway/Break-in）──────────────
  現有已計算（_rlocusBreakpoints）
  標注：□ 方形標記（10px），顏色 var(--text-secondary)
  標籤：「K = 0.25」hover 顯示

── 虛軸穿越點（jω-axis crossing）───────────────────
  位置：根軌跡穿越 Re=0 的點（從 _rlocusJwCrossings 取）
  顯示：★ 星號（12px），顏色 #f59e0b
  標籤：「ωn = 1.41, K = 2.0」
```

**實作方式**

```javascript
function buildRlocusAnnotations(sys, result) {
  const poles = sys.poles();
  const zeros = sys.zeros();
  const n = poles.length, m = zeros.length;
  const shapes = [], annotations = [];

  if (n > m) {
    // 計算質心
    const sigmaA = (poles.reduce((s,p) => s + p.re, 0) -
                    zeros.reduce((s,z) => s + z.re, 0)) / (n - m);
    // 畫漸近線
    for (let k = 0; k < n - m; k++) {
      const angle = ((2*k+1) * Math.PI) / (n - m);
      const len = 50; // 延伸長度
      shapes.push({
        type: 'line', x0: sigmaA, y0: 0,
        x1: sigmaA + len * Math.cos(angle),
        y1: len * Math.sin(angle),
        line: { color: 'rgba(148,163,184,0.4)', width: 1, dash: 'dashdot' },
      });
    }
    // 質心標記
    annotations.push({
      x: sigmaA, y: 0,
      text: `σ_a=${sigmaA.toFixed(2)}`, showarrow: false,
      font: { size: 9, color: 'var(--text-muted)' }, yshift: -14,
    });
  }
  return { shapes, annotations };
}
```

**驗收標準**
- [ ] 漸近線從質心延伸，角度計算正確
- [ ] n=m 時（無漸近線）不顯示任何漸近線標注
- [ ] 質心 × 標記在正確位置
- [ ] 分離點 □ 與現有 breakpoint marker 不重疊
- [ ] 虛軸穿越點有 ★ 標記且顯示對應 K 值

---

### J1-4｜Nyquist 距離與頻率標注

**使用者故事**  
身為控制設計者，我想在 Nyquist 圖上看到軌跡上的頻率標記，以及到 -1 點的最小距離（靈敏度峰值 Ms 的幾何意義）。

**標注內容**

```
── 頻率標記（Frequency Ticks）────────────────────
  在正頻率軌跡上，每 decade 標記一個頻率點
  計算：log10(wMin) ~ log10(wMax) 之間的整數 decade
  顯示：● 小圓點（5px），標籤 「ω=1」「ω=10」
  顏色：var(--text-muted)

── 最小距離圓（1/Ms circle）───────────────────────
  定義：以 -1+j0 為圓心，半徑 = min distance
  計算：min(|G(jω) - (-1)|) over ω
  顯示：虛線圓，顏色 rgba(249,115,22,0.5)（橙色）
  標籤：「1/Ms = 0.42（Ms = 2.38 = 7.5 dB）」
        顯示在圓的右上角

── 單位圓（Unit Circle）──────────────────────────
  顯示條件：使用者勾選（預設關閉）
  顯示：虛線圓，半徑 1，圓心 (0,0)
  顏色：rgba(148,163,184,0.2)
  用途：輔助判斷 |G(jω)| = 1 的頻率（增益穿越頻率）
```

**驗收標準**
- [ ] 頻率標記在正確的 decade 位置
- [ ] 最小距離圓半徑計算正確（與側欄 Ms 值吻合）
- [ ] Ms 數值與 dB 值正確換算
- [ ] 單位圓預設隱藏，可選顯示

---

### J1-5｜標注開關（全局切換）

**使用者故事**  
身為分析研究者，我想在需要截圖給論文時，一鍵關閉所有工程標注，得到乾淨的圖表。

**觸發位置**  
各圖表右上角按鈕區新增「⌗ 標注」切換按鈕

**狀態**

```javascript
state.chartAnnotationsEnabled = true  // 預設開啟
// 儲存：localStorage 'cs-chart-annotations'

// 切換時呼叫：
function toggleChartAnnotations() {
  state.chartAnnotationsEnabled = !state.chartAnnotationsEnabled;
  localStorage.setItem('cs-chart-annotations', state.chartAnnotationsEnabled);
  refreshAllCharts();  // 重繪所有圖表（帶/不帶標注）
}
```

**視覺規格**

```
按鈕：「⌗ 標注」（啟用）/ 「⌗ 標注」（停用，opacity: 0.5）
位置：每個圖表 chart-header-actions 區
尺寸：同現有 Export/Fullscreen 按鈕
```

**驗收標準**
- [ ] 點擊後所有圖表（主圖 + 三窗格 + mini）立即重繪
- [ ] 狀態 persist localStorage
- [ ] 按鈕視覺狀態反映開/關
- [ ] 三窗格模式下也生效

---

## P62 — 設計流程狀態機（Design Flow State Machine）

### 設計動機

> 新手打開 ControlStudio 看到滿滿的面板，不知道要從哪裡開始。  
> 設計一個「五步驟進度列」，讓工具主動引導使用者完成完整的控制設計流程，同時提供情境相關的智慧警示。

---

### K1-1｜五步流程進度列

**使用者故事**  
身為初次使用的學習者，我想看到清楚的設計步驟指引，知道現在在哪一步、下一步該做什麼。

**觸發位置**  
主內容區頂部（圖表 Tab 列上方），可收合

**視覺規格**

```
┌────────────────────────────────────────────────────────────────┐
│ ● 建立 Plant  →  ⚠ 設定規格  →  ● 設計控制器 →  ○ 驗證  →  ○ 匯出 │ [收合 ∧]
│   ✓ 完成          未設定         進行中          待做       待做   │
└────────────────────────────────────────────────────────────────┘

步驟狀態圖示：
  ✓ 完成：綠色實心圓 + ✓，text: --color-stable
  ● 進行中：accent 色實心圓，text: --color-accent
  ⚠ 警告：黃色圓 + ⚠，text: #f59e0b（完成但有問題）
  ○ 待做：灰色空心圓，text: --text-muted

連接箭頭：
  完成 → 下一步：accent 色實線
  其他：--border-primary 虛線

點擊步驟：
  → 側欄切換到對應 Tab + 捲動到對應面板
  → 淡藍色脈衝動畫（highlight 0.5s）
```

**步驟完成條件（K1-2 整合）**

```javascript
function computeFlowSteps() {
  return [
    {
      id: 'plant',
      label: '建立 Plant',
      icon: '🔍',
      status: state.plant ? 'done' : 'active',
      hint: state.plant ? null : '在識別 Tab 輸入傳遞函數或狀態空間模型',
      action: () => switchSidebarTab('identify'),
    },
    {
      id: 'specs',
      label: '設定規格',
      icon: '📋',
      status: hasAnySpec()
        ? (allSpecsReasonable() ? 'done' : 'warning')
        : (state.plant ? 'active' : 'pending'),
      hint: hasAnySpec() ? null : '在設計 Tab 設定 OS、Ts、PM 等規格',
      action: () => { switchSidebarTab('design'); scrollToSection('design-specs'); },
    },
    {
      id: 'controller',
      label: '設計控制器',
      icon: '⚙',
      status: state.controller
        ? (isControllerApplied() ? 'done' : 'warning')
        : (hasAnySpec() ? 'active' : 'pending'),
      hint: null,
      action: () => switchSidebarTab('design'),
    },
    {
      id: 'verify',
      label: '驗證',
      icon: '✅',
      status: allSpecsPassing()
        ? 'done'
        : (state.controller ? 'active' : 'pending'),
      hint: allSpecsPassing() ? null : '檢查規格合規狀態，調整控制器參數',
      action: () => switchSidebarTab('analyse'),
    },
    {
      id: 'export',
      label: '匯出',
      icon: '💾',
      status: state._lastExportTime ? 'done' : 'pending',
      hint: '在實作 Tab 生成程式碼或下載報告',
      action: () => switchSidebarTab('implement'),
    },
  ];
}
```

**狀態機**

```
HIDDEN（使用者收合）
  │ [點擊 ∨ 展開]
  ▼
VISIBLE
  │ refreshAllCharts() 後觸發 updateFlowBar()
  │
  ▼
UPDATE（重新計算各步驟狀態）
  │
  ▼
RENDER（更新 DOM）
  │ [點擊步驟]
  ▼
NAVIGATE（切換 Tab + 捲動）
```

**驗收標準**
- [ ] 五個步驟正確計算狀態（✓/●/⚠/○）
- [ ] 點擊步驟跳轉到正確 Tab + 面板
- [ ] 進度列可收合（狀態 persist）
- [ ] 狀態在 refreshAllCharts() 後自動更新
- [ ] 行動裝置上正確換行（2 行顯示）

---

### K1-3｜情境智慧警示

**使用者故事**  
身為控制設計者，我想在系統不穩定或裕度不足時，立刻收到具體的改善建議，不需要自己去讀數字再判斷。

**觸發位置**  
側欄頂部（Tab Bar 下方），以橫幅形式顯示，可關閉

**警示規則庫**

```javascript
const SMART_WARNINGS = [
  {
    id: 'unstable',
    priority: 1,  // 最高優先（數字越小越先顯示）
    condition: () => state._lastStability?.status === 'unstable',
    level: 'error',  // 'error' | 'warning' | 'info'
    message: () => {
      const poles = state._lastStability?.poles?.filter(p => p.re > 0) ?? [];
      return `閉迴路不穩定：${poles.length} 個 RHP 極點（${poles.map(p => p.re.toFixed(2)).join(', ')}）`;
    },
    action: { label: '前往分析', fn: () => switchSidebarTab('analyse') },
    suggestion: 'Kp 可能過大，嘗試降低 50% 後重新驗證。',
  },
  {
    id: 'low-gm',
    priority: 2,
    condition: () => {
      const gm = state._lastStability?.gainMarginDb;
      return isFinite(gm) && gm < 6;
    },
    level: 'warning',
    message: () => `增益裕度 GM = ${state._lastStability.gainMarginDb.toFixed(1)} dB（建議 > 6 dB）`,
    action: { label: '調低 Kp', fn: () => { /* Kp × 0.8 並更新 */ } },
    suggestion: '降低比例增益 Kp 可提升 GM；或增加 Lead 補償器相位超前。',
  },
  {
    id: 'low-pm',
    priority: 3,
    condition: () => {
      const pm = state._lastStability?.phaseMargin;
      return isFinite(pm) && pm < 30;
    },
    level: 'warning',
    message: () => `相位裕度 PM = ${state._lastStability.phaseMargin.toFixed(1)}°（建議 > 45°）`,
    suggestion: '增加微分項 Kd 或 Lead 補償器可提升 PM。',
  },
  {
    id: 'no-specs',
    priority: 4,
    condition: () => state.plant && !hasAnySpec(),
    level: 'info',
    message: () => '尚未設定設計規格，無法自動驗證控制性能。',
    action: { label: '設定規格', fn: () => scrollToSection('design-specs') },
  },
  {
    id: 'rhp-zeros',
    priority: 5,
    condition: () => {
      const zeros = state.plant?.zeros?.() ?? [];
      return zeros.some(z => z.re > 1e-9);
    },
    level: 'info',
    message: () => 'Plant 有 RHP 零點（非最小相位系統），閉迴路頻寬受限，且必然存在暫態欠沖。',
  },
];
```

**視覺規格**

```
警示橫幅：
  display: flex, align-items: flex-start, gap: 8px
  padding: 8px 10px
  border-radius: var(--radius-sm)
  margin: 6px 8px
  font-size: 11px

  error:   background: rgba(239,68,68,0.12),   border-left: 3px solid #ef4444
  warning: background: rgba(245,158,11,0.12),  border-left: 3px solid #f59e0b
  info:    background: rgba(59,130,246,0.12),   border-left: 3px solid #3b82f6

  Level icon：12px（🔴/⚠️/ℹ️）
  主訊息：font-weight: 600
  建議文字（suggestion）：color: --text-muted, margin-top: 2px
  Action 按鈕：inline btn-sm, margin-top: 4px
  關閉按鈕：× 在右上角，點擊後 dismiss（本 session 內不再顯示該條）

顯示邏輯：
  每次 refreshAllCharts() 後重新計算
  只顯示優先度最高的 1 條（避免警示疲勞）
  dismiss 後的 id 存入 state._dismissedWarnings Set（不 persist，重整恢復）
```

**驗收標準**
- [ ] 不穩定時顯示 error 橫幅（優先於其他警示）
- [ ] GM < 6 dB 時顯示 warning
- [ ] PM < 30° 時顯示 warning
- [ ] 一次最多顯示 1 條警示（最高優先）
- [ ] 關閉按鈕 dismiss 本 session
- [ ] Action 按鈕正確跳轉

---

### K1-4｜Kp 快速推薦

**使用者故事**  
身為初學者，我剛建立了 Plant，不知道 Kp 從哪裡開始設定，我想讓系統推薦一個合理的起始值。

**觸發位置**  
設計 Tab 頂部（Controller Tuning section 上方）；或 K1-1 進度列「Step 3 設計控制器」的 hint 按鈕

**推薦演算法**

```javascript
function recommendInitialKp(sys) {
  try {
    // 方法一：基於 DC Gain 的反推
    // 理想 Kp = 1 / |G(0)|（使 DC 開迴路增益 ≈ 1）
    const dcGain = Math.abs(sys.dcGain?.() ?? evaluateTF(sys, 0));
    if (isFinite(dcGain) && dcGain > 1e-10) {
      const kpByDC = 1 / dcGain;
      
      // 方法二：基於頻寬估計的修正
      // 取 GM > 6 dB 的最大 Kp
      const range = autoFreqRange(sys);
      const margins = stabilityMargins(sys);
      
      // 選較保守的推薦
      const kpRecommended = Math.min(kpByDC, 0.5 / dcGain);
      
      return {
        value: +kpRecommended.toPrecision(2),
        reasoning: `G(s) 的 DC Gain ≈ ${dcGain.toFixed(3)}，推薦 Kp ≈ 1/|G(0)| = ${kpRecommended.toFixed(3)} 作為起始點。`,
        confidence: 'medium',
      };
    }
  } catch { }
  return { value: 1.0, reasoning: '無法自動估算，使用預設值 Kp=1。', confidence: 'low' };
}
```

**視覺規格**

```
推薦卡片：
  background: rgba(59,130,246,0.08)
  border: 1px solid rgba(59,130,246,0.3)
  border-radius: var(--radius-sm)
  padding: 8px 10px
  font-size: 11px

  標題：「💡 推薦起始增益」
  推薦值：「Kp ≈ 0.85」（24px, font-weight: 700, accent 色）
  說明：reasoning 文字（text-muted）
  按鈕：[套用 Kp=0.85] primary btn-sm + [忽略] ghost btn-sm

  顯示條件：!state.controller && state.plant
  套用後：推薦卡消失，Kp 欄位更新並閃爍高亮
```

**驗收標準**
- [ ] 只在無控制器時顯示推薦卡
- [ ] 推薦值計算正確（基於 DC Gain）
- [ ] 「套用」後 Kp 更新且推薦卡消失
- [ ] 積分系統（Type-1+）顯示不同推薦邏輯
- [ ] 系統更換後推薦值自動更新

---

## P63 — 圖表量測工具（Chart Measurement Tools）

---

### L1-1｜Delta 量測游標

**使用者故事**  
身為分析研究者，我想在 Bode 圖的高頻段點兩個點，立刻看到 ΔdB/decade（高頻斜率），而不是靠眼睛估算。

**觸發位置**
- 圖表右上角「Δ」按鈕（所有主圖）
- 快速鍵 `M`（游標在圖表內時）

**互動流程**

```
狀態機：IDLE → POINT_A → POINT_B → SHOWING

IDLE：
  游標正常，無量測

[按 Δ 按鈕 或 M 鍵] → POINT_A 模式：
  游標改為 crosshair（cursor: crosshair）
  狀態列顯示：「點擊設定第一個量測點 (A)」
  圖表邊框高亮：2px accent 色虛線

[第一次點擊] → 設定 A 點：
  在點擊位置顯示 A 標記（垂直線 + 水平線，藍色虛線）
  標記旁顯示座標「A: (ω=1.2, -22.5 dB)」
  狀態列：「點擊設定第二個量測點 (B)」

[第二次點擊] → 設定 B 點，顯示 Delta：
  在 B 點顯示 B 標記（橙色虛線）
  A-B 之間顯示：
    水平雙箭頭（Δx）
    垂直雙箭頭（Δy）
    浮動面板顯示量測結果

量測結果浮動面板：
  ┌────────────────────────────────┐
  │ △ 量測結果                  × │
  │ ΔΩ = 1.08 decade (12.2×)      │
  │ Δ幅值 = -46.3 dB              │
  │ 斜率 = -42.9 dB/decade ≈ -2 階│
  │ ΔΦ = -78.4° (Phase 子圖)     │
  │ [複製] [清除量測]             │
  └────────────────────────────────┘

[按 Esc 或 × 或再按 M] → IDLE
  清除所有量測標記和面板
```

**視覺規格**

```
A 點標記：
  垂直線：x=A.x, color: #3b82f6（藍）, width: 1, dash: [4,4]
  水平線：y=A.y, 同色同線型（但只在圖表可見範圍）
  標籤圓：「A」10px 圓，白字藍底，固定在線的左上角

B 點標記：
  相同，但顏色 #f97316（橙色），標籤「B」

連接標注：
  Δx 雙向箭頭：A.x ↔ B.x，y = 頂部 15%，藍色
  Δy 雙向箭頭：A.y ↔ B.y，x = A.x 右側 10%，橙色
  量測值標注：顯示在箭頭中間

浮動面板：
  position: absolute，跟隨圖表容器
  top: 16px, right: 48px
  background: var(--bg-secondary)
  border: 1px solid var(--border-primary)
  border-radius: var(--radius-md)
  padding: 10px 12px
  font-size: 11px, font-family: monospace
  shadow: 0 4px 16px rgba(0,0,0,0.4)
  width: 220px
```

**工程換算邏輯**

```javascript
function computeDeltaMeasurement(A, B, plotType) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;

  if (plotType === 'bode-magnitude') {
    const dLog = Math.log10(B.xRaw) - Math.log10(A.xRaw); // decade
    const slope = dy / dLog; // dB/decade
    const approxOrder = Math.round(slope / (-20));
    return {
      label: 'Bode 幅值量測',
      rows: [
        { key: 'Δ頻率', value: `${dLog.toFixed(3)} decade（${(B.xRaw/A.xRaw).toFixed(2)}×）` },
        { key: 'Δ幅值', value: `${dy > 0 ? '+' : ''}${dy.toFixed(2)} dB` },
        { key: '斜率', value: `${slope.toFixed(1)} dB/decade ≈ ${approxOrder} 階` },
      ]
    };
  }
  if (plotType === 'step') {
    return {
      label: 'Step Response 量測',
      rows: [
        { key: 'Δ時間', value: `${Math.abs(dx).toFixed(3)} s` },
        { key: 'Δ幅值', value: `${dy > 0 ? '+' : ''}${dy.toFixed(4)}` },
        { key: '平均斜率', value: `${(dy/dx).toFixed(4)} /s` },
      ]
    };
  }
  // ...其他圖表類型
}
```

**鍵盤支援**

| 快速鍵 | 動作 |
|--------|------|
| `M` | 進入/退出量測模式 |
| `Esc` | 退出量測模式，清除標記 |
| `Backspace` | 在 POINT_B 模式時，退回 POINT_A（重設 B 點） |

**依賴模組**
- `Plotly.react()` with shapes + annotations（A/B 標記）
- `plotly_click` event（點擊取座標）
- Floating panel：純 DOM（position: absolute）

**驗收標準**
- [ ] Δ按鈕和 M 鍵都能進入量測模式
- [ ] 兩次點擊後正確顯示量測結果
- [ ] Bode 圖斜率計算用 log10(ω)（不是線性）
- [ ] 量測面板顯示正確的工程單位
- [ ] Esc 完全清除所有量測標記
- [ ] 在 Time Response、Bode、Nyquist 各圖都有效
- [ ] 縮放後重新點擊，量測值仍正確

---

### L1-2｜跨圖連動游標（Linked Crosshair）

**使用者故事**  
身為分析研究者，我想在 Bode 圖上 hover 到某個頻率時，同時看到其他圖表在該頻率的對應值，以便理解頻率域與時域的關係。

**連動規則**

```
主動圖（有 hover）→ 被動圖（顯示對應線）：

Bode（主動）→ Nyquist（被動）：
  在 Nyquist 圖上標注「當前 ω 對應的 G(jω) 點」（移動圓點）

Bode Magnitude（主動）→ Bode Phase（被動）：
  同一 ω 在 Phase 子圖顯示垂直虛線（已有原生同步）

Step（主動）→ 任意（被動）：
  在其他時域圖顯示 t 對應的垂直線（若有相同 x 軸）

實作策略：
  使用 Plotly 的 plotly_hover 事件取得 hover 點的 x 值
  根據 x 值計算其他圖表的對應值（G(jω) 插值）
  用 Plotly.addTraces 或 Plotly.relayout 更新被動圖的 shapes
  用 100ms debounce 避免更新過頻
```

**連動指示器視覺**

```
被動圖上的連動線：
  垂直虛線：color: rgba(255,255,255,0.25), width: 1, dash: [4,4]
  移動點（Nyquist）：6px 白色圓點，outline: 2px solid accent
  浮動值標籤：跟隨移動點，顯示 |G(jω)| 和 ∠G(jω)
```

**啟用條件**
- 多個圖表同時可見時啟用（三窗格模式最適合）
- 可透過 J1-5「標注開關」一起關閉

**驗收標準**
- [ ] Bode hover 時 Nyquist 圖出現對應移動點
- [ ] 移動流暢（60fps），無卡頓
- [ ] hover 離開後移動點消失
- [ ] 只在相關圖表間連動（Bode ↔ Nyquist，不連動 Root Locus）
- [ ] 三窗格模式下 Step/Bode/Nyquist 三圖互聯

---

### L1-3｜圖表備注 Pin

**使用者故事**  
身為分析研究者，我想在 Root Locus 的某個分支上雙擊，記下「這是 PD 補償後的軌跡」，以便日後比較時參考。

**觸發方式**  
在任意圖表上雙擊 → 彈出備注輸入框

**互動流程**

```
雙擊圖表任意位置：
  → 在點擊位置顯示小型 inline textarea（100×60px）
  → placeholder：「輸入備注…」
  → 自動 focus

輸入文字後：
  [Enter 確認] 或 [點擊圖表其他位置] → 儲存
  [Esc] → 取消，不建立備注

儲存後：
  → 在圖表上顯示 📌 圖示（Plotly annotation）
  → 點擊 📌 → 顯示備注氣泡（含「刪除」按鈕）
  → 存入 localStorage（key: 'cs-chart-pins-{plotType}'）

資料格式：
  {
    id: 'pin-1716789012345',
    plotType: 'rlocus',
    x: -1.5, y: 0.8,        // 圖表座標（非像素）
    text: 'PD 補償後分支',
    timestamp: 1716789012345,
    color: '#f59e0b',
  }

匯出/報告：
  備注在圖表截圖和 PDF 報告中一起輸出
```

**視覺規格**

```
📌 annotation：
  text: '📌'（12px）
  showarrow: false
  font: { size: 14 }
  bgcolor: 'transparent'
  hover: 顯示備注氣泡

備注氣泡：
  background: var(--bg-secondary)
  border: 1px solid var(--border-primary)
  border-radius: var(--radius-sm)
  padding: 6px 8px
  font-size: 11px
  max-width: 200px
  word-wrap: break-word
  右上角 × 刪除按鈕

inline textarea（輸入時）：
  position: absolute（overlay 在 Plotly 容器上）
  background: var(--bg-secondary)
  border: 1px solid var(--color-accent)
  border-radius: 4px
  font-size: 11px
  padding: 4px 6px
  resize: none
  z-index: 10
```

**驗收標準**
- [ ] 雙擊後 textarea 出現在正確位置（不超出圖表邊界）
- [ ] 儲存後 📌 圖示出現在正確圖表座標
- [ ] 備注 persist localStorage，重整後恢復
- [ ] 刪除備注後圖表即時更新
- [ ] 縮放/平移後 📌 圖示跟隨座標（不偏移）
- [ ] 每個 plotType 最多 20 個備注（超過提示清理）

---

## P64 — 參數掃描可視化（Parameter Sweep Visualization）

---

### P1-1｜單參數掃描疊加

**使用者故事**  
身為控制設計者，我想一次看到 Kp 從 0.1 到 10 的 8 條 Step Response，理解增益如何影響超量和安定時間的權衡。

**觸發位置**  
Controller Tuning section 的 Kp/Ki/Kd 欄位旁「掃描 ⊞」按鈕

**互動流程**

```
點擊「掃描 ⊞」（Kp 欄位旁）：
  → 展開掃描設定抽屜（slide-down）：
  ┌─────────────────────────────────────────┐
  │ 📊 掃描 Kp                              │
  │ 範圍：[0.1] ── [10]   曲線數：[8 ▾]    │
  │ 比例：○ 線性   ● 對數（推薦）          │
  │ [開始掃描]  [取消]                      │
  └─────────────────────────────────────────┘

點擊「開始掃描」：
  → 計算 N 條 Step Response（背景，不阻塞 UI）
  → Progress bar（0/8 → 8/8）
  → 完成後疊加顯示在主圖或三窗格 Step 圖

掃描結果顯示：
  ─ 疊加 N 條曲線，漸層色（藍→紅，冷→熱）
  ─ 當前 Kp 值的曲線加粗（width: 3px）
  ─ 每條曲線 hover 顯示「Kp=0.5, OS=8%, Ts=2.1s」
  ─ 右側圖例：顏色梯度條 + min/max 值

退出掃描模式：
  ─ 按「× 退出掃描」或切換圖表 Tab
  ─ 主圖恢復單一曲線
```

**實作**

```javascript
async function runParameterSweep(param, minVal, maxVal, n, scale) {
  const values = scale === 'log'
    ? Array.from({ length: n }, (_, i) =>
        Math.pow(10, Math.log10(minVal) + (i/(n-1)) * Math.log10(maxVal/minVal)))
    : Array.from({ length: n }, (_, i) => minVal + (i/(n-1)) * (maxVal - minVal));

  const colors = values.map((_, i) => {
    const t = i / (n - 1);
    // 藍（0,120,255）→ 紅（255,60,0）漸層
    const r = Math.round(t * 255);
    const b = Math.round((1-t) * 255);
    return `rgb(${r},${Math.round(60*(1-t)+60*t)},${b})`;
  });

  const traces = [];
  for (let i = 0; i < n; i++) {
    startCalcProgress(i / n);
    const k = values[i];
    const ctrl = { ...state.pidParams, [param]: k };
    const cl = computeClosedLoop(state.plant, ctrl);
    const resp = stepResponse(cl, { duration: 20, sampleCount: 300 });
    const metrics = stepInfo(resp.t, resp.y);
    traces.push({
      x: resp.t, y: resp.y,
      type: 'scatter', mode: 'lines',
      line: { color: colors[i], width: values[i] === state.pidParams[param] ? 3 : 1.5 },
      name: `${param}=${fmtNum(k)}`,
      customdata: [metrics],
      hovertemplate: `${param}=${fmtNum(k)}<br>OS=${metrics.overshoot?.toFixed(1)}%<br>Ts=${fmtTime(metrics.settlingTime)}<extra></extra>`,
    });
    await new Promise(r => setTimeout(r, 0)); // yield to UI
  }
  completeCalcProgress();
  return traces;
}
```

**視覺規格**

```
漸層色條（圖例）：
  position: absolute, right: 8px, top: 50%
  height: 120px, width: 16px
  border-radius: 8px
  background: linear-gradient(藍 → 紅)
  兩端標籤：min/max 值（10px, text-muted）

掃描抽屜：
  background: var(--bg-tertiary)
  border-radius: var(--radius-md)
  padding: 12px
  border: 1px solid var(--border-primary)
  margin-top: 8px
  animation: slideDown 200ms ease
```

**驗收標準**
- [ ] Kp/Ki/Kd 各參數都有掃描按鈕
- [ ] 對數/線性比例正確計算掃描點
- [ ] N 條曲線正確疊加（不清除現有曲線直到掃描完成）
- [ ] 當前 Kp 曲線加粗
- [ ] hover 顯示正確的 OS 和 Ts
- [ ] 退出掃描後恢復單一曲線
- [ ] 計算 8 條曲線不超過 2 秒

---

### P1-2｜2D 穩定邊界圖（Stability Map）

**使用者故事**  
身為分析研究者，我想在 Kp-Ki 平面上看到系統的穩定區域，並能拖曳「當前設計點」即時看到 Step Response 的變化。

**觸發位置**  
設計 Tab → Controller Tuning section → 「穩定地圖 ⊞」按鈕  
或圖表 Tab 新增「穩定地圖」分頁

**視覺規格**

```
主要圖表（Plotly heatmap）：
  X 軸：Kp（log scale）
  Y 軸：Ki（log scale）
  Z 軸（顏色）：
    穩定 → 綠色（深淺代表 GM，越深越穩定）
    不穩定 → 紅色（深淺代表不穩定程度）
    邊界 → 白色等值線

  當前設計點：● 白色圓點（12px），可拖曳
  拖曳時：
    → 即時更新 Kp/Ki 數值
    → 右側顯示 mini Step Response 預覽
    → 左側 Stability Snapshot 同步更新

解析度：
  預設 20×20 格（400 次計算，背景非同步）
  用戶可選 40×40（更精細，需等待）

計算策略：
  Web Worker 或 requestIdleCallback 批次計算
  先渲染粗解析度，細化後更新
```

**實作**

```javascript
async function computeStabilityMap(sys, kpRange, kiRange, resolution) {
  const { kpMin, kpMax } = kpRange;
  const { kiMin, kiMax } = kiRange;
  const N = resolution; // e.g. 20
  const zData = [];

  for (let j = 0; j < N; j++) {
    const row = [];
    const ki = Math.pow(10, Math.log10(kiMin) + (j/(N-1)) * Math.log10(kiMax/kiMin));
    for (let i = 0; i < N; i++) {
      const kp = Math.pow(10, Math.log10(kpMin) + (i/(N-1)) * Math.log10(kpMax/kpMin));
      try {
        const cl = computeClosedLoopPID(sys, kp, ki, 0);
        const poles = cl.poles();
        const maxRe = Math.max(...poles.map(p => p.re));
        row.push(maxRe < 0 ? -maxRe : maxRe * (-1)); // 正 = 穩定，負 = 不穩定
      } catch { row.push(NaN); }
    }
    zData.push(row);
    await new Promise(r => setTimeout(r, 0)); // yield
    updateStabilityMapProgress(j / N);
  }
  return zData;
}
```

**驗收標準**
- [ ] 穩定/不穩定區域顏色正確
- [ ] 當前設計點顯示在正確位置
- [ ] 拖曳設計點後 Kp/Ki 即時更新
- [ ] 計算進度條顯示（400 格計算約 2–5 秒）
- [ ] 完整計算完成後可選高解析度

---

### P1-3｜Bode 動畫掃描

**使用者故事**  
身為學習者，我想看到 Kp 從小到大變化時，Bode 圖如何平移，PM/GM 如何縮小，建立「增益↑ → PM↓」的直覺。

**觸發位置**  
Bode 圖右上角「▶ 動畫」按鈕

**互動流程**

```
按「▶ 動畫」：
  → 出現浮動控制面板：
  ┌──────────────────────────────────────────┐
  │ ▶ 播放  ‖ 暫停  ◀ 重置                   │
  │ 速度：[──●────] 1×                        │
  │ 參數：[Kp ▾]   從 [0.1] 到 [10]  對數    │
  └──────────────────────────────────────────┘

  播放中：
    每 100ms 更新一幀（共 30 幀）
    Bode 曲線平滑更新（Plotly.animate 或 restyle）
    PM/GM 標注同步更新
    TopBar 顯示「Kp = 0.85 → ...」

  暫停：
    停在當前幀
    允許手動拖曳進度條到任意位置

  動畫結束：
    恢復到原始 Kp 值
```

**驗收標準**
- [ ] Bode 曲線動畫流暢（>20fps）
- [ ] PM/GM 標注同步更新
- [ ] 暫停後可拖曳進度條
- [ ] 結束後恢復原始值
- [ ] 速度可調（0.5× / 1× / 2×）

---

## P65 — 分享與輸出強化（Share & Export Enhancement）

---

### Q1-1｜URL 分享（設計序列化）

**使用者故事**  
身為控制設計者，我想把這個系統的設計（Plant 係數、Kp/Ki/Kd、規格）用一個連結傳給同事，他打開就能看到和我一模一樣的畫面。

**觸發位置**  
TopBar「分享」按鈕（或 ⋯ 選單）

**序列化規格**

```javascript
function serializeDesign() {
  const payload = {
    v: 2,  // schema version
    plant: serializePlant(state.plant),
    pid: state.pidParams,
    compensator: state.compensator,
    domain: state.domain,
    showClosedLoop: state.showClosedLoop,
    specs: serializeSpecs(),
    activePlot: state.activePlot,
    sidebarTab: state.sidebarTab,
    chartAnnotations: state.chartAnnotationsEnabled,
    snapshots: state.comparisonSnapshots.slice(0, 3), // 最多 3 個快照
    notes: localStorage.getItem('cs-design-notes') ?? '',
  };
  return payload;
}

function serializePlant(plant) {
  if (!plant) return null;
  if (plant instanceof TransferFunction) {
    return { type: 'tf', num: plant.num[0], den: plant.den };
  }
  // ...SS / ZPK
}

async function shareDesign() {
  const payload = serializeDesign();
  const json = JSON.stringify(payload);

  // LZ-string 壓縮（~70% 壓縮率）
  const compressed = LZString.compressToEncodedURIComponent(json);
  const url = `${location.origin}${location.pathname}#design=${compressed}`;

  // 複製到剪貼簿
  await navigator.clipboard.writeText(url);
  notify('設計連結已複製！', 'success', {
    title: '分享',
    body: `連結長度：${url.length} 字元`,
    duration: 3000,
  });
}

// 頁面載入時還原
function restoreFromURL() {
  const hash = location.hash;
  if (!hash.startsWith('#design=')) return false;
  try {
    const compressed = hash.slice(8);
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    const payload = JSON.parse(json);
    applyDesignPayload(payload);
    // 清除 hash（避免 reload 重複還原）
    history.replaceState(null, '', location.pathname);
    notify('已載入分享的設計', 'info');
    return true;
  } catch {
    notify('連結格式錯誤或已過期', 'error');
    return false;
  }
}
```

**依賴**：`lz-string` library（15KB，CDN）

**驗收標準**
- [ ] 分享連結可在新分頁正確還原（同一版本）
- [ ] URL 長度 < 2048 字元（典型 4 階系統）
- [ ] 包含 snapshot 的連結也能正確還原（最多 3 個）
- [ ] 版本不符時顯示明確錯誤提示
- [ ] 點擊「分享」後 URL 自動複製

---

### Q1-2｜程式碼生成 v2

**使用者故事**  
身為實作工程師，我想在生成的程式碼中看到設計推導說明，以及對應的 Python/MATLAB/C99 三種版本，並附上驗證用的單元測試。

**改善重點**（對比現有 `exportController()`）

```
現有：
  → 純程式碼，無說明
  → 僅 Python

新版：
  → 每個關鍵數字附上推導說明（// 或 # 格式）
  → 三種語言選擇（Python / MATLAB / C99）
  → 自動附上驗證測試 snippet
  → 可選：加入設計規格作為 assert/comment
```

**生成模板（Python）**

```python
# ControlStudio 自動生成
# 設計日期：2026-05-24
# 系統：G(s) = (4s²+5s+6)/(s²+3s+2)
# 控制器：PID，Kp=1.2, Ki=0.5, Kd=0.1
#
# 設計依據：
#   PM = 45.3°（規格 > 45°）✓
#   GM = 12.4 dB（規格 > 6 dB）✓
#   Overshoot = 8.2%（規格 < 10%）✓

import control as ct
import numpy as np

# 受控體（Plant）
num_G = [4, 5, 6]    # 4s² + 5s + 6
den_G = [1, 3, 2]    # s² + 3s + 2
G = ct.tf(num_G, den_G)

# PID 控制器：C(s) = Kp + Ki/s + Kd·s
# Kp=1.2：比例增益，DC 增益補償
# Ki=0.5：積分增益，消除穩態誤差（Type-1 閉迴路）
# Kd=0.1：微分增益，增加相位超前 ≈ 8.2°
Kp, Ki, Kd = 1.2, 0.5, 0.1
C = ct.tf([Kd, Kp, Ki], [1, 0])

# 閉迴路傳遞函數
T = ct.feedback(C * G, 1)

# 驗證
t, y = ct.step_response(T, T=np.linspace(0, 20, 500))
from scipy.signal import peak_widths
# assert overshoot < 0.10 ...

# 穩定性分析
gm, pm, _, _ = ct.margin(C * G)
print(f"GM = {20*np.log10(gm):.1f} dB, PM = {pm:.1f}°")
```

**語言切換 UI**

```
[Python] [MATLAB] [C99]  ← Tab 切換，下方程式碼即時更新
                           搭配現有 codeBlock() 元件
```

**驗收標準**
- [ ] Python/MATLAB/C99 三種語言正確生成
- [ ] 每個 PID 參數附上推導說明 comment
- [ ] 設計規格出現在檔案頭部 comment
- [ ] 附上可執行的驗證 snippet（Python: assert; MATLAB: assert; C99: unit test macro）
- [ ] 生成的 Python 程式碼可直接執行（使用 python-control）

---

### Q1-3｜一鍵 PDF 設計報告

**使用者故事**  
身為技術決策者，我想點一個按鈕生成完整的設計報告 PDF，包含系統摘要、所有圖表、指標表和程式碼，以便提交技術審查。

**觸發位置**  
TopBar「報告」按鈕（或 ⋯ 選單「生成 PDF 報告」）

**報告結構**

```
封面
  ControlStudio 設計報告
  系統名稱：[user input or auto]
  日期：2026-05-24
  版本：v1.0

1. 系統摘要
  1.1 受控體（Plant）
      傳遞函數：G(s) = ...（LaTeX）
      階數：n=2，極點：s = -1, -2
      特性：穩定 ✓，最小相位 ✓

  1.2 控制器
      PID：Kp=1.2, Ki=0.5, Kd=0.1
      閉迴路特徵值：s = ...

2. 性能指標
  表格：Rise Time / Settling Time / Overshoot / SS Error / PM / GM / DM

3. 圖表（各圖表 SVG，不失真）
  3.1 Step Response（含標注）
  3.2 Bode Plot（含 PM/GM 標注）
  3.3 Nyquist Diagram
  3.4 Root Locus
  3.5 Pole-Zero Map

4. 設計規格合規
  表格：規格 / 目標 / 實際值 / 狀態（✓/✗）

5. 程式碼
  Python-control 實作（含 comment）

6. 設計筆記
  user 在 Learn Tab 記下的備注

頁腳：ControlStudio v11, 自動生成，僅供參考
```

**技術實作（瀏覽器列印方案）**

```javascript
async function generatePDFReport() {
  // 1. 截取所有圖表為 SVG
  const charts = ['chart-active', 'chart-rlocus', 'chart-pzmap'];
  const svgs = {};
  for (const id of charts) {
    svgs[id] = await Plotly.toImage(id, { format: 'svg' });
  }

  // 2. 建立報告 HTML
  const html = buildReportHTML({ svgs, state });

  // 3. 開新 tab，注入 HTML + print CSS
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();

  // 4. 等待圖表載入後提示列印
  w.onload = () => {
    w.focus();
    notify('報告已在新分頁開啟，請使用「儲存為 PDF」列印', 'info', { duration: 5000 });
    // 可選：自動觸發列印 dialog
    // w.print();
  };
}
```

**Print CSS（報告頁面）**

```css
@media print {
  body { font-family: 'Georgia', serif; color: #000; background: #fff; }
  .page-break { page-break-before: always; }
  .no-print { display: none; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; }
  .pass { color: #16a34a; }
  .fail { color: #dc2626; }
  img { max-width: 100%; page-break-inside: avoid; }
}
```

**驗收標準**
- [ ] 點擊「報告」後在新 Tab 開啟報告 HTML
- [ ] 所有圖表以 SVG 嵌入（清晰不失真）
- [ ] 指標表數值與側欄一致
- [ ] 規格合規欄位顯示正確（✓/✗）
- [ ] 程式碼區塊可複製
- [ ] 瀏覽器列印為 PDF 後排版正確（無截斷）

---

### Q1-4｜圖表快速複製

**使用者故事**  
身為分析研究者，我想在 hover 圖表時，一鍵把圖表複製成 PNG，直接貼到 Slack 或 Word 文件。

**觸發位置**  
圖表右上角 hover 時出現「📋」按鈕（所有圖表）

**實作**

```javascript
async function copyChartToClipboard(chartId) {
  try {
    // Plotly.toImage 取得 dataURL
    const dataURL = await Plotly.toImage(chartId, {
      format: 'png', width: 1200, height: 600, scale: 2,
    });
    // 轉換為 Blob 並寫入剪貼簿
    const res = await fetch(dataURL);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    notify('圖表已複製為 PNG', 'success', { duration: 1500 });
  } catch (err) {
    // Fallback：開啟圖片在新 Tab
    const win = window.open();
    win.document.write(`<img src="${dataURL}" style="max-width:100%">`);
    notify('已在新分頁開啟圖表（請右鍵儲存）', 'info');
  }
}
```

**視覺規格**

```
📋 按鈕：
  出現時機：chart-cell hover 時（同現有 fullscreen/export 按鈕）
  位置：chart-header-actions 最右側
  icon：📋 或 SVG clipboard icon
  尺寸：同 btn-sm
  tooltip：「複製圖表為 PNG」

複製成功：
  按鈕短暫顯示「✓ 已複製」（1.5s），然後恢復
```

**驗收標準**
- [ ] 圖表 hover 時📋按鈕出現（不影響其他按鈕）
- [ ] 點擊後 PNG 進入系統剪貼簿
- [ ] 複製的 PNG 解析度為 @2x（適合 Retina）
- [ ] Clipboard API 不支援時 fallback 開新 Tab
- [ ] 三窗格的三個子圖各有獨立複製按鈕

---

## 實作 Checklist

### P60 側欄重組（8d）
- [ ] H1-1 側欄 Tab Bar（2d）
- [ ] H1-2 Accordion 折疊記憶（1d）
- [ ] H1-3 智慧 Badge（1d）
- [ ] H1-4 快速收藏 Pin（2d）
- [ ] H1-5 側欄搜尋（2d）

### P61 圖表標注（10d）
- [ ] J1-1 Step Response 標注（3d）
- [ ] J1-2 Bode PM/GM 標注（2d）
- [ ] J1-3 Root Locus 幾何標注（2d）
- [ ] J1-4 Nyquist 距離標注（2d）
- [ ] J1-5 標注開關（1d）

### P62 設計流程狀態機（9d）
- [ ] K1-1 五步流程進度列（2d）
- [ ] K1-2 步驟完成條件邏輯（2d）
- [ ] K1-3 情境智慧警示（3d）
- [ ] K1-4 Kp 快速推薦（2d）

### P63 量測工具（8d）
- [ ] L1-1 Delta 量測游標（3d）
- [ ] L1-2 跨圖連動游標（3d）
- [ ] L1-3 圖表備注 Pin（2d）

### P64 參數掃描（10d）
- [ ] P1-1 單參數掃描疊加（4d）
- [ ] P1-2 2D 穩定邊界圖（4d）
- [ ] P1-3 Bode 動畫掃描（2d）

### P65 分享輸出（10d）
- [ ] Q1-1 URL 分享（3d）
- [ ] Q1-2 程式碼生成 v2（3d）
- [ ] Q1-3 一鍵 PDF 報告（3d）
- [ ] Q1-4 圖表快速複製（1d）

---

*Round 2 合計：34 張功能規格卡，P60–P65，總估計 55d*  
*建議優先：P60（8d）→ P61（10d）— 解決側欄滾動疲勞與圖表可讀性兩大核心痛點*
