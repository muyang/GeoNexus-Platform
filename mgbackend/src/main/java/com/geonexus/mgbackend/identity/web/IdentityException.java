package com.geonexus.mgbackend.identity.web;

/** 身份与权限错误：带 HTTP 状态码，由 IdentityExceptionHandler 统一转响应。 */
public class IdentityException extends RuntimeException {
    private final int status;

    public IdentityException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
