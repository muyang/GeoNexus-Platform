package com.geonexus.mgbackend.identity.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.geonexus.mgbackend.identity.model.SysMenu;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysMenuMapper extends BaseMapper<SysMenu> {

    /** scopes 来自角色可见菜单的 perms —— 与 RuoYi 的按钮级权限同源。 */
    @Select("SELECT DISTINCT m.perms FROM sys_menu m "
          + "JOIN sys_role_menu rm ON rm.menu_id = m.menu_id "
          + "JOIN sys_user_role ur ON ur.role_id = rm.role_id "
          + "WHERE ur.user_id = #{userId} AND m.status = '0' AND m.perms IS NOT NULL AND m.perms <> ''")
    List<String> findPermsByUserId(@Param("userId") Long userId);

    @Select("SELECT m.* FROM sys_menu m JOIN sys_role_menu rm ON rm.menu_id = m.menu_id "
          + "WHERE rm.role_id = #{roleId} AND m.status = '0' ORDER BY m.order_num")
    List<SysMenu> findByRoleId(@Param("roleId") Long roleId);
}
