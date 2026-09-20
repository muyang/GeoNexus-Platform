package com.geonexus.mgbackend.identity.web;

import com.geonexus.mgbackend.identity.model.SysUser;
import com.geonexus.mgbackend.identity.service.IdentityService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** 认证端点。路径与响应形状与平台前端契约一致（/api/auth/*），因此切换权威只需改前端基址。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final IdentityService identityService;

    public AuthController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @PostMapping("/register")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@RequestBody Map<String, String> body, HttpServletRequest req) {
        IdentityService.AuthResult r = identityService.register(
                body.get("name"), body.get("email"), body.get("password"), body.get("org"), clientIp(req));
        return asResponse(r);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body, HttpServletRequest req) {
        String login = body.get("email") != null ? body.get("email") : body.get("userName");
        IdentityService.AuthResult r = identityService.login(login, body.get("password"), clientIp(req));
        return asResponse(r);
    }

    @GetMapping("/me")
    @RequiresPerm("")
    public Map<String, Object> me() {
        IdentityContext.Identity id = requireIdentity();
        SysUser user = identityService.requireUser(id.userId());
        IdentityService.AuthResult described = identityService.describe(user);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("user", described.user());
        return m;
    }

    @PostMapping("/logout")
    @RequiresPerm("")
    public Map<String, Object> logout() {
        IdentityContext.Identity id = requireIdentity();
        Claims claims = id.claims();
        identityService.logout(id.jti(), claims.getExpiration());
        return Map.of("status", "logged-out", "jti", String.valueOf(id.jti()));
    }

    /** 数据范围：平台据此把可见性投影到 GeoCard（见 docs/user-management.md §5.1）。 */
    @GetMapping("/data-scope")
    @RequiresPerm("")
    public Map<String, Object> dataScope() {
        IdentityContext.Identity id = requireIdentity();
        var scope = identityService.dataScopeFor(id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scope", scope.scope());
        m.put("deptIds", scope.deptIds());
        m.put("userId", scope.userId());
        m.put("description", scope.description());
        return m;
    }

    private Map<String, Object> asResponse(IdentityService.AuthResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("user", r.user());
        m.put("token", r.token());
        m.put("refreshToken", r.refreshToken());
        m.put("expiresAt", r.expiresAt());
        m.put("expiresIn", r.expiresInSeconds());
        return m;
    }

    private IdentityContext.Identity requireIdentity() {
        IdentityContext.Identity id = IdentityContext.get();
        if (id == null) throw new IdentityException(401, "需要登录");
        return id;
    }

    private static String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        return fwd != null ? fwd.split(",")[0].trim() : req.getRemoteAddr();
    }
}
