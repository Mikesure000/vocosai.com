// ============================================================
// 白标报告 + 客户交付模板引擎
// ============================================================

const REPORT_TEMPLATES = {
  weekly: {
    name: "周报模板",
    sections: ["本周概览", "内容分析亮点", "评论关键词云", "高价值评论 Top10", "内容策略建议", "下周行动项"],
    estimatedTime: "5分钟生成",
    suitableFor: "品牌内部周会、代运营周度汇报"
  },
  monthly: {
    name: "月报模板",
    sections: ["月度概览", "内容效果回顾", "评论趋势分析", "购买障碍变化", "用户需求聚类", "竞品对标", "内容生产卡合集", "下月策略规划"],
    estimatedTime: "10分钟生成",
    suitableFor: "品牌月度复盘、客户月度汇报"
  },
  quarterly: {
    name: "季报模板",
    sections: ["季度总结", "爆款内容复盘", "评论洞察全貌", "用户画像更新", "品类知识库更新建议", "竞品动态", "内容策略演进", "下季度KPI建议"],
    estimatedTime: "15分钟生成",
    suitableFor: "品牌季度总结、年度规划参考"
  },
  special: {
    name: "专题报告",
    sections: ["专题背景", "数据概览", "深度分析", "策略建议", "执行方案", "预期效果"],
    estimatedTime: "自定义",
    suitableFor: "特定活动复盘、新品上市分析"
  }
};

export function listReportTemplates() {
  return Object.entries(REPORT_TEMPLATES).map(([key, tpl]) => ({
    id: key, ...tpl
  }));
}

export function buildWhiteLabelReport(input) {
  const { reportData, template, whiteLabelConfig } = input;
  const tpl = REPORT_TEMPLATES[template] || REPORT_TEMPLATES.weekly;
  const config = whiteLabelConfig || {};

  const header = buildWhiteLabelHeader(config);
  const footer = buildWhiteLabelFooter(config);
  const sections = tpl.sections.map(section => buildSection(section, reportData, config));

  return {
    metadata: {
      template: template,
      generatedAt: new Date().toISOString(),
      whiteLabel: !!config.clientName,
      clientName: config.clientName || null,
      brandColor: config.brandColor || "#147d6f"
    },
    header,
    sections,
    footer,
    exports: {
      pdf: buildPdfPayload(header, sections, footer, config),
      markdown: buildMarkdownExport(header, sections, footer, tpl),
      ppt: { supported: false, message: "PPT导出将在后续版本支持" }
    }
  };
}

function buildWhiteLabelHeader(config) {
  const logoUrl = config.logoUrl || null;
  const clientName = config.clientName || "Vocos";
  const brandColor = config.brandColor || "#147d6f";
  const hideVocosBrand = config.hideBrand !== false; // 默认隐藏Vocos品牌

  return {
    logoUrl,
    title: clientName + (config.reportTitle || " · 内容策略分析报告"),
    subtitle: config.reportSubtitle || "基于评论区真实用户反馈的智能分析",
    brandColor,
    hideVocosBrand,
    date: new Date().toISOString().slice(0, 10)
  };
}

function buildWhiteLabelFooter(config) {
  return {
    text: config.footerText || `© ${config.clientName || "Vocos"} · AI驱动的内容策略分析`,
    hideVocosBrand: config.hideBrand !== false,
    pageNumber: true
  };
}

function buildSection(name, data, config) {
  const sectionBuilders = {
    "本周概览": () => ({ summary: data.summary || "暂无数据", keyMetrics: data.metrics || {} }),
    "内容分析亮点": () => ({ highlights: data.highlights || [] }),
    "评论关键词云": () => ({ keywords: data.keywords || [] }),
    "高价值评论 Top10": () => ({ topComments: data.topComments || [] }),
    "内容策略建议": () => ({ strategies: data.strategies || [] }),
    "下周行动项": () => ({ actionItems: data.actionItems || [] }),
    "内容生产卡合集": () => ({ cards: data.cards || [] }),
  };

  const builder = sectionBuilders[name] || (() => ({ content: `待填充: ${name}` }));
  return { name, ...builder() };
}

function buildPdfPayload(header, sections, footer, config) {
  return {
    format: "A4",
    orientation: "portrait",
    header,
    sections,
    footer,
    brandColor: config.brandColor || "#147d6f",
    watermark: config.hideBrand !== false ? null : "Powered by Vocos"
  };
}

function buildMarkdownExport(header, sections, footer, template) {
  let md = `# ${header.title}\n*${header.subtitle}*\n\n---\n\n`;

  for (const section of sections) {
    md += `## ${section.name}\n\n`;
    if (section.summary) md += `${section.summary}\n\n`;
    if (section.keywords?.length) md += `**关键词**: ${section.keywords.join(" · ")}\n\n`;
    if (section.topComments?.length) {
      section.topComments.slice(0, 5).forEach((c, i) => {
        md += `${i + 1}. "${c}"\n`;
      });
      md += "\n";
    }
    if (section.strategies?.length) {
      section.strategies.forEach(s => { md += `- **${s.title}**: ${s.description}\n`; });
      md += "\n";
    }
  }

  md += `---\n\n${footer.text}\n`;
  return md;
}

// 客户交付友好：格式化数字、友好日期、中文化
export function formatReportNumber(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatReportDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
