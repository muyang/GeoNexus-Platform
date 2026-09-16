package com.geonexus.mgbackend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Agent 代理服务 — Java 控制面通过 REST 调用 Python 执行面的 Data Agent。
 *
 * <p>实现"管算分离"全链路：
 * Java 管理面接收用户请求 → REST 调用 Python 执行面 →
 * DataAgent 语义搜索 → 合约绑定 → 返回结果</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${geonexus.execution-plane.url:http://127.0.0.1:8787}")
    private String executionPlaneUrl;

    @Value("${geonexus.execution-plane.api-key:default-node-key}")
    private String apiKey;

    /** 语义搜索合约。 */
    public Map<String, Object> discover(String intent, int k) {
        Map<String, Object> body = new HashMap<>();
        body.put("intent", intent);
        body.put("k", k);
        return post("/api/agent/discover", body);
    }

    /** 合约绑定 + 计算下推决策。 */
    public Map<String, Object> bind(String intent, Map<String, Object> spatial) {
        Map<String, Object> body = new HashMap<>();
        body.put("intent", intent);
        if (spatial != null) {
            if (spatial.containsKey("bbox")) body.put("bbox", spatial.get("bbox"));
            if (spatial.containsKey("crs")) body.put("crs", spatial.get("crs"));
            if (spatial.containsKey("required_bands")) body.put("required_bands", spatial.get("required_bands"));
        }
        return post("/api/agent/bind", body);
    }

    /** 执行面 Agent 健康检查。 */
    public Map<String, Object> agentHealth() {
        return get("/api/agent/health");
    }

    // ── 内部 ──

    private Map<String, Object> post(String path, Map<String, Object> body) {
        String url = executionPlaneUrl + (path.startsWith("/") ? path : "/" + path);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (apiKey != null && !apiKey.isEmpty()) {
                headers.set("X-API-Key", apiKey);
            }
            HttpEntity<String> request = new HttpEntity<>(objectMapper.writeValueAsString(body), headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);
            return response.getBody() != null ? response.getBody() : Map.of();
        } catch (Exception e) {
            log.error("Agent REST call failed: {} error={}", url, e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> get(String path) {
        String url = executionPlaneUrl + (path.startsWith("/") ? path : "/" + path);
        try {
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            return response.getBody() != null ? response.getBody() : Map.of();
        } catch (Exception e) {
            log.error("Agent REST call failed: {} error={}", url, e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }
}