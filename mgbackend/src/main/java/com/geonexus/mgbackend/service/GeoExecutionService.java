package com.geonexus.mgbackend.service;

import com.geonexus.mgbackend.client.ExecuteRequest;
import com.geonexus.mgbackend.client.GeoMCPClient;
import com.geonexus.mgbackend.client.GeoMCPClientException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * 地理空间执行服务 — Java 控制面调用 Python 执行面的业务入口。
 *
 * <p>将 Java 侧的 GeoCard 引用翻译为 GeoMCP geo.execute 调用，
 * 处理错误码分类和审计日志。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GeoExecutionService {

    private final GeoMCPClient geoMCPClient;

    /** 执行 NDVI 分析。 */
    public Map<String, Object> executeNDVI(String redPath, String nirPath, String outputPath) {
        ExecuteRequest req = ExecuteRequest.of("ndvi-analysis")
                .params(Map.of("red", redPath, "nir", nirPath, "output", outputPath))
                .requestId("req-" + UUID.randomUUID().toString().substring(0, 8));
        return execute(req);
    }

    /** 执行 NDVI 变化检测。 */
    public Map<String, Object> executeNDVIChange(String ndviAPath, String ndviBPath) {
        ExecuteRequest req = ExecuteRequest.of("ndvi-change")
                .params(Map.of("ndvi_a", ndviAPath, "ndvi_b", ndviBPath))
                .requestId("req-" + UUID.randomUUID().toString().substring(0, 8));
        return execute(req);
    }

    /** 通用执行入口。 */
    public Map<String, Object> execute(ExecuteRequest request) {
        log.info("GeoExec: skill={} requestId={}", request.getSkill(), request.getRequestId());
        try {
            return geoMCPClient.execute(request);
        } catch (GeoMCPClientException e) {
            log.error("GeoExec failed: skill={} code={} message={}",
                    request.getSkill(), e.getCode(), e.getMessage());
            throw e;
        }
    }

    /** 查询 Python 执行面健康状态。 */
    public Map<String, Object> executionPlaneHealth() {
        return geoMCPClient.health();
    }

    /** 查询 Python 执行面能力列表。 */
    public Map<String, Object> executionPlaneCapabilities() {
        return geoMCPClient.capabilities();
    }
}