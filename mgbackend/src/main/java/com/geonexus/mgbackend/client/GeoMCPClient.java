package com.geonexus.mgbackend.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 轻量级 GeoMCP JSON-RPC 2.0 客户端。
 *
 * <p>Java 控制面调用 Python 执行面的唯一入口。
 * <b>200 行代码，零 Python 依赖。</b></p>
 *
 * <pre>
 * 使用示例：
 *   GeoMCPClient client = new GeoMCPClient("http://127.0.0.1:8787", "my-api-key");
 *   Map<String, Object> caps = client.capabilities();
 *   GeoMCPExecuteResult result = client.execute(
 *       ExecuteRequest.of("ndvi-analysis")
 *           .geocards(List.of("amazon-ndvi-2015"))
 *           .spatial(new SpatialContext(List.of(-73.9, -15.0, -44.0, 5.0), "EPSG:4326"))
 *   );
 * </pre>
 */
@Slf4j
public class GeoMCPClient {

    private final String baseUrl;
    private final String apiKey;
    private final RestTemplate rest;
    private final ObjectMapper mapper;

    public GeoMCPClient(String baseUrl, String apiKey) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey = apiKey;
        this.rest = new RestTemplate();
        this.mapper = new ObjectMapper();
    }

    // ==================================================================
    // 公开 API（对应 GeoMCP 协议的 3 个核心方法 + health）
    // ==================================================================

    /** 查询 Python 执行面能力。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> capabilities() {
        return (Map<String, Object>) rpc("geo.capabilities", Map.of());
    }

    /** 查询 GeoCard / Skill 详情。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> describe(List<String> geocards, List<String> skills) {
        return (Map<String, Object>) rpc("geo.describe",
                Map.of("geocards", geocards != null ? geocards : List.of(),
                       "skills", skills != null ? skills : List.of()));
    }

    /** 执行 GeoSkill（核心方法）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> execute(ExecuteRequest request) {
        return (Map<String, Object>) rpc("geo.execute", request.toParams());
    }

    /** 健康检查（GET，非 JSON-RPC）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> health() {
        return rest.getForObject(baseUrl + "/health", Map.class);
    }

    // ==================================================================
    // 内部实现
    // ==================================================================

    private Object rpc(String method, Map<String, Object> params) {
        ObjectNode body = mapper.createObjectNode();
        body.put("jsonrpc", "2.0");
        body.put("id", UUID.randomUUID().toString());
        body.put("method", method);
        body.set("params", mapper.valueToTree(params));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (apiKey != null && !apiKey.isEmpty()) {
            headers.set("X-API-Key", apiKey);
        }

        HttpEntity<String> request = new HttpEntity<>(body.toString(), headers);
        log.debug("GeoMCP → {} method={} requestId={}", baseUrl, method, body.get("id").asText());

        ResponseEntity<JsonNode> response = rest.postForEntity(
                baseUrl + "/geomcp", request, JsonNode.class);

        JsonNode result = response.getBody();
        if (result == null) {
            throw new GeoMCPClientException(-1, "Empty response from execution plane");
        }

        if (result.has("error")) {
            JsonNode error = result.get("error");
            int code = error.get("code").asInt();
            String message = error.get("message").asText();
            log.error("GeoMCP error [{}]: {}", code, message);
            throw new GeoMCPClientException(code, message);
        }

        return mapper.convertValue(result.get("result"), Map.class);
    }
}