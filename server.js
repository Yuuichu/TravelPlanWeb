import 'dotenv/config';
import express from 'express';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT || 3000);
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const planRequestSchema = z.object({
  destination: z.string().min(1).max(80),
  days: z.number().int().min(1).max(14),
  interests: z.string().max(500).optional().default(''),
  pace: z.enum(['relaxed', 'balanced', 'intensive']).default('balanced')
});

app.post('/api/plan', async (req, res) => {
  if (!deepseekApiKey) {
    return res.status(500).json({ error: '缺少 DEEPSEEK_API_KEY 环境变量' });
  }

  const parsed = planRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '请求参数无效' });
  }

  try {
    const plan = await createTravelPlan(parsed.data);
    res.json(plan);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: 'DeepSeek 行程规划失败，请稍后重试' });
  }
});

app.listen(port, () => {
  console.log(`TravelPlanWeb listening on http://localhost:${port}`);
});

async function createTravelPlan(input) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是中国境内自由行规划助手。只输出 JSON，不输出 Markdown。坐标必须尽量给出真实经纬度；如果不确定，使用 null。'
        },
        {
          role: 'user',
          content: buildPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek returned empty content');
  }

  return normalizePlan(JSON.parse(content), input);
}

function buildPrompt({ destination, days, interests, pace }) {
  return `为用户生成 ${destination} ${days} 天自由行行程。偏好：${interests || '无特殊偏好'}。节奏：${pace}。
输出 JSON 格式：
{
  "title": "行程标题",
  "goal": "一句话行程目标",
  "days": [
    {
      "day": 1,
      "theme": "当天主题",
      "stops": [
        {
          "name": "地点名",
          "lat": 31.2304,
          "lng": 121.4737,
          "type": "景点/餐饮/住宿/交通/体验",
          "durationMinutes": 90,
          "reason": "推荐原因"
        }
      ]
    }
  ]
}
每天 3-6 个 stops，按游玩顺序排列。不要编造价格、营业时间或预约状态。`;
}

function normalizePlan(plan, input) {
  const days = Array.isArray(plan.days) ? plan.days : [];
  return {
    title: String(plan.title || `${input.destination}${input.days}日行程`),
    goal: String(plan.goal || `规划${input.destination}自由行`),
    days: days.map((day, dayIndex) => ({
      day: Number(day.day || dayIndex + 1),
      theme: String(day.theme || `第${dayIndex + 1}天`),
      stops: Array.isArray(day.stops) ? day.stops.map(normalizeStop).filter(Boolean) : []
    }))
  };
}

function normalizeStop(stop, index) {
  const lat = Number(stop.lat);
  const lng = Number(stop.lng);
  return {
    id: `${index}-${String(stop.name || 'stop').replace(/\s+/g, '-')}`,
    name: String(stop.name || '未命名地点'),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    type: String(stop.type || '地点'),
    durationMinutes: Number(stop.durationMinutes || 60),
    reason: String(stop.reason || '')
  };
}
