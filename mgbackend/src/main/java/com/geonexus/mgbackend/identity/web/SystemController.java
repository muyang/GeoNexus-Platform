package com.geonexus.mgbackend.identity.web;

import com.geonexus.mgbackend.identity.mapper.SysMenuMapper;
import com.geonexus.mgbackend.identity.mapper.SysRoleMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** 后台管理（RuoYi 系统管理模块）：本轮只读，权限由 @RequiresPerm 收口。 */
@RestController
@RequestMapping("/api/system")
public class SystemController {

    private final SysUserMapper userMapper;
    private final SysRoleMapper roleMapper;
    private final SysMenuMapper menuMapper;

    public SystemController(SysUserMapper userMapper, SysRoleMapper roleMapper, SysMenuMapper menuMapper) {
        this.userMapper = userMapper;
        this.roleMapper = roleMapper;
        this.menuMapper = menuMapper;
    }

    @GetMapping("/users")
    @RequiresPerm("system:user:list")
    public Map<String, Object> users() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (SysUser u : userMapper.selectList(null)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", u.getUserId());
            m.put("userName", u.getUserName());
            m.put("nickName", u.getNickName());
            m.put("email", u.getEmail());
            m.put("deptId", u.getDeptId());
            m.put("userType", u.getUserType());
            m.put("status", u.getStatus());
            m.put("roles", roleMapper.findByUserId(u.getUserId()).stream().map(r -> r.getRoleKey()).collect(Collectors.toList()));
            items.add(m);
        }
        return Map.of("items", items, "count", items.size());
    }

    @GetMapping("/roles")
    @RequiresPerm("system:role:list")
    public Map<String, Object> roles() {
        List<Map<String, Object>> items = new ArrayList<>();
        roleMapper.selectList(null).forEach(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("roleId", r.getRoleId());
            m.put("roleName", r.getRoleName());
            m.put("roleKey", r.getRoleKey());
            m.put("dataScope", r.getDataScope());
            m.put("permCount", menuMapper.findByRoleId(r.getRoleId()).size());
            items.add(m);
        });
        return Map.of("items", items, "count", items.size());
    }

    @GetMapping("/menus")
    @RequiresPerm("system:menu:list")
    public Map<String, Object> menus() {
        List<Map<String, Object>> items = new ArrayList<>();
        menuMapper.selectList(null).forEach(menu -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("menuId", menu.getMenuId());
            m.put("menuName", menu.getMenuName());
            m.put("parentId", menu.getParentId());
            m.put("menuType", menu.getMenuType());
            m.put("path", menu.getPath());
            m.put("perms", menu.getPerms());
            items.add(m);
        });
        return Map.of("items", items, "count", items.size());
    }

    /** 角色可见菜单：前端据此渲染菜单（功能权限的最小闭环）。 */
    @GetMapping("/roles/{roleId}/menus")
    @RequiresPerm("system:role:list")
    public Map<String, Object> roleMenus(@PathVariable Long roleId) {
        return Map.of("roleId", roleId, "items", menuMapper.findByRoleId(roleId));
    }
}
