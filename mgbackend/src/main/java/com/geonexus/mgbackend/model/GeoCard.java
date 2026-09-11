package com.geonexus.mgbackend.model;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * GeoCard 资产实体 — Java 控制面的核心数据模型。
 *
 * <p>每个 GeoCard 对应一个地理空间资产（数据产品、模型、技能等），
 * 在 Java 侧管理其元数据和审核状态，然后同步到 Python 执行面。</p>
 */
@Data
@TableName("mogan_geocard")
public class GeoCard {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 关联的 GeoCapability ID（Python 执行面统一标识）。 */
    private String capabilityId;

    /** 资产类型：data | data_product | model | skill | agent */
    private String assetType;

    /** 资产名称。 */
    private String title;

    /** 提供方。 */
    private String provider;

    /** 所属 GeoNode。 */
    private String nodeId;

    /** 地理区域。 */
    private String region;

    /** 几何类型：raster | vector | raster-cog | stac-collection */
    private String geometryType;

    /** 时间覆盖。 */
    private String temporalCoverage;

    /** 访问地址。 */
    private String accessUrl;

    /** 许可证。 */
    private String license;

    /** 关联策略 ID。 */
    private String policyId;

    /** 是否允许原始数据导出。 */
    private Boolean rawDataExport;

    /** 允许的派生输出类型（JSON 数组字符串）。 */
    private String derivedOutputs;

    /** 标签（JSON 数组字符串）。 */
    private String tags;

    /** 描述。 */
    private String description;

    /** 审核状态：draft | pending | approved | rejected */
    private String status;

    /** 删除标记（RuoYi 惯例）。 */
    @TableLogic
    private String delFlag;

    /** 空间范围 CRS。 */
    private String crs;

    /** 空间范围 bbox（JSON 数组字符串）。 */
    private String bbox;

    /** 波段信息（JSON 字符串）。 */
    private String bands;

    /** 分辨率。 */
    private Double resolution;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}