package com.geonexus.mgbackend.identity.service;

import com.geonexus.mgbackend.identity.config.IdentityProperties;
import com.geonexus.mgbackend.identity.mapper.SysDeptMapper;
import com.geonexus.mgbackend.identity.mapper.SysLogininforMapper;
import com.geonexus.mgbackend.identity.mapper.SysRelationMapper;
import com.geonexus.mgbackend.identity.mapper.SysRoleMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysDept;
import com.geonexus.mgbackend.identity.model.SysLogininfor;
import com.geonexus.mgbackend.identity.model.SysUser;
import com.geonexus.mgbackend.identity.web.IdentityException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** 注册、登录、会话与登录日志。注册 ≠ 授权：自助注册只得到"能看"。 */
@Service
public class IdentityService {

    private final SysUserMapper userMapper;
    private final SysDeptMapper deptMapper;
    private final SysRoleMapper roleMapper;
    private final SysRelationMapper relationMapper;
    private final SysLogininforMapper logininforMapper;
    private final PermissionService permissionService;
    private final JwtService jwtService;
    private final IdentityProperties props;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final AtomicLong idGen = new AtomicLong(System.currentTimeMillis() / 1000);
    private final Map<String, Integer> failures = new ConcurrentHashMap<>();

    public IdentityService(SysUserMapper userMapper, SysDeptMapper deptMapper, SysRoleMapper roleMapper,
                           SysRelationMapper relationMapper, SysLogininforMapper logininforMapper,
                           PermissionService permissionService, JwtService jwtService, IdentityProperties props) {
        this.userMapper = userMapper;
        this.deptMapper = deptMapper;
        this.roleMapper = roleMapper;
        this.relationMapper = relationMapper;
        this.logininforMapper = logininforMapper;
        this.permissionService = permissionService;
        this.jwtService = jwtService;
        this.props = props;
    }

    public record AuthResult(Map<String, Object> user, String token, String refreshToken,
                             String expiresAt, Long expiresInSeconds) { }

    /** 公众自助注册：落在公众部门，角色 public_visitor（只能看）。 */
    @Transactional
    public AuthResult register(String name, String email, String password, String org, String ip) {
        if (name == null || name.isBlank()) throw new IdentityException(422, "name 必填");
        if (email == null || email.isBlank()) throw new IdentityException(422, "email 必填");
        if (password == null || password.length() < 10) throw new IdentityException(422, "密码至少 10 位");
        if (userMapper.findByLogin(email.trim().toLowerCase()) != null) throw new IdentityException(409, "邮箱已注册");

        SysDept publicDept = deptMapper.selectList(null).stream()
                .filter(d -> props.getPublicDeptName().equals(d.getDeptName())).findFirst().orElse(null);
        if (publicDept == null) throw new IdentityException(500, "公众部门未初始化");

        SysUser user = new SysUser();
        user.setUserId(idGen.incrementAndGet());
        user.setDeptId(publicDept.getDeptId());
        user.setUserName(email.trim().toLowerCase());
        user.setNickName(name.trim());
        user.setUserType("public");
        user.setEmail(email.trim().toLowerCase());
        user.setPassword(encoder.encode(password));
        user.setStatus("0");
        user.setDelFlag("0");
        user.setTenantId(org != null && !org.isBlank() ? org : publicDept.getDeptName());
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userMapper.insert(user);

        Long roleId = roleMapper.findIdByKey("public_visitor");
        if (roleId != null) relationMapper.bindUserRole(user.getUserId(), roleId);
        return issueFor(user);
    }

    /** 登录：失败 5 次锁 10 分钟；每次尝试都写 sys_logininfor。
     *
     *  刻意**不加 @Transactional**：登录失败要抛异常，若包在事务里，写下的失败日志会被一起回滚，
     *  锁定计数永远是 0（这正是单元测试抓到的缺陷）。这里每条写操作自成一事务。 */
    public AuthResult login(String login, String password, String ip) {
        String key = login == null ? "" : login.trim().toLowerCase();
        LocalDateTime since = LocalDateTime.now().minusMinutes(props.getLockMinutes());
        if (logininforMapper.countFailuresSince(key, since) >= props.getMaxLoginFailures()) {
            record(key, ip, "1", "账号已锁定（连续失败 " + props.getMaxLoginFailures() + " 次）");
            throw new IdentityException(423, "账号已锁定，请 " + props.getLockMinutes() + " 分钟后重试");
        }
        SysUser user = userMapper.findByLogin(key);
        if (user == null || !encoder.matches(password == null ? "" : password, user.getPassword())) {
            record(key, ip, "1", "用户名或密码错误");
            throw new IdentityException(401, "用户名或密码错误");
        }
        if (!"0".equals(user.getStatus())) {
            record(key, ip, "1", "账号已停用");
            throw new IdentityException(403, "账号已停用");
        }
        user.setLoginIp(ip);
        user.setLoginDate(LocalDateTime.now());
        userMapper.updateById(user);
        record(key, ip, "0", "登录成功");
        failures.remove(key);
        return issueFor(user);
    }

    /** 停用 / 改密后旧令牌应立即失效：这里通过 jti 黑名单实现。 */
    public void logout(String jti, java.util.Date expiresAt) {
        jwtService.revoke(jti, expiresAt);
    }

    public AuthResult issueFor(SysUser user) {
        List<String> roles = permissionService.roleKeys(user.getUserId());
        List<String> scopes = permissionService.scopes(user.getUserId(), roles);
        SysDept dept = user.getDeptId() == null ? null : deptMapper.selectById(user.getDeptId());
        String deptPath = dept == null ? "" : (dept.getAncestors() == null ? "" : dept.getAncestors()) + "," + dept.getDeptId();
        String access = jwtService.issueAccess(user.getUserId(), user.getUserName(), user.getNickName(),
                user.getDeptId(), deptPath, user.getTenantId(), user.getUserType(), roles, scopes);
        String refresh = jwtService.issueRefresh(user.getUserId(), user.getUserName(), user.getNickName(),
                user.getDeptId(), deptPath, user.getTenantId(), user.getUserType(), roles, scopes);
        Map<String, Object> publicUser = publicUser(user, dept, roles, scopes);
        return new AuthResult(publicUser, access, refresh,
                java.time.Instant.now().plusSeconds(jwtService.getAccessSeconds()).toString(), jwtService.getAccessSeconds());
    }

    public Map<String, Object> publicUser(SysUser user, SysDept dept, List<String> roles, List<String> scopes) {
        if (user == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", user.getUserId());
        m.put("name", user.getNickName());
        m.put("email", user.getEmail());
        m.put("org", dept == null ? user.getTenantId() : dept.getDeptName());
        m.put("deptId", user.getDeptId());
        m.put("tenant", user.getTenantId());
        m.put("accountType", user.getUserType());
        m.put("roles", roles);
        m.put("scopes", scopes);
        m.put("isAdmin", permissionService.isAdmin(roles));
        m.put("createdAt", user.getCreateTime());
        return m;
    }

    public AuthResult describe(SysUser user) { return issueFor(user); }

    /** 数据范围解析：结合用户的部门与祖先链，交给 PermissionService 按 data_scope 判定。 */
    public PermissionService.DataScope dataScopeFor(com.geonexus.mgbackend.identity.web.IdentityContext.Identity id) {
        SysUser user = requireUser(id.userId());
        SysDept dept = user.getDeptId() == null ? null : deptMapper.selectById(user.getDeptId());
        return permissionService.resolveDataScope(user.getUserId(), user.getDeptId(),
                dept == null ? "" : dept.getAncestors());
    }

    public SysUser requireUser(Long userId) {
        SysUser user = userMapper.selectById(userId);
        if (user == null) throw new IdentityException(404, "用户不存在");
        return user;
    }

    private void record(String userName, String ip, String status, String msg) {
        SysLogininfor info = new SysLogininfor();
        info.setInfoId(idGen.incrementAndGet());
        info.setUserName(userName);
        info.setIpaddr(ip);
        info.setStatus(status);
        info.setMsg(msg);
        info.setLoginTime(LocalDateTime.now());
        logininforMapper.insert(info);
    }
}
