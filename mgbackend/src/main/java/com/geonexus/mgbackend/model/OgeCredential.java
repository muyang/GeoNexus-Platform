package com.geonexus.mgbackend.model;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OGE 计算中心凭证配置实体（对应表 mogan_oge_credential）。
 *
 * <p>凭证在 Java 控制面加密存储（MVP 阶段明文入库，生产应接入 AES），
 * 通过 REST 下发到 Python 执行面，由执行面运行时获取 JWT/tk。</p>
 */
@Data
@TableName("mogan_oge_credential")
public class OgeCredential {

    @TableId(type = IdType.ASSIGN_ID)
    private String credentialId;

    /** 关联 GeoNode。 */
    private String nodeId;

    /** OGE API 网关地址，如 http://openge.org.cn/api。 */
    private String endpoint;

    /** OGE 平台账号。 */
    private String username;

    /** 密码（生产环境 AES 加密存储）。 */
    private String password;

    /** OAuth Client ID。 */
    private String clientId;

    /** OAuth Client Secret。 */
    private String clientSecret;

    /** 应用名称。 */
    private String appName;

    /** active | error | expired。 */
    private String status;

    /** 最后同步到 Python 的时间。 */
    private LocalDateTime lastSyncAt;

    /** 最后错误信息。 */
    private String lastError;

    @TableLogic
    private String delFlag;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}