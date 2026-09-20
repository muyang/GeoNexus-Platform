package com.geonexus.mgbackend.identity;

import com.geonexus.mgbackend.identity.mapper.SysRelationMapper;
import com.geonexus.mgbackend.identity.mapper.SysRoleMapper;
import com.geonexus.mgbackend.identity.mapper.SysUserMapper;
import com.geonexus.mgbackend.identity.model.SysUser;
import com.geonexus.mgbackend.identity.service.PermissionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** data_scope 1–5 的解析：这是"能看哪些资产"的权威判定，必须可验证。 */
@SpringBootTest
@AutoConfigureMockMvc   // 与 IdentityApiTest 共用同一测试上下文，避免 schema.sql 在同一内存库跑两遍
class DataScopeTest {

    @Autowired PermissionService permissionService;
    @Autowired SysUserMapper userMapper;
    @Autowired SysRoleMapper roleMapper;
    @Autowired SysRelationMapper relationMapper;

    private SysUser staffInGroup(Long deptId) {
        SysUser u = new SysUser();
        u.setUserId(System.nanoTime());
        u.setDeptId(deptId);
        u.setUserName("staff-" + u.getUserId());
        u.setNickName("小组成员");
        u.setUserType("staff");
        u.setEmail(u.getUserName() + "@test.local");
        u.setPassword("x");
        u.setStatus("0");
        u.setDelFlag("0");
        u.setCreateTime(LocalDateTime.now());
        userMapper.insert(u);
        return u;
    }

    @Test
    void 机构成员为本部门数据_小组6() {
        SysUser u = staffInGroup(1003L);
        relationMapper.bindUserRole(u.getUserId(), roleMapper.findIdByKey("org_member"));
        var scope = permissionService.resolveDataScope(u.getUserId(), 1003L, "0,1000,1002");
        assertThat(scope.scope()).isEqualTo(3);
        assertThat(scope.deptIds()).containsExactly(1003L);
        assertThat(scope.description()).contains("本部门数据");
    }

    @Test
    void 资产管理员为本部门及以下_含祖链() {
        SysUser u = staffInGroup(1003L);
        relationMapper.bindUserRole(u.getUserId(), roleMapper.findIdByKey("org_publisher"));
        var scope = permissionService.resolveDataScope(u.getUserId(), 1003L, "0,1000,1002");
        assertThat(scope.scope()).isEqualTo(4);
        assertThat(scope.deptIds()).contains(1003L).contains(1000L).contains(1002L);
        assertThat(scope.deptIds()).doesNotContain(0L);   // 0 是虚拟根，不能当部门用
    }

    @Test
    void 平台运营为全部数据() {
        SysUser u = staffInGroup(1002L);
        relationMapper.bindUserRole(u.getUserId(), roleMapper.findIdByKey("platform_operator"));
        var scope = permissionService.resolveDataScope(u.getUserId(), 1002L, "0,1000");
        assertThat(scope.scope()).isEqualTo(1);
        assertThat(scope.description()).contains("全部数据");
    }

    @Test
    void 无角色用户仅本人() {
        SysUser u = staffInGroup(1003L);
        var scope = permissionService.resolveDataScope(u.getUserId(), 1003L, "0,1000,1002");
        assertThat(scope.scope()).isEqualTo(5);
        assertThat(scope.userId()).isEqualTo(u.getUserId());
    }

    @Test
    void scopes来自角色菜单的perms_且管理员为通配() {
        SysUser u = staffInGroup(1003L);
        relationMapper.bindUserRole(u.getUserId(), roleMapper.findIdByKey("org_admin"));
        List<String> roles = permissionService.roleKeys(u.getUserId());
        List<String> scopes = permissionService.scopes(u.getUserId(), roles);
        assertThat(scopes).contains("system:user:list").contains("card:read").contains("earth:view");
        assertThat(scopes).doesNotContain("*");
        assertThat(permissionService.hasPerm(u.getUserId(), roles, "system:user:add")).isTrue();
        assertThat(permissionService.hasPerm(u.getUserId(), roles, "app:manage")).isFalse();

        SysUser noRole = staffInGroup(1003L);
        assertThat(permissionService.scopes(noRole.getUserId(), List.of())).contains("card:read");
    }
}
