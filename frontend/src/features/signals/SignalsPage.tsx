import { useEffect, useState, useRef } from "react";
import { api } from "../../shared/services/api";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  TextField, Button, Stepper, Step, StepLabel, Alert, LinearProgress
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

export default function SignalsPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [signals, setSignals] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // Step flow state
  const [step, setStep] = useState(0);
  const [newTask, setNewTask] = useState({ taskName: "", platform: "douyin", contentTitle: "", brandInfo: "", productInfo: "", contentGoal: "education", contentUrl: "" });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [mapping, setMapping] = useState<any>(null);

  const pollRef = useRef<any>(null);
  const fileReaderRef = useRef<FileReader | null>(null);

  useEffect(() => { api.listTasks().then(d => setTasks(d?.data || [])); }, []);

  const selectTask = async (task: any) => {
    setSelectedTask(task); setStep(0); setSignals(null); setStatus(null);
    setLoading(true);
    try {
      const [sigs, stat] = await Promise.all([
        api.getCommentSignals(task.id).catch(() => null),
        api.getTaskStatus(task.id).catch(() => null)
      ]);
      setSignals(sigs); setStatus(stat?.data);
    } catch { }
    setLoading(false);
  };

  // === Step 1: Create task ===
  const handleCreate = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.createTask(newTask);
      const task = res?.data || res;
      setSelectedTask(task);
      const d = await api.listTasks(); setTasks(d?.data || []);
      setStep(1);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // === Step 2: Upload file ===
  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    // P2-4: 中止上一个 FileReader 避免竞态
    fileReaderRef.current?.abort();
    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onload = (ev) => setFileContent(ev.target?.result as string || "");
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!selectedTask || !fileContent) return;
    setLoading(true); setError("");
    try {
      const data = await api.parseComments(selectedTask.id, {
        fileName: uploadedFile?.name || "comments.csv",
        fileContent,
        platform: selectedTask.platform || "douyin"
      });
      setMapping(data?.data?.file || data?.file);
      setStep(2);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const handleConfirmMapping = async () => {
    if (!selectedTask || !mapping) return;
    setLoading(true);
    try {
      await api.confirmMapping(selectedTask.id, {
        mapping: mapping.mappingConfig || mapping
      });
      setStep(3);
      await selectTask(selectedTask);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // === Step 3: Start pipeline ===
  const handleStart = async () => {
    if (!selectedTask) return;
    setRunning(true); setError("");
    try {
      await api.startPipeline(selectedTask.id);
      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const stat = await api.getTaskStatus(selectedTask.id);
          setStatus(stat?.data || stat);
          const taskStatus = stat?.data?.task?.status || stat?.task?.status;
          if (taskStatus === "completed" || taskStatus === "partially_failed" || taskStatus === "failed") {
            clearInterval(pollRef.current);
            setRunning(false);
            await selectTask(selectedTask);
          }
        } catch { }
      }, 2000);
    } catch (e: any) { setError(e.message); setRunning(false); }
  };

  // Cleanup poll and FileReader on unmount
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    fileReaderRef.current?.abort();
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>评论信号池</Typography>

      {/* Task selector */}
      <Box sx={{ mb: 3, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>任务:</Typography>
        <Chip label="+ 新建" color="primary" onClick={() => { setSelectedTask(null); setStep(0); setSignals(null); setStatus(null); }} />
        {tasks.map(t => (
          <Chip key={t.id} label={`${t.taskName || t.id?.slice(0, 8)} (${t.status})`}
            onClick={() => selectTask(t)} variant={selectedTask?.id === t.id ? "filled" : "outlined"}
            color={selectedTask?.id === t.id ? "primary" : "default"} />
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* === NEW TASK FLOW === */}
      {!selectedTask && (
        <Card sx={{ maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>新建分析任务</Typography>
            <TextField label="任务名称" fullWidth margin="dense" value={newTask.taskName}
              onChange={e => setNewTask({ ...newTask, taskName: e.target.value })} />
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <TextField select label="平台" size="small" sx={{ minWidth: 130 }} value={newTask.platform}
                onChange={e => setNewTask({ ...newTask, platform: e.target.value })}
                slotProps={{ select: { native: true } }}>
                <option value="douyin">🎵 抖音</option>
                <option value="xiaohongshu">📕 小红书</option>
              </TextField>
              <TextField select label="内容目标" size="small" sx={{ minWidth: 130 }} value={newTask.contentGoal}
                onChange={e => setNewTask({ ...newTask, contentGoal: e.target.value })}
                slotProps={{ select: { native: true } }}>
                <option value="education">新品教育</option>
                <option value="trust">种草信任</option>
                <option value="conversion">转化成交</option>
                <option value="exposure">拉新曝光</option>
                <option value="competitor">竞品对比</option>
                <option value="private_domain">私域引流</option>
                <option value="interaction">评论互动</option>
                <option value="brand_mind">品牌心智</option>
              </TextField>
            </Box>
            <TextField label="品牌" fullWidth margin="dense" value={newTask.brandInfo}
              onChange={e => setNewTask({ ...newTask, brandInfo: e.target.value })} />
            <TextField label="内容链接 (抖音/小红书链接)" fullWidth margin="dense" value={newTask.contentUrl}
              onChange={e => setNewTask({ ...newTask, contentUrl: e.target.value })} placeholder="https://v.douyin.com/... 或小红书链接" />
            <TextField label="内容标题" fullWidth margin="dense" value={newTask.contentTitle}
              onChange={e => setNewTask({ ...newTask, contentTitle: e.target.value })} />
            <Button variant="contained" onClick={handleCreate} disabled={loading} sx={{ mt: 2 }} fullWidth>
              {loading ? <CircularProgress size={20} /> : "创建任务"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === TASK WORKFLOW === */}
      {selectedTask && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6">{selectedTask.taskName || "分析任务"}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              状态: {status?.task?.status || selectedTask.status} · 平台: {selectedTask.platform}
              {status?.stages && ` · 进度: ${status.progress?.completedAgents || 0}/${status.progress?.totalAgents || 17}`}
            </Typography>

            <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
              <Step completed={step > 0}><StepLabel>创建</StepLabel></Step>
              <Step completed={step > 1 || !!mapping}><StepLabel>上传数据</StepLabel></Step>
              <Step completed={step > 2 || status?.task?.status === "ready"}><StepLabel>确认映射</StepLabel></Step>
              <Step completed={status?.task?.status === "completed"}><StepLabel>启动分析</StepLabel></Step>
            </Stepper>

            {/* Pipeline progress */}
            {running && status?.stages && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>管线进度</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {status.stages.map((s: any) => (
                    <Chip key={s.id}
                      icon={<span>{s.icon}</span>}
                      label={`${s.label} ${s.completed}/${s.total}`}
                      size="small"
                      color={s.status === "completed" ? "success" : s.status === "running" ? "info" : s.status === "failed" ? "error" : "default"}
                      variant={s.status === "completed" ? "filled" : "outlined"}
                    />
                  ))}
                </Box>
                <LinearProgress variant="determinate" value={status.progress?.percent || 0} sx={{ mt: 2, height: 6, borderRadius: 3 }} />
              </Box>
            )}

            {/* Step 1: Upload */}
            {step === 1 && (
              <Box sx={{ textAlign: "center", py: 3, border: "2px dashed", borderColor: "divider", borderRadius: 2 }}>
                <input type="file" accept=".csv,.xlsx" onChange={handleFileDrop} id="file-upload" hidden />
                <label htmlFor="file-upload">
                  <Button component="span" startIcon={<CloudUploadIcon />} variant="outlined" size="large">
                    选择CSV/XLSX文件
                  </Button>
                </label>
                {uploadedFile && (
                  <Box sx={{ mt: 2 }}>
                    <Typography>{uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(0)}KB)</Typography>
                    <Button variant="contained" onClick={handleUpload} disabled={loading} sx={{ mt: 1 }}>
                      {loading ? "解析中..." : "上传解析"}
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* Step 2: Confirm mapping */}
            {step === 2 && mapping && (
              <Box sx={{ textAlign: "center", py: 2 }}>
                <Typography gutterBottom>解析完成: {mapping.rowCount || fileContent.split("\n").length - 1} 条评论</Typography>
                <Button variant="contained" onClick={handleConfirmMapping} disabled={loading}>
                  {loading ? "确认中..." : "确认并入库"}
                </Button>
              </Box>
            )}

            {/* Step 3: Start pipeline */}
            {(step === 3 || status?.task?.status === "ready" || status?.task?.status === "draft") && (
              <Box sx={{ textAlign: "center", py: 2 }}>
                <Typography gutterBottom>数据就绪，准备启动 6阶段/17Agent 分析管线</Typography>
                <Button variant="contained" color="success" size="large"
                  startIcon={running ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleStart} disabled={running}>
                  {running ? "分析中..." : "▶ 开始分析"}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signal cards */}
      {signals && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(signals?.signals || signals?.data?.signals || []).map((s: any) => (
            <Card key={s.key || s.label} sx={{ flex: "1 1 200px", minWidth: 180 }}>
              <CardContent>
                <Typography variant="subtitle2">{s.label || s.key}</Typography>
                <Typography variant="h4" color="primary">{s.count || 0}</Typography>
                <Typography variant="caption" color="text.secondary">{s.description}</Typography>
              </CardContent>
            </Card>
          ))}
          {(!signals?.signals?.length && !signals?.data?.signals?.length) && (
            <Typography color="text.secondary" sx={{ py: 2, width: "100%", textAlign: "center" }}>
              上传评论并启动分析后，信号分布将在此显示
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
