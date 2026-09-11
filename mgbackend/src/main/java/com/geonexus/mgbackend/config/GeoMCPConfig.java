package com.geonexus.mgbackend.config;

import com.geonexus.mgbackend.client.GeoMCPClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * GeoMCP 客户端 + RestTemplate Bean 配置。
 *
 * <p>ObjectMapper 使用 Spring Boot 自动配置（含 JavaTimeModule），
 * 此处不覆盖。</p>
 */
@Configuration
public class GeoMCPConfig {

    @Value("${geonexus.execution-plane.url:http://127.0.0.1:8787}")
    private String executionPlaneUrl;

    @Value("${geonexus.execution-plane.api-key:default-node-key}")
    private String apiKey;

    @Bean
    public GeoMCPClient geoMCPClient() {
        return new GeoMCPClient(executionPlaneUrl, apiKey);
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}