package com.geonexus.mgbackend.client;

/**
 * GeoMCP 客户端异常。
 *
 * <p>包含 JSON-RPC 错误码，可用于分类处理：</p>
 * <ul>
 *   <li>{@code isContractNotSatisfied()} — 错误码 2000，GeoCard 契约校验失败</li>
 *   <li>{@code isSkillNotFound()} — 错误码 2001，技能未注册</li>
 *   <li>{@code isInvalidParams()} — 错误码 2002，缺少必填参数</li>
 *   <li>{@code isExecutionFailed()} — 错误码 2003，技能执行异常</li>
 * </ul>
 */
public class GeoMCPClientException extends RuntimeException {

    /** JSON-RPC 错误码。 */
    private final int code;

    public GeoMCPClientException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }

    public boolean isContractNotSatisfied() {
        return code == 2000;
    }

    public boolean isSkillNotFound() {
        return code == 2001;
    }

    public boolean isInvalidParams() {
        return code == 2002;
    }

    public boolean isExecutionFailed() {
        return code == 2003;
    }
}