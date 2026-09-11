package com.geonexus.mgbackend.service;

import cn.hutool.core.util.IdUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.mgbackend.mapper.OgeCredentialMapper;
import com.geonexus.mgbackend.model.OgeCredential;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OGE 凭证管理服务。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OgeCredentialService extends ServiceImpl<OgeCredentialMapper, OgeCredential> {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${geonexus.execution-plane.url:http://127.0.0.1:8787}")
    private String executionPlaneUrl;

    @Value("${geonexus.execution-plane.api-key:default-node-key}")
    private String apiKey;

    // ==================== CRUD ====================

    /** 查询全部凭证（含已删除筛选）。 */
    public List<OgeCredential> listAll() {
        return list(new LambdaQueryWrapper<OgeCredential>()
                .orderByDesc(OgeCredential::getUpdateTime));
    }

    /** 按节点查询。 */
    public List<OgeCredential> listByNode(String nodeId) {
        return list(new LambdaQueryWrapper<OgeCredential>()
                .eq(OgeCredential::getNodeId, nodeId));
    }

    /** 保存凭证（新增或更新），自动标注 status。 */
    public OgeCredential saveCredential(OgeCredential credential) {
        if (credential.getCredentialId() == null || credential.getCredentialId().isBlank()) {
            credential.setCredentialId(IdUtil.fastSimpleUUID());
            credential.setStatus("active");
            credential.setCreateTime(LocalDateTime.now());
        }
        if (credential.getStatus() == null || credential.getStatus().isBlank()) {
            credential.setStatus("active");
        }
        credential.setUpdateTime(LocalDateTime.now());
        saveOrUpdate(credential);
        log.info("OGE credential saved: id={} node={} endpoint={}",
                credential.getCredentialId(), credential.getNodeId(), credential.getEndpoint());
        return credential;
    }

    /** 删除凭证。 */
    public void deleteCredential(String credentialId) {
        removeById(credentialId);
        log.info("OGE credential deleted: id={}", credentialId);
    }

    /** 测试凭证连通性（仅持有凭证的元数据校验，不调用 OGE）。 */
    public Map<String, Object> validateCredential(String credentialId) {
        OgeCredential credential = getById(credentialId);
        if (credential == null) {
            throw new IllegalArgumentException("Credential not found: " + credentialId);
        }
        boolean valid = credential.getEndpoint() != null
                && credential.getUsername() != null
                && credential.getPassword() != null;
        return Map.of(
                "credentialId", credentialId,
                "valid", valid,
                "endpoint", credential.getEndpoint(),
                "username", credential.getUsername()
        );
    }

    // ==================== 下发 Python 执行面 ====================

    /**
     * 下发凭证配置到 Python 执行面。
     *
     * <p>对应协议（docs/ruoyi-integration-protocol.md 2.3 方向三）：
     * {@code POST {execution-plane}/api/sync/oge-credential}
     * 携带 X-API-Key。执行面收到后更新 OgeCredentialManager 并刷新 JWT/tk。</p>
     */
    public Map<String, Object> syncCredentialToExecutionPlane(String credentialId) {
        OgeCredential credential = getById(credentialId);
        if (credential == null) {
            throw new IllegalArgumentException("Credential not found: " + credentialId);
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("endpoint", credential.getEndpoint());
        payload.put("username", credential.getUsername());
        payload.put("password", credential.getPassword());
        payload.put("client_id", credential.getClientId());
        payload.put("client_secret", credential.getClientSecret());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (apiKey != null && !apiKey.isEmpty()) {
            headers.set("X-API-Key", apiKey);
        }

        HttpEntity<String> request = new HttpEntity<>(toJson(payload), headers);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    executionPlaneUrl + "/api/sync/oge-credential",
                    request,
                    Map.class
            );
            // 同步成功后更新状态
            credential.setLastSyncAt(LocalDateTime.now());
            credential.setLastError(null);
            credential.setUpdateTime(LocalDateTime.now());
            updateById(credential);

            log.info("OGE credential synced to execution plane: id={} -> {}", credentialId, executionPlaneUrl);
            return Map.of(
                    "status", "ok",
                    "credentialId", credentialId,
                    "syncedTo", executionPlaneUrl,
                    "response", response.getBody() != null ? response.getBody() : Map.of()
            );
        } catch (Exception e) {
            credential.setStatus("error");
            credential.setLastError(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            credential.setUpdateTime(LocalDateTime.now());
            updateById(credential);
            log.error("OGE credential sync failed: id={} error={}", credentialId, e.getMessage());
            return Map.of(
                    "status", "error",
                    "credentialId", credentialId,
                    "error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()
            );
        }
    }

    @SneakyThrows
    private String toJson(Map<String, Object> payload) {
        return objectMapper.writeValueAsString(payload);
    }
}