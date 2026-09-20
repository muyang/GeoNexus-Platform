package com.geonexus.mgbackend.identity.web;

import com.geonexus.mgbackend.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;

/** 统一鉴权入口：解析 Bearer 令牌、注入身份、按 @RequiresPerm 判定。
 *
 *  语义：缺令牌 → 401；有令牌但权限不足 → 403；权限不足不泄露对象是否存在（对象级越权由上层返回 404）。 */
@Component
public class IdentityInterceptor implements HandlerInterceptor {

    private final JwtService jwtService;

    public IdentityInterceptor(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!(handler instanceof HandlerMethod method)) return true;

        String auth = request.getHeader("Authorization");
        String token = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : null;
        if (token != null) {
            try {
                Claims claims = jwtService.parse(token);
                IdentityContext.set(toIdentity(claims));
            } catch (JwtException | IllegalArgumentException e) {
                writeJson(response, 401, "令牌无效或已过期：" + e.getMessage());
                return false;
            }
        }

        RequiresPerm required = method.getMethodAnnotation(RequiresPerm.class);
        if (required == null) required = method.getBeanType().getAnnotation(RequiresPerm.class);

        String perm = required == null ? null : required.value();
        boolean needsAuth = perm != null || method.hasMethodAnnotation(RequiresPerm.class) || required != null;
        if (needsAuth && IdentityContext.get() == null) {
            writeJson(response, 401, "需要登录");
            return false;
        }
        if (perm != null && IdentityContext.get() != null && !IdentityContext.get().hasPerm(perm)) {
            writeJson(response, 403, "权限不足：需要 " + perm);
            return false;
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        IdentityContext.clear();
    }

    @SuppressWarnings("unchecked")
    static IdentityContext.Identity toIdentity(Claims claims) {
        return new IdentityContext.Identity(
                claims.get("userId", Number.class) == null ? null : claims.get("userId", Number.class).longValue(),
                claims.get("userName", String.class),
                claims.get("nickName", String.class),
                claims.get("deptId", Number.class) == null ? null : claims.get("deptId", Number.class).longValue(),
                claims.get("deptPath", String.class),
                claims.get("tenant", String.class),
                claims.get("accountType", String.class),
                claims.get("roles", List.class) == null ? List.<String>of() : (List<String>) claims.get("roles", List.class),
                claims.get("scopes", List.class) == null ? List.<String>of() : (List<String>) claims.get("scopes", List.class),
                claims.getId(), claims);
    }

    private static void writeJson(HttpServletResponse response, int status, String message) throws Exception {
        response.setStatus(status);
        response.setContentType("application/json; charset=utf-8");
        response.getWriter().write("{\"error\":" + quote(message) + "}");
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
