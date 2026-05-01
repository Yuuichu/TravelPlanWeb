# TravelPlanWeb

基于 DeepSeek 的 Web 行程规划工具：输入目的地、天数和偏好后生成结构化行程，在地图中标点，并按天显示/隐藏推荐路线。

## 功能

- 后端代理调用 DeepSeek，避免浏览器暴露 API Key
- Leaflet 地图标点展示行程 stop
- 按天显示或隐藏推荐路线
- OSRM 公共路线服务获取路线，失败时回退为直线示意
- 路线结果使用 localStorage 缓存

## 启动

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
npm run dev
```

打开 http://localhost:3000。

## 环境变量

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
```

如果 DeepSeek 发布了新的 v4 模型名，把 `DEEPSEEK_MODEL` 改成对应模型即可。

## 路线说明

当前路线使用 OSRM 公共服务，公共服务无 SLA，可能超时或不可用；超时后页面会显示直线示意路线。需要更精准的国内路线时，可后续接入高德路线规划 API。
