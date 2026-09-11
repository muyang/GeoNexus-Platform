package com.geonexus.mgbackend.controller;

import com.geonexus.mgbackend.model.OgeCredential;
import com.geonexus.mgbackend.service.OgeCredentialService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * OGE 凭证管理 REST 控制器（RuoYi 风格）。
 *
 * <p>提供 OGE 计算中心凭证的 CRUD、连接测试、以及下发 Python 执行面。</p>
 */
@RestController
@RequestMapping("/mogan/oge/credential")
@RequiredArgsConstructor
public class OgeCredentialController {

    private final OgeCredentialService credentialService;

    /** 凭证列表。 */
    @GetMapping("/list")
    public List<OgeCredential> list(@RequestParam(required = false) String nodeId) {
        if (nodeId != null && !nodeId.isBlank()) {
            return credentialService.listByNode(nodeId);
        }
        return credentialService.listAll();
    }

    /** 创建/更新凭证。 */
    @PostMapping
    public OgeCredential save(@RequestBody OgeCredential credential) {
        return credentialService.saveCredential(credential);
    }

    /** 查询单个凭证。 */
    @GetMapping("/{id}")
    public OgeCredential get(@PathVariable String id) {
        return credentialService.getById(id);
    }

    /** 删除凭证。 */
    @DeleteMapping("/{id}")
    public String delete(@PathVariable String id) {
        credentialService.deleteCredential(id);
        return "ok";
    }

    /** 凭证连通性校验。 */
    @PostMapping("/{id}/validate")
    public Map<String, Object> validate(@PathVariable String id) {
        return credentialService.validateCredential(id);
    }

    /** 同步凭证到 Python 执行面。 */
    @PostMapping("/{id}/sync")
    public Map<String, Object> syncToExecutionPlane(@PathVariable String id) {
        return credentialService.syncCredentialToExecutionPlane(id);
    }
}