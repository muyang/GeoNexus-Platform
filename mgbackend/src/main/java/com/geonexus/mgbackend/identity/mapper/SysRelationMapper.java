package com.geonexus.mgbackend.identity.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 关联表：用户-角色、角色-菜单、角色-部门。 */
@Mapper
public interface SysRelationMapper {

    @Insert("INSERT INTO sys_user_role (user_id, role_id) VALUES (#{userId}, #{roleId})")
    int bindUserRole(@Param("userId") Long userId, @Param("roleId") Long roleId);

    @Insert("INSERT INTO sys_role_menu (role_id, menu_id) VALUES (#{roleId}, #{menuId})")
    int bindRoleMenu(@Param("roleId") Long roleId, @Param("menuId") Long menuId);

    @Insert("INSERT INTO sys_role_dept (role_id, dept_id) VALUES (#{roleId}, #{deptId})")
    int bindRoleDept(@Param("roleId") Long roleId, @Param("deptId") Long deptId);

    @Delete("DELETE FROM sys_user_role WHERE user_id = #{userId}")
    int unbindUserRoles(@Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM sys_user_role WHERE user_id = #{userId} AND role_id = #{roleId}")
    int hasUserRole(@Param("userId") Long userId, @Param("roleId") Long roleId);
}
