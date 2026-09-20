package com.geonexus.mgbackend.identity.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** 统一错误响应：{error: "..."}，前端与 Node BFF 的约定一致。 */
@RestControllerAdvice
public class IdentityExceptionHandler {

    @ExceptionHandler(IdentityException.class)
    public ResponseEntity<Map<String, Object>> handle(IdentityException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage()));
    }
}
