package com.geonexus.mgbackend.identity.web;

import io.jsonwebtoken.Claims;

/** 当前请求的身份（由 IdentityInterceptor 解析后放入）。 */
public final class IdentityContext {

    public record Identity(Long userId, String userName, String nickName, Long deptId, String deptPath,
                           String tenant, String accountType, java.util.List<String> roles,
                           java.util.List<String> scopes, String jti, Claims claims) {
        public boolean hasPerm(String perm) {
            if (perm == null || perm.isBlank()) return true;
            return scopes.contains("*") || scopes.contains(perm);
        }
    }

    private static final ThreadLocal<Identity> CURRENT = new ThreadLocal<>();

    private IdentityContext() { }

    public static void set(Identity identity) { CURRENT.set(identity); }
    public static Identity get() { return CURRENT.get(); }
    public static void clear() { CURRENT.remove(); }
}
