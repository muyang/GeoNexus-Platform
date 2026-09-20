package com.geonexus.mgbackend.identity.service;

import com.geonexus.mgbackend.identity.config.IdentityProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** RS256 JWT：平台唯一签发，其余系统只验签（JWKS 分发公钥）。
 *
 *  claim 形状与目标架构一致：sub/userId/userName/deptId/deptPath/tenant/roles/scopes/jti。 */
@Service
public class JwtService {

    private final IdentityProperties props;
    private final RSAPrivateKey privateKey;
    private final RSAPublicKey publicKey;
    /** jti 黑名单：登出 / 踢人 / 停用后立即失效（生产应放 Redis）。 */
    private final Map<String, Instant> denylist = new ConcurrentHashMap<>();

    public JwtService(IdentityProperties props) throws Exception {
        this.props = props;
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();
        this.privateKey = (RSAPrivateKey) pair.getPrivate();
        this.publicKey = (RSAPublicKey) pair.getPublic();
    }

    public String issue(Long userId, String userName, String nickName, Long deptId, String deptPath,
                        String tenant, String accountType, java.util.List<String> roles,
                        java.util.List<String> scopes, long ttlMinutes) {
        Instant now = Instant.now();
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("userId", userId);
        claims.put("userName", userName);
        claims.put("nickName", nickName);
        claims.put("deptId", deptId);
        claims.put("deptPath", deptPath);
        claims.put("tenant", tenant);
        claims.put("accountType", accountType);
        claims.put("roles", roles);
        claims.put("scopes", scopes);
        return Jwts.builder()
                // 带上 kid（jjwt 0.12 的写法）：接收方按 kid 精确选公钥，便于公钥轮换
                .header().keyId(keyId()).and()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .issuer(props.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttlMinutes, ChronoUnit.MINUTES)))
                .claims(claims)
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    public String issueAccess(Long userId, String userName, String nickName, Long deptId, String deptPath,
                              String tenant, String accountType, java.util.List<String> roles, java.util.List<String> scopes) {
        return issue(userId, userName, nickName, deptId, deptPath, tenant, accountType, roles, scopes, props.getAccessMinutes());
    }

    public String issueRefresh(Long userId, String userName, String nickName, Long deptId, String deptPath,
                               String tenant, String accountType, java.util.List<String> roles, java.util.List<String> scopes) {
        return issue(userId, userName, nickName, deptId, deptPath, tenant, accountType, roles, scopes,
                props.getRefreshDays() * 24 * 60);
    }

    /** 验签 + 校验签发者；失败抛 JwtException（过期 / 签名不对 / 格式错）。 */
    public Claims parse(String token) {
        Claims claims = Jwts.parser().verifyWith(publicKey).requireIssuer(props.getIssuer())
                .build().parseSignedClaims(token).getPayload();
        if (isRevoked(claims.getId())) throw new JwtException("令牌已失效（已登出或被踢出）");
        return claims;
    }

    public long getAccessSeconds() { return props.getAccessMinutes() * 60; }
    public long getRefreshSeconds() { return props.getRefreshDays() * 24 * 3600; }

    public void revoke(String jti, Date expiresAt) {
        if (jti == null) return;
        denylist.put(jti, expiresAt != null ? expiresAt.toInstant() : Instant.now().plusSeconds(getAccessSeconds()));
    }

    public boolean isRevoked(String jti) {
        if (jti == null) return false;
        Instant exp = denylist.get(jti);
        if (exp == null) return false;
        if (exp.isBefore(Instant.now())) { denylist.remove(jti); return false; }
        return true;
    }

    public int denylistSize() { return denylist.size(); }

    /** JWKS（RFC 7517）：只暴露公钥，供其他系统就地验签。 */
    public Map<String, Object> jwks() {
        BigInteger n = publicKey.getModulus();
        BigInteger e = publicKey.getPublicExponent();
        Map<String, Object> key = new LinkedHashMap<>();
        key.put("kty", "RSA");
        key.put("use", "sig");
        key.put("alg", "RS256");
        key.put("kid", keyId());
        key.put("n", b64(n));
        key.put("e", b64(e));
        return Map.of("keys", java.util.List.of(key));
    }

    public String keyId() {
        return "geonexus-" + Integer.toHexString(publicKey.getModulus().hashCode());
    }

    /** BigInteger → Base64URL，去掉 toByteArray 补的前导 0x00。 */
    private static String b64(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            bytes = trimmed;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
