import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../shared/services/api";
import {
  Box, Typography, CircularProgress, Paper, Card, CardContent,
  Chip, Alert, Button, Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";
import { ExpandMore, PlayCircle, AutoStories } from "@mui/icons-material";

export default function ProductionCardsPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cards, setCards] = useState<any[]>([]);
  const [generating, setGenerating] = useState<string>("");

  const load = () => {
    if (!taskId) return;
    setLoading(true);
    api.listProductionCards(taskId).then((d: any) => {
      setCards(d.data || []);
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  const generate = (platform: string) => {
    if (!taskId) return;
    setGenerating(platform);
    api.generateProductionCard(taskId, platform).then(() => {
      setTimeout(load, 1000);
    }).catch((e: Error) => setError(e.message)).finally(() => setGenerating(""));
  };

  useEffect(() => { load(); }, [taskId]);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>内容生产卡</Typography>
          <Typography color="text.secondary">基于归因分析生成可执行的抖音/小红书内容脚本</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Generate buttons */}
      <Paper sx={{ p: 3, mb: 3, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>生成新的生产卡</Typography>
        <Box sx={{ display: "flex", gap: 2, justifyContent: "center", mt: 2 }}>
          <Button
            variant="contained"
            startIcon={generating === "douyin" ? <CircularProgress size={16} color="inherit" /> : <PlayCircle />}
            onClick={() => generate("douyin")}
            disabled={generating !== ""}
            sx={{ bgcolor: "#147d6f", minWidth: 160 }}
          >
            {generating === "douyin" ? "生成中..." : "🎵 抖音生产卡"}
          </Button>
          <Button
            variant="contained"
            startIcon={generating === "xiaohongshu" ? <CircularProgress size={16} color="inherit" /> : <AutoStories />}
            onClick={() => generate("xiaohongshu")}
            disabled={generating !== ""}
            sx={{ bgcolor: "#c04b1f", minWidth: 160 }}
          >
            {generating === "xiaohongshu" ? "生成中..." : "📕 小红书生产卡"}
          </Button>
        </Box>
      </Paper>

      {/* Card list */}
      {cards.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            暂无生产卡 — 请先{" "}
            <Link to={`/attribution/${taskId}`} style={{ color: "#147d6f" }}>完成归因分析</Link>
            ，然后点击上方按钮生成内容脚本
          </Typography>
        </Paper>
      ) : (
        cards.map((card: any) => <ProductionCardDetail key={card.id} card={card} />)
      )}
    </Box>
  );
}

function ProductionCardDetail({ card }: { card: any }) {
  const isDouyin = card.card_type === "douyin";
  const numFields = Object.keys(card).filter(k => !["id", "taskId", "agent_run_id"].includes(k)).length;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Chip
              label={isDouyin ? "🎵 抖音" : "📕 小红书"}
              size="small"
              color={isDouyin ? "primary" : "warning"}
            />
            <Typography variant="h6">{card.title}</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <StatusBadge status={card.status} qcResult={card.quality_check_result} />
            <Typography variant="caption" color="text.secondary">{numFields} 字段</Typography>
          </Box>
        </Box>

        {/* QC Score + Approval Actions */}
        {card.quality_check_result && (
          <Box sx={{ display: "flex", gap: 2, mb: 2, p: 1.5, bgcolor: "#f8f9fa", borderRadius: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Chip label={`质检 ${card.quality_check_result.totalScore}/100`} size="small"
              color={card.quality_check_result.totalScore >= 80 ? "success" : card.quality_check_result.totalScore >= 60 ? "warning" : "error"} />
            <Chip label={card.quality_check_result.verdict === "approve" ? "可发布" : card.quality_check_result.verdict === "revise" ? "需修改" : "不可发布"}
              size="small" color={card.quality_check_result.verdict === "approve" ? "success" : "warning"} />
            {card.quality_check_result.checks?.filter((c:any) => c.result !== "pass").slice(0, 2).map((c:any) => (
              <Chip key={c.check_type} label={`⚠ ${c.check_type}: ${c.score}分`} size="small" variant="outlined" color="warning" />
            ))}
          </Box>
        )}

        {/* Core fields summary */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          痛点: {card.target_audience_pain_point?.slice(0, 60)}...
        </Typography>

        {card.selling_points && (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
            {card.selling_points.map((sp: any, i: number) => (
              <Chip key={i} label={`卖点: ${sp.point}`} size="small" variant="outlined" color="success" />
            ))}
          </Box>
        )}

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>查看完整脚本结构</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {card.script_structure?.map((seg: any, i: number) => (
              <Box key={i} sx={{ mb: 1, p: 1, bgcolor: i % 2 === 0 ? "#f5f5f5" : "white", borderRadius: 1 }}>
                <Chip label={`${seg.segment} (${seg.duration})`} size="small" color="primary" sx={{ mb: 0.5 }} />
                <Typography variant="body2">{seg.content}</Typography>
                {seg.visual && (
                  <Typography variant="caption" color="text.secondary">视觉: {seg.visual}</Typography>
                )}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>全文案 / 口播稿</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Paper variant="outlined" sx={{ p: 2, whiteSpace: "pre-wrap", fontSize: "0.85rem", fontFamily: "monospace", bgcolor: "#fafafa" }}>
              {card.copywriting}
            </Paper>
          </AccordionDetails>
        </Accordion>

        {card.supporting_evidence && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                证据链 ({card.supporting_evidence.length} 条评论)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {card.supporting_evidence.map((e: string, i: number) => (
                <Typography key={i} variant="body2" sx={{ mb: 0.5, p: 1, bgcolor: "#f9f9f9", borderRadius: 1 }}>
                  "{e}"
                </Typography>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {/* AB test + Expected outcome */}
        <Box sx={{ mt: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
          {card.ab_test_variables && (
            <Alert severity="info" variant="outlined" sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>AB测试变量</Typography>
              {card.ab_test_variables.map((v: any, i: number) => (
                <Typography key={i} variant="caption" sx={{ display: "block" }}>
                  {v.variable}: {v.variantA} vs {v.variantB}
                </Typography>
              ))}
            </Alert>
          )}
          {card.expected_outcome && (
            <Alert severity="success" variant="outlined" sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>预期效果</Typography>
              <Typography variant="caption" sx={{ display: "block" }}>{card.expected_outcome}</Typography>
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, qcResult }: { status: string; qcResult?: any }) {
  const score = qcResult?.totalScore;
  if (status === "approved") return <Chip label="已批准" size="small" color="success" />;
  if (status === "pending_review") return <Chip label="待审批" size="small" color="warning" />;
  if (status === "rejected") return <Chip label="已驳回" size="small" color="error" />;
  if (score >= 80) return <Chip label="可发布" size="small" color="success" variant="outlined" />;
  return <Chip label={status || "draft"} size="small" variant="outlined" />;
}
