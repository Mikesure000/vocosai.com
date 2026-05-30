const app = document.querySelector("#app");
const title = document.querySelector("#viewTitle");
const desc = document.querySelector("#viewDesc");
const statusEl = document.querySelector("#apiStatus");
const activeBrandLabel = document.querySelector("#activeBrandLabel");

const views = {
  dashboard: ["本周决策台", "核心指标、Top5 建议动作和模块职责矩阵"],
  brands: ["多品牌管理", "品牌独立工作区、品牌切换和品类标签共享"],
  comments: ["持续导入", "去重导入、增量 AI、导入历史和评论浏览"],
  review: ["审核工作台", "AI 产出进入人工审核，支持三态流转和置信度标记"],
  briefs: ["策略 Brief", "把策略卡转成可执行 Brief，并支持 CSV 导出"],
  search: ["全局搜索", "跨评论、需求、障碍、策略、报告和知识库检索"],
  demands: ["用户需求地图", "高频需求、趋势和建议动作"],
  barriers: ["购买障碍地图", "价格、信任、效果、风险等障碍拆解"],
  competitors: ["竞品机会地图", "竞品优势、弱点和我方切入机会"],
  xhs: ["小红书策略卡", "封面、标题、正文、标签和发布时间"],
  douyin: ["抖音策略卡", "钩子、分镜、BGM、达人和人群定向"],
  content: ["内容资产池", "沉淀待分析和已分析的内容素材"],
  lab: ["内容实验室", "A/B 测试方案、预算和放大规则"],
  reviews: ["复盘归因中心", "投放结果、归因结论和下一步动作"],
  reports: ["报告中心", "面向不同角色生成汇报内容"],
  brand: ["品牌中心", "当前品牌档案、定位和产品知识"],
  benchmark: ["对标中心", "竞品知识库、SWOT 和产品对标"],
  knowledge: ["品类知识库", "人群、障碍、场景、卖点和竞品标签"],
  ai: ["AI 分析引擎", "10 Agent 链路、执行模式和运行记录"],
  system: ["系统修复", "清 Demo、周快照和运维入口"],
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function setLoading() {
  app.innerHTML = document.querySelector("#loading").innerHTML;
}

function toast(message, isError = false) {
  const node = document.createElement("div");
  node.className = isError ? "toast error" : "toast";
  node.textContent = message;
  app.prepend(node);
  setTimeout(() => node.remove(), 6000);
}

async function refreshBrandLabel() {
  try {
    const brands = await api("/api/brands");
    const active = brands.items.find((b) => b.id === brands.active_brand_id) || brands.items[0];
    activeBrandLabel.textContent = active ? `${active.name} 工作区` : "未设置品牌";
  } catch {
    activeBrandLabel.textContent = "品牌未连接";
  }
}

async function health() {
  try {
    await api("/api/health");
    statusEl.textContent = "API connected";
    await refreshBrandLabel();
  } catch {
    statusEl.textContent = "API offline";
    statusEl.classList.add("error");
  }
}

function metric(label, value) {
  return `<div class="card"><div class="metric">${esc(value)}</div><div class="label">${esc(label)}</div></div>`;
}

function priorityClass(p) {
  return p === "P0" ? "p0" : p === "P1" ? "p1" : "p2";
}

function trimEvidence(evidence) {
  try {
    const parsed = JSON.parse(evidence);
    if (Array.isArray(parsed)) return parsed.slice(0, 2).join(" / ");
  } catch {}
  return evidence || "";
}

function strategyCard(s, platform = "") {
  return `
    <article class="card">
      <span class="badge ${priorityClass(s.priority)}">${esc(s.priority || "P2")}</span>
      <span class="badge">${esc(platform || s.status || "draft")}</span>
      <span class="badge">${esc(s.review_status || "pending")}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.subtitle || s.body)}</p>
      ${s.evidence ? `<div class="label">${esc(trimEvidence(s.evidence))}</div>` : ""}
      <div class="actions compact"><button class="secondary makeBrief" data-id="${esc(s.id)}">生成 Brief</button></div>
    </article>
  `;
}

function table(items, columns) {
  if (!items || !items.length) return `<div class="empty">暂无数据</div>`;
  return `
    <table class="table">
      <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${items.map((item) => `<tr>${columns.map((c) => `<td>${esc(c.render ? c.render(item) : item[c.key])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function wireBriefButtons() {
  document.querySelectorAll(".makeBrief").forEach((button) => {
    button.onclick = async () => {
      try {
        const brief = await api("/api/briefs/from-strategy", { method: "POST", body: JSON.stringify({ strategy_id: Number(button.dataset.id) }) });
        toast(`已生成 Brief：${brief.title}`);
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
}

async function renderDashboard() {
  setLoading();
  const [data, modules] = await Promise.all([api("/api/dashboard"), api("/api/modules")]);
  const m = data.metrics;
  app.innerHTML = `
    <div class="hero-strip">
      <div>
        <div class="label">当前工作区</div>
        <h2>${esc(data.brand?.name || "默认品牌")}</h2>
        <p>${esc(data.brand?.positioning || "评论驱动策略工作台")}</p>
      </div>
      <button class="secondary" id="snapshotBtn">生成周快照</button>
    </div>
    <div class="grid metrics">
      ${metric("评论数", m.comments)}
      ${metric("需求洞察", m.demands)}
      ${metric("购买障碍", m.barriers)}
      ${metric("策略卡", m.strategies)}
      ${metric("内容资产", m.content)}
      ${metric("测试方案", m.tests)}
      ${metric("复盘记录", m.reviews)}
      ${metric("平均 CVR", m.avgCvr)}
    </div>
    <div class="section">
      <div class="section-title">本周优先动作</div>
      <div class="grid two">${data.actions.map((s) => strategyCard(s)).join("")}</div>
    </div>
    <div class="section">
      <div class="section-title">14 模块职责矩阵</div>
      ${table(modules.items, [
        { label: "分组", key: "group" },
        { label: "模块", key: "module" },
        { label: "输入", key: "input" },
        { label: "输出", key: "output" },
        { label: "数据量", key: "count" },
      ])}
    </div>
  `;
  document.querySelector("#snapshotBtn").onclick = async () => {
    const result = await api("/api/snapshots/weekly", { method: "POST", body: "{}" });
    toast(`周快照已生成：${result.week_start}`);
  };
  wireBriefButtons();
}

async function renderBrands() {
  setLoading();
  const brands = await api("/api/brands");
  app.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>新增/编辑品牌</h3>
        <div class="grid two">
          <label>品牌名<input id="brandName"></label>
          <label>行业<input id="brandIndustry"></label>
        </div>
        <label>Slogan<input id="brandSlogan"></label>
        <label>品类标签<input id="brandCategories" placeholder="用逗号分隔，如 护肤,敏感肌,修护"></label>
        <label>定位<textarea id="brandPositioning"></textarea></label>
        <div class="actions"><button class="primary" id="saveNewBrand">保存品牌</button></div>
      </div>
      <div class="card">
        <h3>品牌工作区</h3>
        ${table(brands.items, [
          { label: "品牌", render: (b) => `${b.is_active ? "当前 · " : ""}${b.name}` },
          { label: "行业", key: "industry" },
          { label: "标签", render: (b) => Array.isArray(b.categories) ? b.categories.join(" / ") : "" },
        ])}
      </div>
    </div>
    <div class="section"><div class="section-title">切换品牌</div>
      <div class="grid three">${brands.items.map((b) => `
        <div class="card">
          <span class="badge">${b.is_active ? "当前" : "可切换"}</span>
          <h3>${esc(b.name)}</h3>
          <p>${esc(b.positioning)}</p>
          <div class="actions compact"><button class="secondary switchBrand" data-id="${b.id}">切换到此品牌</button></div>
        </div>`).join("")}
      </div>
    </div>
  `;
  document.querySelector("#saveNewBrand").onclick = async () => {
    await api("/api/brands", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#brandName").value,
        industry: document.querySelector("#brandIndustry").value,
        slogan: document.querySelector("#brandSlogan").value,
        categories: document.querySelector("#brandCategories").value,
        positioning: document.querySelector("#brandPositioning").value,
      }),
    });
    toast("品牌已保存");
    await renderBrands();
    await refreshBrandLabel();
  };
  document.querySelectorAll(".switchBrand").forEach((button) => {
    button.onclick = async () => {
      await api("/api/brands/switch", { method: "POST", body: JSON.stringify({ id: Number(button.dataset.id) }) });
      toast("品牌工作区已切换");
      await refreshBrandLabel();
      await renderBrands();
    };
  });
}

async function renderComments() {
  setLoading();
  const [data, imports] = await Promise.all([api("/api/comments?limit=120"), api("/api/imports")]);
  app.innerHTML = `
    <div class="card">
      <div class="form-row">
        <input id="commentSearch" placeholder="搜索评论、作者或标签">
        <select id="commentType">
          <option value="">全部类型</option>
          <option value="demand">需求</option>
          <option value="barrier">障碍</option>
          <option value="intent">购买意图</option>
          <option value="praise">好评</option>
          <option value="complaint">投诉</option>
          <option value="comparison">对比</option>
        </select>
        <button class="secondary" id="searchBtn">搜索</button>
      </div>
      <textarea id="importText" placeholder="粘贴 CSV 或 JSON 评论数据。导入时会按评论ID或 作者+内容+时间 自动去重。"></textarea>
      <div class="actions" style="margin-top:10px">
        <button class="primary" id="importCsv">去重导入 CSV</button>
        <button class="secondary" id="importJson">去重导入 JSON</button>
        <button class="secondary" id="importIncremental">导入并增量分析</button>
      </div>
    </div>
    <div class="section"><div class="section-title">导入历史</div>${table(imports.items, [
      { label: "时间", key: "created_at" },
      { label: "模式", key: "mode" },
      { label: "总数", key: "total_rows" },
      { label: "新增", key: "inserted_rows" },
      { label: "重复", key: "duplicate_rows" },
      { label: "状态", key: "status" },
    ])}</div>
    <div class="section">
      <div class="section-title">评论列表</div>
      <div id="commentsTable">${commentsTable(data.items)}</div>
    </div>
  `;
  document.querySelector("#searchBtn").onclick = loadComments;
  document.querySelector("#importCsv").onclick = () => importComments("csv", false);
  document.querySelector("#importJson").onclick = () => importComments("json", false);
  document.querySelector("#importIncremental").onclick = () => importComments("csv", true);
}

async function loadComments() {
  const search = encodeURIComponent(document.querySelector("#commentSearch").value.trim());
  const type = encodeURIComponent(document.querySelector("#commentType").value);
  const data = await api(`/api/comments?limit=120&search=${search}&type=${type}`);
  document.querySelector("#commentsTable").innerHTML = commentsTable(data.items);
}

function commentsTable(items) {
  return table(items, [
    { label: "内容", render: (c) => `${c.content} ${Array.isArray(c.labels) ? c.labels.join(" / ") : ""}` },
    { label: "作者", key: "author" },
    { label: "类型", key: "type" },
    { label: "情感", key: "sentiment" },
    { label: "点赞", key: "likes" },
  ]);
}

async function importComments(format, incremental) {
  const text = document.querySelector("#importText").value.trim();
  if (!text) return toast("请先粘贴数据", true);
  try {
    const result = await api("/api/comments/import", {
      method: "POST",
      body: JSON.stringify({ format, text, dedupe: true, incremental, mode: incremental ? "incremental" : "dedupe" }),
    });
    toast(`新增 ${result.imported} 条，重复 ${result.duplicates} 条${result.run ? `，增量分析 ${result.run.status}` : ""}`);
    await renderComments();
  } catch (err) {
    toast(err.message, true);
  }
}

async function renderReview() {
  const data = await loadList("/api/review");
  app.innerHTML = `
    <div class="grid metrics">
      ${metric("待审", data.counts.pending || 0)}
      ${metric("通过", data.counts.approved || 0)}
      ${metric("驳回", data.counts.rejected || 0)}
      ${metric("总计", data.items.length)}
    </div>
    <div class="section"><div class="section-title">AI 产出审核</div>
      <div class="grid two">${data.items.map((item) => `
        <div class="card">
          <span class="badge">${esc(item.source_table)}</span>
          <span class="badge ${item.status === "pending" ? "p1" : item.status === "approved" ? "" : "p0"}">${esc(item.status)}</span>
          <span class="badge">置信度 ${esc(item.confidence)}</span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.summary)}</p>
          <label>审核备注<input class="reviewNote" data-id="${item.id}" value="${esc(item.notes)}"></label>
          <div class="actions compact">
            <button class="secondary reviewAction" data-id="${item.id}" data-status="approved">通过</button>
            <button class="secondary reviewAction" data-id="${item.id}" data-status="rejected">驳回</button>
            <button class="secondary reviewAction" data-id="${item.id}" data-status="pending">待审</button>
          </div>
        </div>`).join("")}</div>
    </div>
  `;
  document.querySelectorAll(".reviewAction").forEach((button) => {
    button.onclick = async () => {
      const input = document.querySelector(`.reviewNote[data-id="${button.dataset.id}"]`);
      await api("/api/review/update", { method: "POST", body: JSON.stringify({ id: Number(button.dataset.id), status: button.dataset.status, notes: input.value }) });
      toast("审核状态已更新");
      await renderReview();
    };
  });
}

async function renderBriefs() {
  const [briefs, strategies] = await Promise.all([loadList("/api/briefs"), api("/api/strategies")]);
  app.innerHTML = `
    <div class="card">
      <h3>从策略卡生成 Brief</h3>
      <div class="form-row">
        <select id="strategySelect">${strategies.items.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join("")}</select>
        <input id="briefBudget" placeholder="预算，可选">
        <button class="primary" id="createBrief">生成 Brief</button>
      </div>
      <div class="actions"><a class="button-link" href="/api/briefs/export" target="_blank">导出 Excel/CSV</a></div>
    </div>
    <div class="section"><div class="section-title">Brief 列表</div>${table(briefs.items, [
      { label: "标题", key: "title" },
      { label: "平台", key: "platform" },
      { label: "目标", key: "objective" },
      { label: "受众", key: "audience" },
      { label: "KPI", key: "kpi" },
      { label: "状态", key: "status" },
    ])}</div>
  `;
  document.querySelector("#createBrief").onclick = async () => {
    const result = await api("/api/briefs/from-strategy", {
      method: "POST",
      body: JSON.stringify({ strategy_id: Number(document.querySelector("#strategySelect").value), budget: document.querySelector("#briefBudget").value }),
    });
    toast(`已生成 Brief：${result.title}`);
    await renderBriefs();
  };
}

async function renderSearch() {
  app.innerHTML = `
    <div class="card">
      <div class="form-row">
        <input id="globalSearchInput" placeholder="输入关键词，搜索全库">
        <button class="primary" id="globalSearchBtn">搜索</button>
      </div>
    </div>
    <div class="section"><div class="section-title">搜索结果</div><div id="searchResults" class="empty">等待搜索</div></div>
  `;
  document.querySelector("#globalSearchBtn").onclick = async () => {
    const q = encodeURIComponent(document.querySelector("#globalSearchInput").value.trim());
    const result = await api(`/api/search?q=${q}`);
    document.querySelector("#searchResults").innerHTML = table(result.items, [
      { label: "类型", key: "type" },
      { label: "标题", key: "title" },
      { label: "内容", key: "body" },
    ]);
  };
}

async function renderDemands() {
  const data = await loadList("/api/demands");
  app.innerHTML = `<div class="grid two">${data.items.map((d) => `
    <div class="card"><span class="badge">${esc(d.category)}</span><span class="badge">${esc(d.trend)}</span><span class="badge">${esc(d.review_status || "pending")}</span><h3>${esc(d.text)}</h3><p>${esc(d.action)}</p><div class="label">频次 ${esc(d.frequency)}</div></div>
  `).join("")}</div>`;
}

async function renderBarriers() {
  const data = await loadList("/api/barriers");
  app.innerHTML = `<div class="grid two">${data.items.map((b) => `
    <div class="card"><span class="badge ${b.severity === "high" ? "p0" : "p1"}">${esc(b.severity)}</span><span class="badge">${esc(b.type)}</span><span class="badge">${esc(b.review_status || "pending")}</span><h3>${esc(b.text)}</h3><p>${esc(b.solution)}</p><div class="label">命中 ${esc(b.count)}</div></div>
  `).join("")}</div>`;
}

async function renderCompetitors() {
  const data = await loadList("/api/competitors");
  app.innerHTML = `<div class="grid three">${data.items.map((c) => `
    <div class="card"><h3>${esc(c.competitor)}</h3><p><strong>优势：</strong>${esc(c.strength)}</p><p><strong>弱点：</strong>${esc(c.weakness)}</p><p><strong>机会：</strong>${esc(c.opportunity)}</p><div class="label">${esc(c.action)}</div></div>
  `).join("")}</div>`;
}

async function renderStrategies(platform) {
  const data = await loadList("/api/strategies");
  const keyword = platform === "xhs" ? "小红书" : platform === "douyin" ? "抖音" : "";
  const items = keyword ? data.items.filter((s) => `${s.title} ${s.subtitle} ${s.body}`.includes(keyword)) : data.items;
  const shown = items.length ? items : data.items;
  app.innerHTML = `<div class="grid two">${shown.map((s) => strategyCard(s, keyword || "通用策略")).join("")}</div>`;
  wireBriefButtons();
}

async function renderContent() {
  const data = await loadList("/api/content");
  app.innerHTML = table(data.items, [
    { label: "平台", key: "platform" },
    { label: "标题", key: "title" },
    { label: "类型", key: "content_type" },
    { label: "摘要", key: "summary" },
    { label: "已分析", render: (x) => x.is_analyzed ? "是" : "否" },
  ]);
}

async function renderLab() {
  const data = await loadList("/api/lab");
  app.innerHTML = `<div class="grid two">${data.items.map((p) => `
    <div class="card"><span class="badge">${esc(p.status)}</span><h3>${esc(p.objective)}</h3><p>${esc(p.strategy_title)}</p><p>${esc(p.variants)}</p><div class="label">预算 ${esc(p.budget)} · ${esc(p.success_rule)}</div></div>
  `).join("")}</div>`;
}

async function renderReviews() {
  const data = await loadList("/api/reviews");
  app.innerHTML = `<div class="grid two">${data.items.map((r) => `
    <div class="card"><h3>${esc(r.title)}</h3><p><strong>结果：</strong>${esc(r.result)}</p><p><strong>归因：</strong>${esc(r.attribution)}</p><div class="label">${esc(r.next_action)}</div></div>
  `).join("")}</div>`;
}

async function renderReports() {
  const data = await loadList("/api/reports");
  app.innerHTML = `
    <div class="card">
      <div class="form-row">
        <input id="reportAudience" placeholder="报告对象，如 老板/执行/投放/客户">
        <select id="reportCadence"><option value="weekly">weekly</option><option value="monthly">monthly</option></select>
        <button class="primary" id="generateReport">生成报告</button>
      </div>
    </div>
    <div class="grid three section">${data.items.map((r) => `
      <div class="card"><span class="badge">${esc(r.cadence)}</span><h3>${esc(r.title)}</h3><p>${esc(r.scope)}</p><div class="label">面向：${esc(r.audience)}</div></div>
    `).join("")}</div>
  `;
  document.querySelector("#generateReport").onclick = async () => {
    await api("/api/reports/generate", { method: "POST", body: JSON.stringify({ audience: document.querySelector("#reportAudience").value || "老板/管理层", cadence: document.querySelector("#reportCadence").value }) });
    toast("报告已生成");
    await renderReports();
  };
}

async function renderBrand() {
  setLoading();
  const result = await api("/api/brand");
  const b = result.data;
  app.innerHTML = `
    <div class="card">
      <div class="grid two">
        <label>品牌名<input id="brandName" value="${esc(b.name)}"></label>
        <label>行业<input id="brandIndustry" value="${esc(b.industry)}"></label>
      </div>
      <label>Slogan<input id="brandSlogan" value="${esc(b.slogan)}"></label>
      <label>品类标签<input id="brandCategories" value="${esc(Array.isArray(b.categories) ? b.categories.join(",") : "")}"></label>
      <label>定位<textarea id="brandPositioning">${esc(b.positioning || "")}</textarea></label>
      <div class="actions"><button class="primary" id="saveBrand">保存当前品牌</button></div>
    </div>
  `;
  document.querySelector("#saveBrand").onclick = async () => {
    await api("/api/brand", {
      method: "PUT",
      body: JSON.stringify({
        name: document.querySelector("#brandName").value,
        industry: document.querySelector("#brandIndustry").value,
        slogan: document.querySelector("#brandSlogan").value,
        categories: document.querySelector("#brandCategories").value,
        positioning: document.querySelector("#brandPositioning").value,
      }),
    });
    toast("品牌信息已保存");
    await refreshBrandLabel();
  };
}

async function renderKnowledge() {
  const data = await loadList("/api/knowledge");
  app.innerHTML = `
    <div class="actions"><button class="primary" id="inferKnowledge">从洞察推理沉淀知识</button></div>
    <div class="grid three section">${data.items.map((k) => `
      <div class="card"><span class="badge">${esc(k.dimension)}</span><span class="badge">置信度 ${esc(k.confidence || 70)}</span><h3>${esc(k.tag)}</h3><p>${esc(k.note)}</p></div>
    `).join("")}</div>
  `;
  document.querySelector("#inferKnowledge").onclick = async () => {
    const result = await api("/api/knowledge/infer", { method: "POST", body: "{}" });
    toast(`已沉淀 ${result.inserted} 条知识`);
    await renderKnowledge();
  };
}

async function renderAI() {
  setLoading();
  const [settings, runs, flow, steps] = await Promise.all([api("/api/ai/settings"), api("/api/ai/runs"), api("/api/agents"), api("/api/ai/steps")]);
  app.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>AI 配置</h3>
        <p>API Key 保存到服务端，前端不直接调用模型。未配置 Key 时会使用本地回退，保证流程可运行。</p>
        <label>Provider<select id="aiProvider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义兼容接口</option></select></label>
        <label>Model<input id="aiModel" value="${esc(settings.model || "deepseek-chat")}"></label>
        <label>Base URL<input id="aiBase" value="${esc(settings.base_url || "")}" placeholder="自定义接口填写，例如 https://api.example.com/v1"></label>
        <label>API Key<input id="aiKey" type="password" placeholder="${settings.has_key ? "已配置，留空保持不变" : "请输入 API Key"}"></label>
        <div class="actions">
          <button class="primary" id="saveAi">保存配置</button>
          <button class="secondary" id="runAi">运行全链路</button>
          <button class="secondary" id="runInsight">仅洞察</button>
          <button class="secondary" id="runStrategy">仅策略</button>
        </div>
      </div>
      <div class="card">
        <h3>Agent 依赖链</h3>
        <div class="grid">${flow.agents.map((a) => `<div><span class="badge">${esc(a.layer)}</span><strong>${esc(a.name)}</strong><div class="label">依赖：${esc(a.depends_on.join(" + ") || "无")} · 写入：${esc(a.writes.join(", "))}</div></div>`).join("")}</div>
      </div>
    </div>
    <div class="section"><div class="section-title">最近运行</div>${table(runs.items, [
      { label: "时间", key: "created_at" },
      { label: "模式", key: "mode" },
      { label: "状态", key: "status" },
      { label: "摘要", key: "summary" },
    ])}</div>
    <div class="section"><div class="section-title">最近 Agent 步骤</div>${agentStepsTable(steps.items)}</div>
    <div id="aiResult"></div>
  `;
  document.querySelector("#aiProvider").value = settings.provider || "deepseek";
  document.querySelector("#saveAi").onclick = saveAi;
  document.querySelector("#runAi").onclick = () => runAi("full");
  document.querySelector("#runInsight").onclick = () => runAi("insight");
  document.querySelector("#runStrategy").onclick = () => runAi("strategy");
}

async function saveAi() {
  try {
    await api("/api/ai/settings", {
      method: "POST",
      body: JSON.stringify({
        provider: document.querySelector("#aiProvider").value,
        model: document.querySelector("#aiModel").value,
        base_url: document.querySelector("#aiBase").value,
        api_key: document.querySelector("#aiKey").value,
      }),
    });
    toast("AI 配置已保存");
  } catch (err) {
    toast(err.message, true);
  }
}

function agentStepsTable(items) {
  return table(items, [
    { label: "Run", key: "run_id" },
    { label: "层", key: "layer" },
    { label: "Agent", key: "agent_name" },
    { label: "状态", key: "status" },
    { label: "写入", key: "records_written" },
    { label: "耗时", render: (x) => `${x.latency_ms || 0}ms` },
    { label: "输入", key: "input_summary" },
  ]);
}

async function runAi(mode = "full") {
  const buttons = ["#runAi", "#runInsight", "#runStrategy"].map((id) => document.querySelector(id)).filter(Boolean);
  const box = document.querySelector("#aiResult");
  buttons.forEach((button) => button.disabled = true);
  box.innerHTML = `<div class="empty">后端 Agent 执行中：${esc(mode)}</div>`;
  try {
    const result = await api("/api/ai/run", { method: "POST", body: JSON.stringify({ mode }) });
    box.innerHTML = `
      <div class="toast"><strong>${esc(result.status)}</strong> Run #${esc(result.id)} · ${esc(result.summary)} · ${esc(result.latency_ms)}ms · ${esc(result.tokens)} tokens</div>
      <div class="section"><div class="section-title">本次执行步骤</div>${agentStepsTable(result.steps || [])}</div>
    `;
  } catch (err) {
    box.innerHTML = `<div class="toast error">${esc(err.message)}</div>`;
  } finally {
    buttons.forEach((button) => button.disabled = false);
  }
}

async function renderSystem() {
  const snapshots = await loadList("/api/snapshots");
  app.innerHTML = `
    <div class="grid two">
      <div class="card">
        <h3>清除当前品牌 Demo 数据</h3>
        <p>保留品牌、AI Key 和系统配置，清空当前品牌下的评论、洞察、策略、报告、Brief、审核和运行记录。</p>
        <button class="secondary danger" id="clearDemo">清除 Demo</button>
      </div>
      <div class="card">
        <h3>周快照</h3>
        <p>用于持续导入后的阶段性归档。</p>
        <button class="primary" id="createSnapshot">生成周快照</button>
      </div>
    </div>
    <div class="section"><div class="section-title">历史快照</div>${table(snapshots.items, [
      { label: "周期", key: "week_start" },
      { label: "摘要", key: "summary" },
      { label: "时间", key: "created_at" },
    ])}</div>
  `;
  document.querySelector("#clearDemo").onclick = async () => {
    if (!confirm("确认清除当前品牌的 Demo/运行数据？此操作不可恢复。")) return;
    await api("/api/system/clear-demo", { method: "POST", body: "{}" });
    toast("当前品牌 Demo 数据已清除");
  };
  document.querySelector("#createSnapshot").onclick = async () => {
    const result = await api("/api/snapshots/weekly", { method: "POST", body: "{}" });
    toast(`周快照已生成：${result.week_start}`);
    await renderSystem();
  };
}

async function loadList(path) {
  setLoading();
  return api(path);
}

async function navigate(view) {
  document.querySelectorAll(".nav").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  title.textContent = views[view][0];
  desc.textContent = views[view][1];
  const renderers = {
    dashboard: renderDashboard,
    brands: renderBrands,
    comments: renderComments,
    review: renderReview,
    briefs: renderBriefs,
    search: renderSearch,
    demands: renderDemands,
    barriers: renderBarriers,
    competitors: renderCompetitors,
    xhs: () => renderStrategies("xhs"),
    douyin: () => renderStrategies("douyin"),
    content: renderContent,
    lab: renderLab,
    reviews: renderReviews,
    reports: renderReports,
    brand: renderBrand,
    benchmark: renderCompetitors,
    knowledge: renderKnowledge,
    ai: renderAI,
    system: renderSystem,
  };
  try {
    await renderers[view]();
  } catch (err) {
    app.innerHTML = `<div class="empty error">${esc(err.message)}</div>`;
  }
}

document.querySelectorAll(".nav").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));

health();
navigate("dashboard");
