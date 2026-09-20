package com.geonexus.mgbackend.identity.seed;

import com.geonexus.mgbackend.identity.config.IdentityProperties;
import com.geonexus.mgbackend.identity.mapper.SysDeptMapper;
import com.geonexus.mgbackend.identity.mapper.SysMenuMapper;
import com.geonexus.mgbackend.identity.mapper.SysRelationMapper;
import com.geonexus.mgbackend.identity.mapper.SysRoleMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysDept;
import com.geonexus.mgbackend.identity.model.SysMenu;
import com.geonexus.mgbackend.identity.model.SysRole;
import com.geonexus.mgbackend.identity.model.SysUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 初始化 RuoYi 风格的部门/角色/菜单与引导管理员（幂等：已有角色则跳过）。
 *
 *  设计对应 docs/user-management.md：
 *   · 部门树是权限骨架（公众用户单独一个根部门，攻坚小组按"小组"建部门）；
 *   · 角色决定权限，账号类型只决定"怎么来的、能不能登录"；
 *   · scopes 来自角色可见菜单的 perms —— 与 RuoYi 按钮级权限同源。 */
@Component
public class IdentitySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IdentitySeeder.class);
    private final SysDeptMapper deptMapper;
    private final SysRoleMapper roleMapper;
    private final SysMenuMapper menuMapper;
    private final SysUserMapper userMapper;
    private final SysRelationMapper relationMapper;
    private final IdentityProperties props;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public IdentitySeeder(SysDeptMapper deptMapper, SysRoleMapper roleMapper, SysMenuMapper menuMapper,
                          SysUserMapper userMapper, SysRelationMapper relationMapper, IdentityProperties props) {
        this.deptMapper = deptMapper;
        this.roleMapper = roleMapper;
        this.menuMapper = menuMapper;
        this.userMapper = userMapper;
        this.relationMapper = relationMapper;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!roleMapper.selectList(null).isEmpty()) {
            log.debug("身份种子已存在，跳过");
            return;
        }
        LocalDateTime now = LocalDateTime.now();

        // ── 部门树 ──────────────────────────────────────────────
        dept(1000L, 0L, "0", "GeoNexus", 1, now);
        dept(1001L, 1000L, "0,1000", props.getPublicDeptName(), 1, now);
        dept(1002L, 1000L, "0,1000", "攻坚团队", 2, now);
        dept(1003L, 1002L, "0,1000,1002", "小组6 卫星智能服务攻关小组", 1, now);
        dept(1004L, 1002L, "0,1000,1002", "小组7 SDG 评价服务攻关小组", 2, now);
        dept(1005L, 1000L, "0,1000", "合作单位", 3, now);

        // ── 菜单与按钮权限（perms 即 scopes 的来源）──────────────
        Map<String, Long> menus = new LinkedHashMap<>();
        long menuId = 2000;
        menus.put("门户", menu(menuId++, 0L, "门户", "M", null, null, 1));
        Long portal = lastMenuId(menus);
        menus.put("earth:view", menu(menuId++, portal, "可视化地球", "C", "/portal/earth", "earth:view", 1));
        menus.put("card:read", menu(menuId++, portal, "数据资源", "C", "/portal/data", "card:read", 2));
        menus.put("case:read", menu(menuId++, portal, "全球案例", "C", "/portal/cases", "case:read", 3));
        menus.put("card:read.ops", menu(menuId++, portal, "算子模型", "C", "/portal/operators", "card:read", 4));
        menus.put("compute:view", menu(menuId++, portal, "算力平台", "C", "/portal/compute", "compute:view", 5));
        menus.put("community:view", menu(menuId++, portal, "开放社区", "C", "/portal/community", "community:view", 6));
        menus.put("agent:invoke", menu(menuId++, portal, "超级智能体", "C", "/portal/agent", "agent:invoke", 7));
        menus.put("apps:view", menu(menuId++, portal, "典型应用", "C", "/portal/apps", "apps:view", 8));
        menus.put("莫干地球系统", menu(menuId++, 0L, "莫干地球系统", "M", null, null, 2));
        Long earth = lastMenuId(menus);
        menus.put("workbench:run", menu(menuId++, earth, "智能工作台", "C", "/workbench", "workbench:run", 1));
        menus.put("earth:view.ops", menu(menuId++, earth, "地图", "C", "/map", "earth:view", 2));
        menus.put("系统管理", menu(menuId++, 0L, "系统管理", "M", null, null, 9));
        Long system = lastMenuId(menus);
        menus.put("system:user:list", menu(menuId++, system, "用户管理", "C", "/system/user", "system:user:list", 1));
        menus.put("system:role:list", menu(menuId++, system, "角色管理", "C", "/system/role", "system:role:list", 2));
        menus.put("system:menu:list", menu(menuId++, system, "菜单管理", "C", "/system/menu", "system:menu:list", 3));
        menus.put("approval:list", menu(menuId++, system, "审批管理", "C", "/system/approval", "approval:list", 4));
        menus.put("quota:read", menu(menuId++, system, "配额管理", "C", "/system/quota", "quota:read", 5));
        menus.put("resource:manage", menu(menuId++, system, "资源管理", "C", "/system/resource", "resource:manage", 6));
        menus.put("app:manage", menu(menuId++, system, "开发管理", "C", "/system/app", "app:manage", 7));
        menus.put("system:user:add", menu(menuId++, menus.get("system:user:list"), "用户新增", "F", null, "system:user:add", 1));

        // ── 角色（data_scope：1 全部 2 自定义 3 本部门 4 本部门及以下 5 仅本人）──
        role(3001L, "公众访客", "public_visitor", 5, "5");
        role(3002L, "机构成员", "org_member", 10, "3");
        role(3003L, "机构资产管理员", "org_publisher", 20, "4");
        role(3004L, "单位管理员", "org_admin", 30, "4");
        role(3005L, "平台运营", "platform_operator", 40, "1");
        role(3006L, "平台管理员", "platform_admin", 50, "1");
        role(3007L, "审计员", "auditor", 60, "1");

        bindMenus(3001L, List.of("earth:view", "card:read", "case:read", "apps:view"));
        bindMenus(3002L, List.of("earth:view", "card:read", "case:read", "apps:view", "compute:view",
                "community:view", "workbench:run", "earth:view.ops"));
        bindMenus(3003L, List.of("earth:view", "card:read", "case:read", "apps:view", "compute:view",
                "community:view", "workbench:run", "earth:view.ops", "resource:manage"));
        bindMenus(3004L, List.of("earth:view", "card:read", "case:read", "apps:view", "compute:view",
                "community:view", "workbench:run", "earth:view.ops", "resource:manage", "system:user:list",
                "system:user:add"));
        bindMenus(3005L, List.of("earth:view", "card:read", "case:read", "apps:view", "compute:view",
                "community:view", "workbench:run", "earth:view.ops", "resource:manage", "app:manage",
                "approval:list", "quota:read"));
        bindMenus(3006L, List.copyOf(menus.keySet()));
        bindMenus(3007L, List.of("approval:list", "quota:read", "system:user:list"));

        // 自定义数据范围示例：机构成员(3002 是 3 本部门)不演示；给"平台运营"挂一个自定义部门集
        relationMapper.bindRoleDept(3005L, 1002L);

        // ── 引导管理员 ──────────────────────────────────────────
        SysUser admin = new SysUser();
        admin.setUserId(4001L);
        admin.setDeptId(1000L);
        admin.setUserName(props.getAdminUserName());
        admin.setNickName("平台管理员");
        admin.setUserType("staff");
        admin.setEmail("admin@geonexus.local");
        admin.setPassword(encoder.encode(props.getAdminPassword()));
        admin.setStatus("0");
        admin.setDelFlag("0");
        admin.setTenantId("GeoNexus");
        admin.setCreateTime(now);
        admin.setUpdateTime(now);
        userMapper.insert(admin);
        relationMapper.bindUserRole(4001L, 3006L);

        log.warn("身份种子已初始化：部门 6 / 角色 7 / 菜单 {} / 管理员 {}（初始密码请立即修改）",
                menus.size(), props.getAdminUserName());
    }

    private void dept(Long id, Long parent, String ancestors, String name, int order, LocalDateTime now) {
        SysDept d = new SysDept();
        d.setDeptId(id); d.setParentId(parent); d.setAncestors(ancestors); d.setDeptName(name);
        d.setOrderNum(order); d.setStatus("0"); d.setDelFlag("0");
        deptMapper.insert(d);
    }

    private Long menu(long id, Long parent, String name, String type, String path, String perms, int order) {
        SysMenu m = new SysMenu();
        m.setMenuId(id); m.setParentId(parent); m.setMenuName(name); m.setMenuType(type);
        m.setPath(path); m.setPerms(perms); m.setOrderNum(order); m.setVisible("0"); m.setStatus("0");
        menuMapper.insert(m);
        return id;
    }

    private Long lastMenuId(Map<String, Long> menus) {
        Long last = null;
        for (Long v : menus.values()) last = v;
        return last;
    }

    private void role(Long id, String name, String key, int sort, String dataScope) {
        SysRole r = new SysRole();
        r.setRoleId(id); r.setRoleName(name); r.setRoleKey(key); r.setRoleSort(sort);
        r.setDataScope(dataScope); r.setStatus("0"); r.setDelFlag("0");
        roleMapper.insert(r);
    }

    private void bindMenus(Long roleId, List<String> menuKeys) {
        for (String key : menuKeys) {
            Long id = menuMapper.selectList(null).stream()
                    .filter(m -> key.equals(m.getPerms()) || key.equals(m.getMenuName()))
                    .map(SysMenu::getMenuId).findFirst().orElse(null);
            if (id != null) relationMapper.bindRoleMenu(roleId, id);
        }
    }
}
