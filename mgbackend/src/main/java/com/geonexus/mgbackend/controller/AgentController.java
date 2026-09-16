package com.geonexus.mgbackend.controller;

import com.geonexus.mgbackend.service.AgentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Agent REST 控制器 — 驱动 Python 执行面的 Data Agent。
 *
 * <p>Java 控制面通过此端点实现"管算分离"全链路：
 * 用户意图 → Java REST → Python DataAgent → GAAG 语义搜索 → 合约绑定 → 决策结果</p>
 */
@RestController
@RequestMapping("/mogan/agent")
@RequiredArgsConstructor
public class AgentController {

    private final AgentService agentService;

    /** 语义搜索合约。 */
    @PostMapping("/discover")
    public Map<String, Object> discover(@RequestBody Map<String, Object> body) {
        String intent = body.getOrDefault("intent", "").toString();
        int k = body.containsKey("k") ? ((Number) body.get("k")).intValue() : 5;
        return agentService.discover(intent, k);
    }

    /** 合约绑定 + 计算下推决策。 */
    @PostMapping("/bind")
    public Map<String, Object> bind(@RequestBody Map<String, Object> body) {
        String intent = body.getOrDefault("intent", "").toString();
        @SuppressWarnings("unchecked")
        Map<String, Object> spatial = (Map<String, Object>) body.get("spatial");
        return agentService.bind(intent, spatial);
    }

    /** Agent 健康检查。 */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return agentService.agentHealth();
    }
}