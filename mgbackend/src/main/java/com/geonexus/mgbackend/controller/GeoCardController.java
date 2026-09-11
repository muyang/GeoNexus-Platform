package com.geonexus.mgbackend.controller;

import com.geonexus.mgbackend.model.GeoCard;
import com.geonexus.mgbackend.service.GeoCardService;
import com.geonexus.mgbackend.service.GeoExecutionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * GeoCard 管理 REST 控制器。
 *
 * <p>提供 GeoCard 的 CRUD、搜索、审核流转 API。
 * 接口路径沿袭 RuoYi 风格。</p>
 */
@RestController
@RequestMapping("/mogan/geocard")
@RequiredArgsConstructor
public class GeoCardController {

    private final GeoCardService geoCardService;
    private final GeoExecutionService geoExecutionService;

    // ==================== GeoCard CRUD ====================

    /** 列表查询（按状态过滤）。 */
    @GetMapping("/list")
    public List<GeoCard> list(@RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            return geoCardService.listByStatus(status);
        }
        return geoCardService.list();
    }

    /** 全文搜索。 */
    @GetMapping("/search")
    public List<GeoCard> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String assetType,
            @RequestParam(required = false) String region) {
        return geoCardService.search(keyword, assetType, region);
    }

    /** 获取单个 GeoCard。 */
    @GetMapping("/{id}")
    public GeoCard getById(@PathVariable String id) {
        return geoCardService.getById(id);
    }

    /** 创建草稿。 */
    @PostMapping
    public GeoCard create(@RequestBody GeoCard card) {
        return geoCardService.createDraft(card);
    }

    /** 更新。 */
    @PutMapping("/{id}")
    public GeoCard update(@PathVariable String id, @RequestBody GeoCard card) {
        card.setId(id);
        geoCardService.updateById(card);
        return geoCardService.getById(id);
    }

    /** 删除。 */
    @DeleteMapping("/{id}")
    public String delete(@PathVariable String id) {
        geoCardService.removeById(id);
        return "ok";
    }

    // ==================== 审核流转 ====================

    /** 提交审核：draft → pending。 */
    @PostMapping("/{id}/submit")
    public GeoCard submitForReview(@PathVariable String id) {
        return geoCardService.submitForReview(id);
    }

    /** 审核通过：pending → approved。 */
    @PostMapping("/{id}/approve")
    public GeoCard approve(@PathVariable String id) {
        return geoCardService.approve(id);
    }

    /** 驳回：pending → rejected。 */
    @PostMapping("/{id}/reject")
    public GeoCard reject(@PathVariable String id) {
        return geoCardService.reject(id);
    }

    // ==================== Python 执行面状态 ====================

    /** 查询 Python 执行面健康状态。 */
    @GetMapping("/execution-plane/health")
    public Map<String, Object> executionPlaneHealth() {
        return geoExecutionService.executionPlaneHealth();
    }

    /** 查询 Python 执行面能力列表。 */
    @GetMapping("/execution-plane/capabilities")
    public Map<String, Object> executionPlaneCapabilities() {
        return geoExecutionService.executionPlaneCapabilities();
    }

    // ==================== 执行 NDVI（Java → Python 计算面） ====================

    /** 执行 NDVI 分析（Java 控制面驱动 Python 计算面）。 */
    @PostMapping("/execute/ndvi")
    public Map<String, Object> executeNDVI(@RequestBody Map<String, String> body) {
        String red = requireParam(body, "red");
        String nir = requireParam(body, "nir");
        String output = body.getOrDefault("output", null);
        return geoExecutionService.executeNDVI(red, nir, output);
    }

    /** 执行 NDVI 变化检测。 */
    @PostMapping("/execute/ndvi-change")
    public Map<String, Object> executeNDVIChange(@RequestBody Map<String, String> body) {
        String ndviA = requireParam(body, "ndvi_a");
        String ndviB = requireParam(body, "ndvi_b");
        return geoExecutionService.executeNDVIChange(ndviA, ndviB);
    }

    private String requireParam(Map<String, String> body, String key) {
        String value = body.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required param: " + key);
        }
        return value;
    }
}