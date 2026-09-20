package com.geonexus.mgbackend.identity.service;

import com.geonexus.mgbackend.identity.mapper.SysMenuMapper;
import com.geonexus.mgbackend.identity.mapper.SysRoleMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysRole;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 权限判定：功能权限（scopes，来自角色菜单的 perms）与数据范围（data_scope 1–5）。 */
@Service
public class PermissionService {

    private final SysRoleMapper roleMapper;
    private final SysMenuMapper menuMapper;
    private final SysUserMapper userMapper;

    public PermissionService(SysRoleMapper roleMapper, SysMenuMapper menuMapper, SysUserMapper userMapper) {
        this.roleMapper = roleMapper;
        this.menuMapper = menuMapper;
        this.userMapper = userMapper;
    }

    public List<String> roleKeys(Long userId) {
        List<String> keys = new ArrayList<>();
        for (SysRole r : roleMapper.findByUserId(userId)) keys.add(r.getRoleKey());
        return keys;
    }

    public boolean isAdmin(List<String> roleKeys) {
        return roleKeys.contains("platform_admin") || roleKeys.contains("admin");
    }

    /** scopes：管理员为 *，其余取角色菜单 perms 的并集。 */
    public List<String> scopes(Long userId, List<String> roleKeys) {
        if (isAdmin(roleKeys)) return List.of("*");
        Set<String> perms = new LinkedHashSet<>(menuMapper.findPermsByUserId(userId));
        if (perms.isEmpty()) perms.addAll(List.of("earth:view", "card:read", "case:read"));
        return new ArrayList<>(perms);
    }

    public boolean hasPerm(Long userId, List<String> roleKeys, String perm) {
        if (perm == null || perm.isBlank()) return true;
        List<String> scopes = scopes(userId, roleKeys);
        return scopes.contains("*") || scopes.contains(perm);
    }

    /** 数据范围解析结果：平台据此把"能看哪些"投影到 GeoCard 的 visibility/tenant/owner。 */
    public record DataScope(int scope, List<Long> deptIds, Long userId, String description) { }

    /** 多角色取最宽：任一角为 1（全部）即全部；否则按部门集合与本人并集。 */
    public DataScope resolveDataScope(Long userId, Long deptId, String deptAncestors) {
        List<SysRole> roles = roleMapper.findByUserId(userId);
        if (roles.isEmpty()) {
            return new DataScope(5, List.of(), userId, "未分配角色：仅本人数据");
        }
        int widest = roles.stream().map(r -> parseScope(r.getDataScope())).min(Comparator.naturalOrder()).orElse(5);
        if (widest == 1) return new DataScope(1, List.of(), userId, "全部数据（仍受 visibility 上限约束）");
        Set<Long> depts = new LinkedHashSet<>();
        for (SysRole r : roles) {
            int s = parseScope(r.getDataScope());
            if (s == 2) depts.addAll(roleMapper.findCustomDeptIds(r.getRoleId()));
            else if (s == 3 || s == 4) {
                if (deptId != null) depts.add(deptId);
                if (s == 4 && deptAncestors != null) {
                    // ancestors 形如 "0,100,200"：本部门及以下由 ancestors LIKE 前缀匹配（见 SysDeptMapper）
                    for (String part : deptAncestors.split(",")) {
                        if (!part.isBlank() && !"0".equals(part.trim())) depts.add(Long.parseLong(part.trim()));
                    }
                }
            }
        }
        if (depts.isEmpty()) return new DataScope(5, List.of(), userId, "仅本人数据");
        String desc = widest == 2 ? "自定义部门数据" : widest == 3 ? "本部门数据" : "本部门及以下数据";
        return new DataScope(widest, new ArrayList<>(depts), userId, desc);
    }

    private static int parseScope(String s) {
        try { return s == null ? 5 : Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return 5; }
    }
}
