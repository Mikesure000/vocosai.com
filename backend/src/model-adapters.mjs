const DEFAULTS = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    reasoningModel: "deepseek-v4-pro"
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    reasoningModel: "gpt-4.1"
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    reasoningModel: "qwen-max"
  }
};

export function getProviderStatuses(env = process.env, providerRuntime = {}) {
  return [
    {
      providerName: "deepseek",
      baseUrl: getProviderBaseUrl("deepseek", env),
      configured: Boolean(env.DEEPSEEK_API_KEY || providerRuntime.secrets?.deepseek),
      source: env.DEEPSEEK_API_KEY ? "env" : providerRuntime.keyMeta?.deepseek?.source ?? "none",
      keyMasked: env.DEEPSEEK_API_KEY ? "env:DEEPSEEK_API_KEY" : providerRuntime.keyMeta?.deepseek?.keyMasked ?? null,
      keyUpdatedAt: providerRuntime.keyMeta?.deepseek?.updatedAt ?? null,
      defaultModel: env.DEEPSEEK_MODEL || DEFAULTS.deepseek.model,
      reasoningModel: env.DEEPSEEK_REASONING_MODEL || DEFAULTS.deepseek.reasoningModel,
      priority: Number(env.VOCOS_PRIMARY_PROVIDER !== "openai" && env.VOCOS_PRIMARY_PROVIDER !== "qwen")
    },
    {
      providerName: "openai",
      baseUrl: getProviderBaseUrl("openai", env),
      configured: Boolean(env.OPENAI_API_KEY || providerRuntime.secrets?.openai),
      source: env.OPENAI_API_KEY ? "env" : providerRuntime.keyMeta?.openai?.source ?? "none",
      keyMasked: env.OPENAI_API_KEY ? "env:OPENAI_API_KEY" : providerRuntime.keyMeta?.openai?.keyMasked ?? null,
      keyUpdatedAt: providerRuntime.keyMeta?.openai?.updatedAt ?? null,
      defaultModel: env.OPENAI_MODEL || DEFAULTS.openai.model,
      reasoningModel: env.OPENAI_REASONING_MODEL || DEFAULTS.openai.reasoningModel,
      priority: Number(env.VOCOS_PRIMARY_PROVIDER === "openai")
    },
    {
      providerName: "qwen",
      baseUrl: getProviderBaseUrl("qwen", env),
      configured: Boolean(env.QWEN_API_KEY || providerRuntime.secrets?.qwen),
      source: env.QWEN_API_KEY ? "env" : providerRuntime.keyMeta?.qwen?.source ?? "none",
      keyMasked: env.QWEN_API_KEY ? "env:QWEN_API_KEY" : providerRuntime.keyMeta?.qwen?.keyMasked ?? null,
      keyUpdatedAt: providerRuntime.keyMeta?.qwen?.updatedAt ?? null,
      defaultModel: env.QWEN_MODEL || DEFAULTS.qwen.model,
      reasoningModel: env.QWEN_REASONING_MODEL || DEFAULTS.qwen.reasoningModel,
      priority: Number(env.VOCOS_PRIMARY_PROVIDER === "qwen")
    }
  ].sort((a, b) => b.priority - a.priority);
}

export function resolveProviderRoute(agent, modelPreference = "auto", env = process.env) {
  if (modelPreference && modelPreference !== "auto") {
    return routeFromModelName(modelPreference, agent);
  }

  if (env.VOCOS_PRIMARY_PROVIDER === "qwen") {
    return {
      providerName: "qwen",
      modelName: pickQwenModel(agent, env),
      fallbackProviderName: "deepseek",
      fallbackModelName: pickDeepSeekModel(agent, env)
    };
  }

  if (env.VOCOS_PRIMARY_PROVIDER === "openai") {
    return {
      providerName: "openai",
      modelName: pickOpenAiModel(agent, env),
      fallbackProviderName: "deepseek",
      fallbackModelName: pickDeepSeekModel(agent, env)
    };
  }

  return {
    providerName: "deepseek",
    modelName: pickDeepSeekModel(agent, env),
    fallbackProviderName: "openai",
    fallbackModelName: pickOpenAiModel(agent, env)
  };
}

export async function invokeModel({ route, prompt, agent, input, outputSchema, timeoutMs = 90000, env = process.env, providerRuntime = {} }) {
  const credentials = getCredentials(route.providerName, env, providerRuntime);
  if (!credentials.apiKey) {
    return {
      ok: false,
      skipped: true,
      errorCode: "provider_api_key_missing",
      errorMessage: `${route.providerName.toUpperCase()} API key is not configured`
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchChatCompletion({
      credentials,
      modelName: route.modelName,
      messages: buildMessages({ prompt, agent, input, outputSchema }),
      timeoutMs
    });
    const content = response.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonContent(content);
    return {
      ok: true,
      content,
      outputJson: parsed.outputJson,
      repairedJson: parsed.repaired,
      providerResponse: response,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "provider_request_failed",
      errorMessage: error.message,
      latencyMs: Date.now() - startedAt
    };
  }
}

export async function testProviderConnection({ providerName, modelName, env = process.env, providerRuntime = {}, timeoutMs = 20000 }) {
  const route = {
    providerName,
    modelName: modelName || pickDefaultProviderModel(providerName, env)
  };
  const startedAt = Date.now();
  const result = await invokeModel({
    route,
    prompt: {
      versions: [
        {
          systemPrompt: "Return JSON only. This is a provider connectivity check."
        }
      ]
    },
    agent: {
      code: "provider_connectivity_check",
      version: "0.1.0"
    },
    input: {
      check: "connectivity",
      expected_response: { ok: true }
    },
    outputSchema: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean" }
      }
    },
    timeoutMs,
    env,
    providerRuntime
  });

  return {
    providerName,
    modelName: route.modelName,
    status: result.ok ? "connected" : result.skipped ? "skipped" : "failed",
    ok: result.ok,
    errorCode: result.ok ? null : result.errorCode,
    errorMessage: result.ok ? null : result.errorMessage,
    latencyMs: result.latencyMs ?? Date.now() - startedAt,
    jsonRepairUsed: Boolean(result.repairedJson),
    checkedAt: new Date().toISOString()
  };
}

export function isLiveModelEnabled(env = process.env) {
  return env.VOCOS_MODEL_MODE !== "mock";
}

export function getProviderBaseUrl(providerName, env = process.env) {
  if (providerName === "deepseek") return env.DEEPSEEK_BASE_URL || DEFAULTS.deepseek.baseUrl;
  if (providerName === "openai") return env.OPENAI_BASE_URL || DEFAULTS.openai.baseUrl;
  if (providerName === "qwen") return env.QWEN_BASE_URL || DEFAULTS.qwen.baseUrl;
  return "";
}

function getCredentials(providerName, env, providerRuntime) {
  if (providerName === "deepseek") {
    return {
      providerName,
      baseUrl: getProviderBaseUrl(providerName, env),
      apiKey: env.DEEPSEEK_API_KEY || providerRuntime.secrets?.deepseek
    };
  }

  if (providerName === "qwen") {
    return {
      providerName,
      baseUrl: getProviderBaseUrl(providerName, env),
      apiKey: env.QWEN_API_KEY || providerRuntime.secrets?.qwen
    };
  }

  return {
    providerName,
    baseUrl: getProviderBaseUrl(providerName, env),
    apiKey: env.OPENAI_API_KEY || providerRuntime.secrets?.openai
  };
}

export async function fetchChatCompletion({ credentials, modelName, messages, timeoutMs, responseFormat = { type: "json_object" } }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${credentials.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${credentials.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.2,
        ...(responseFormat ? { response_format: responseFormat } : {})
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error?.message || payload.message || `HTTP ${response.status}`;
      throw new Error(`${credentials.providerName} ${message}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMessages({ prompt, agent, input, outputSchema }) {
  const systemPrompt = prompt?.versions?.[0]?.systemPrompt || [
    "You are a Voice of Consumer OS analysis agent.",
    "Return only valid JSON matching the requested output schema.",
    "Use concrete comment evidence when it is available."
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        agent: agent.code,
        agent_version: agent.version,
        task_input: input,
        output_schema: outputSchema
      })
    }
  ];
}

function parseJsonContent(content) {
  const stripped = stripJsonFence(content.trim());
  const trimmed = stripped.content;
  if (!trimmed) throw new Error("Provider returned empty content");
  try {
    return { outputJson: JSON.parse(trimmed), repaired: stripped.repaired };
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Provider did not return JSON content");
    return { outputJson: JSON.parse(match[0]), repaired: true };
  }
}

function stripJsonFence(content) {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return {
    content: stripped,
    repaired: stripped !== content
  };
}

function routeFromModelName(modelName, agent) {
  const isQwen = modelName.includes("qwen");
  const isDeepSeek = modelName.includes("deepseek");
  const providerName = isQwen ? "qwen" : isDeepSeek ? "deepseek" : "openai";
  const fallbackProviderName = isQwen ? "deepseek" : isDeepSeek ? "openai" : "deepseek";
  const fallbackModelName = isQwen
    ? pickDeepSeekModel(agent, process.env)
    : isDeepSeek
      ? pickOpenAiModel(agent, process.env)
      : pickDeepSeekModel(agent, process.env);

  return {
    providerName,
    modelName,
    fallbackProviderName,
    fallbackModelName
  };
}

function pickDeepSeekModel(agent, env) {
  if (requiresReasoningModel(agent.code)) {
    return env.DEEPSEEK_REASONING_MODEL || env.DEEPSEEK_MODEL || DEFAULTS.deepseek.reasoningModel;
  }
  return env.DEEPSEEK_MODEL || DEFAULTS.deepseek.model;
}

function pickOpenAiModel(agent, env) {
  if (requiresReasoningModel(agent.code)) {
    return env.OPENAI_REASONING_MODEL || env.OPENAI_MODEL || DEFAULTS.openai.reasoningModel;
  }
  return env.OPENAI_MODEL || DEFAULTS.openai.model;
}

function pickQwenModel(agent, env) {
  if (requiresReasoningModel(agent.code)) {
    return env.QWEN_REASONING_MODEL || env.QWEN_MODEL || DEFAULTS.qwen.reasoningModel;
  }
  return env.QWEN_MODEL || DEFAULTS.qwen.model;
}

function pickDefaultProviderModel(providerName, env) {
  if (providerName === "deepseek") return env.DEEPSEEK_MODEL || DEFAULTS.deepseek.model;
  if (providerName === "qwen") return env.QWEN_MODEL || DEFAULTS.qwen.model;
  return env.OPENAI_MODEL || DEFAULTS.openai.model;
}

function requiresReasoningModel(agentCode) {
  return new Set([
    "platform_strategy_agent",
    "production_card_agent",
    "ad_fit_agent",
    "pre_publish_check_agent",
    "report_assembly_agent",
    "ai_quality_eval_agent"
  ]).has(agentCode);
}
