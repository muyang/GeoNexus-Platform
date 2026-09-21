package com.geonexus.mgbackend.identity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.mgbackend.identity.mapper.SysLogininforMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysUser;
import com.geonexus.mgbackend.identity.service.IdentityService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 身份权威在 Java 这一层：注册、登录、令牌、权限、数据范围、JWKS。 */
@SpringBootTest
@AutoConfigureMockMvc
class IdentityApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired SysUserMapper userMapper;
    @Autowired SysLogininforMapper logininforMapper;
    @Autowired IdentityService identityService;

    private String body(Map<String, String> m) throws Exception { return json.writeValueAsString(m); }

    private JsonNode postJson(String url, String payload, String token, int expect) throws Exception {
        var req = post(url).contentType(MediaType.APPLICATION_JSON).content(payload);
        if (token != null) req.header("Authorization", "Bearer " + token);
        // MockMvc 默认 ISO-8859-1，中文会变乱码 —— 必须显式按 UTF-8 解码
        String res = mvc.perform(req).andExpect(status().is(expect)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return res.isBlank() ? json.createObjectNode() : json.readTree(res);
    }

    private JsonNode getJson(String url, String token, int expect) throws Exception {
        var req = get(url);
        if (token != null) req.header("Authorization", "Bearer " + token);
        return json.readTree(mvc.perform(req).andExpect(status().is(expect)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String adminToken() throws Exception {
        return postJson("/api/auth/login", body(Map.of("userName", "admin", "password", "Admin@GeoNexus2026")), null, 200)
                .get("token").asText();
    }

    @Test
    void 公众自助注册只拿到能看的权限() throws Exception {
        String email = "public1@test.local";
        JsonNode res = postJson("/api/auth/register",
                body(Map.of("name", "公众用户", "email", email, "password", "pw-public-1234", "org", "某高校")), null, 201);
        JsonNode user = res.get("user");
        assertThat(user.get("roles").toString()).contains("public_visitor");
        assertThat(user.get("scopes").toString()).contains("card:read");
        assertThat(user.get("scopes").toString()).doesNotContain("workbench:run");
        assertThat(user.get("isAdmin").asBoolean()).isFalse();
        assertThat(user.get("org").asText()).isEqualTo("公众用户");   // 落在公众部门
        assertThat(res.get("token").asText()).isNotBlank();
        assertThat(res.get("expiresAt").asText()).isNotBlank();
    }

    @Test
    void 同一邮箱重复注册返回409() throws Exception {
        String payload = body(Map.of("name", "重复", "email", "dupe@test.local", "password", "pw-1234567890"));
        postJson("/api/auth/register", payload, null, 201);
        JsonNode err = postJson("/api/auth/register", payload, null, 409);
        assertThat(err.get("error").asText()).contains("已注册");
    }

    @Test
    void 管理员登录拿到platform_admin与通配scope() throws Exception {
        JsonNode res = postJson("/api/auth/login",
                body(Map.of("userName", "admin", "password", "Admin@GeoNexus2026")), null, 200);
        JsonNode user = res.get("user");
        assertThat(user.get("roles").toString()).contains("platform_admin");
        assertThat(user.get("scopes").toString()).contains("*");
        assertThat(user.get("isAdmin").asBoolean()).isTrue();
        assertThat(res.get("refreshToken").asText()).isNotBlank();
    }

    @Test
    void me需要令牌否则401() throws Exception {
        assertThat(mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized()).andReturn()
                .getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("需要登录");
    }

    @Test
    void me返回角色与scope() throws Exception {
        String email = "public2@test.local";
        String token = postJson("/api/auth/register",
                body(Map.of("name", "公众2", "email", email, "password", "pw-public-1234")), null, 201)
                .get("token").asText();
        JsonNode me = getJson("/api/auth/me", token, 200);
        assertThat(me.get("user").get("email").asText()).isEqualTo(email);
        assertThat(me.get("user").get("roles").toString()).contains("public_visitor");
    }

    @Test
    void 功能权限_公众访问系统管理403_管理员200() throws Exception {
        String publicToken = postJson("/api/auth/register",
                body(Map.of("name", "公众3", "email", "public3@test.local", "password", "pw-public-1234")), null, 201)
                .get("token").asText();
        JsonNode denied = getJson("/api/system/users", publicToken, 403);
        assertThat(denied.get("error").asText()).contains("system:user:list");

        JsonNode allowed = getJson("/api/system/users", adminToken(), 200);
        assertThat(allowed.get("count").asInt()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void 角色与菜单可读且带dataScope() throws Exception {
        JsonNode roles = getJson("/api/system/roles", adminToken(), 200);
        assertThat(roles.get("count").asInt()).isEqualTo(7);
        JsonNode menus = getJson("/api/system/menus", adminToken(), 200);
        assertThat(menus.get("count").asInt()).isGreaterThanOrEqualTo(20);
    }

    @Test
    void jwks暴露可验签的RSA公钥() throws Exception {
        JsonNode jwks = getJson("/.well-known/jwks.json", null, 200);
        JsonNode key = jwks.get("keys").get(0);
        assertThat(key.get("kty").asText()).isEqualTo("RSA");
        assertThat(key.get("alg").asText()).isEqualTo("RS256");
        assertThat(key.get("n").asText()).isNotBlank();
        assertThat(key.get("e").asText()).isEqualTo("AQAB");
        assertThat(key.get("kid").asText()).startsWith("geonexus-");
    }

    @Test
    void 密码错误累计5次后锁定并写登录日志() throws Exception {
        String email = "lockme@test.local";
        postJson("/api/auth/register", body(Map.of("name", "锁定测试", "email", email, "password", "pw-1234567890")), null, 201);
        long before = logininforMapper.selectList(null).size();
        for (int i = 0; i < 5; i++) {
            postJson("/api/auth/login", body(Map.of("userName", email, "password", "wrong-password")), null, 401);
        }
        JsonNode locked = postJson("/api/auth/login", body(Map.of("userName", email, "password", "pw-1234567890")), null, 423);
        assertThat(locked.get("error").asText()).contains("锁定");
        assertThat(logininforMapper.selectList(null).size()).isGreaterThan((int) before + 4);
    }

    @Test
    void 登出后旧令牌立即失效() throws Exception {
        String token = postJson("/api/auth/login", body(Map.of("userName", "admin", "password", "Admin@GeoNexus2026")), null, 200)
                .get("token").asText();
        getJson("/api/auth/me", token, 200);
        postJson("/api/auth/logout", "{}", token, 200);
        JsonNode rejected = getJson("/api/auth/me", token, 401);
        assertThat(rejected.get("error").asText()).contains("令牌无效");
    }

    @Test
    void 伪造令牌被拒绝() throws Exception {
        getJson("/api/auth/me", "not-a-real-token", 401);
    }

    @Test
    void 数据范围_管理员为全部_公众为仅本人() throws Exception {
        JsonNode adminScope = getJson("/api/auth/data-scope", adminToken(), 200);
        assertThat(adminScope.get("scope").asInt()).isEqualTo(1);
        assertThat(adminScope.get("description").asText()).contains("全部数据");

        String publicToken = postJson("/api/auth/register",
                body(Map.of("name", "公众4", "email", "public4@test.local", "password", "pw-public-1234")), null, 201)
                .get("token").asText();
        JsonNode publicScope = getJson("/api/auth/data-scope", publicToken, 200);
        assertThat(publicScope.get("scope").asInt()).isEqualTo(5);
        assertThat(publicScope.get("description").asText()).contains("仅本人");
    }

    @Test
    void 演示账号与管理员账号可用_且权限各不相同() throws Exception {
        // 管理员：通配 scope，可进管理端
        String admin = postJson("/api/auth/login",
                body(Map.of("userName", "admin", "password", "Admin@GeoNexus2026")), null, 200)
                .get("token").asText();
        assertThat(getJson("/api/system/users", admin, 200).get("count").asInt()).isGreaterThanOrEqualTo(4);

        // 公众访客：能看，不能跑工作台
        JsonNode visitor = postJson("/api/auth/login",
                body(Map.of("userName", "visitor", "password", "Demo@GeoNexus2026")), null, 200).get("user");
        assertThat(visitor.get("roles").toString()).contains("public_visitor");
        assertThat(visitor.get("scopes").toString()).contains("card:read");
        assertThat(visitor.get("scopes").toString()).doesNotContain("workbench:run");
        assertThat(visitor.get("isAdmin").asBoolean()).isFalse();

        // 机构成员：能用工作台（业务面的 auth 档）
        JsonNode member = postJson("/api/auth/login",
                body(Map.of("userName", "member", "password", "Demo@GeoNexus2026")), null, 200).get("user");
        assertThat(member.get("roles").toString()).contains("org_member");
        assertThat(member.get("scopes").toString()).contains("workbench:run");
        assertThat(getJson("/api/system/users", postJson("/api/auth/login",
                body(Map.of("userName", "member", "password", "Demo@GeoNexus2026")), null, 200)
                .get("token").asText(), 403).get("error").asText()).contains("system:user:list");

        // 平台运营：能看审批与配额，但没有系统管理
        JsonNode operator = postJson("/api/auth/login",
                body(Map.of("userName", "operator", "password", "Demo@GeoNexus2026")), null, 200).get("user");
        assertThat(operator.get("roles").toString()).contains("platform_operator");
        assertThat(operator.get("scopes").toString()).contains("approval:list").contains("quota:read");
        assertThat(operator.get("scopes").toString()).doesNotContain("system:user:list");

        // 数据范围也各不相同：管理员=全部，成员=本部门
        String memberToken = postJson("/api/auth/login",
                body(Map.of("userName", "member", "password", "Demo@GeoNexus2026")), null, 200).get("token").asText();
        assertThat(getJson("/api/auth/data-scope", admin, 200).get("scope").asInt()).isEqualTo(1);
        assertThat(getJson("/api/auth/data-scope", memberToken, 200).get("scope").asInt()).isEqualTo(3);
    }

    @Test
    void 停用账号后无法登录() throws Exception {
        String email = "disabled@test.local";
        postJson("/api/auth/register", body(Map.of("name", "停用", "email", email, "password", "pw-1234567890")), null, 201);
        SysUser u = userMapper.findByLogin(email);
        u.setStatus("1");
        userMapper.updateById(u);
        JsonNode err = postJson("/api/auth/login", body(Map.of("userName", email, "password", "pw-1234567890")), null, 403);
        assertThat(err.get("error").asText()).contains("停用");
    }
}
