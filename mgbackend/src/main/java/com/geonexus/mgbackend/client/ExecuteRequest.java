package com.geonexus.mgbackend.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * GeoMCP {@code geo.execute} 请求参数模型。
 *
 * <p>纯 POJO，零 Python 依赖。对应 GeoMCP 协议 ExecuteParams。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecuteRequest {

    /** 技能名称，如 "ndvi-analysis"。 */
    private String skill;

    /** 引用的 GeoCard ID 列表。 */
    private List<String> geocards;

    /** 空间上下文（bbox + CRS）。 */
    private SpatialContext spatial;

    /** 时间上下文。 */
    private TemporalContext temporal;

    /** 技能参数（如 red/nir 路径）。 */
    private Map<String, Object> params;

    /** 全链路追踪 ID。 */
    private String requestId;

    /**
     * 便捷工厂：仅指定技能名。
     */
    public static ExecuteRequest of(String skill) {
        ExecuteRequest req = new ExecuteRequest();
        req.skill = skill;
        return req;
    }

    public ExecuteRequest geocards(List<String> geocards) {
        this.geocards = geocards;
        return this;
    }

    public ExecuteRequest spatial(SpatialContext spatial) {
        this.spatial = spatial;
        return this;
    }

    public ExecuteRequest temporal(TemporalContext temporal) {
        this.temporal = temporal;
        return this;
    }

    public ExecuteRequest params(Map<String, Object> params) {
        this.params = params;
        return this;
    }

    public ExecuteRequest requestId(String requestId) {
        this.requestId = requestId;
        return this;
    }

    /** 转换为 GeoMCP JSON-RPC params map。 */
    public Map<String, Object> toParams() {
        Map<String, Object> map = new HashMap<>();
        map.put("skill", skill);
        if (geocards != null) map.put("geocards", geocards);
        if (spatial != null) map.put("spatial", spatial.toMap());
        if (temporal != null) map.put("temporal", temporal.toMap());
        if (params != null) map.put("params", params);
        if (requestId != null) map.put("request_id", requestId);
        return map;
    }

    // ---- 内嵌模型 ----

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpatialContext {
        private List<Double> bbox;
        private String crs;
        private Double resolution;

        public SpatialContext(List<Double> bbox, String crs) {
            this.bbox = bbox;
            this.crs = crs;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> map = new HashMap<>();
            if (bbox != null) map.put("bbox", bbox);
            if (crs != null) map.put("crs", crs);
            if (resolution != null) map.put("resolution", resolution);
            return map;
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TemporalContext {
        private String start;
        private String end;
        private String interval;

        public TemporalContext(LocalDate start, LocalDate end) {
            this.start = start != null ? start.toString() : null;
            this.end = end != null ? end.toString() : null;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> map = new HashMap<>();
            if (start != null) map.put("start", start);
            if (end != null) map.put("end", end);
            if (interval != null) map.put("interval", interval);
            return map;
        }
    }
}