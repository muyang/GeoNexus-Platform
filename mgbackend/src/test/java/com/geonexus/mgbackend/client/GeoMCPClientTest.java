package com.geonexus.mgbackend.client;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * GeoMCP 客户端集成测试（使用 WireMock 模拟 Python 执行面）。
 *
 * <p>测试 4 个核心方法：capabilities / describe / execute / health，
 * 以及 4 类错误码分类处理。</p>
 */
class GeoMCPClientTest {

    private WireMockServer wireMock;
    private GeoMCPClient client;

    @BeforeEach
    void setUp() {
        wireMock = new WireMockServer(18787);
        wireMock.start();
        WireMock.configureFor("localhost", 18787);
        client = new GeoMCPClient("http://127.0.0.1:18787", "test-api-key");
    }

    @AfterEach
    void tearDown() {
        wireMock.stop();
    }

    // ==================== geo.capabilities ====================

    @Test
    void shouldReturnCapabilities() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.capabilities")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "jsonrpc": "2.0",
                                "id": "test-001",
                                "result": {
                                    "protocol": "geomcp",
                                    "version": "1.0.0",
                                    "node": "test-node",
                                    "methods": ["geo.capabilities", "geo.describe", "geo.execute", "geo.health"],
                                    "skills": [
                                        {"name": "ndvi-analysis", "description": "Compute NDVI"}
                                    ],
                                    "geocards": ["amazon-ndvi-2015"]
                                }
                            }
                            """)));

        Map<String, Object> caps = client.capabilities();

        assertThat(caps).containsKey("protocol");
        assertThat(caps.get("protocol")).isEqualTo("geomcp");
        assertThat(caps.get("methods")).asList().contains("geo.execute");
        assertThat(caps.get("skills")).asList().isNotEmpty();
    }

    // ==================== geo.describe ====================

    @Test
    void shouldReturnDescribe() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.describe")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "jsonrpc": "2.0",
                                "id": "test-002",
                                "result": {
                                    "geocards": [
                                        {"id": "amazon-ndvi-2015", "title": "Amazon NDVI 2015"}
                                    ],
                                    "skills": []
                                }
                            }
                            """)));

        Map<String, Object> desc = client.describe(
                List.of("amazon-ndvi-2015"), null);

        assertThat(desc).containsKey("geocards");
        assertThat(desc.get("geocards")).asList().hasSize(1);
    }

    // ==================== geo.execute ====================

    @Test
    void shouldExecuteNDVI() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.execute")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "jsonrpc": "2.0",
                                "id": "test-003",
                                "result": {
                                    "status": "ok",
                                    "skill": "ndvi-analysis",
                                    "outputs": {
                                        "ndvi_raster": "/tmp/ndvi.tif",
                                        "stats": {"mean": 0.75, "std": 0.12, "pixels": 4096}
                                    }
                                }
                            }
                            """)));

        Map<String, Object> result = client.execute(
                ExecuteRequest.of("ndvi-analysis")
                        .params(Map.of("red", "/data/red.tif", "nir", "/data/nir.tif"))
                        .requestId("test-003"));

        assertThat(result.get("status")).isEqualTo("ok");
        assertThat(result.get("skill")).isEqualTo("ndvi-analysis");

        @SuppressWarnings("unchecked")
        Map<String, Object> outputs = (Map<String, Object>) result.get("outputs");
        assertThat(outputs.get("ndvi_raster")).isEqualTo("/tmp/ndvi.tif");
    }

    // ==================== 错误处理 ====================

    @Test
    void shouldHandleContractNotSatisfied() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.execute")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withStatus(200)  // GeoMCP errors are in the response body, not HTTP status
                        .withBody("""
                            {
                                "jsonrpc": "2.0",
                                "id": "test-err",
                                "error": {
                                    "code": 2000,
                                    "message": "Contract not satisfied: bbox outside coverage"
                                }
                            }
                            """)));

        assertThatThrownBy(() -> client.execute(
                ExecuteRequest.of("ndvi-analysis")
                        .requestId("test-err")))
                .isInstanceOf(GeoMCPClientException.class)
                .matches(e -> ((GeoMCPClientException) e).isContractNotSatisfied());
    }

    @Test
    void shouldHandleSkillNotFound() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.execute")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "jsonrpc": "2.0", "id": "test-err",
                                "error": {"code": 2001, "message": "Skill not found: unknown-skill"}
                            }
                            """)));

        assertThatThrownBy(() -> client.execute(
                ExecuteRequest.of("unknown-skill")))
                .isInstanceOf(GeoMCPClientException.class)
                .matches(e -> ((GeoMCPClientException) e).isSkillNotFound());
    }

    @Test
    void shouldHandleExecutionFailed() {
        stubFor(post("/geomcp")
                .withRequestBody(matchingJsonPath("$.method", equalTo("geo.execute")))
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "jsonrpc": "2.0", "id": "test-err",
                                "error": {"code": 2003, "message": "Skill failed: out of memory"}
                            }
                            """)));

        assertThatThrownBy(() -> client.execute(
                ExecuteRequest.of("ndvi-analysis")))
                .isInstanceOf(GeoMCPClientException.class)
                .matches(e -> ((GeoMCPClientException) e).isExecutionFailed());
    }

    // ==================== health ====================

    @Test
    void shouldReturnHealth() {
        stubFor(get("/health")
                .willReturn(aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                            {
                                "status": "ok",
                                "node": "execution-plane-01",
                                "checks": {"registry": "ok"}
                            }
                            """)));

        Map<String, Object> health = client.health();
        assertThat(health.get("status")).isEqualTo("ok");
    }
}